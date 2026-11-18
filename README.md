# SorghumCare (BimaSorgum) — Web

AI recipe generator berbasis sorgum. SPA React 19 + Vite + Tailwind v4, database
Supabase, AI dari backend RAG `https://api.llmsorgum.online`.

Catatan fitur, alur, tabel database, dan temuan pengujian: lihat [`memory.md`](memory.md).

## Menjalankan

```bash
npm ci
npm run dev        # http://localhost:3000
npm run build      # hasil ke dist/
npm run preview    # menyajikan dist/ di port 4173 (sama seperti produksi)
npm run lint       # cek tipe TypeScript
```

## Env (`.env`)

| Variabel | Dipakai di | Fungsi |
|---|---|---|
| `VITE_SUPABASE_URL` | browser | URL project Supabase |
| `VITE_SUPABASE_ANON_KEY` | browser | Anon key Supabase (aman publik, dilindungi RLS) |
| `VITE_UNSPLASH_ACCESS_KEY` | browser | Opsional — gambar resep dari Unsplash |
| `BIMA_API_KEY` | server (proxy) | Consumer key backend (`bima_live_…`), **tanpa** prefix `VITE_` agar tidak ter-bundle |
| `BIMA_BACKEND_ORIGIN` | server (proxy) | Opsional — default `https://api.llmsorgum.online` |
| `VITE_BIMA_API_URL` | browser | Opsional — URL chat penuh, hanya untuk host TANPA proses Node (lihat di bawah) |

Browser memanggil `/bima-api/*`; proxy di `vite.config.ts` meneruskannya ke
`{BIMA_BACKEND_ORIGIN}/api/*` sambil menambahkan `X-Api-Key`, jadi key backend
tidak pernah sampai ke browser.

### Kenapa fitur AI jalan di localhost tapi 405 di web hasil deploy

`/bima-api/*` **bukan** route milik aplikasi ini — ia hanya hidup selama proses
Vite yang punya `server.proxy` berjalan:

- `npm run dev` → proxy hidup (inilah "jalan di localhost").
- `npm run preview` → Vite memakai ulang `server.proxy` sebagai `preview.proxy`,
  jadi proxy juga hidup. Dockerfile di repo ini memakai jalur ini.
- Hosting statis (nginx/panel hosting yang hanya menyajikan `dist/`) → tidak ada
  proses Node di belakang domain, jadi `POST /bima-api/chat` dijawab
  `405 Not Allowed` (text/html) oleh nginx. Tampilan aplikasi normal, katalog dan
  Supabase aman, hanya AI yang mati.

Jadi pilih salah satu: deploy sebagai **aplikasi Node** (`npm run preview`),
atau set `VITE_BIMA_API_URL` ke URL backend penuh saat build.

## Deploy

Dokploy membangun `Dockerfile`: `npm ci` → `npm run build` → `npm run preview`
(port 4173). Env di atas diisi di pengaturan Dokploy. `package-lock.json` harus
sinkron dengan `package.json`, kalau tidak `npm ci` gagal.

## Database

Migrasi SQL ada di `supabase/migrations/` (urut nomor); panduan setup di
`supabase/README-setup.md`.
# bimasorgum
