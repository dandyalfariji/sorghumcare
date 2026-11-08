# PANDUAN: Bikin Project Supabase BARU + Login Google

Untuk aplikasi **BimaSorgum** (`D:\PKM 2026\bimasorgum`).

Panduan ini dibuat setelah aplikasinya saya baca dan uji. Semua nama menu, urutan
langkah, dan jebakannya sudah diverifikasi dari kode, bukan tebakan.

**Ada 2 bagian. Bagian 1–5 = database & halaman jalan (wajib). Bagian 6 = login Google.**
Bagian 7 berisi jebakan yang sudah saya temukan — bacalah sebelum mengeluh "kok gagal".

---

## Bagian 0 — Kenapa cuma 2 nilai yang dibutuhkan

Aplikasi ini **hanya** memakai 2 nilai dari Supabase:

```dotenv
VITE_SUPABASE_URL=https://<ref-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key dari project itu>
```

Sudah saya pastikan lewat kode: aplikasi **tidak** memakai Edge Function, Storage,
Realtime, RPC, maupun panggilan `auth/v1` langsung. Karena itu:

- Key `service_role` **tidak diperlukan** — jangan dipakai, jangan ditempel di `.env`.
- Key `anon` **aman** ada di browser, karena keamanannya dijaga oleh policy RLS di database.

---

## Bagian 1 — Buat project

1. Buka <https://supabase.com/dashboard> → **Sign in** (daftar dulu bila belum punya akun).
2. **New project**. Isi:
   - **Name**: `bimasorgum`
   - **Database Password**: **klik Generate a password lalu SIMPAN di tempat aman.**
     Password ini tidak ditampilkan lagi. (Untuk panduan ini password itu tidak
     dipakai, tapi Anda akan butuh kalau nanti mengelola database langsung.)
   - **Region**: **Southeast Asia (Singapore)** — paling dekat, paling cepat.
   - **Plan**: Free
3. Klik **Create new project**, tunggu ±1–2 menit sampai selesai menyiapkan.

---

## Bagian 2 — Isi database (SATU kali tempel)

Jangan menjalankan 15 file migrasi satu per satu — **urutan abjad akan gagal**
(`recipe_comments.sql` & `comment_likes.sql` tidak berangka sehingga terurut paling
akhir, padahal migrasi `008` membuat policy pada tabel yang dibuat file itu).

Pakai berkas gabungan yang sudah saya uji jalan:

1. Sidebar kiri → **SQL Editor** → **New query**
2. Buka `D:\PKM 2026\bimasorgum\supabase\ALL-IN-ONE-setup.sql` dengan Notepad,
   tekan **Ctrl+A** lalu **Ctrl+C** (seluruh isinya, **termasuk** baris komentar di atas)
3. Tempel ke SQL Editor → klik **Run** → tunggu ±10–30 detik
4. Harus muncul **"Success. No rows returned"** (atau sukses tanpa error merah)

Berkas itu idempoten (`if not exists` / `drop ... if exists`), jadi aman diulang
kalau ada bagian yang gagal.

---

## Bagian 3 — Ambil 2 nilai, taruh di `.env`

1. Sidebar kiri → **Project Settings** (ikon gir) → **API**
2. Salin:
   - **Project URL** → bentuknya `https://abcdefghijklmn.supabase.co`
   - **anon / publishable key** → **key yang boleh publik**.
     Bentuknya bisa `sb_publishable_...` (project baru) atau JWT panjang
     `eyJhbGciOi...` (project lama). **Yang penting: ambil dari project yang sama.**

   Jangan ambil `service_role` / `secret key`.

3. Buka `D:\PKM 2026\bimasorgum\.env` dengan Notepad, **ganti 2 baris** ini:

