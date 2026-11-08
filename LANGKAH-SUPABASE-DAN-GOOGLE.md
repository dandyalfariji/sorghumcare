# LANGKAH SUPABASE & GOOGLE — jalur "pakai project teman"

Panduan ini untuk dua gejala:
1. Database belum tersambung (katalog kosong, layar sebagian kosong)
2. Login Google tidak bisa dipakai

Waktu: ~10 menit, sebagian besar menunggu balasan teman Anda.

---

## BAGIAN A — Yang perlu Anda MINTA dari teman Anda

Kirim pesan ini ke teman Anda:

> Untuk menyambungkan aplikasi ke database Supabase yang sudah kamu buat, aku butuh 2 nilai:
> 1. **Project URL** — contoh `https://abcdefghijklmn.supabase.co`
>    (Dashboard Supabase → Project Settings → API → Project URL)
> 2. **anon / publishable key** — key yang boleh publik
>    (Dashboard Supabase → Project Settings → API → anon public / `sb_publishable_...`)
>
> **Jangan kirim `service_role`** — key itu menembus semua pengaman dan tidak
> dibutuhkan aplikasi ini.
>
> Dua hal lagi, tolong dicek ya:
> 3. Apakah di database sudah ada tabelnya? (Dashboard → Table Editor → harus ada
>    tabel `recipes` dan isinya tidak kosong). Kalau kosong, jalankan dulu file
>    `supabase/ALL-IN-ONE-setup.sql` di SQL Editor.
> 4. Apakah login Google sudah pernah diaktifkan?
>    (Dashboard → Authentication → Sign In / Providers → Google)
>    Kalau belum, lihat Bagian C di bawah dan kirim hasilnya ke aku.

---

## BAGIAN B — Setelah kunci diterima

Buka file `D:\PKM 2026\bimasorgum\.env` lalu **ganti 2 baris** ini:

```dotenv
# DARI (placeholder — harus diganti):
VITE_SUPABASE_URL=https://placeholder-preview.supabase.co
VITE_SUPABASE_ANON_KEY=placeholder-anon-key-preview-only

# MENJADI (nilai dari teman Anda):
VITE_SUPABASE_URL=https://<project-ref-teman>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key dari teman>
```

Biarkan `BIMA_API_KEY` apa adanya. **Jangan beri prefix `VITE_` pada
`BIMA_API_KEY`** — sudah dijelaskan alasannya di `SETUP-LOKAL.md`.

Simpan file. Dev server akan restart sendiri. Setelah itu cek:

```
  Buka   http://localhost:3000
  Harus  : katalog resep terisi (bukan "0 resep")
  Console: tidak ada "Anonymous sign-in failed"
```

Kalau masih kosong padahal URL & key benar: tabel di database belum dibuat.
Jalankan `supabase/ALL-IN-ONE-setup.sql` di Supabase SQL Editor (satu kali paste,
~10 detik). File itu gabungan 15 migrasi dalam urutan yang benar.

**Cara cepat memastikan database terisi** (ganti `<ref>` dan `<anon>`):

```
curl "https://<ref>.supabase.co/rest/v1/recipes?select=title&limit=3" \
  -H "apikey: <anon>" -H "Authorization: Bearer <anon>"
```

Kalau keluar `[]` → tabel ada tapi kosong. Kalau error `relation ... does not
exist` → tabelnya belum dibuat, jalankan file ALL-IN-ONE tadi.

---

## BAGIAN C — Menyalakan login Google (kalau belum)

Login Google butuh 3 sisi dikonfigurasi. Bagian yang paling sering terlewat
adalah nomor 2.

### 1. Di Google Cloud Console
Buat **OAuth client ID** tipe *Web application*:
- Menu: APIs & Services → Credentials → Create Credentials → OAuth client ID
- **Authorized redirect URIs** harus berisi (ganti `<ref>`):
  ```
  https://<ref>.supabase.co/auth/v1/callback
  ```
  Ini alamat callback Supabase, **bukan** alamat aplikasi Anda. Salah di sini
  adalah penyebab #1 login Google gagal (`redirect_uri_mismatch`).
- Salin **Client ID** dan **Client Secret**

### 2. Di Supabase
- **Authentication → Sign In / Providers → Google**: aktifkan, tempel
  Client ID + Client Secret dari langkah 1, simpan.
- **Authentication → URL Configuration**:
  - *Site URL*: `http://localhost:3000`
  - *Redirect URLs* (tambahkan semuanya):
    ```
    http://localhost:3000/**
    http://localhost:3000
    ```
    (nanti tambahkan juga alamat produksi, mis. `https://domain-anda/**`)

### 3. Uji
Buka `http://localhost:3000/#/profile` → klik **Masuk dengan Google**.
Yang benar terjadi: pindah ke halaman pilih akun Google, lalu kembali ke
aplikasi dalam keadaan sudah login (nama + foto profil muncul di kanan atas
halaman Beranda).

Kalau muncul `redirect_uri_mismatch` → langkah C.1 belum benar (redirect URI
tidak persis sama).
Kalau kembali ke aplikasi tapi masih "Guest" → langkah C.2 Redirect URLs belum
memuat alamat aplikasi Anda.

---

## BAGIAN D — Lain-lain yang berguna

**Melihat isi database** — Dashboard Supabase → **Table Editor** (seperti Excel)
atau **SQL Editor**. Contoh query berguna:

```sql
select count(*) from recipes;                    -- jumlah resep
select title, dish_category, is_published from recipes order by created_at desc limit 20;
select config_key, config_value from admin_configs;   -- flag gambar & tombol generate
select tablename, policyname, cmd from pg_policies where schemaname='public';
```

**Menjadikan diri Anda admin** (membuka menu `/admin`):
Table Editor → tabel `profiles` → cari baris dengan `id` = akun Anda →
ubah kolom `role` dari `user` menjadi `admin` → simpan. Buka `/admin`.

**Kalau teman Anda justru ingin membuat project baru** (bukan yang ada):
pilih region Singapore, lalu jalankan `supabase/ALL-IN-ONE-setup.sql`.
Urutannya sudah benar di dalam file itu — jangan menjalankan 15 file migrasi
menurut urutan abjad, karena akan gagal (alasannya ada di header file tersebut).

---

## Catatan jujur soal status saat ini

- Gejala 1 & 2 **belum benar-benar beres** sampai kunci dari teman Anda masuk.
  Yang sudah siap: aplikasi, skema database (sudah saya uji jalan di PostgreSQL
  lokal terpisah: 15 tabel, 38 policy RLS, seed 10 resep + 12 bahan), dan file
  setup satu-paste.
- Gejala 3 (generate selalu timeout) sesuai konfirmasi teman Anda: kuota AI
  sedang habis. Bukan bug di aplikasi. Pesan timeout + alternatif resep lokal
  sudah berfungsi (terbukti: 3 saran muncul otomatis).
