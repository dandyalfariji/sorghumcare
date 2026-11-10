-- 014_profiles_bio.sql
-- Tambah kolom `bio` pada public.profiles.
--
-- Kenapa perlu: form "Edit Informasi Profil" punya dua isian — Nama Lengkap dan
-- Status / Bio Singkat. Hanya `full_name` yang punya kolom di DB, sehingga isian
-- bio selalu hilang setelah reload (dan `full_name` pun tidak pernah dibaca
-- kembali oleh aplikasi). Kolom ini melengkapinya.
--
-- Aman diulang (idempotent).

alter table public.profiles
  add column if not exists bio text;

comment on column public.profiles.bio is
  'Status / bio singkat yang diisi pengguna di halaman Profil (opsional).';

-- Verifikasi cepat (jalankan terpisah kalau perlu):
--   select id, full_name, bio, role from public.profiles limit 5;
