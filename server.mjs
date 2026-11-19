/**
 * Server produksi SorghumCare — BUKAN `vite preview`.
 *
 * Kenapa file ini ada
 * -------------------
 * Situs ini di-deploy sebagai berkas STATIS (Kroombox: Runtime "—"), sehingga
 * proxy `/bima-api` di vite.config.ts tidak punya proses yang menjalankannya:
 * nginx menjawab `405 Not Allowed` (text/html) dan fitur AI mati walaupun
 * katalog, Supabase, dan semua halaman lain tampak normal.
 *
 * `vite preview` TIDAK bisa dipakai sebagai perbaikan: panel menolaknya
 * (errSTART_DEV_SERVER - "runs the development server of a browser frontend
 * (such as ng serve or vite)... This project builds web pages"). Panel hanya
 * bisa menjalankan Node.js, PHP/Laravel, dan situs statis.
 *
 * Jadi: satu proses Node kecil yang
 *   1) menyajikan `dist/` (hasil `npm run build`), dan
 *   2) meneruskan `/bima-api/*` ke backend AI sambil MENYUNTIK `X-Api-Key`
 *      dari environment server.
 *
 * Konsekuensi keamanan: kunci API tetap di server. Ia tidak pernah ikut
 * ter-bundle ke JavaScript browser, jadi tidak bisa dibaca lewat DevTools -
 * inilah alasan kita memilih jalur ini daripada mengirim kunci dari klien.
 *
 * Tanpa dependensi baru (hanya modul bawaan Node) supaya `npm ci` di server
 * dan package-lock.json tidak perlu berubah. Butuh Node 18+ (memakai fetch).
 *
 * Env yang dibaca (diisi di panel: Settings -> Env):
 *   BIMA_API_KEY         (wajib)  kunci backend, mis. bima_live_...
 *   BIMA_BACKEND_ORIGIN  (opsional) default https://api.llmsorgum.online
 *   PORT                 (otomatis dari panel)
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(__dirname, 'dist')

const PORT = Number(process.env.PORT || 4173)
const HOST = process.env.HOST || '0.0.0.0'
const BACKEND = (process.env.BIMA_BACKEND_ORIGIN || 'https://api.llmsorgum.online')
  .replace(/\/+$/, '')
const API_KEY = (process.env.BIMA_API_KEY || '').trim()

if (!API_KEY) {
  console.warn(
    '[server] PERINGATAN: BIMA_API_KEY belum diisi. ' +
    '/bima-api/* akan diteruskan tanpa kunci dan backend akan menjawab 401. ' +
    'Isi lewat Settings -> Env di panel, lalu deploy ulang.'
  )
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

/** Header yang diteruskan dari klien ke backend. */
const FORWARD_REQ = new Set([
  'content-type', 'accept', 'x-use-rag', 'x-stream', 'x-max-tokens',
  'x-model', 'x-target-doc', 'x-llm-api-key', 'x-server-url',
])
/** Header respons yang tidak boleh diteruskan balik (hop-by-hop). */
const STRIP_RES = new Set([
  'connection', 'keep-alive', 'transfer-encoding', 'upgrade',
  'proxy-authenticate', 'proxy-authorization', 'te', 'trailer',
  'content-encoding', 'content-length',
])

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/** Teruskan /bima-api/<sisa> -> <BACKEND>/api/<sisa>, menyuntik X-Api-Key. */
async function proxy(req, res, url) {
  // rewrite: /bima-api -> /api  (sama seperti vite.config.ts)
  const rest = url.pathname.replace(/^\/bima-api/, '')
  const target = `${BACKEND}/api${rest}${url.search}`

  const headers = {}
  for (const [k, v] of Object.entries(req.headers)) {
    if (FORWARD_REQ.has(k.toLowerCase())) headers[k] = v
  }
  if (API_KEY) headers['X-Api-Key'] = API_KEY

  let body
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await readBody(req)
  }

  try {
    const up = await fetch(target, {
      method: req.method,
      headers,
      body: body && body.length ? body : undefined,
      redirect: 'manual',
    })

    const out = {}
    up.headers.forEach((v, k) => {
      if (!STRIP_RES.has(k.toLowerCase())) out[k] = v
    })
    res.writeHead(up.status, out)

    if (!up.body) {
      res.end()
      return
    }
    // Streaming (SSE) - penting agar balasan AI muncul bertahap, bukan sekaligus.
    Readable.fromWeb(up.body).pipe(res)
  } catch (err) {
    const msg = String((err && err.message) || err)
    console.error('[server] proxy gagal:', target, msg)
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({
      error: 'Tidak bisa menghubungi backend AI.',
      target,
      detail: msg,
    }))
  }
}

/** Sajikan berkas dari dist/ dengan fallback SPA ke index.html. */
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname)
  if (rel.endsWith('/')) rel += 'index.html'

  // Cegah path traversal.
  const full = path.normalize(path.join(DIST, rel))
  if (!full.startsWith(DIST)) {
    res.writeHead(403).end('Forbidden')
    return
  }

  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) {
      // Fallback SPA: rute aplikasi (mis. /#/admin) bukan berkas nyata.
      const idx = path.join(DIST, 'index.html')
      fs.readFile(idx, (e2, buf) => {
        if (e2) {
          res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('Not found. Apakah `npm run build` sudah dijalankan?')
          return
        }
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-cache',
        })
        res.end(buf)
      })
      return
    }

    const ext = path.extname(full).toLowerCase()
    // Aset ber-hash aman di-cache lama; HTML tidak.
    const isHashedAsset = /^\/assets\//.test(rel)
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'content-length': st.size,
      'cache-control': isHashedAsset
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    })
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    fs.createReadStream(full).pipe(res)
  })
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

  if (url.pathname === '/bima-api' || url.pathname.startsWith('/bima-api/')) {
    proxy(req, res, url)
    return
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Method not allowed')
    return
  }
  serveStatic(req, res, url)
})

// Streaming AI bisa lama; jangan biarkan Node memutus permintaan di tengah jalan.
server.requestTimeout = 0
server.headersTimeout = 0

server.listen(PORT, HOST, () => {
  console.log(`[server] SorghumCare siap di http://${HOST}:${PORT}`)
  console.log(`[server] dist      : ${DIST}`)
  console.log(`[server] proxy     : /bima-api/* -> ${BACKEND}/api/*`)
  console.log(`[server] X-Api-Key : ${API_KEY ? 'TERPASANG' : 'BELUM DIISI'}`)
})
