import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  // Server-side only (no VITE_ prefix, so never bundled into the browser JS):
  // the consumer key the backend requires on /api/chat, and an optional backend
  // override. Read from the process env (Dokploy) or .env.local.
  const env = loadEnv(mode, process.cwd(), '');
  const bimaApiKey = env.BIMA_API_KEY || '';
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Proxy: same-origin calls from the browser hit this prefix and are
      // forwarded server-side to the AI backend (`/bima-api/*` -> `/api/*`).
      // `vite preview` (the Dokploy container) reuses it, since preview.proxy
      // defaults to server.proxy.
      // Origin is pinned to an allowed dev origin so a CORS allowlist on the
      // backend doesn't reject the hop. The consumer key is added here, not in
      // the browser; lowercase so it replaces any key the client sent instead
      // of going out as a second header.
      proxy: {
        '/bima-api': {
          target: env.BIMA_BACKEND_ORIGIN || 'https://api.llmsorgum.online',
          changeOrigin: true,
          rewrite: (p: string) => p.replace(/^\/bima-api/, '/api'),
          headers: {
            Origin: 'http://localhost:3000',
            ...(bimaApiKey ? { 'x-api-key': bimaApiKey } : {}),
          },
        },
      },
    },
    preview: {
      allowedHosts: true as any,
    },
    build: {
      // Bundle sebelumnya satu chunk 1.106 kB (309 kB gzip) — Vite sendiri
      // memperingatkan batas 500 kB. Library besar dipisah ke chunk sendiri
      // supaya unduhan awal lebih kecil dan cache bertahan saat kode app berubah.
      //
      // Catatan: `src/lib/supabase.ts` di-import dinamis di beberapa tempat TAPI
      // juga statis di belasan file, sehingga Rollup tidak bisa memindahkannya ke
      // chunk terpisah ("dynamic import will not move module into another chunk").
      // Karena itu Supabase dipisah lewat manualChunks berdasarkan nama modul,
      // bukan mengandalkan dynamic import.
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules')) {
              if (id.includes('@supabase') || id.includes('postgrest')) return 'vendor-supabase';
              if (id.includes('motion') || id.includes('framer')) return 'vendor-motion';
              if (id.includes('lucide-react')) return 'vendor-icons';
              if (id.includes('react-dom') || id.includes('/react/')) return 'vendor-react';
              return 'vendor';
            }
            return undefined;
          },
        },
      },
      chunkSizeWarningLimit: 700,
    },
  };
});
