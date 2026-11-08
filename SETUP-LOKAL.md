# SETUP-LOKAL.md — Menjalankan BimaSorgum di komputer sendiri

Panduan ini ditulis supaya satu orang bisa menyalakan proyek ini dari nol:
backend database (Supabase) + kunci AI + menjalankan dev server.

Diskop dari repo pada commit `388c087` (6 Nov 2026). Semua perintah sudah
diverifikasi urutannya terhadap isi `supabase/migrations/`.

Target pembaca: siapa pun di tim PKM. Tidak perlu pengalaman Supabase.

---

## 0. Ringkasan cepat (kalau sudah punya kunci Supabase & BIMA)

```bash
cd "D:\PKM 2026\bimasorgum"
npm ci
cp .env.example .env      # lalu isi 4 nilai di dalamnya
npm run dev               # buka http://localhost:3000
```

Kalau belum punya kunci, lanjut ke bagian 1.

Kebutuhan **Node.js 20.19+ atau 22.12+**. Ini bukan angka karangan:
`@vitejs/plugin-react@5.2.0` memasang `engines.node = "^20.19.0 || >=22.12.0"`,
jadi Node 18 **tidak** didukung. `Dockerfile` proyek memakai `node:20-alpine`
yang sudah memenuhi syarat.

> Di mesin ini terpasang Node v22.11.0 dengan npm 10.9.0 — sedikit di bawah
> batas (22.12), sehingga `npm ci` memunculkan `npm warn EBADENGINE`, tapi
> `npm run lint` dan `npm run build` tetap **sukses** (sudah saya buktikan,
> lihat bagian 6). Kalau ingin peringatan itu hilang, naikkan Node ke 22.12+.

---

## 1. Kenapa butuh setup Supabase

`src/lib/supabase.ts` langsung melempar error saat file itu di-import kalau
`VITE_SUPABASE_URL` atau `VITE_SUPABASE_ANON_KEY` kosong:

```ts
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY env var.');
}
```

Karena `DataProvider` di `main.tsx` memuat modul tersebut sebelum apa pun
dirender, aplikasi akan tampil **layar kosong** tanpa pesan yang jelas di UI.
Jadi: tanpa Supabase, tidak ada cara menjalankannya setengah-setengah.
Tidak ada mode "demo tanpa database".

Supabase punya tier gratis dan cukup untuk keperluan ini. Yang dipakai proyek:
Postgres + Auth (login anonim + Google) + Row Level Security.

---

## 2. Membuat project Supabase (sekali saja)

Lewat dashboard web (paling mudah, tanpa perlu CLI):

1. Daftar/masuk ke https://supabase.com/dashboard
2. **New project**
   - Name: `bimasorgum` (bebas)
   - Database Password: buat yang kuat, **simpan di tempat aman**
   - Region: **Southeast Asia (Singapore)** — `ap-southeast-1`, latensi terbaik
     untuk Indonesia
3. Tunggu sampai project selesai disiapkan (~2 menit)

Catat dari **Project Settings -> API**:
- **Project URL** → `https://<ref>.supabase.co`
- **anon / publishable key** → untuk `VITE_SUPABASE_ANON_KEY`

> Jangan pakai key `service_role`. Key itu menembus RLS dan hanya untuk kode
> server. Proyek ini tidak membutuhkannya sama sekali.

### 2b. Nyalakan login anonim (WAJIB)

Proyek ini memberi setiap pengunjung identitas anonim supaya resep tersimpan
dan riwayat chat bisa terikat ke seseorang tanpa memaksa login.

**Authentication -> Sign In / Providers -> Anonymous sign-ins → aktifkan (ON).**

Kalau ini lupa dinyalakan: halaman tampil, tapi `saved_recipes` dan riwayat chat
tidak akan pernah tersimpan (di console muncul `Anonymous sign-in failed`).

### 2c. Google OAuth (OPSIONAL)

Tanpa ini, tombol login Google (`AuthProvider.signInWithGoogle`) tidak berfungsi,
tapi seluruh fitur lain tetap jalan karena identitas anonim sudah cukup.

Kalau ingin menyalakan: **Authentication -> Sign In / Providers -> Google**,
lalu isi Client ID/Secret dari Google Cloud Console dan daftarkan redirect URI
yang ditampilkan Supabase.

---

## 3. Menerapkan skema database — URUTAN INI PENTING

Buka **SQL Editor** di dashboard Supabase. Tempel isi tiap file di bawah ini
secara berurutan, **satu file per sekali RUN**, sesuai urutan persis di tabel ini.

