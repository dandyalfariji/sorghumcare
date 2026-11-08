-- ============================================================================
--  SorghumCare (BimaSorgum) — SETUP DATABASE LENGKAP (SATU FILE)
-- ============================================================================
--  File ini adalah gabungan 15 file migrasi dari supabase/migrations/,
--  disusun dalam URUTAN EKSEKUSI YANG BENAR.
--
--  CARA PAKAI (paling mudah):
--    1. Buka project Supabase Anda -> menu "SQL Editor" -> "New query"
--    2. Tempel SELURUH isi file ini
--    3. Klik RUN, tunggu sampai selesai (mungkin perlu 10-30 detik)
--    4. Jalankan bagian "VERIFIKASI" di baris paling bawah file ini
--
--  MENGAPA SATU FILE? Karena urutan abjad nama file akan GAGAL:
--    * recipe_comments.sql & comment_likes.sql tidak berangka, jadi terurut
--      paling akhir -> migrasi 008 akan error "relation recipe_comments
--      does not exist" (008 membuat policy pada tabel itu).
--    * 003_recipe_source_fields.sql harus jalan SEBELUM
--      004_seed_full_catalog.sql, karena 004 memasukkan data ke kolom
--      source_id & target_budget yang justru DIBUAT oleh 003.
--    * 012_drop_price_columns.sql harus SETELAH 002 & 004 (mereka mengisi
--      kolom harga yang dihapus 012).
--
--  Semua pernyataan memakai "if not exists" / "drop ... if exists",
--  sehingga AMAN DIULANG kalau ada bagian yang gagal.
-- ============================================================================

-- ============================================================================
-- SUMBER: supabase/migrations/001_schema_core.sql
-- ============================================================================