```dotenv
# DARI (placeholder):
VITE_SUPABASE_URL=https://placeholder-preview.supabase.co
VITE_SUPABASE_ANON_KEY=placeholder-anon-key-preview-only

# MENJADI (nilai dari project baru Anda):
VITE_SUPABASE_URL=https://<ref-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

Biarkan `BIMA_API_KEY` apa adanya. **Jangan beri prefix `VITE_` pada `BIMA_API_KEY`** —
kalau diberi, key AI itu ikut terkirim ke browser (sudah saya buktikan: semua variabel
ber-prefix `VITE_` ikut ter-embed ke berkas hasil build).

4. Simpan. Dev server akan memuat ulang sendiri.

---

## Bagian 4 — Verifikasi database terisi

Cara cepat dari terminal (ganti `<ref>` dan `<anon>`):

```bash
curl "https://<ref>.supabase.co/rest/v1/recipes?select=title&limit=3" \
  -H "apikey: <anon>" -H "Authorization: Bearer <anon>"
```

- keluar daftar judul resep → **berhasil**
- keluar `[]` → tabel ada tapi kosong → ulangi Bagian 2
- error `relation "public.recipes" does not exist` → Bagian 2 belum jalan

Atau lewat dashboard: **Table Editor** → tabel `recipes` → harus ada **10 baris**,
dan `ingredients` → **12 baris**.

---

## Bagian 5 — Jalankan & lihat hasilnya

```bash
cd "D:\PKM 2026\bimasorgum"
npm run dev
```

Buka <http://localhost:3000>. Yang benar: **katalog resep terisi**, dan di Console
tidak ada `Anonymous sign-in failed`.

Catatan: aplikasi ini **tidak menampilkan pesan error apa pun** kalau Supabase gagal —
hanya layar kosong + error di Console. Jadi kalau layar kosong, buka Console (F12).

---

## Bagian 6 — Menyalakan login Google

Butuh 3 sisi. Yang paling sering salah adalah **nomor 3**.

### 6.1 Di Google Cloud Console

1. Buka <https://console.cloud.google.com/> → login dengan akun Google Anda
2. Buat project (bebas namanya), lalu:
   **APIs & Services → OAuth consent screen** → pilih **External** → isi nama app
   + email → Save. (Untuk pemakaian sendiri tidak perlu proses verifikasi.)
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Name: `bimasorgum`
   - **Authorized redirect URIs** → **Add URI** → isi **persis** ini
     (ganti `<ref>` dengan ref project Supabase Anda):

     ```
     https://<ref>.supabase.co/auth/v1/callback
     ```

     ⚠️ **Ini alamat SUPABASE, bukan alamat aplikasi Anda.** Ini penyebab #1
     login Google gagal dengan pesan `redirect_uri_mismatch`. Jangan isi
     `http://localhost:3000` di sini.
4. Klik **Create** → salin **Client ID** dan **Client Secret**.

### 6.2 Di Supabase

1. **Authentication → Sign In / Providers → Google** → aktifkan (toggle ON)
   → tempel **Client ID** + **Client Secret** dari langkah 6.1 → **Save**
2. **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:3000`
   - **Redirect URLs** → tambahkan **keduanya**:
     ```
     http://localhost:3000/**
     http://localhost:3000
     ```
   - Nanti setelah punya domain produksi, tambahkan juga `https://domain-anda/**`

### 6.3 Uji

1. Buka <http://localhost:3000/#/profile>
2. Klik **Masuk dengan Google** → pilih akun → kembali ke aplikasi
3. Yang benar: nama + foto profil muncul di kanan atas halaman Beranda

Kalau gagal, lihat Bagian 7.

---

## Bagian 7 — JEBAKAN yang sudah saya temukan (baca sebelum panik)

**1. `redirect_uri_mismatch`**
Redirect URI di Google Cloud tidak persis sama. Harus
`https://<ref>.supabase.co/auth/v1/callback` — huruf, tanda, dan akhiran `/callback`
harus tepat.

**2. Kembali ke aplikasi tapi masih "Guest"**
**Authentication → URL Configuration → Redirect URLs** belum memuat alamat aplikasi
Anda (`http://localhost:3000/**`).

**3. URL dan key tidak sekawan**
URL project baru + key project lama (atau sebaliknya) = **tidak jalan**, dan
gejalanya menyesatkan (`Anonymous sign-in failed: Failed to fetch`).
Jangan hanya minta "URL dan key" — pastikan **pasangannya**.