```
 1.  supabase/migrations/001_schema_core.sql
 2.  supabase/migrations/recipe_comments.sql      <-- BUKAN urut abjad
 3.  supabase/migrations/comment_likes.sql        <-- BUKAN urut abjad
 4.  supabase/migrations/002_seed_catalog.sql
 5.  supabase/migrations/003_recipe_source_fields.sql   <-- wajib sebelum 004
 6.  supabase/migrations/004_seed_full_catalog.sql
 7.  supabase/migrations/005_user_recipes_rls.sql
 8.  supabase/migrations/006_private_recipes_rls.sql
 9.  supabase/migrations/007_admin_configs.sql
10.  supabase/migrations/008_reports_and_admin_rls.sql
11.  supabase/migrations/009_revoke_testing_policies.sql
12.  supabase/migrations/010_cleanup_tmp_helpers.sql
13.  supabase/migrations/011_admin_configs_public_read.sql
14.  supabase/migrations/012_drop_price_columns.sql
15.  supabase/migrations/013_recipe_likes_and_reviews.sql
```

### Kenapa urutannya tidak boleh sekadar “001 → 013 berurutan”

Kalau file dijalankan urut abjad menaik, akan **gagal** di dua tempat:

| Masalah | Penyebab | Akibat kalau salah |
|---|---|---|
| `recipe_comments.sql` dan `comment_likes.sql` selalu terurut paling akhir (tanpa prefix angka) | namanya tidak berangka, jadi jatuh setelah `013` | Migrasi `008` membuat policy pada tabel `recipe_comments` yang belum ada → `ERROR: relation "recipe_comments" does not exist` |
| `003` harus jalan **sebelum** `004` | `004_seed_full_catalog.sql` meng-INSERT ke kolom `source_id` dan `target_budget` yang justru **dibuat** oleh `003` | `ERROR: column "source_id" of relation "recipes" does not exist` |
| `012_drop_price_columns.sql` harus **setelah** `002` dan `004` | `012` menghapus kolom `estimated_cost`, `target_budget`, `estimated_price`, `default_price` yang di-INSERT oleh `002` dan `004` | Kalau dijalankan sebelum seed, seed-nya kemudian gagal karena kolomnya sudah hilang |

Semua file memakai `if not exists` / `drop policy if exists` sehingga
**aman diulang** kalau ada langkah yang gagal dan Anda perlu mengulang dari file
yang sama.

### Verifikasi setelah semua selesai

Jalankan di SQL Editor:

```sql
-- jumlah tabel yang diharapkan
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;

-- katalog terisi?
select count(*) as jumlah_resep from public.recipes;              -- harap > 0
select count(*) as jumlah_bahan from public.ingredients;          -- harap = 12

-- kolom harga sudah bersih?
select column_name from information_schema.columns
where table_name = 'recipes' and column_name in ('estimated_cost','target_budget');
-- harap: 0 baris
```

Tabel yang harus ada di `public`:
`admin_configs, chat_messages, chat_sessions, comment_likes, ingredients,
profiles, recipe_comments, recipe_ingredients, recipe_likes, recipe_reviews,
recipe_steps, recipe_targets, recipes, reports, saved_recipes`
+ view `v_recipe_stats`.

> Catatan: kalau memakai Supabase CLI (`supabase db push`), ke-15 file itu akan
> dijalankan **menurut urutan nama file** — CLI tidak tahu soal urutan khusus di
> atas. Karena itu cara paling aman adalah SQL Editor + urutan manual di tabel.
> (Di mesin ini CLI `supabase` tidak terpasang.)

---

## 4. Mendapatkan kunci AI BIMA (`bima_live_...`)

Frontend **tidak** memanggil backend AI langsung. Browser memanggil
`/bima-api/chat`, lalu proxy di `vite.config.ts` meneruskannya ke
`https://api.llmsorgum.online/api/chat` sambil menambahkan header `X-Api-Key`.

Saya cek langsung ke backend:

```
GET  /api/health  -> {"status":"Online","chunks":3603,"documentsCount":32}
POST /api/chat tanpa key -> HTTP 401
  {"detail":"API key diperlukan. Kirim header X-API-Key (atau Authorization: Bearer)
   dengan key consumer dari halaman API Consumers."}
```

Jadi backend menuntut **consumer key**. Cara mendapatkannya:

