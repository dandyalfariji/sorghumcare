-- ============================================================
-- SorghumCare (BimaSorgum) — Migration 015
-- Perbaikan & kelengkapan panel admin.
--
-- Isi:
--   1. Seed baris awal admin_configs (agar "Konfigurasi Aktif" tidak 0
--      dan toggle fitur punya nilai eksplisit).
--   2. Admin boleh MELIHAT semua profil (untuk halaman Kelola Pengguna).
--   3. Ubah peran pengguna lewat fungsi SECURITY DEFINER `admin_set_user_role`
--      (RLS tidak bisa membatasi per-kolom, jadi jalur fungsi yang aman).
--   4. Admin boleh MODERASI ulasan (hapus ulasan kasar / rating palsu).
--   5. Tabel `admin_audit_log` + RLS (jejak tindakan admin).
--
-- Aman diulang (idempotent).
-- ============================================================

-- ============================================================
-- 1. SEED KONFIGURASI AWAL
-- ============================================================
-- Dashboard menghitung `activeConfigs = configs.length`; tanpa baris awal
-- angkanya selalu 0 dan penguji tidak tahu key apa yang tersedia.
insert into public.admin_configs (config_key, config_value, description)
values
  ('main_feature_enabled', 'true'::jsonb,
   'Mengaktifkan generator resep AI (wizard & chat) untuk seluruh pengguna.'),
  ('images_enabled', 'true'::jsonb,
   'Menampilkan gambar resep dan materi belajar di seluruh aplikasi.'),
  ('ai_model', '""'::jsonb,
   'Model AI yang diminta ke backend saat generate resep. Kosong = pakai default backend.')
on conflict (config_key) do nothing;

-- ============================================================
-- 2. ADMIN BOLEH MELIHAT SEMUA PROFIL
-- ============================================================
-- Tanpa ini halaman Kelola Pengguna hanya bisa melihat profil admin sendiri
-- (policy "profiles own select" di 001). Isi tabel profiles tidak sensitif
-- lebih dari data publik aplikasi (nama + avatar + peran).
drop policy if exists "admins can read all profiles" on public.profiles;
create policy "admins can read all profiles"
  on public.profiles for select
  to public
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ============================================================
-- 3. UBAH PERAN PENGGUNA (fungsi aman)
-- ============================================================
-- RLS hanya bekerja per-baris, bukan per-kolom: memberi admin policy UPDATE
-- pada profiles akan sekaligus mengizinkannya mengubah `full_name` orang lain.
-- Karena itu perubahan `role` dialirkan lewat fungsi SECURITY DEFINER yang
-- memeriksa admin di dalamnya dan hanya menyentuh kolom `role`.
create or replace function public.admin_set_user_role(target_id uuid, new_role text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_admin boolean;
begin
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) into caller_is_admin;

  if not caller_is_admin then
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
-- Sesi anonim Supabase tetap memakai peran JWT `authenticated`, jadi grant
-- ini mencakup pengguna anonim maupun akun Google; gerbang sebenarnya adalah
-- pemeriksaan admin di dalam fungsi.
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;

-- ============================================================
-- 4. ADMIN BOLEH MENERBITKAN / MENARIK RESEP
-- ============================================================
-- Policy 008 hanya memberi admin DELETE pada recipes. Untuk tombol
-- Terbitkan/Tarik di panel, admin butuh UPDATE. Aman dari "claim" resep orang
-- lain karena `created_by` TIDAK PERNAH dikirim oleh aplikasi pada UPDATE ini
-- (hanya `is_published`), dan policy 005 yang memakai WITH CHECK
-- (created_by = auth.uid()) hanya berlaku bila created_by ikut di-set.
drop policy if exists "admins can update any recipe" on public.recipes;
create policy "admins can update any recipe"
  on public.recipes for update
  to public
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ============================================================
-- 5. ADMIN BOLEH MEMODERASI ULASAN
-- ============================================================
-- Migrasi 013 memberi policy "public read reviews" tapi tidak ada jalur admin
-- untuk menghapus ulasan kasar / rating palsu.
drop policy if exists "admins can delete any review" on public.recipe_reviews;
create policy "admins can delete any review"
  on public.recipe_reviews for delete
  to public
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ============================================================
-- 5. AUDIT LOG TINDAKAN ADMIN
-- ============================================================
create table if not exists public.admin_audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles (id) on delete set null,
  actor_name  text,
  action      text not null,          -- mis. 'recipe.delete'
  target_type text,                   -- 'recipe' | 'comment' | 'report' | 'profile' | 'config' | 'review'
  target_id   text,
  detail      text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_admin_audit_created
  on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;

drop policy if exists "admins read audit log" on public.admin_audit_log;
create policy "admins read audit log"
  on public.admin_audit_log for select
  to public
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "admins write audit log" on public.admin_audit_log;
create policy "admins write audit log"
  on public.admin_audit_log for insert
  to public
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ============================================================
-- VERIFIKASI (jalankan terpisah kalau perlu)
-- ============================================================
--   select config_key, config_value from public.admin_configs order by config_key;
--   select proname from pg_proc where proname = 'admin_set_user_role';
--   select tablename from pg_tables where tablename = 'admin_audit_log';