**4. Hash router vs token OAuth — khusus aplikasi ini**
Aplikasi ini memakai router berbasis hash (`#/welcome`, `#/profile`), sedangkan token
OAuth juga dikirim lewat `#`. Yang saya sudah pastikan: `detectSessionInUrl` **tidak**
diset di kode, jadi pakai bawaan library yaitu **aktif** (benar), dan aplikasi
**tidak** menghapus hash di URL (jadi token tidak dibuang). Artinya seharusnya aman.
**Tapi ini belum pernah diuji dengan login Google sungguhan** karena kredensialnya
dulu masih placeholder.

Kalau setelah Bagian 6 login Google tetap tidak mendarat, perbaikannya 5 baris di
`src/lib/AuthProvider.tsx` (jaring pengaman, tidak perlu menyentuh bagian lain):
tambahkan rute `/auth/callback` yang memanggil `supabase.auth.exchangeCodeForSession()`,
lalu setel `detectSessionInUrl: false` di `src/lib/supabase.ts` supaya tidak tabrakan
dengan hash router.

**5. ⚠️ Token OAuth tertinggal di address bar**
Aplikasi ini tidak membersihkan parameter token dari URL setelah login. Akibatnya
token bisa lengket di address bar dan ikut tersalin bila Anda menyalin URL ke orang
lain. Bukan penghalang login, tapi kebocoran privasi kecil yang sebaiknya dibersihkan.
Perbaikannya sepele (satu baris `history.replaceState`).

**6. Menandai diri sebagai admin**
Untuk membuka menu `/admin`: **Table Editor → `profiles`** → cari baris dengan
`id` = user Anda → ubah kolom `role` dari `user` menjadi `admin` → simpan.

---

## Bagian 8 — Kalau malas ke Google Cloud Console

Login Google mewajibkan Anda membuat OAuth client di akun Google Anda — itu tidak bisa
dilewati.

**Saya sudah cek kodenya: aplikasi ini HANYA punya tombol "Masuk dengan Google"**
(`src/components/Profile/ProfilePage.tsx:372`). Tidak ada tombol email / magic link di
halaman. Selain itu ada sesi **anonim otomatis** (`ensureAnonymousSession`) yang dipakai
untuk mode guest.

Artinya pilihan Anda:

- **Tanpa Google**: aplikasi tetap jalan, tapi Anda selalu sebagai guest — tidak bisa
  login sebagai diri sendiri.
- **Mau login tanpa Google (magic link email)?** Perlu tambahan kode kecil
  (±10 baris: tombol + `supabase.auth.signInWithOtp()` di `AuthProvider.tsx`) dan
  aktifkan **Authentication → Providers → Email** di Supabase. Tidak perlu menyentuh
  Google Cloud sama sekali. Bilang saja kalau mau saya buatkan.
- **Google**: ikuti Bagian 6. Ini satu-satunya jalur login yang **sudah ada** di
  aplikasi tanpa mengubah kode.


---

## Ringkasan urutan

```
[ ] 1. Buat project Supabase (region Singapore) — simpan password DB
[ ] 2. SQL Editor -> tempel ALL-IN-ONE-setup.sql -> Run
[ ] 3. Settings -> API -> ambil Project URL + anon key -> taruh di .env (2 baris)
[ ] 4. Verifikasi: recipes = 10 baris, ingredients = 12 baris
[ ] 5. npm run dev -> katalog terisi (Console bersih)
[ ] 6. Google Cloud -> OAuth client (redirect URI = ...supabase.co/auth/v1/callback)
[ ] 7. Supabase -> Providers -> Google (tempel Client ID + Secret)
[ ] 8. Supabase -> URL Configuration -> Site URL + Redirect URLs (localhost:3000)
[ ] 9. Uji klik "Masuk dengan Google" di /#/profile
[ ] 10. (opsional) profiles.role -> admin, untuk membuka menu /admin
```