1. Buka dashboard backend RAG di `https://api.llmsorgum.online`
2. Masuk ke halaman **API Consumers**
   (endpoint-nya: `GET /api/consumers`, membuat baru: `POST /api/consumers`
   dengan body `{"name": "...", "owner": "...", "description": "...",
   "rateLimit": 100}`)
3. Buat consumer (mis. name `bimasorgum-lokal`, owner: nama Anda), lalu copy
   key-nya. Formatnya `bima_live_...`

Halaman admin backend itu dilindungi; kalau Anda tidak punya aksesnya,
**minta key ke pemilik backend / ketua tim PKM**. Key ini tidak ada di dalam
repo (memang sengaja — repo tidak memuat kredensial apa pun).

Hasilnya ditaruh di `.env` sebagai `BIMA_API_KEY=` (tanpa prefix `VITE_`).

> Kalau file ini dipakai bersama tim, satu key bisa dipakai bersama. Kalau
> nanti bikin consumer sendiri, cukup ganti nilai `BIMA_API_KEY`.

---

## 5. Mengisi `.env`

```bash
cd "D:\PKM 2026\bimasorgum"
cp .env.example .env
```

Buka `.env`, isi minimal tiga ini:

```dotenv
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon atau sb_publishable_...>
BIMA_API_KEY=bima_live_xxxxxxxxxxxxxxxx
```

Sisanya boleh dikosongkan.

**Aturan yang mudah sekali dilanggar:**

- Variabel berprefix `VITE_` **ikut ter-bundle ke JavaScript yang dikirim ke
  browser**. Jadi `VITE_SUPABASE_ANON_KEY` aman (memang untuk publik, dilindungi
  RLS), tapi key AI **tidak boleh** berprefix `VITE_`.
- `src/services/bimaClient.ts` masih membaca `VITE_BIMA_API_KEY` dan
  `VITE_BIMA_MODEL`. **Jangan isi keduanya** — isinya akan bocor ke browser.
  Cukup `BIMA_API_KEY` (dibaca `vite.config.ts` di sisi server/proxy).
  Ini juga sudah diperingatkan di `memory.md` proyek.

`.env` sudah masuk daftar abaikan git, jadi tidak akan ikut ter-commit.
File ini juga tidak akan pernah masuk `.env` repo karena `.gitignore`
memakai `!.env.example` (template boleh ikut, isian asli tidak).

---

## 6. Menjalankan aplikasi

```bash
cd "D:\PKM 2026\bimasorgum"
npm ci            # install sesuai package-lock.json (dipakai Dockerfile juga)
npm run dev       # http://localhost:3000
```

Kalau `npm ci` gagal, biasanya `package-lock.json` tidak sinkron dengan
`package.json`. Pakai `npm install` sebagai gantinya, dan ketahui bahwa build
Docker/Dokploy tetap memakai `npm ci`.

Perintah lain:

| Perintah | Fungsi |
|---|---|
| `npm run dev` | dev server, port 3000, host 0.0.0.0 |
| `npm run build` | build produksi ke `dist/` |
| `npm run preview` | menyajikan `dist/` di port 4173 (sama seperti di server) |
| `npm run lint` | `tsc --noEmit` — hanya cek tipe, bukan linter gaya kode |
| `npm run clean` | hapus `dist/` |

### Hasil yang sudah saya verifikasi

Dijalankan di mesin ini pada salinan lokal commit `388c087`:

```
npm ci          -> added 100 packages        (1 warn EBADENGINE, lihat bagian 0)
npm run lint    -> exit 0, tanpa error       (tsc --noEmit bersih)
npm run build   -> built in 8.21s, sukses
                   dist/index.html                1.49 kB (gzip  0.80 kB)
                   dist/assets/index-*.css       78.67 kB (gzip 13.42 kB)
                   dist/assets/index-*.js       955.82 kB (gzip 265.21 kB)
```

Artinya proyek ini **compile bersih** tanpa `.env` sekalipun, karena
`VITE_SUPABASE_*` hanya dibaca saat runtime, bukan saat build.

Dua peringatan yang muncul dan bukan tanda kerusakan:
- `EBADENGINE` dari `@vitejs/plugin-react` (Node 22.11.0 < 22.12) — build tetap sukses.
- Bundle JS mendekati 1 MB dan Vite menyarankan code-splitting. Wajar untuk SPA
  satu-bundel tanpa lazy loading; ini kandidat optimasi, bukan bug.
- `npm audit` melaporkan 2 kerentanan high — belum saya periksa satu per satu.
  Jangan buru-buru `npm audit fix` yang bisa mengubah versi paket; periksa dulu.

