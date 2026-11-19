-- ============================================================
-- SorghumCare — Migration 016 (PERBAIKAN MENDESAK)
-- Memperbaiki "infinite recursion detected in policy for relation
-- profiles" (kode Postgres 42P17) yang membuat SETIAP cek admin gagal
-- dan seluruh aplikasi mengembalikan HTTP 500.
--
-- PENYEBAB
--   Policy baru di tabel `profiles` (migrasi 015) memakai klausa
--       exists (select 1 from public.profiles p where ... )
--   Policy di `profiles` yang men-query `profiles` dipanggil ulang
--   saat query itu dievaluasi -> rekursi tanpa henti. Postgres
--   menghentikannya dengan error 42P17.
--
-- CATATAN: ini bahaya laten. Policy 007 & 008 memakai pola yang SAMA,
--   tapi aman karena keduanya berada di tabel LAIN (admin_configs,
--   reports, recipe_comments). Policy di atas `profiles` sendiri
--   itulah yang memicu rekursi. Jadi jangan "perbaiki" 007/008.
--
-- SOLUSI
--   Bungkus cek admin dalam fungsi SECURITY DEFINER. Fungsi menembus
--   RLS (berjalan sebagai pemilik tabel), sehingga tidak ada policy
--   yang dievaluasi ulang -> rekursi putus. Ini pola resmi Supabase.
--
-- Aman diulang (idempotent).
-- ============================================================

-- ============================================================
-- 1. FUNGSI HELPER
-- ============================================================
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;

-- ============================================================
-- 2. GANTI SEMUA POLICY PROFILES YANG REKURSIF
-- ============================================================
-- Versi lama (SALAH):
--   using (exists (select 1 from public.profiles p where p.id = auth.uid() ...))
-- Versi baru: panggil fungsi, jangan query tabelnya.
drop policy if exists "admins can read all profiles" on public.profiles;
create policy "admins can read all profiles"
  on public.profiles for select
  to public
  using (public.is_admin());

-- Pastikan tidak ada policy profiles lain yang masih men-query profiles.
-- (Kalau ada sisa dari percobaan sebelumnya, dibersihkan di sini.)
do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and (coalesce(qual, '') like '%from public.profiles%'
           or coalesce(with_check, '') like '%from public.profiles%')
  loop
    execute format('drop policy if exists %I on public.profiles', pol.policyname);
    raise notice 'policy profiles rekursif dibuang: %', pol.policyname;
  end loop;
end $$;

-- ============================================================
-- 3. FUNGSI UBAH PERAN — pakai helper, bukan query inline
-- ============================================================
create or replace function public.admin_set_user_role(target_id uuid, new_role text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang boleh mengubah peran pengguna.';
  end if;

  if new_role not in ('user', 'admin', 'nutritionist') then
    raise exception 'Peran tidak valid: %', new_role;
  end if;

  -- Cegah admin mengunci dirinya sendiri keluar dari panel.
  if target_id = auth.uid() and new_role <> 'admin' then
    raise exception 'Admin tidak boleh menurunkan perannya sendiri.';
  end if;

  update public.profiles set role = new_role where id = target_id;
  if not found then
    raise exception 'Pengguna tidak ditemukan: %', target_id;
  end if;

  return true;
end;
$$;

revoke all on function public.admin_set_user_role(uuid, text) from public;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;

-- ============================================================
-- 4. TABEL AUDIT LOG TIDAK BUTUH POLICY REKURSIF SENDIRI
-- ============================================================
-- Policy admin_audit_log men-query `profiles`, bukan dirinya sendiri,
-- jadi tidak rekursif — tapi tetap dirapikan memakai helper supaya
-- konsisten dan bebas risiko kalau policy profiles berubah lagi.
drop policy if exists "admins read audit log" on public.admin_audit_log;
create policy "admins read audit log"
  on public.admin_audit_log for select
  to public
  using (public.is_admin());

drop policy if exists "admins write audit log" on public.admin_audit_log;
create policy "admins write audit log"
  on public.admin_audit_log for insert
  to public
  with check (public.is_admin());

-- ============================================================
-- 5. POLICY 015 LAIN — ikut dirapikan (mereka juga query profiles)
-- ============================================================
drop policy if exists "admins can update any recipe" on public.recipes;
create policy "admins can update any recipe"
  on public.recipes for update
  to public
  using (public.is_admin());

drop policy if exists "admins can delete any review" on public.recipe_reviews;
create policy "admins can delete any review"
  on public.recipe_reviews for delete
  to public
  using (public.is_admin());

-- ============================================================
-- VERIFIKASI — jalankan setelahnya, semua harus lolos
-- ============================================================
-- a) tidak boleh error (dulu 42P17):
select count(*) as terlihat_dari_anon from public.profiles;

-- b) config ter-seed:
select config_key, config_value from public.admin_configs order by config_key;

-- c) fungsi baru ada:
select proname, prosecdef as security_definer
from   pg_proc
where  proname in ('is_admin', 'admin_set_user_role')
order  by proname;

-- d) tabel audit ada:
select count(*) as baris_audit from public.admin_audit_log;

-- e) tidak ada policy profiles yang masih men-query profiles:
select count(*) as policy_rekursif_tersisa
from   pg_policies
where  schemaname = 'public' and tablename = 'profiles'
  and (coalesce(qual, '') like '%from public.profiles%'
       or coalesce(with_check, '') like '%from public.profiles%');