-- ============================================================
-- SorghumCare (BimaSorgum) — Supabase Schema
-- Tema: AI Recipe Generator berbahan sorgum + target konsumen
-- (Balita, Anak Sekolah, Remaja/Dewasa, Lansia, dll)
--
-- Cara pakai:
--   1. Buat project Supabase baru (Singapore/ap-southeast-1)
--   2. Buka SQL Editor -> tempel file ini -> RUN (urut dari atas)
--   3. Simpan kunci anon/publishable + service_role ke Vercel env
--
-- Catatan penting (pelajaran dari proyek flo-web):
--   - Kunci auth: pakai PUBLISHABLE key (sb_publishable_...) utk
--     NEXT_PUBLIC_* / VITE_*, BUKAN legacy anon (eyJ...)
--   - Password DB: URL-encode karakter spesial (! # @ dst)
--   - Koneksi dari Vercel: pakai POOLER + sslmode=no-verify
-- ============================================================

-- ============================================================
-- 1. EXTENSIONS
-- ============================================================
create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "moddatetime";   -- trigger updated_at otomatis

-- ============================================================
-- 2. ENUM (nilai tetap dari frontend types.ts)
-- ============================================================
do $$ begin
  create type public.target_consumer as enum (
    'balita', 'anak_sd', 'anak_sekolah', 'siswa_smp', 'siswa_sma',
    'remaja_dewasa', 'dewasa_lansia', 'lansia'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.dish_category as enum (
    'makanan_berat', 'camilan_sehat', 'minuman_nutrisi', 'dessert_rendah_gi'
  );
exception when duplicate_object then null; end $$;

-- ============================================================
-- 3. TABEL PROFIL / GLOBAL
-- ============================================================

-- Profil pengguna (1:1 dengan auth.users). Peran dasar utk masa depan.
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  full_name     text,
  avatar_url    text,
  role          text not null default 'user'
                check (role in ('user','admin','nutritionist')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Master bahan pangan (utk wizard pilihan bahan & estimasi harga)
create table if not exists public.ingredients (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name          text not null,
  category      text not null default 'utama'
                check (category in ('utama','sayur','protein','bumbu','pelengkap')),
  icon_name     text,
  unit          text not null default 'porsi',
  default_price integer not null default 0,   -- estimasi Rupiah per unit
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ============================================================
-- 4. TABEL RESEP (Jantung Aplikasi)
-- ============================================================

-- Master resep: resep "sistem" (di-ekspor dari frontend) maupun
-- resep "AI-generated" (dihasilkan dari wizard/chat lalu disimpan)
create table if not exists public.recipes (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,          -- utk URL /recipe/:slug
  title             text not null,
  subtitle          text,
  description       text,
  image_url         text,
  tags              text[] not null default '{}',
  target_age_label  text,                          -- mis. "Balita (1-5 thn)"
  dish_category     public.dish_category,
  prep_time_minutes integer,
  cook_time_minutes integer,
  servings          integer not null default 1,
  estimated_cost    integer,                       -- Rupiah per porsi
  difficulty        text,                          -- Mudah/Sedang/Sulit
  calories_estimate integer,
  fiber_grams       numeric(6,2),
  protein_grams     numeric(6,2),
  glycemic_index    text check (glycemic_index in ('Sangat Rendah','Rendah (Low GI)','Sedang')),
  nutrition_note    text,                          -- judul + deskripsi nutrisi unggulan
  is_system         boolean not null default false,-- true = resep bawaan aplikasi
  is_published      boolean not null default true,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Bahan per resep (tabel anak resep, order dijaga dgn sort_order)
create table if not exists public.recipe_ingredients (
  id              uuid primary key default gen_random_uuid(),
  recipe_id       uuid not null references public.recipes (id) on delete cascade,
  ingredient_ref  uuid references public.ingredients (id) on delete set null,
  name            text not null,        -- denormalisasi utk resep AI (nama bebas)
  amount          text not null,        -- "50g", "1 butir", "150ml"
  notes           text,
  estimated_price integer,
  sort_order      integer not null default 0,
  unique (recipe_id, sort_order)
);

-- Langkah memasak (tabel anak resep, berurutan)
create table if not exists public.recipe_steps (
  id            uuid primary key default gen_random_uuid(),
  recipe_id     uuid not null references public.recipes (id) on delete cascade,
  step_number   integer not null,
  title         text not null,
  instruction   text not null,
  timer_minutes integer,
  tip           text,
  unique (recipe_id, step_number)
);

-- Peta target konsumen -> resep (many-to-many, dipakai filter wizard)
create table if not exists public.recipe_targets (
  recipe_id      uuid not null references public.recipes (id) on delete cascade,
  target         public.target_consumer not null,
  primary key (recipe_id, target)
);

-- ============================================================
-- 5. TABEL PENGGUNA (Interaksi)
-- ============================================================

-- Resep tersimpan / favorit pengguna
create table if not exists public.saved_recipes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  recipe_id   uuid not null references public.recipes (id) on delete cascade,
  is_favorite boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now(),
  unique (user_id, recipe_id)
);

-- Riwayat percakapan AI (per sesi chat)
create table if not exists public.chat_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null default 'Percakapan baru',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Pesan dalam sesi chat (user/ai + lampiran resep)
create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.chat_sessions (id) on delete cascade,
  sender      text not null check (sender in ('user','ai','system')),
  content     text,
  recipe_id   uuid references public.recipes (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- 6. INDEX
-- ============================================================
create index if not exists idx_recipes_category   on public.recipes (dish_category);
create index if not exists idx_recipes_created    on public.recipes (created_at desc);
create index if not exists idx_recipes_system     on public.recipes (is_system);
create index if not exists idx_recipe_ingr_recipe on public.recipe_ingredients (recipe_id);
create index if not exists idx_recipe_steps_recipe on public.recipe_steps (recipe_id);
create index if not exists idx_saved_user        on public.saved_recipes (user_id);
create index if not exists idx_saved_recipe      on public.saved_recipes (recipe_id);
create index if not exists idx_chat_sess_user    on public.chat_sessions (user_id);
create index if not exists idx_chat_msg_session  on public.chat_messages (session_id);
create index if not exists idx_ingredients_slug  on public.ingredients (slug);
create index if not exists idx_profiles_role     on public.profiles (role);

-- ============================================================
-- 7. TRIGGER updated_at
-- ============================================================
drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function moddatetime (updated_at);

drop trigger if exists trg_recipes_updated on public.recipes;
create trigger trg_recipes_updated before update on public.recipes
  for each row execute function moddatetime (updated_at);

drop trigger if exists trg_chat_sessions_updated on public.chat_sessions;
create trigger trg_chat_sessions_updated before update on public.chat_sessions
  for each row execute function moddatetime (updated_at);

-- ============================================================
-- 8. ROW LEVEL SECURITY (RLS)
--    Filosofi: katalog publik bisa dibaca semua; data pribadi
--    hanya pemiliknya (user_id = auth.uid())
-- ============================================================

-- ---- Katalog publik: baca untuk semua; tulis hanya admin/system ----
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps enable row level security;
alter table public.recipe_targets enable row level security;
alter table public.ingredients enable row level security;

create policy "recipes public read"
  on public.recipes for select using (is_published = true);
create policy "recipes ingredients public read"
  on public.recipe_ingredients for select using (true);
create policy "recipe steps public read"
  on public.recipe_steps for select using (true);
create policy "recipe targets public read"
  on public.recipe_targets for select using (true);
create policy "ingredients public read"
  on public.ingredients for select using (is_active = true);

-- ---- Data pengguna: hanya pemilik ----
alter table public.profiles enable row level security;
alter table public.saved_recipes enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;

create policy "profiles own select"
  on public.profiles for select using (auth.uid() = id);
create policy "profiles own insert"
  on public.profiles for insert with check (auth.uid() = id);
create policy "profiles own update"
  on public.profiles for update using (auth.uid() = id);

create policy "saved own all"
  on public.saved_recipes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "chat sessions own all"
  on public.chat_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "chat messages via own session"
  on public.chat_messages for all
  using (exists (
    select 1 from public.chat_sessions s
    where s.id = session_id and s.user_id = auth.uid()))
  with check (exists (
    select 1 from public.chat_sessions s
    where s.id = session_id and s.user_id = auth.uid()));

-- ============================================================
-- 9. HANDLE PROFIL BARU OTOMATIS (signup -> insert profiles)
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name',
             new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================================
-- SUMBER: supabase/migrations/recipe_comments.sql
-- ============================================================================

-- Recipe Comments table for BimaSorgum
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS recipe_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT 'Anonymous',
  avatar_url TEXT,
  content TEXT NOT NULL,
  parent_id UUID REFERENCES recipe_comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup by recipe
CREATE INDEX IF NOT EXISTS idx_recipe_comments_recipe_id ON recipe_comments(recipe_id);
-- Index for nested replies
CREATE INDEX IF NOT EXISTS idx_recipe_comments_parent_id ON recipe_comments(parent_id);

-- RLS: anyone can read, only authenticated users can insert/update/delete their own
ALTER TABLE recipe_comments ENABLE ROW LEVEL SECURITY;

-- Read: anyone (including anon)
CREATE POLICY "Comments are readable by everyone"
  ON recipe_comments FOR SELECT
  USING (true);

-- Insert: any authenticated user (including anon with stable id)
CREATE POLICY "Users can insert their own comments"
  ON recipe_comments FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

-- Update: only own comments
CREATE POLICY "Users can update their own comments"
  ON recipe_comments FOR UPDATE
  USING (auth.uid()::text = user_id);

-- Delete: only own comments
CREATE POLICY "Users can delete their own comments"
  ON recipe_comments FOR DELETE
  USING (auth.uid()::text = user_id);


-- ============================================================================
-- SUMBER: supabase/migrations/comment_likes.sql
-- ============================================================================

-- Comment Likes table for BimaSorgum
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS comment_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id UUID NOT NULL REFERENCES recipe_comments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_likes_comment_id ON comment_likes(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_likes_user_id ON comment_likes(user_id);

ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Likes are readable by everyone"
  ON comment_likes FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own likes"
  ON comment_likes FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can delete their own likes"
  ON comment_likes FOR DELETE
  USING (auth.uid()::text = user_id);


-- ============================================================================
-- SUMBER: supabase/migrations/002_seed_catalog.sql
-- ============================================================================

-- ============================================================
-- SorghumCare (BimaSorgum) — SEED DATA
-- Jalankan SETELAH 001_schema_core.sql (Source: src/data/*.ts)
-- ============================================================

-- ---------- BAHAN (dari DEFAULT_INGREDIENTS, mockData.ts) ----------
insert into public.ingredients (slug, name, category, icon_name, unit, default_price) values
  ('biji-sorgum',        'Biji Sorgum',              'utama',     'grain',   '1 porsi (100g)',        3000),
  ('tepung-sorgum',      'Tepung Sorgum',            'utama',     'blur_on', '100g',                  3500),
  ('sayuran-hijau',      'Sayuran Hijau',            'sayur',     'eco',     '1 ikat kecil',          1500),
  ('protein-ayam-telur', 'Protein Ayam/Telur',       'protein',   'egg',     '1 butir / 50g ayam',    2500),
  ('bawang-merah',       'Bawang Merah',             'bumbu',     'spa',     '3 siung',               1000),
  ('bawang-putih',       'Bawang Putih',             'bumbu',     'spa',     '2 siung',               1000),
  ('santan',             'Santan',                   'pelengkap', 'water_drop', '50ml',               1500),
  ('wortel',             'Wortel Segar',             'sayur',     'nutrition', '1 buah kecil',        1000),
  ('kecap-manis-garam',  'Kecap Manis & Garam',      'bumbu',     'soup_kitchen', 'Secukupnya',       1000),
  ('minyak-kelapa',      'Minyak Kelapa / Goreng',   'pelengkap', 'oil_barrel', '1 sdm',              1000),
  ('madu-alami',         'Madu Alami',               'pelengkap', 'hive',    '1 sdm',                 2000),
  ('pisang-buah-segar',  'Pisang / Buah Segar',      'pelengkap', 'temp_preferences_custom', '1 buah', 1500)
on conflict (slug) do nothing;

-- ---------- RESEP SISTEM (contoh: Nasi Goreng Sorgum SD) ----------
-- (ID di-snapshot agar referensi konsisten antar run)
insert into public.recipes (
  id, slug, title, subtitle, description, image_url, tags,
  target_age_label, dish_category, prep_time_minutes, cook_time_minutes,
  servings, estimated_cost, difficulty, calories_estimate,
  fiber_grams, protein_grams, glycemic_index, nutrition_note,
  is_system, is_published
) values (
  '9f2c1e4a-0000-4000-8000-000000000001',
  'nasi-goreng-sorgum-ceria-sd-edition',
  'Nasi Goreng Sorgum Ceria (SD Edition)',
  'Tentu! Ini resep bergizi, lezat, dan sangat terjangkau untuk bekal sekolah.',
  'Nasi goreng berbahan sorgum, tinggi serat, bebas gluten, cocok untuk bekal anak sekolah.',
  NULL,
  array['nasi goreng','bekal sekolah','hemat','bebas gluten'],
  'Anak Sekolah (6-12 thn)',
  'makanan_berat', 10, 15, 1, 9500, 'Mudah', 340, 8.5, 9.2, 'Rendah (Low GI)',
  'Tinggi serat untuk energi tahan lama & bebas gluten (aman untuk pencernaan sensitif anak).',
  true, true
);

insert into public.recipe_ingredients (recipe_id, ingredient_ref, name, amount, estimated_price, sort_order) values
  ('9f2c1e4a-0000-4000-8000-000000000001',
     (select id from public.ingredients where slug='biji-sorgum'),
     'Nasi sorgum dingin', '1 piring (150g)', 3000, 0),
  ('9f2c1e4a-0000-4000-8000-000000000001',
     (select id from public.ingredients where slug='protein-ayam-telur'),
     'Telur, kocok lepas', '1 butir', 2000, 1),
  ('9f2c1e4a-0000-4000-8000-000000000001',
     (select id from public.ingredients where slug='wortel'),
     'Wortel kecil, potong dadu', '1/2 buah', 1000, 2),
  ('9f2c1e4a-0000-4000-8000-000000000001',
     (select id from public.ingredients where slug='bawang-merah'),
     'Bawang merah & putih', '2 siung each', 1500, 3),
  ('9f2c1e4a-0000-4000-8000-000000000001',
     (select id from public.ingredients where slug='kecap-manis-garam'),
     'Kecap manis & garam', 'Secukupnya', 1000, 4),
  ('9f2c1e4a-0000-4000-8000-000000000001',
     (select id from public.ingredients where slug='minyak-kelapa'),
     'Minyak goreng', '1 sdm', 1000, 5);

insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip) values
  ('9f2c1e4a-0000-4000-8000-000000000001', 1, 'Persiapan Bahan',
   'Pastikan nasi sorgum sudah dalam keadaan dingin agar teksturnya butiran tidak menggumpal saat ditumis.',
   2, 'Masak sorgum dengan perbandingan 1:3 air semalam sebelumnya.'),
  ('9f2c1e4a-0000-4000-8000-000000000001', 2, 'Menumis Bumbu',
   'Panaskan minyak, tumis bawang merah dan bawang putih hingga harum.',
   3, NULL),
  ('9f2c1e4a-0000-4000-8000-000000000001', 3, 'Masak Telur & Sayur',
   'Masukkan telur, orak-arik hingga matang lalu tambah wortel dan sayuran lain.',
   4, NULL),
  ('9f2c1e4a-0000-4000-8000-000000000001', 4, 'Nasi Goreng',
   'Masukkan nasi sorgum, bumbui kecap manis dan garam. Aduk rata hingga panas.',
   3, 'Gunakan api besar agar tekstur nasi tetap pulen.');

insert into public.recipe_targets (recipe_id, target) values
  ('9f2c1e4a-0000-4000-8000-000000000001', 'anak_sd'),
  ('9f2c1e4a-0000-4000-8000-000000000001', 'anak_sekolah'),
  ('9f2c1e4a-0000-4000-8000-000000000001', 'siswa_smp')
on conflict do nothing;

-- ---------- VERIFIKASI CEPAT ----------
-- select 'recipes' as t, count(*) from public.recipes
-- union all select 'ingredients', count(*) from public.ingredients;

-- ============================================================================
-- SUMBER: supabase/migrations/003_recipe_source_fields.sql
-- ============================================================================

-- ============================================================
-- SorghumCare (BimaSorgum) — Migration 003
-- Tambahan kolom untuk integrasi frontend↔DB
--   source_id            : id string asal dari data frontend (stabil utk relasi)
--   target_budget        : budget target per porsi (Rp) — dari Recipe.targetBudget
--   nutrition_title      : judul blok nutrisi ("Nutrisi Unggulan")
--   nutrition_description: deskripsi nutrisi unggulan
--   prep_time_limit      : batas waktu persiapan (dari wizard), utk resep user
-- ============================================================

alter table public.recipes
  add column if not exists source_id        text,
  add column if not exists target_budget    integer,
  add column if not exists nutrition_title  text,
  add column if not exists nutrition_description text,
  add column if not exists prep_time_limit  text;

create unique index if not exists idx_recipes_source_id
  on public.recipes (source_id)
  where source_id is not null;


-- ============================================================================
-- SUMBER: supabase/migrations/004_seed_full_catalog.sql
-- ============================================================================

-- ============================================================
-- SorghumCare (BimaSorgum) — Migration 004: FULL SYSTEM CATALOG SEED
-- Generated from src/data (source of truth). Idempotent (upsert by source_id).
-- ============================================================

-- ---------- RECIPES ----------
insert into public.recipes (id, source_id, slug, title, subtitle, image_url, tags, target_age_label, dish_category, prep_time_minutes, cook_time_minutes, servings, estimated_cost, target_budget, calories_estimate, fiber_grams, protein_grams, glycemic_index, nutrition_title, nutrition_description, is_system, is_published, created_at)
values ('3cb225e7-55bf-4732-6e9c-ae08e5de0a83', 'nasi-goreng-sorgum-sd', 'nasi-goreng-sorgum-ceria-sd-edition', 'Nasi Goreng Sorgum Ceria (SD Edition)', 'Tentu! Ini resep bergizi, lezat, dan sangat terjangkau untuk bekal sekolah:', 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=800&auto=format&fit=crop&q=80', array['Bekal Sekolah','Bebas Gluten','Budget Friendly','Tinggi Serat'], 'Anak Sekolah (6-12 thn)', 'makanan_berat', 10, 15, 1, 9500, 10000, 340, 8.5, 9.2, 'Rendah (Low GI)', 'Nutrisi Unggulan', 'Tinggi serat untuk energi tahan lama & bebas gluten (aman untuk pencernaan sensitif anak).', true, true, '2026-08-26T10:42:00Z')
on conflict (slug) do update set source_id=excluded.source_id, title=excluded.title, subtitle=excluded.subtitle, image_url=excluded.image_url, tags=excluded.tags, target_age_label=excluded.target_age_label, dish_category=excluded.dish_category, prep_time_minutes=excluded.prep_time_minutes, cook_time_minutes=excluded.cook_time_minutes, servings=excluded.servings, estimated_cost=excluded.estimated_cost, target_budget=excluded.target_budget, calories_estimate=excluded.calories_estimate, fiber_grams=excluded.fiber_grams, protein_grams=excluded.protein_grams, glycemic_index=excluded.glycemic_index, nutrition_title=excluded.nutrition_title, nutrition_description=excluded.nutrition_description;

insert into public.recipes (id, source_id, slug, title, subtitle, image_url, tags, target_age_label, dish_category, prep_time_minutes, cook_time_minutes, servings, estimated_cost, target_budget, calories_estimate, fiber_grams, protein_grams, glycemic_index, nutrition_title, nutrition_description, is_system, is_published, created_at)
values ('8104aefe-a5fa-40e5-67c1-b03c757b4d9e', 'pancakes-sorghum', 'pancakes-sorghum-gluten-free', 'Sorghum Pancakes Bebas Gluten', 'Pancake lembut mengenyangkan dari tepung sorgum dengan madu kelapa murni.', 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=800&auto=format&fit=crop&q=80', array['Gluten Free','Sarapan','Manis Alami'], 'Balita & Anak Sekolah', 'camilan_sehat', 10, 10, 2, 11000, 12000, 280, 6.2, 7.8, 'Rendah (Low GI)', 'Nutrisi Unggulan', 'Kaya kalsium, fosfor, dan bebas protein gluten untuk sarapan sehat keluarga.', true, true, '2026-08-25T08:00:00Z')
on conflict (slug) do update set source_id=excluded.source_id, title=excluded.title, subtitle=excluded.subtitle, image_url=excluded.image_url, tags=excluded.tags, target_age_label=excluded.target_age_label, dish_category=excluded.dish_category, prep_time_minutes=excluded.prep_time_minutes, cook_time_minutes=excluded.cook_time_minutes, servings=excluded.servings, estimated_cost=excluded.estimated_cost, target_budget=excluded.target_budget, calories_estimate=excluded.calories_estimate, fiber_grams=excluded.fiber_grams, protein_grams=excluded.protein_grams, glycemic_index=excluded.glycemic_index, nutrition_title=excluded.nutrition_title, nutrition_description=excluded.nutrition_description;

insert into public.recipes (id, source_id, slug, title, subtitle, image_url, tags, target_age_label, dish_category, prep_time_minutes, cook_time_minutes, servings, estimated_cost, target_budget, calories_estimate, fiber_grams, protein_grams, glycemic_index, nutrition_title, nutrition_description, is_system, is_published, created_at)
values ('efd83b54-a70a-4c26-aeef-dc4e45548abe', 'rustic-loaf-sorghum', 'roti-tawar-biji-sorgum-artisanal', 'Rustic Sorghum Loaf Bread', 'Roti tawar artisanal kaya serat bertekstur padat lembut tanpa terigu gandum.', 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800&auto=format&fit=crop&q=80', array['Artisanal','Bebas Gluten','Low GI'], 'Remaja & Dewasa', 'makanan_berat', 20, 40, 6, 14500, 15000, 210, 12, 11.5, 'Rendah (Low GI)', 'Nutrisi Unggulan', 'Karbohidrat kompleks tahan lama dengan indeks glikemik stabil, baik untuk penderita diabetes.', true, true, '2026-08-24T14:30:00Z')
on conflict (slug) do update set source_id=excluded.source_id, title=excluded.title, subtitle=excluded.subtitle, image_url=excluded.image_url, tags=excluded.tags, target_age_label=excluded.target_age_label, dish_category=excluded.dish_category, prep_time_minutes=excluded.prep_time_minutes, cook_time_minutes=excluded.cook_time_minutes, servings=excluded.servings, estimated_cost=excluded.estimated_cost, target_budget=excluded.target_budget, calories_estimate=excluded.calories_estimate, fiber_grams=excluded.fiber_grams, protein_grams=excluded.protein_grams, glycemic_index=excluded.glycemic_index, nutrition_title=excluded.nutrition_title, nutrition_description=excluded.nutrition_description;

insert into public.recipes (id, source_id, slug, title, subtitle, image_url, tags, target_age_label, dish_category, prep_time_minutes, cook_time_minutes, servings, estimated_cost, target_budget, calories_estimate, fiber_grams, protein_grams, glycemic_index, nutrition_title, nutrition_description, is_system, is_published, created_at)
values ('02089fec-da16-4138-2301-5ca731e88017', 'healthy-bowl-sorghum', 'sorghum-power-bowl', 'Healthy Buddha Bowl Sayur & Sorgum', 'Mangkok nutrisi lengkap dengan paduan biji sorgum pulen, selada, dan saus wijen.', 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&auto=format&fit=crop&q=80', array['Plant-Based','Superfood','Antioksidan'], 'Remaja, Dewasa & Lansia', 'makanan_berat', 15, 15, 1, 10500, 12000, 310, 10.4, 14.2, 'Sangat Rendah', 'Nutrisi Unggulan', 'Tinggi antioksidan polifenol & serat pangan pangan prebiotik untuk mikrobioma usus sehat.', true, true, '2026-08-23T11:20:00Z')
on conflict (slug) do update set source_id=excluded.source_id, title=excluded.title, subtitle=excluded.subtitle, image_url=excluded.image_url, tags=excluded.tags, target_age_label=excluded.target_age_label, dish_category=excluded.dish_category, prep_time_minutes=excluded.prep_time_minutes, cook_time_minutes=excluded.cook_time_minutes, servings=excluded.servings, estimated_cost=excluded.estimated_cost, target_budget=excluded.target_budget, calories_estimate=excluded.calories_estimate, fiber_grams=excluded.fiber_grams, protein_grams=excluded.protein_grams, glycemic_index=excluded.glycemic_index, nutrition_title=excluded.nutrition_title, nutrition_description=excluded.nutrition_description;

insert into public.recipes (id, source_id, slug, title, subtitle, image_url, tags, target_age_label, dish_category, prep_time_minutes, cook_time_minutes, servings, estimated_cost, target_budget, calories_estimate, fiber_grams, protein_grams, glycemic_index, nutrition_title, nutrition_description, is_system, is_published, created_at)
values ('5ba7c469-5d20-4cea-d642-2f6996e1645e', 'sorghum-mushroom-risotto', 'risotto-jamur-liar-sorgum-creamy', 'Sorghum Mushroom Creamy Risotto', 'Alternatif risotto bebas gluten dengan biji sorgum pulen kenyal, jamur champignon, dan kaldu gurih nabati.', 'https://images.unsplash.com/photo-1633964913295-ceb43826e7c9?w=800&auto=format&fit=crop&q=80', array['Low GI','Gourmet Sehat','Gluten Free','Tinggi Serat'], 'Remaja, Dewasa & Lansia', 'makanan_berat', 10, 25, 2, 16000, 18000, 360, 9.8, 11.2, 'Rendah (Low GI)', 'Nutrisi Unggulan', 'Serat larut beta-glukan sorgum berpadu dengan antioksidan jamur untuk kesehatan jantung dan imun.', true, true, '2026-08-25T11:00:00Z')
on conflict (slug) do update set source_id=excluded.source_id, title=excluded.title, subtitle=excluded.subtitle, image_url=excluded.image_url, tags=excluded.tags, target_age_label=excluded.target_age_label, dish_category=excluded.dish_category, prep_time_minutes=excluded.prep_time_minutes, cook_time_minutes=excluded.cook_time_minutes, servings=excluded.servings, estimated_cost=excluded.estimated_cost, target_budget=excluded.target_budget, calories_estimate=excluded.calories_estimate, fiber_grams=excluded.fiber_grams, protein_grams=excluded.protein_grams, glycemic_index=excluded.glycemic_index, nutrition_title=excluded.nutrition_title, nutrition_description=excluded.nutrition_description;

insert into public.recipes (id, source_id, slug, title, subtitle, image_url, tags, target_age_label, dish_category, prep_time_minutes, cook_time_minutes, servings, estimated_cost, target_budget, calories_estimate, fiber_grams, protein_grams, glycemic_index, nutrition_title, nutrition_description, is_system, is_published, created_at)
values ('3f90e0c3-27cf-4763-0c26-52f8afe72bf5', 'bubur-manado-tinutuan-sorgum', 'bubur-tinutuan-sorgum-manado', 'Tinutuan Bubur Sayur Sorgum Manado', 'Kreasi bubur Manado tradisional kaya serat dari biji sorgum pulen berpadu labu kuning, kangkung, dan jagung manis.', 'https://images.unsplash.com/photo-1541832676-9b763b0239ab?w=800&auto=format&fit=crop&q=80', array['Tradisional','Kaya Vitamin A','Low GI','Ramah Lansia & Balita'], 'Semua Usia (Balita - Lansia)', 'makanan_berat', 10, 20, 2, 11000, 12000, 290, 11.5, 8.9, 'Sangat Rendah', 'Nutrisi Unggulan', 'Super kaya vitamin A beta-karoten, kalium, dan serat pangan prebiotik tanpa risiko lonjakan glukosa darah.', true, true, '2026-08-25T14:15:00Z')
on conflict (slug) do update set source_id=excluded.source_id, title=excluded.title, subtitle=excluded.subtitle, image_url=excluded.image_url, tags=excluded.tags, target_age_label=excluded.target_age_label, dish_category=excluded.dish_category, prep_time_minutes=excluded.prep_time_minutes, cook_time_minutes=excluded.cook_time_minutes, servings=excluded.servings, estimated_cost=excluded.estimated_cost, target_budget=excluded.target_budget, calories_estimate=excluded.calories_estimate, fiber_grams=excluded.fiber_grams, protein_grams=excluded.protein_grams, glycemic_index=excluded.glycemic_index, nutrition_title=excluded.nutrition_title, nutrition_description=excluded.nutrition_description;

insert into public.recipes (id, source_id, slug, title, subtitle, image_url, tags, target_age_label, dish_category, prep_time_minutes, cook_time_minutes, servings, estimated_cost, target_budget, calories_estimate, fiber_grams, protein_grams, glycemic_index, nutrition_title, nutrition_description, is_system, is_published, created_at)
values ('a3a939c0-0cba-4c8e-46ea-ee118f05effc', 'sorghum-cookies-chocochip', 'cookies-keping-cokelat-sorgum', 'Crunchy Sorghum Chocochip Cookies', 'Kue kering renyah bebas terigu dari tepung sorgum dengan dark chocolate chips dan aroma gula kelapa harum.', 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=800&auto=format&fit=crop&q=80', array['Camilan Sehat','Bebas Gluten','Bekal Anak','Baking Mudah'], 'Anak Sekolah & Remaja', 'camilan_sehat', 15, 15, 12, 13500, 15000, 160, 5.6, 4.8, 'Rendah (Low GI)', 'Nutrisi Unggulan', 'Camilan manis alami bebas gluten dengan zat besi dan magnesium tinggi untuk konsentrasi belajar anak.', true, true, '2026-08-25T16:00:00Z')
on conflict (slug) do update set source_id=excluded.source_id, title=excluded.title, subtitle=excluded.subtitle, image_url=excluded.image_url, tags=excluded.tags, target_age_label=excluded.target_age_label, dish_category=excluded.dish_category, prep_time_minutes=excluded.prep_time_minutes, cook_time_minutes=excluded.cook_time_minutes, servings=excluded.servings, estimated_cost=excluded.estimated_cost, target_budget=excluded.target_budget, calories_estimate=excluded.calories_estimate, fiber_grams=excluded.fiber_grams, protein_grams=excluded.protein_grams, glycemic_index=excluded.glycemic_index, nutrition_title=excluded.nutrition_title, nutrition_description=excluded.nutrition_description;

insert into public.recipes (id, source_id, slug, title, subtitle, image_url, tags, target_age_label, dish_category, prep_time_minutes, cook_time_minutes, servings, estimated_cost, target_budget, calories_estimate, fiber_grams, protein_grams, glycemic_index, nutrition_title, nutrition_description, is_system, is_published, created_at)
values ('b121262e-9ba0-4c1f-379b-428e84903e6f', 'es-cendol-dawet-sorgum', 'es-cendol-sorgum-nangka-gula-aren', 'Es Dawet Cendol Tepung Sorgum Sehat', 'Minuman segar tradisional dengan cendol kenyal dari tepung sorgum, santan kelapa murni, dan sirup nira aren organik.', 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=800&auto=format&fit=crop&q=80', array['Minuman Segar','Tradisional','Bebas Gluten','Pencuci Mulut'], 'Semua Usia', 'minuman_nutrisi', 15, 10, 2, 8500, 10000, 190, 6, 3.5, 'Rendah (Low GI)', 'Nutrisi Unggulan', 'Menyegarkan tanpa lonjakan insulin, kaya senyawa klorofil pandan dan serat pencernaan sorgum.', true, true, '2026-08-25T17:30:00Z')
on conflict (slug) do update set source_id=excluded.source_id, title=excluded.title, subtitle=excluded.subtitle, image_url=excluded.image_url, tags=excluded.tags, target_age_label=excluded.target_age_label, dish_category=excluded.dish_category, prep_time_minutes=excluded.prep_time_minutes, cook_time_minutes=excluded.cook_time_minutes, servings=excluded.servings, estimated_cost=excluded.estimated_cost, target_budget=excluded.target_budget, calories_estimate=excluded.calories_estimate, fiber_grams=excluded.fiber_grams, protein_grams=excluded.protein_grams, glycemic_index=excluded.glycemic_index, nutrition_title=excluded.nutrition_title, nutrition_description=excluded.nutrition_description;

insert into public.recipes (id, source_id, slug, title, subtitle, image_url, tags, target_age_label, dish_category, prep_time_minutes, cook_time_minutes, servings, estimated_cost, target_budget, calories_estimate, fiber_grams, protein_grams, glycemic_index, nutrition_title, nutrition_description, is_system, is_published, created_at)
values ('c1f2b15d-c9fc-4430-d3b5-3c5a3b473716', 'bolu-kukus-sorgum-gula-aren', 'bolu-kukus-pandan-sorgum-mekar', 'Bolu Kukus Mekar Sorgum & Pandan Aren', 'Bolu kukus super empuk dan mekar sempurna dibuat dari 100% tepung sorgum bebas gluten beraroma pandan alami.', 'https://images.unsplash.com/photo-1587314168485-3236d6710814?w=800&auto=format&fit=crop&q=80', array['Bolu Kukus','Bebas Gluten','Kudapan Tradisional','Rendah Gula'], 'Semua Usia', 'dessert_rendah_gi', 10, 15, 6, 10000, 12000, 210, 7.2, 6.5, 'Rendah (Low GI)', 'Nutrisi Unggulan', 'Kudapan manis lembut ramah pencernaan dengan profil asam amino esensial lengkap dan rendah lemak jenuh.', true, true, '2026-08-25T18:00:00Z')
on conflict (slug) do update set source_id=excluded.source_id, title=excluded.title, subtitle=excluded.subtitle, image_url=excluded.image_url, tags=excluded.tags, target_age_label=excluded.target_age_label, dish_category=excluded.dish_category, prep_time_minutes=excluded.prep_time_minutes, cook_time_minutes=excluded.cook_time_minutes, servings=excluded.servings, estimated_cost=excluded.estimated_cost, target_budget=excluded.target_budget, calories_estimate=excluded.calories_estimate, fiber_grams=excluded.fiber_grams, protein_grams=excluded.protein_grams, glycemic_index=excluded.glycemic_index, nutrition_title=excluded.nutrition_title, nutrition_description=excluded.nutrition_description;

insert into public.recipes (id, source_id, slug, title, subtitle, image_url, tags, target_age_label, dish_category, prep_time_minutes, cook_time_minutes, servings, estimated_cost, target_budget, calories_estimate, fiber_grams, protein_grams, glycemic_index, nutrition_title, nutrition_description, is_system, is_published, created_at)
values ('f78a8e5b-a475-4283-5b30-a3c9962b3e43', 'sup-krim-sorgum-jagung', 'sup-krim-jagung-sorgum-hangat', 'Creamy Sorghum & Sweet Corn Chowder', 'Sup hangat kental menenangkan dengan butiran biji sorgum kenyal, jagung manis pipil, dan wortel dadu kaya serat.', 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=800&auto=format&fit=crop&q=80', array['Sup Hangat','Comfort Food','Ramah Balita','Kaya Serat'], 'Balita, Anak Sekolah & Lansia', 'makanan_berat', 10, 15, 2, 10500, 12000, 260, 8.8, 7, 'Rendah (Low GI)', 'Nutrisi Unggulan', 'Menghangatkan tubuh, kaya kalsium dan prebiotik alami untuk imunitas keluarga di musim hujan.', true, true, '2026-08-25T19:00:00Z')
on conflict (slug) do update set source_id=excluded.source_id, title=excluded.title, subtitle=excluded.subtitle, image_url=excluded.image_url, tags=excluded.tags, target_age_label=excluded.target_age_label, dish_category=excluded.dish_category, prep_time_minutes=excluded.prep_time_minutes, cook_time_minutes=excluded.cook_time_minutes, servings=excluded.servings, estimated_cost=excluded.estimated_cost, target_budget=excluded.target_budget, calories_estimate=excluded.calories_estimate, fiber_grams=excluded.fiber_grams, protein_grams=excluded.protein_grams, glycemic_index=excluded.glycemic_index, nutrition_title=excluded.nutrition_title, nutrition_description=excluded.nutrition_description;

-- ---------- RECIPE INGREDIENTS ----------
insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'nasi-goreng-sorgum-ceria-sd-edition'), '1 piring nasi sorgum dingin', '1 piring (150g)', NULL, 3000, 0
where exists (select 1 from public.recipes where slug = 'nasi-goreng-sorgum-ceria-sd-edition')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'nasi-goreng-sorgum-ceria-sd-edition'), '1 butir telur, kocok lepas', '1 butir', NULL, 2000, 1
where exists (select 1 from public.recipes where slug = 'nasi-goreng-sorgum-ceria-sd-edition')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'nasi-goreng-sorgum-ceria-sd-edition'), 'Wortel kecil, potong dadu', '1/2 buah', NULL, 1000, 2
where exists (select 1 from public.recipes where slug = 'nasi-goreng-sorgum-ceria-sd-edition')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'nasi-goreng-sorgum-ceria-sd-edition'), 'Bawang merah & putih', '2 siung each', NULL, 1500, 3
where exists (select 1 from public.recipes where slug = 'nasi-goreng-sorgum-ceria-sd-edition')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'nasi-goreng-sorgum-ceria-sd-edition'), 'Kecap manis & garam', 'Secukupnya', NULL, 1000, 4
where exists (select 1 from public.recipes where slug = 'nasi-goreng-sorgum-ceria-sd-edition')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'nasi-goreng-sorgum-ceria-sd-edition'), 'Sedikit minyak goreng', '1 sdm', NULL, 1000, 5
where exists (select 1 from public.recipes where slug = 'nasi-goreng-sorgum-ceria-sd-edition')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'pancakes-sorghum-gluten-free'), 'Tepung sorgum halus', '100g', NULL, 4000, 0
where exists (select 1 from public.recipes where slug = 'pancakes-sorghum-gluten-free')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'pancakes-sorghum-gluten-free'), '1 butir telur ayam', '1 butir', NULL, 2000, 1
where exists (select 1 from public.recipes where slug = 'pancakes-sorghum-gluten-free')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'pancakes-sorghum-gluten-free'), 'Susu / santan cair', '80ml', NULL, 2000, 2
where exists (select 1 from public.recipes where slug = 'pancakes-sorghum-gluten-free')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'pancakes-sorghum-gluten-free'), 'Madu atau gula kelapa', '1 sdm', NULL, 2000, 3
where exists (select 1 from public.recipes where slug = 'pancakes-sorghum-gluten-free')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'pancakes-sorghum-gluten-free'), 'Baking powder & sejumput garam', '1/2 sdt', NULL, 1000, 4
where exists (select 1 from public.recipes where slug = 'pancakes-sorghum-gluten-free')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'roti-tawar-biji-sorgum-artisanal'), 'Tepung sorgum premium', '250g', NULL, 7500, 0
where exists (select 1 from public.recipes where slug = 'roti-tawar-biji-sorgum-artisanal')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'roti-tawar-biji-sorgum-artisanal'), 'Tepung tapioka / pati garut', '50g', NULL, 1500, 1
where exists (select 1 from public.recipes where slug = 'roti-tawar-biji-sorgum-artisanal')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'roti-tawar-biji-sorgum-artisanal'), 'Ragi instan', '1 sdt', NULL, 1500, 2
where exists (select 1 from public.recipes where slug = 'roti-tawar-biji-sorgum-artisanal')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'roti-tawar-biji-sorgum-artisanal'), 'Minyak kelapa & air hangat', '200ml', NULL, 2000, 3
where exists (select 1 from public.recipes where slug = 'roti-tawar-biji-sorgum-artisanal')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'roti-tawar-biji-sorgum-artisanal'), 'Biji chia / biji sorgum sangrai', '1 sdm', NULL, 2000, 4
where exists (select 1 from public.recipes where slug = 'roti-tawar-biji-sorgum-artisanal')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'sorghum-power-bowl'), 'Biji sorgum rebus empuk', '1 mangkok (120g)', NULL, 3500, 0
where exists (select 1 from public.recipes where slug = 'sorghum-power-bowl')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'sorghum-power-bowl'), 'Sayuran hijau (bayam & selada)', '1 genggam', NULL, 2000, 1
where exists (select 1 from public.recipes where slug = 'sorghum-power-bowl')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'sorghum-power-bowl'), 'Tempe / Tahu panggang', '3 potong dadu', NULL, 2000, 2
where exists (select 1 from public.recipes where slug = 'sorghum-power-bowl')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'sorghum-power-bowl'), 'Irisan tomat & mentimun', '1 buah', NULL, 1500, 3
where exists (select 1 from public.recipes where slug = 'sorghum-power-bowl')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'sorghum-power-bowl'), 'Dressing wijen sangrai', '2 sdm', NULL, 1500, 4
where exists (select 1 from public.recipes where slug = 'sorghum-power-bowl')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'risotto-jamur-liar-sorgum-creamy'), 'Biji sorgum rendam semalam', '150g', NULL, 4500, 0
where exists (select 1 from public.recipes where slug = 'risotto-jamur-liar-sorgum-creamy')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'risotto-jamur-liar-sorgum-creamy'), 'Jamur kancing / champignon iris', '100g', NULL, 4000, 1
where exists (select 1 from public.recipes where slug = 'risotto-jamur-liar-sorgum-creamy')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'risotto-jamur-liar-sorgum-creamy'), 'Bawang bombay & bawang putih', '1/2 buah + 2 siung', NULL, 2000, 2
where exists (select 1 from public.recipes where slug = 'risotto-jamur-liar-sorgum-creamy')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'risotto-jamur-liar-sorgum-creamy'), 'Kaldu sayur hangat / ayam', '350ml', NULL, 2500, 3
where exists (select 1 from public.recipes where slug = 'risotto-jamur-liar-sorgum-creamy')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'risotto-jamur-liar-sorgum-creamy'), 'Minyak zaitun / mentega nabati', '1 sdm', NULL, 1500, 4
where exists (select 1 from public.recipes where slug = 'risotto-jamur-liar-sorgum-creamy')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'risotto-jamur-liar-sorgum-creamy'), 'Keju parmesan parut (opsional)', '1 sdm', NULL, 1500, 5
where exists (select 1 from public.recipes where slug = 'risotto-jamur-liar-sorgum-creamy')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'bubur-tinutuan-sorgum-manado'), 'Biji sorgum giling / utuh rebus', '120g', NULL, 3500, 0
where exists (select 1 from public.recipes where slug = 'bubur-tinutuan-sorgum-manado')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'bubur-tinutuan-sorgum-manado'), 'Labu kuning kukus potong dadu', '80g', NULL, 1500, 1
where exists (select 1 from public.recipes where slug = 'bubur-tinutuan-sorgum-manado')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'bubur-tinutuan-sorgum-manado'), 'Jagung manis pipil', '50g', NULL, 1500, 2
where exists (select 1 from public.recipes where slug = 'bubur-tinutuan-sorgum-manado')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'bubur-tinutuan-sorgum-manado'), 'Daun bayam / kangkung & kemangi', '1 ikat', NULL, 2000, 3
where exists (select 1 from public.recipes where slug = 'bubur-tinutuan-sorgum-manado')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'bubur-tinutuan-sorgum-manado'), 'Serai memar & daun bawang', '1 batang', NULL, 1000, 4
where exists (select 1 from public.recipes where slug = 'bubur-tinutuan-sorgum-manado')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'bubur-tinutuan-sorgum-manado'), 'Ikan asin / tempe renyah (pelengkap)', 'Secukupnya', NULL, 1500, 5
where exists (select 1 from public.recipes where slug = 'bubur-tinutuan-sorgum-manado')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'cookies-keping-cokelat-sorgum'), 'Tepung sorgum sangrai halus', '120g', NULL, 4000, 0
where exists (select 1 from public.recipes where slug = 'cookies-keping-cokelat-sorgum')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'cookies-keping-cokelat-sorgum'), 'Minyak kelapa / butter leleh', '50g', NULL, 3500, 1
where exists (select 1 from public.recipes where slug = 'cookies-keping-cokelat-sorgum')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'cookies-keping-cokelat-sorgum'), 'Gula kelapa / aren bubuk', '40g', NULL, 2000, 2
where exists (select 1 from public.recipes where slug = 'cookies-keping-cokelat-sorgum')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'cookies-keping-cokelat-sorgum'), '1 butir kuning telur ayam', '1 butir', NULL, 2000, 3
where exists (select 1 from public.recipes where slug = 'cookies-keping-cokelat-sorgum')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'cookies-keping-cokelat-sorgum'), 'Dark chocolate chips 70%', '30g', NULL, 2000, 4
where exists (select 1 from public.recipes where slug = 'cookies-keping-cokelat-sorgum')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'es-cendol-sorgum-nangka-gula-aren'), 'Tepung sorgum & tapioka (rasio 2:1)', '60g', NULL, 2500, 0
where exists (select 1 from public.recipes where slug = 'es-cendol-sorgum-nangka-gula-aren')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'es-cendol-sorgum-nangka-gula-aren'), 'Air perasan daun suji & pandan', '200ml', NULL, 1500, 1
where exists (select 1 from public.recipes where slug = 'es-cendol-sorgum-nangka-gula-aren')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'es-cendol-sorgum-nangka-gula-aren'), 'Santan kelapa segar matang', '150ml', NULL, 2000, 2
where exists (select 1 from public.recipes where slug = 'es-cendol-sorgum-nangka-gula-aren')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'es-cendol-sorgum-nangka-gula-aren'), 'Gula aren cair asli', '4 sdm', NULL, 1500, 3
where exists (select 1 from public.recipes where slug = 'es-cendol-sorgum-nangka-gula-aren')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'es-cendol-sorgum-nangka-gula-aren'), 'Es batu kristal', 'Secukupnya', NULL, 1000, 4
where exists (select 1 from public.recipes where slug = 'es-cendol-sorgum-nangka-gula-aren')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'bolu-kukus-pandan-sorgum-mekar'), 'Tepung sorgum premium ayak', '150g', NULL, 4500, 0
where exists (select 1 from public.recipes where slug = 'bolu-kukus-pandan-sorgum-mekar')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'bolu-kukus-pandan-sorgum-mekar'), 'Telur ayam negeri', '2 butir', NULL, 3500, 1
where exists (select 1 from public.recipes where slug = 'bolu-kukus-pandan-sorgum-mekar')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'bolu-kukus-pandan-sorgum-mekar'), 'Gula aren organik bubuk', '60g', NULL, 2000, 2
where exists (select 1 from public.recipes where slug = 'bolu-kukus-pandan-sorgum-mekar')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'bolu-kukus-pandan-sorgum-mekar'), 'Santan kental & air pandan', '60ml', NULL, 1500, 3
where exists (select 1 from public.recipes where slug = 'bolu-kukus-pandan-sorgum-mekar')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'bolu-kukus-pandan-sorgum-mekar'), 'Baking powder', '1/2 sdt', NULL, 500, 4
where exists (select 1 from public.recipes where slug = 'bolu-kukus-pandan-sorgum-mekar')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'sup-krim-jagung-sorgum-hangat'), 'Biji sorgum rebus empuk', '100g', NULL, 3000, 0
where exists (select 1 from public.recipes where slug = 'sup-krim-jagung-sorgum-hangat')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'sup-krim-jagung-sorgum-hangat'), 'Jagung manis pipil segar', '1 buah', NULL, 2500, 1
where exists (select 1 from public.recipes where slug = 'sup-krim-jagung-sorgum-hangat')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'sup-krim-jagung-sorgum-hangat'), 'Wortel potong dadu kecil', '1/2 buah', NULL, 1000, 2
where exists (select 1 from public.recipes where slug = 'sup-krim-jagung-sorgum-hangat')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'sup-krim-jagung-sorgum-hangat'), 'Susu cair UHT / santan encer', '150ml', NULL, 2000, 3
where exists (select 1 from public.recipes where slug = 'sup-krim-jagung-sorgum-hangat')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'sup-krim-jagung-sorgum-hangat'), 'Bawang bombay & mentega', '1 sdm', NULL, 1500, 4
where exists (select 1 from public.recipes where slug = 'sup-krim-jagung-sorgum-hangat')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

insert into public.recipe_ingredients (recipe_id, name, amount, notes, estimated_price, sort_order)
select (select id from public.recipes where slug = 'sup-krim-jagung-sorgum-hangat'), 'Pala bubuk, garam & merica', 'Secukupnya', NULL, 500, 5
where exists (select 1 from public.recipes where slug = 'sup-krim-jagung-sorgum-hangat')
on conflict (recipe_id, sort_order) do update set name=excluded.name, amount=excluded.amount, notes=excluded.notes, estimated_price=excluded.estimated_price;

-- ---------- RECIPE STEPS ----------
insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip)
select (select id from public.recipes where slug = 'nasi-goreng-sorgum-ceria-sd-edition'), 1, 'Persiapan Bahan', 'Pastikan nasi sorgum sudah dalam keadaan dingin agar teksturnya butiran tidak menggumpal saat ditumis.', 2, 'Masak sorgum dengan perbandingan 1:3 air semalam sebelumnya.'
where exists (select 1 from public.recipes where slug = 'nasi-goreng-sorgum-ceria-sd-edition')
on conflict (recipe_id, step_number) do update set title=excluded.title, instruction=excluded.instruction, timer_minutes=excluded.timer_minutes, tip=excluded.tip;

insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip)
select (select id from public.recipes where slug = 'nasi-goreng-sorgum-ceria-sd-edition'), 2, 'Tumis Bumbu & Telur', 'Panaskan 1 sdm minyak. Tumis irisan bawang merah dan putih hingga harum. Masukkan telur kocok, lalu orak-arik hingga matang.', 3, NULL
where exists (select 1 from public.recipes where slug = 'nasi-goreng-sorgum-ceria-sd-edition')
on conflict (recipe_id, step_number) do update set title=excluded.title, instruction=excluded.instruction, timer_minutes=excluded.timer_minutes, tip=excluded.tip;

insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip)
select (select id from public.recipes where slug = 'nasi-goreng-sorgum-ceria-sd-edition'), 3, 'Masukkan Sayur & Sorgum', 'Tambahkan potongan dadu wortel, aduk sebentar. Masukkan nasi sorgum dingin, kecap manis, garam, dan sedikit merica.', 4, NULL
where exists (select 1 from public.recipes where slug = 'nasi-goreng-sorgum-ceria-sd-edition')
on conflict (recipe_id, step_number) do update set title=excluded.title, instruction=excluded.instruction, timer_minutes=excluded.timer_minutes, tip=excluded.tip;

insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip)
select (select id from public.recipes where slug = 'nasi-goreng-sorgum-ceria-sd-edition'), 4, 'Aduk Merata & Angkat', 'Aduk dengan api sedang-tinggi selama 3-4 menit hingga bumbu meresap sempurna dan aroma sedap keluar. Angkat dan sajikan hangat di kotak bekal!', 3, 'Tambahkan irisan mentimun segar sebagai garnish.'
where exists (select 1 from public.recipes where slug = 'nasi-goreng-sorgum-ceria-sd-edition')
on conflict (recipe_id, step_number) do update set title=excluded.title, instruction=excluded.instruction, timer_minutes=excluded.timer_minutes, tip=excluded.tip;

insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip)
select (select id from public.recipes where slug = 'pancakes-sorghum-gluten-free'), 1, 'Campur Bahan Kering', 'Ayak tepung sorgum bersama baking powder dan garam di mangkuk.', 2, NULL
where exists (select 1 from public.recipes where slug = 'pancakes-sorghum-gluten-free')
on conflict (recipe_id, step_number) do update set title=excluded.title, instruction=excluded.instruction, timer_minutes=excluded.timer_minutes, tip=excluded.tip;

insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip)
select (select id from public.recipes where slug = 'pancakes-sorghum-gluten-free'), 2, 'Aduk Adonan', 'Kocok telur dan susu/santan cair, lalu satukan dengan tepung hingga tekstur kental pas.', 3, NULL
where exists (select 1 from public.recipes where slug = 'pancakes-sorghum-gluten-free')
on conflict (recipe_id, step_number) do update set title=excluded.title, instruction=excluded.instruction, timer_minutes=excluded.timer_minutes, tip=excluded.tip;

insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip)
select (select id from public.recipes where slug = 'pancakes-sorghum-gluten-free'), 3, 'Panggang di Wajan', 'Tuang 1 sendok sayur adonan ke teflon antilengket dengan api kecil. Balik saat muncul gelembung.', 5, NULL
where exists (select 1 from public.recipes where slug = 'pancakes-sorghum-gluten-free')
on conflict (recipe_id, step_number) do update set title=excluded.title, instruction=excluded.instruction, timer_minutes=excluded.timer_minutes, tip=excluded.tip;

insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip)
select (select id from public.recipes where slug = 'roti-tawar-biji-sorgum-artisanal'), 1, 'Aktifkan Ragi', 'Larutkan ragi dalam air hangat dengan sedikit gula kelapa selama 7 menit hingga berbusa.', 7, NULL
where exists (select 1 from public.recipes where slug = 'roti-tawar-biji-sorgum-artisanal')
on conflict (recipe_id, step_number) do update set title=excluded.title, instruction=excluded.instruction, timer_minutes=excluded.timer_minutes, tip=excluded.tip;

insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip)
select (select id from public.recipes where slug = 'roti-tawar-biji-sorgum-artisanal'), 2, 'Uleni Lembut', 'Campur tepung dan bahan basah, uleni hingga kalis lembap lalu diamkan 45 menit.', 45, NULL
where exists (select 1 from public.recipes where slug = 'roti-tawar-biji-sorgum-artisanal')
on conflict (recipe_id, step_number) do update set title=excluded.title, instruction=excluded.instruction, timer_minutes=excluded.timer_minutes, tip=excluded.tip;

insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip)
select (select id from public.recipes where slug = 'roti-tawar-biji-sorgum-artisanal'), 3, 'Panggang Oven', 'Panggang pada suhu 180°C selama 35-40 menit hingga permukaan kecokelatan beraroma gurih kacang.', 40, NULL
where exists (select 1 from public.recipes where slug = 'roti-tawar-biji-sorgum-artisanal')
on conflict (recipe_id, step_number) do update set title=excluded.title, instruction=excluded.instruction, timer_minutes=excluded.timer_minutes, tip=excluded.tip;

insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip)
select (select id from public.recipes where slug = 'sorghum-power-bowl'), 1, 'Rebus Biji Sorgum', 'Rebus biji sorgum yang telah direndam selama 20 menit hingga empuk dan kenyal mekar.', 20, NULL
where exists (select 1 from public.recipes where slug = 'sorghum-power-bowl')
on conflict (recipe_id, step_number) do update set title=excluded.title, instruction=excluded.instruction, timer_minutes=excluded.timer_minutes, tip=excluded.tip;

insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip)
select (select id from public.recipes where slug = 'sorghum-power-bowl'), 2, 'Tata Mangkok Sehat', 'Susun biji sorgum di sisi mangkok, lengkapi dengan sayuran segar dan tempe panggang.', 3, NULL
where exists (select 1 from public.recipes where slug = 'sorghum-power-bowl')
on conflict (recipe_id, step_number) do update set title=excluded.title, instruction=excluded.instruction, timer_minutes=excluded.timer_minutes, tip=excluded.tip;

insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip)
select (select id from public.recipes where slug = 'sorghum-power-bowl'), 3, 'Siram Saus & Nikmati', 'Kucurkan dressing wijen gurih dan nikmati sensasi kenyal crunchy sorgum.', 1, NULL
where exists (select 1 from public.recipes where slug = 'sorghum-power-bowl')
on conflict (recipe_id, step_number) do update set title=excluded.title, instruction=excluded.instruction, timer_minutes=excluded.timer_minutes, tip=excluded.tip;

insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip)
select (select id from public.recipes where slug = 'risotto-jamur-liar-sorgum-creamy'), 1, 'Tumis Aromatik & Jamur', 'Panaskan minyak zaitun di wajan, tumis bawang bombay dan bawang putih cincang hingga harum layu, lalu masukkan irisan jamur hingga kecokelatan.', 4, NULL
where exists (select 1 from public.recipes where slug = 'risotto-jamur-liar-sorgum-creamy')
on conflict (recipe_id, step_number) do update set title=excluded.title, instruction=excluded.instruction, timer_minutes=excluded.timer_minutes, tip=excluded.tip;

insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip)
select (select id from public.recipes where slug = 'risotto-jamur-liar-sorgum-creamy'), 2, 'Masukkan Biji Sorgum', 'Masukkan biji sorgum yang telah ditiriskan. Aduk rata selama 2 menit agar terlumuri minyak dan aroma gurih.', 2, NULL
where exists (select 1 from public.recipes where slug = 'risotto-jamur-liar-sorgum-creamy')
on conflict (recipe_id, step_number) do update set title=excluded.title, instruction=excluded.instruction, timer_minutes=excluded.timer_minutes, tip=excluded.tip;

insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip)
select (select id from public.recipes where slug = 'risotto-jamur-liar-sorgum-creamy'), 3, 'Tuang Kaldu Bertahap', 'Tuangkan kaldu sayur hangat secara bertahap sambil diaduk perlahan dengan api sedang hingga cairan meresap dan sorgum empuk al-dente.', 16, NULL
where exists (select 1 from public.recipes where slug = 'risotto-jamur-liar-sorgum-creamy')
on conflict (recipe_id, step_number) do update set title=excluded.title, instruction=excluded.instruction, timer_minutes=excluded.timer_minutes, tip=excluded.tip;

insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip)
select (select id from public.recipes where slug = 'risotto-jamur-liar-sorgum-creamy'), 4, 'Finishing Creamy', 'Matikan api, masukkan sedikit parmesan atau santan encer. Aduk rata dan taburkan parsley cincang segar sebelum disajikan hangat.', 3, NULL
where exists (select 1 from public.recipes where slug = 'risotto-jamur-liar-sorgum-creamy')
on conflict (recipe_id, step_number) do update set title=excluded.title, instruction=excluded.instruction, timer_minutes=excluded.timer_minutes, tip=excluded.tip;

insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip)
select (select id from public.recipes where slug = 'bubur-tinutuan-sorgum-manado'), 1, 'Rebus Sorgum & Labu', 'Masak biji sorgum bersama air kaldu sayur, serai, dan labu kuning hingga labu melunak dan sorgum merekah membentuk bubur kental.', 12, NULL
where exists (select 1 from public.recipes where slug = 'bubur-tinutuan-sorgum-manado')
on conflict (recipe_id, step_number) do update set title=excluded.title, instruction=excluded.instruction, timer_minutes=excluded.timer_minutes, tip=excluded.tip;

insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip)
select (select id from public.recipes where slug = 'bubur-tinutuan-sorgum-manado'), 2, 'Tambahkan Jagung & Sayur', 'Masukkan jagung manis pipil dan bumbu garam secukupnya. Masak selama 3 menit.', 3, NULL
where exists (select 1 from public.recipes where slug = 'bubur-tinutuan-sorgum-manado')
on conflict (recipe_id, step_number) do update set title=excluded.title, instruction=excluded.instruction, timer_minutes=excluded.timer_minutes, tip=excluded.tip;

insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip)
select (select id from public.recipes where slug = 'bubur-tinutuan-sorgum-manado'), 3, 'Masukkan Sayuran Hijau & Kemangi', 'Tambahkan daun bayam/kangkung dan kemangi wangi sesaat sebelum api dimatikan agar tetap hijau segar bernutrisi.', 3, NULL
where exists (select 1 from public.recipes where slug = 'bubur-tinutuan-sorgum-manado')
on conflict (recipe_id, step_number) do update set title=excluded.title, instruction=excluded.instruction, timer_minutes=excluded.timer_minutes, tip=excluded.tip;

insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip)
select (select id from public.recipes where slug = 'bubur-tinutuan-sorgum-manado'), 4, 'Sajikan dengan Sambal Dabu-Dabu', 'Tuang ke mangkuk hangat, sajikan dengan tempe goreng renyah atau sambal dabu-dabu segar.', 2, NULL
where exists (select 1 from public.recipes where slug = 'bubur-tinutuan-sorgum-manado')
on conflict (recipe_id, step_number) do update set title=excluded.title, instruction=excluded.instruction, timer_minutes=excluded.timer_minutes, tip=excluded.tip;

insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip)
select (select id from public.recipes where slug = 'cookies-keping-cokelat-sorgum'), 1, 'Kocok Butter & Gula Kelapa', 'Campurkan mentega/minyak kelapa dengan gula aren hingga larut dan lembut creamy.', 4, NULL
where exists (select 1 from public.recipes where slug = 'cookies-keping-cokelat-sorgum')
on conflict (recipe_id, step_number) do update set title=excluded.title, instruction=excluded.instruction, timer_minutes=excluded.timer_minutes, tip=excluded.tip;

insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip)
select (select id from public.recipes where slug = 'cookies-keping-cokelat-sorgum'), 2, 'Campur Tepung Sorgum', 'Masukkan kuning telur, lalu tuang tepung sorgum bertahap. Aduk dengan spatula hingga adonan kalis tidak lengket.', 4, NULL
where exists (select 1 from public.recipes where slug = 'cookies-keping-cokelat-sorgum')
on conflict (recipe_id, step_number) do update set title=excluded.title, instruction=excluded.instruction, timer_minutes=excluded.timer_minutes, tip=excluded.tip;

insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip)
select (select id from public.recipes where slug = 'cookies-keping-cokelat-sorgum'), 3, 'Bentuk Bulatan & Chocochip', 'Bentuk bulatan pipih di loyang beroles minyak, beri taburan chocochip di atasnya.', 5, NULL
where exists (select 1 from public.recipes where slug = 'cookies-keping-cokelat-sorgum')
on conflict (recipe_id, step_number) do update set title=excluded.title, instruction=excluded.instruction, timer_minutes=excluded.timer_minutes, tip=excluded.tip;

insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip)
select (select id from public.recipes where slug = 'cookies-keping-cokelat-sorgum'), 4, 'Panggang Renyah', 'Panggang pada oven suhu 160°C selama 15 menit hingga renyah keemasan.', 15, NULL
where exists (select 1 from public.recipes where slug = 'cookies-keping-cokelat-sorgum')
on conflict (recipe_id, step_number) do update set title=excluded.title, instruction=excluded.instruction, timer_minutes=excluded.timer_minutes, tip=excluded.tip;

insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip)
select (select id from public.recipes where slug = 'es-cendol-sorgum-nangka-gula-aren'), 1, 'Masak Adonan Cendol', 'Campur tepung sorgum, tapioka, dan air pandan di panci. Masak dengan api kecil sambil diaduk terus hingga mengental meletup-letup mengilap.', 6, NULL
where exists (select 1 from public.recipes where slug = 'es-cendol-sorgum-nangka-gula-aren')
on conflict (recipe_id, step_number) do update set title=excluded.title, instruction=excluded.instruction, timer_minutes=excluded.timer_minutes, tip=excluded.tip;

insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip)
select (select id from public.recipes where slug = 'es-cendol-sorgum-nangka-gula-aren'), 2, 'Cetak Butiran Cendol', 'Tuang adonan panas ke saringan cendol di atas baskom berisi air es. Tekan perlahan hingga butiran cendol kenyal jatuh mengeras.', 5, NULL
where exists (select 1 from public.recipes where slug = 'es-cendol-sorgum-nangka-gula-aren')
on conflict (recipe_id, step_number) do update set title=excluded.title, instruction=excluded.instruction, timer_minutes=excluded.timer_minutes, tip=excluded.tip;

insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip)
select (select id from public.recipes where slug = 'es-cendol-sorgum-nangka-gula-aren'), 3, 'Susun di Gelas Segar', 'Tuang gula aren cair di dasar gelas, tambahkan cendol sorgum, es batu, dan siram santan gurih di atasnya.', 2, NULL
where exists (select 1 from public.recipes where slug = 'es-cendol-sorgum-nangka-gula-aren')
on conflict (recipe_id, step_number) do update set title=excluded.title, instruction=excluded.instruction, timer_minutes=excluded.timer_minutes, tip=excluded.tip;

insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip)
select (select id from public.recipes where slug = 'bolu-kukus-pandan-sorgum-mekar'), 1, 'Kocok Telur & Gula Aren', 'Mixer telur ayam dan gula aren bubuk dengan kecepatan tinggi hingga mengembang putih berjejak kental.', 6, NULL
where exists (select 1 from public.recipes where slug = 'bolu-kukus-pandan-sorgum-mekar')
on conflict (recipe_id, step_number) do update set title=excluded.title, instruction=excluded.instruction, timer_minutes=excluded.timer_minutes, tip=excluded.tip;

insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip)
select (select id from public.recipes where slug = 'bolu-kukus-pandan-sorgum-mekar'), 2, 'Masukkan Tepung & Santan', 'Turunkan kecepatan, masukkan tepung sorgum dan santan pandan secara bergantian hingga tercampur rata lembut.', 3, NULL
where exists (select 1 from public.recipes where slug = 'bolu-kukus-pandan-sorgum-mekar')
on conflict (recipe_id, step_number) do update set title=excluded.title, instruction=excluded.instruction, timer_minutes=excluded.timer_minutes, tip=excluded.tip;

insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip)
select (select id from public.recipes where slug = 'bolu-kukus-pandan-sorgum-mekar'), 3, 'Kukus Api Besar', 'Tuang ke cetakan bolu kukus beralas kertas roti. Kukus di panci kukusan yang sudah panas mendidih selama 12-15 menit tanpa membuka tutup.', 15, NULL
where exists (select 1 from public.recipes where slug = 'bolu-kukus-pandan-sorgum-mekar')
on conflict (recipe_id, step_number) do update set title=excluded.title, instruction=excluded.instruction, timer_minutes=excluded.timer_minutes, tip=excluded.tip;

insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip)
select (select id from public.recipes where slug = 'sup-krim-jagung-sorgum-hangat'), 1, 'Tumis Bawang Bombay', 'Tumis bawang bombay cincang dengan sedikit mentega hingga harum manis transparan.', 3, NULL
where exists (select 1 from public.recipes where slug = 'sup-krim-jagung-sorgum-hangat')
on conflict (recipe_id, step_number) do update set title=excluded.title, instruction=excluded.instruction, timer_minutes=excluded.timer_minutes, tip=excluded.tip;

insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip)
select (select id from public.recipes where slug = 'sup-krim-jagung-sorgum-hangat'), 2, 'Blender Sebagian Jagung', 'Blender 1/2 porsi jagung dengan sedikit susu cair untuk memberi kekentalan alami pada sup tanpa tepung maizena.', 2, NULL
where exists (select 1 from public.recipes where slug = 'sup-krim-jagung-sorgum-hangat')
on conflict (recipe_id, step_number) do update set title=excluded.title, instruction=excluded.instruction, timer_minutes=excluded.timer_minutes, tip=excluded.tip;

insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip)
select (select id from public.recipes where slug = 'sup-krim-jagung-sorgum-hangat'), 3, 'Rebus Bahan Bersama', 'Campurkan pure jagung, sisa jagung pipil, wortel dadu, dan biji sorgum rebus ke panci. Masak hingga sayuran matang.', 8, NULL
where exists (select 1 from public.recipes where slug = 'sup-krim-jagung-sorgum-hangat')
on conflict (recipe_id, step_number) do update set title=excluded.title, instruction=excluded.instruction, timer_minutes=excluded.timer_minutes, tip=excluded.tip;

insert into public.recipe_steps (recipe_id, step_number, title, instruction, timer_minutes, tip)
select (select id from public.recipes where slug = 'sup-krim-jagung-sorgum-hangat'), 4, 'Bumbui & Sajikan', 'Bumbui dengan pala bubuk, garam, dan merica. Aduk rata dan sajikan hangat di mangkuk sup.', 2, NULL
where exists (select 1 from public.recipes where slug = 'sup-krim-jagung-sorgum-hangat')
on conflict (recipe_id, step_number) do update set title=excluded.title, instruction=excluded.instruction, timer_minutes=excluded.timer_minutes, tip=excluded.tip;

-- ---------- RECIPE TARGETS (inferred from target_age_label) ----------
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'nasi-goreng-sorgum-ceria-sd-edition'), 'anak_sd' where exists (select 1 from public.recipes where slug = 'nasi-goreng-sorgum-ceria-sd-edition') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'nasi-goreng-sorgum-ceria-sd-edition'), 'anak_sekolah' where exists (select 1 from public.recipes where slug = 'nasi-goreng-sorgum-ceria-sd-edition') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'pancakes-sorghum-gluten-free'), 'balita' where exists (select 1 from public.recipes where slug = 'pancakes-sorghum-gluten-free') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'pancakes-sorghum-gluten-free'), 'anak_sd' where exists (select 1 from public.recipes where slug = 'pancakes-sorghum-gluten-free') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'pancakes-sorghum-gluten-free'), 'anak_sekolah' where exists (select 1 from public.recipes where slug = 'pancakes-sorghum-gluten-free') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'roti-tawar-biji-sorgum-artisanal'), 'remaja_dewasa' where exists (select 1 from public.recipes where slug = 'roti-tawar-biji-sorgum-artisanal') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'roti-tawar-biji-sorgum-artisanal'), 'dewasa_lansia' where exists (select 1 from public.recipes where slug = 'roti-tawar-biji-sorgum-artisanal') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'sorghum-power-bowl'), 'remaja_dewasa' where exists (select 1 from public.recipes where slug = 'sorghum-power-bowl') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'sorghum-power-bowl'), 'dewasa_lansia' where exists (select 1 from public.recipes where slug = 'sorghum-power-bowl') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'sorghum-power-bowl'), 'lansia' where exists (select 1 from public.recipes where slug = 'sorghum-power-bowl') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'risotto-jamur-liar-sorgum-creamy'), 'remaja_dewasa' where exists (select 1 from public.recipes where slug = 'risotto-jamur-liar-sorgum-creamy') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'risotto-jamur-liar-sorgum-creamy'), 'dewasa_lansia' where exists (select 1 from public.recipes where slug = 'risotto-jamur-liar-sorgum-creamy') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'risotto-jamur-liar-sorgum-creamy'), 'lansia' where exists (select 1 from public.recipes where slug = 'risotto-jamur-liar-sorgum-creamy') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'bubur-tinutuan-sorgum-manado'), 'anak_sd' where exists (select 1 from public.recipes where slug = 'bubur-tinutuan-sorgum-manado') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'bubur-tinutuan-sorgum-manado'), 'siswa_smp' where exists (select 1 from public.recipes where slug = 'bubur-tinutuan-sorgum-manado') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'bubur-tinutuan-sorgum-manado'), 'siswa_sma' where exists (select 1 from public.recipes where slug = 'bubur-tinutuan-sorgum-manado') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'bubur-tinutuan-sorgum-manado'), 'remaja_dewasa' where exists (select 1 from public.recipes where slug = 'bubur-tinutuan-sorgum-manado') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'bubur-tinutuan-sorgum-manado'), 'lansia' where exists (select 1 from public.recipes where slug = 'bubur-tinutuan-sorgum-manado') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'bubur-tinutuan-sorgum-manado'), 'balita' where exists (select 1 from public.recipes where slug = 'bubur-tinutuan-sorgum-manado') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'cookies-keping-cokelat-sorgum'), 'anak_sd' where exists (select 1 from public.recipes where slug = 'cookies-keping-cokelat-sorgum') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'cookies-keping-cokelat-sorgum'), 'anak_sekolah' where exists (select 1 from public.recipes where slug = 'cookies-keping-cokelat-sorgum') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'cookies-keping-cokelat-sorgum'), 'remaja_dewasa' where exists (select 1 from public.recipes where slug = 'cookies-keping-cokelat-sorgum') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'cookies-keping-cokelat-sorgum'), 'dewasa_lansia' where exists (select 1 from public.recipes where slug = 'cookies-keping-cokelat-sorgum') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'es-cendol-sorgum-nangka-gula-aren'), 'anak_sd' where exists (select 1 from public.recipes where slug = 'es-cendol-sorgum-nangka-gula-aren') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'es-cendol-sorgum-nangka-gula-aren'), 'siswa_smp' where exists (select 1 from public.recipes where slug = 'es-cendol-sorgum-nangka-gula-aren') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'es-cendol-sorgum-nangka-gula-aren'), 'siswa_sma' where exists (select 1 from public.recipes where slug = 'es-cendol-sorgum-nangka-gula-aren') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'es-cendol-sorgum-nangka-gula-aren'), 'remaja_dewasa' where exists (select 1 from public.recipes where slug = 'es-cendol-sorgum-nangka-gula-aren') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'es-cendol-sorgum-nangka-gula-aren'), 'lansia' where exists (select 1 from public.recipes where slug = 'es-cendol-sorgum-nangka-gula-aren') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'es-cendol-sorgum-nangka-gula-aren'), 'balita' where exists (select 1 from public.recipes where slug = 'es-cendol-sorgum-nangka-gula-aren') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'bolu-kukus-pandan-sorgum-mekar'), 'anak_sd' where exists (select 1 from public.recipes where slug = 'bolu-kukus-pandan-sorgum-mekar') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'bolu-kukus-pandan-sorgum-mekar'), 'siswa_smp' where exists (select 1 from public.recipes where slug = 'bolu-kukus-pandan-sorgum-mekar') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'bolu-kukus-pandan-sorgum-mekar'), 'siswa_sma' where exists (select 1 from public.recipes where slug = 'bolu-kukus-pandan-sorgum-mekar') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'bolu-kukus-pandan-sorgum-mekar'), 'remaja_dewasa' where exists (select 1 from public.recipes where slug = 'bolu-kukus-pandan-sorgum-mekar') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'bolu-kukus-pandan-sorgum-mekar'), 'lansia' where exists (select 1 from public.recipes where slug = 'bolu-kukus-pandan-sorgum-mekar') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'bolu-kukus-pandan-sorgum-mekar'), 'balita' where exists (select 1 from public.recipes where slug = 'bolu-kukus-pandan-sorgum-mekar') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'sup-krim-jagung-sorgum-hangat'), 'balita' where exists (select 1 from public.recipes where slug = 'sup-krim-jagung-sorgum-hangat') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'sup-krim-jagung-sorgum-hangat'), 'anak_sd' where exists (select 1 from public.recipes where slug = 'sup-krim-jagung-sorgum-hangat') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'sup-krim-jagung-sorgum-hangat'), 'anak_sekolah' where exists (select 1 from public.recipes where slug = 'sup-krim-jagung-sorgum-hangat') on conflict do nothing;
insert into public.recipe_targets (recipe_id, target) select (select id from public.recipes where slug = 'sup-krim-jagung-sorgum-hangat'), 'lansia' where exists (select 1 from public.recipes where slug = 'sup-krim-jagung-sorgum-hangat') on conflict do nothing;

-- ---------- INGREDIENT MASTER (from mock DEFAULT_INGREDIENTS) ----------

-- ============================================================================
-- SUMBER: supabase/migrations/005_user_recipes_rls.sql
-- ============================================================================

-- ============================================================
-- SorghumCare (BimaSorgum) — Migration 005
-- RLS untuk user-generated recipes (wizard/chat "generate" flow):
--   anon user boleh INSERT resep baru (created_by = auth.uid()),
--   UPDATE/DELETE hanya resep miliknya.
-- ============================================================

-- Insert: user only creates rows they own
create policy "recipes own insert"
  on public.recipes
  for insert
  to public
  with check (created_by = auth.uid());

-- Update: user can edit only their own generated recipes
create policy "recipes own update"
  on public.recipes
  for update
  to public
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- Delete: user can remove only their own generated recipes
create policy "recipes own delete"
  on public.recipes
  for delete
  to public
  using (created_by = auth.uid());

-- Children of user recipes must be manageable by the owning user too.
-- (recipe_ingredients / recipe_steps currently only public-read; the
--  upsertRecipe flow deletes + re-inserts children, so the anon user needs
--  INSERT/DELETE on children whose recipe they own.)
create policy "recipe_ingredients owner insert"
  on public.recipe_ingredients
  for insert
  to public
  with check (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.created_by = auth.uid()
    )
  );

create policy "recipe_ingredients owner delete"
  on public.recipe_ingredients
  for delete
  to public
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.created_by = auth.uid()
    )
  );

create policy "recipe_steps owner insert"
  on public.recipe_steps
  for insert
  to public
  with check (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.created_by = auth.uid()
    )
  );

create policy "recipe_steps owner delete"
  on public.recipe_steps
  for delete
  to public
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.created_by = auth.uid()
    )
  );


-- ============================================================================
-- SUMBER: supabase/migrations/006_private_recipes_rls.sql
-- ============================================================================

-- ============================================================
-- SorghumCare (BimaSorgum) — Migration 006
-- Resep privat vs publik:
--   * Setiap resep hasil generate disimpan dgn is_published = false
--     (PRIVATE) — hanya pemiliknya yg bisa membaca.
--   * Tombol "Unggah" (di kartu resep) men-set is_published = true
--     sehingga muncul di Explore.
--   * Membaca resep privat milik sendiri butuh policy baru.
-- ============================================================

-- Owner dapat membaca resepnya sendiri meski is_published = false
create policy "recipes owner read own"
  on public.recipes
  for select
  to public
  using (created_by = auth.uid());


-- ============================================================================
-- SUMBER: supabase/migrations/007_admin_configs.sql
-- ============================================================================

-- ============================================================
-- SorghumCare (BimaSorgum) — Migration 007
-- Tabel konfigurasi admin (key-value store) untuk menyimpan
-- payload/pengaturan yang dapat diubah oleh admin.
-- Contoh key: 'main_feature_enabled', 'images_enabled',
-- 'max_budget_per_portion', 'ai_model', dll.
-- ============================================================

-- Tabel konfigurasi admin (key-value store)
create table if not exists public.admin_configs (
  id            uuid primary key default gen_random_uuid(),
  config_key    text unique not null,
  config_value  jsonb not null default '{}',
  description   text,
  updated_by    uuid references public.profiles (id) on delete set null,
  updated_at    timestamptz not null default now()
);

-- Index untuk pencarian cepat berdasarkan key
create index if not exists idx_admin_configs_key
  on public.admin_configs (config_key);

-- Trigger updated_at otomatis (moddatetime)
drop trigger if exists trg_admin_configs_updated on public.admin_configs;
create trigger trg_admin_configs_updated before update on public.admin_configs
  for each row execute function moddatetime (updated_at);

-- Aktifkan RLS
alter table public.admin_configs enable row level security;

-- Policy: hanya admin yang boleh mengelola (ALL operations)
create policy "admins manage admin_configs"
  on public.admin_configs for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));


-- ============================================================================
-- SUMBER: supabase/migrations/008_reports_and_admin_rls.sql
-- ============================================================================

-- ============================================================
-- SorghumCare (BimaSorgum) — Migration 008
-- Laporan (reports) + hak akses admin untuk hapus konten:
--   * Tabel public.reports untuk laporan user terhadap konten
--     (komentar / resep / user / konten lain) yang bisa
--     di-review admin (terima / tolak).
--   * Policy baru di tabel existing (recipe_comments, recipes)
--     supaya admin bisa menghapus data bermasalah.
-- ============================================================

-- ============================================================
-- 1. TABEL LAPORAN (REPORTS)
-- ============================================================
-- reporter_id  : user yang mengirim laporan (boleh null bila akun dihapus)
-- target_type  : jenis objek yang dilaporkan
-- target_id    : id objek yang dilaporkan (disimpan sbg text agar
--                bisa menunjuk ke berbagai tabel: uuid/ teks)
-- status       : pending -> accepted (diterima) / rejected (ditolak)
-- admin_note   : catatan dari admin saat memproses laporan
-- reviewed_by  : admin yang memproses laporan
create table if not exists public.reports (
  id            uuid primary key default gen_random_uuid(),
  reporter_id   uuid references auth.users (id) on delete set null,
  target_type   text not null
                check (target_type in ('comment','recipe','user','content')),
  target_id     text not null,
  reason        text not null,
  status        text not null default 'pending'
                check (status in ('pending','accepted','rejected')),
  admin_note    text,
  reviewed_by   uuid references public.profiles (id) on delete set null,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now()
);

-- ============================================================
-- 2. INDEX
-- ============================================================
-- Index untuk filter laporan berdasarkan status (antrian review admin)
create index if not exists idx_reports_status
  on public.reports (status);

-- Index untuk mencari semua laporan atas satu objek tertentu
create index if not exists idx_reports_target
  on public.reports (target_type, target_id);

-- Catatan: tabel reports tidak punya kolom updated_at, jadi tidak ada
-- trigger moddatetime di sini. created_at memakai default now().

-- ============================================================
-- 3. ROW LEVEL SECURITY (RLS) untuk reports
-- ============================================================
alter table public.reports enable row level security;

-- Insert: hanya user yang login (auth.uid() = reporter_id) boleh melapor
drop policy if exists "users can insert reports" on public.reports;
create policy "users can insert reports"
  on public.reports for insert
  to public
  with check (auth.uid() = reporter_id);

-- Select: laporan bisa dibaca semua (anon maupun user) — dipakai
-- untuk statistik jumlah laporan pada konten
drop policy if exists "reports are readable by everyone" on public.reports;
create policy "reports are readable by everyone"
  on public.reports for select
  to public
  using (true);

-- Update: hanya admin yang boleh menerima / menolak laporan
drop policy if exists "admins manage reports" on public.reports;
create policy "admins manage reports"
  on public.reports for update
  to public
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ============================================================
-- 4. HAK AKSES ADMIN UNTUK HAPUS KONTEN (TABEL EXISTING)
-- ============================================================

-- Admin boleh menghapus komentar mana pun (tidak hanya komentarnya sendiri)
drop policy if exists "admins can delete any comment" on public.recipe_comments;
create policy "admins can delete any comment"
  on public.recipe_comments for delete
  to public
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Admin boleh menghapus resep mana pun (termasuk resep user lain)
drop policy if exists "admins can delete any recipe" on public.recipes;
create policy "admins can delete any recipe"
  on public.recipes for delete
  to public
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Admin boleh membaca SEMUA resep (termasuk draft milik user lain)
drop policy if exists "admins can read any recipe" on public.recipes;
create policy "admins can read any recipe"
  on public.recipes for select
  to public
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));


-- ============================================================================
-- SUMBER: supabase/migrations/009_revoke_testing_policies.sql
-- ============================================================================

-- Cabut policy testing sementara (009 + 010). Kembalikan ke RLS admin-only.
drop policy if exists "tmp testing allow all authenticated admin_configs" on public.admin_configs;
drop policy if exists "tmp testing allow all authenticated reports" on public.reports;
drop policy if exists "tmp testing allow all authenticated recipe_comments" on public.recipe_comments;
drop policy if exists "tmp testing allow all authenticated recipes" on public.recipes;
drop policy if exists "tmp testing open admin_configs" on public.admin_configs;
drop policy if exists "tmp testing open reports" on public.reports;
drop policy if exists "tmp testing open recipe_comments" on public.recipe_comments;
drop policy if exists "tmp testing open recipes" on public.recipes;


-- ============================================================================
-- SUMBER: supabase/migrations/010_cleanup_tmp_helpers.sql
-- ============================================================================

-- Final cleanup: pastikan tidak ada helper sementara yang tersisa di production.
drop function if exists public.tmp_create_admin(text, text, text);
drop function if exists public.tmp_auth_users_cols();
drop function if exists public.tmp_auth_notnull();
drop function if exists public.tmp_fix_admin();
drop function if exists public.tmp_debug_admin();
drop function if exists public.tmp_promote_signup();
drop function if exists public.tmp_confirm_signup();
drop view if exists public.tmp_auth_users_cols;


-- ============================================================================
-- SUMBER: supabase/migrations/011_admin_configs_public_read.sql
-- ============================================================================

-- Flag admin (mis. images_enabled, main_feature_enabled) harus bisa dibaca
-- semua pengguna agar berlaku global. Tulis tetap hanya admin (policy 007).
create policy "admin_configs public read"
  on public.admin_configs for select to public using (true);


-- ============================================================================
-- SUMBER: supabase/migrations/012_drop_price_columns.sql
-- ============================================================================

-- 012_drop_price_columns.sql
-- Hapus semua kolom harga: harga tidak lagi dipakai di mana pun (UI, prompt AI, mapper).
-- Backup nilai: C:\Users\shafnats\Documents\Key\backup_harga_bimasorgum_2026.json
-- (187 recipes, 12 ingredients, 1830 recipe_ingredients) — restore manual bila perlu.

alter table public.recipes drop column if exists estimated_cost;
alter table public.recipes drop column if exists target_budget;
alter table public.recipe_ingredients drop column if exists estimated_price;
alter table public.ingredients drop column if exists default_price;


-- ============================================================================
-- SUMBER: supabase/migrations/013_recipe_likes_and_reviews.sql
-- ============================================================================

-- 013_recipe_likes_and_reviews.sql
-- Pisah konsep: Save = koleksi pribadi (saved_recipes, sudah ada),
-- Like = apresiasi publik agregat, Review = rating+ulasan publik.

-- 1. Like publik: satu baris per user per resep
create table if not exists public.recipe_likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, recipe_id)
);
create index if not exists idx_recipe_likes_recipe on public.recipe_likes(recipe_id);
create index if not exists idx_recipe_likes_user on public.recipe_likes(user_id);

-- 2. Review publik: satu rating per user per resep (boleh update)
create table if not exists public.recipe_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  review_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, recipe_id)
);
create index if not exists idx_recipe_reviews_recipe on public.recipe_reviews(recipe_id);

-- 3. Agregat publik (dibaca anon tanpa RLS per-baris)
create or replace view public.v_recipe_stats as
select
  r.id as recipe_id,
  (select count(*) from public.recipe_likes l where l.recipe_id = r.id) as likes,
  (select count(*) from public.recipe_reviews v where v.recipe_id = r.id) as reviews_count,
  (select round(avg(v.rating)::numeric, 1) from public.recipe_reviews v where v.recipe_id = r.id) as rating_avg
from public.recipes r;

-- 4. RLS: user kelola miliknya; baca agregat via view (security invoker = ikut RLS pembaca,
--    tapi count dari tabel lain tetap perlu policy baca publik agar view bisa dipakai anon)
alter table public.recipe_likes enable row level security;
alter table public.recipe_reviews enable row level security;

drop policy if exists "own likes all" on public.recipe_likes;
create policy "own likes all" on public.recipe_likes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "public read likes" on public.recipe_likes;
create policy "public read likes" on public.recipe_likes for select using (true);

drop policy if exists "own reviews all" on public.recipe_reviews;
create policy "own reviews all" on public.recipe_reviews
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "public read reviews" on public.recipe_reviews;
create policy "public read reviews" on public.recipe_reviews for select using (true);


-- ============================================================================
--  VERIFIKASI — jalankan SETELAH semua di atas selesai
-- ============================================================================
-- 1) Daftar tabel yang harus ada (harap 15 tabel + 1 view)
-- select table_name from information_schema.tables
--   where table_schema='public' order by table_name;
--
-- 2) Katalog terisi?
-- select count(*) as jumlah_resep from public.recipes;      -- harap > 0
-- select count(*) as jumlah_bahan from public.ingredients;  -- harap = 12
--
-- 3) Kolom harga sudah bersih? (harap 0 baris)
-- select column_name from information_schema.columns
--   where table_name='recipes' and column_name in ('estimated_cost','target_budget');
--
-- 4) Tidak ada policy testing sementara yang tertinggal? (harap 0 baris)
-- select tablename, policyname from pg_policies where policyname like 'tmp%';
-- ============================================================================