---

## 7. Kalau ada yang tidak jalan

**Layar putih / blank, console: `Missing VITE_SUPABASE_URL...`**
→ `.env` belum dibuat/terisi, atau dev server belum di-restart setelah `.env`
diubah. Vite membaca `.env` sekali saat start: hentikan lalu `npm run dev` lagi.

**Console: `Anonymous sign-in failed`**
→ Anonymous sign-ins belum dinyalakan (bagian 2b).

**Tombol generate “tidak ada hasil” / error `BIMA AI error 401`**
→ `BIMA_API_KEY` kosong atau salah. Ingat key ini hanya dibaca proxy; kalau
Anda mengubahnya, restart dev server.
→ Cek juga: `BIMA_BACKEND_ORIGIN` jangan diisi kalau tidak yakin.

**Error 403 / `Permission denied` saat query tabel**
→ Urutan migrasi di bagian 3 tidak terpenuhi (tabel/policy ada yang belum
dibuat) atau RLS memblokir. Cek bagian verifikasi di akhir bagian 3.

**Wizard lama sekali / timeout**
→ Normal sampai batas tertentu: backend AI menjalankan RAG + reviewer
**sebelum** token pertama keluar. Dari `memory.md`, TTFT terukur 68–128 detik
(median 96 s). Kode memberi batas 250 detik tanpa konten dan 260 detik total di
`bimaClient.ts`.
→ Kalau tetap timeout, penyebabnya di sisi server, bukan koneksi Anda: saat
diukur 2026-11-07, retrieval RAG selesai ~0,3 detik tapi provider LLM tidak
mengeluarkan token sama sekali (4 percobaan: 150s, 180s, 240s, 392s). Yang 392s
diakhiri backend dengan pesan timeout-nya sendiri. Jadi larikan ulang nanti,
atau minta admin backend memilih model yang lebih cepat.
→ Anda tidak akan berakhir buntu: saat AI gagal, aplikasi otomatis menawarkan
alternatif resep lokal (tanpa AI) yang bisa langsung dipilih.

**Gambar tidak muncul**
→ Gambar memakai URL Unsplash eksternal (`src/data/imageAssets.ts`), jadi butuh
internet. Ada juga “mode tanpa gambar” yang disimpan di tabel `admin_configs`
key `images_enabled` — kalau nilainya `false`, semua gambar memang disembunyikan.

---

## 8. Yang perlu diketahui sebelum mulai mengubah kode

Empat hal yang saya temukan saat membaca kode dan akan menjebak Anda:
lihat bagian “Temuan” di laporan analisis. Ringkas:

1. `generateRecipeFromWizard()` di `src/services/recipeGenerator.ts:614` berisi
   `if (true) { return INITIAL_FEATURED_RECIPE }` — fungsi ini **selalu**
   mengembalikan “Nasi Goreng Sorgum Ceria”, semua cabang di bawahnya mati.
   Jalur yang benar-benar dipakai: `generateRecipeFromWizardAsync()`.
2. `memory.md` menunjuk `git show 6c0b99d:docs/FITUR_DAN_FLOW.md`, tetapi commit
   itu tidak ada di repo (hanya ada 2 commit). Dokumentasi lama benar-benar hilang.
3. `supabase/README-setup.md` sudah usang: menyuruh apply 001+002 saja dan
   deploy ke Vercel. Kenyataannya perlu 15 file (bagian 3) dan deploy-nya Dokploy.
4. Proyek sama sekali belum punya test (tidak ada vitest/jest, tidak ada script
   `test`). `npm run lint` hanya memeriksa tipe.

---

## 9. Lampiran: perintah aman untuk memeriksa isi database

Semua di bawah ini hanya membaca (read-only), aman dijalankan di SQL Editor:

```sql
-- daftar tabel
select table_name from information_schema.tables
where table_schema='public' order by table_name;

-- resep sistem vs buatan user
select is_system, is_published, count(*)
from public.recipes group by 1,2 order by 1,2;

-- policy RLS yang aktif pada tabel penting
select tablename, policyname, cmd from pg_policies
where schemaname='public' order by tablename, policyname;

-- apakah ada policy testing sementara yang tertinggal (harus 0 baris)
select tablename, policyname from pg_policies
where policyname like 'tmp%';

-- konfigurasi admin (flag images_enabled, main_feature_enabled)
select config_key, config_value from public.admin_configs order by config_key;
```
