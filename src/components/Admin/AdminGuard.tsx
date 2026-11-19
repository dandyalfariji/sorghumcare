import React from 'react'
import { ShieldAlert, Loader2 } from 'lucide-react'
import { useAuth } from '../../lib/AuthProvider'
import { navigateToSlug, RouteSlugs } from '../../utils/slugRouter'

interface AdminGuardProps {
  children: React.ReactNode
}

/**
 * Gerbang akses panel admin.
 *
 * PERUBAHAN PENTING — dulu pemeriksaan peran dilakukan di dalam `useEffect`,
 * dan `AdminLayout` TIDAK dibungkus komponen ini (hanya isinya). Akibatnya
 * seluruh kerangka panel admin tetap ter-render di DOM untuk pengunjung tanpa
 * login (bisa dibaca siapa pun lewat DevTools / HTML). Sekarang:
 *
 *   - pemeriksaan terjadi SAAT RENDER, bukan sebagai efek samping;
 *   - `AdminLayout` juga dibungkus, jadi "Admin Panel", daftar menu, dan
 *     tombol "Keluar Admin" tidak pernah muncul untuk non-admin;
 *   - selama peran belum diketahui, yang tampil hanya indikator loading —
 *     bukan panel kosong.
 */
export function AdminGuard({ children }: AdminGuardProps) {
  const { isAdmin, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f9f9f7] text-[#1a1c1b] font-['Manrope',sans-serif] antialiased flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 text-[#163422] animate-spin" />
        <p className="text-xs text-[#727972]">Memeriksa hak akses…</p>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#f9f9f7] text-[#1a1c1b] font-['Manrope',sans-serif] antialiased flex flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-[#ffdad6] text-[#ba1a1a] flex items-center justify-center">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h1 className="text-base font-bold text-[#1a1c1b]">Akses Ditolak</h1>
        <p className="text-xs text-[#727972] max-w-xs">
          Halaman panel admin hanya dapat diakses oleh akun dengan peran admin.
        </p>
        <button
          type="button"
          onClick={() => navigateToSlug(RouteSlugs.home())}
          className="mt-1 px-4 py-2 rounded-xl bg-[#163422] text-white text-xs font-bold hover:bg-[#2d4b37] transition-colors cursor-pointer"
        >
          Kembali ke Beranda
        </button>
      </div>
    )
  }

  return <>{children}</>
}

export default AdminGuard
