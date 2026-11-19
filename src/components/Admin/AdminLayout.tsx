import React, { useState } from 'react'
import {
  LayoutDashboard,
  MessageSquare,
  Flag,
  BookOpen,
  Star,
  Users,
  History,
  Settings,
  LogOut,
  Loader2,
} from 'lucide-react'
import { useAuth } from '../../lib/AuthProvider'
import { navigateToSlug, RouteSlugs } from '../../utils/slugRouter'

interface AdminLayoutProps {
  children: React.ReactNode
  /**
   * Bagian admin yang aktif. Kalau tidak diisi, dihitung dari URL saat ini —
   * ini yang membuat menu ter-highlight benar pada render pertama dan setelah
   * back/forward browser (dulu prop ini berasal dari state yang baru di-set
   * setelah navigasi, sehingga highlight selalu tertinggal satu langkah).
   */
  active?: string
  /** Peran masih dimuat — tampilkan kerangka tanpa menu supaya tidak bocor. */
  loading?: boolean
}

export function AdminLayout({ children, active = 'dashboard', loading = false }: AdminLayoutProps) {
  const { signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const handleSignOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      await signOut()
      navigateToSlug(RouteSlugs.home())
    } finally {
      setSigningOut(false)
      setConfirming(false)
    }
  }

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'komentar', label: 'Komentar', icon: MessageSquare },
    { id: 'laporan', label: 'Laporan', icon: Flag },
    { id: 'resep', label: 'Resep', icon: BookOpen },
    { id: 'ulasan', label: 'Ulasan', icon: Star },
    { id: 'pengguna', label: 'Pengguna', icon: Users },
    { id: 'aktivitas', label: 'Aktivitas', icon: History },
    { id: 'pengaturan', label: 'Pengaturan', icon: Settings },
  ]

  // Sebelum peran diketahui, JANGAN render menu apa pun. Sebelumnya seluruh
  // kerangka panel ("Admin Panel", daftar menu, "Keluar Admin") tetap muncul
  // di DOM untuk pengunjung tanpa login.
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9F9F7] text-[#1A1C1B] font-['Manrope',sans-serif] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 text-[#163422] animate-spin" />
        <p className="text-xs text-[#727972]">Memuat panel admin…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F9F9F7] text-[#1A1C1B] font-['Manrope',sans-serif]">
      <div className="flex">
        {/* `relative` wajib: tombol "Keluar Admin" memakai `absolute`, dan
            sebelumnya tidak ada ancestor ber-posisi sehingga tombol itu
            menempel ke viewport (turun ke y≈1044, di luar layar). */}
        <aside className="relative w-64 min-h-screen bg-white border-r border-[#c2c8c0]/60 shadow-sm pb-24">
          <div className="p-6 border-b border-[#c2c8c0]/60">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-2xl bg-[#163422] flex items-center justify-center">
                <Settings className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-lg">Admin Panel</span>
            </div>
          </div>
          <nav className="p-4 space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon
              const isActive = active === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => navigateToSlug(`/admin/${item.id}`)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl transition-colors ${
                    isActive
                      ? 'bg-[#163422] text-white shadow-sm'
                      : 'text-[#1A1C1B] hover:bg-[#F9F9F7]'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-sm font-medium">{item.label}</span>
                </button>
              )
            })}
          </nav>
          <div className="absolute bottom-4 left-4 right-4">
            <button
              onClick={() => setConfirming(true)}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-[#1A1C1B] hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
            >
              <LogOut className="w-5 h-5" />
              <span className="text-sm font-medium">Keluar Admin</span>
            </button>
          </div>
        </aside>
        <main className="flex-1 p-6">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>

      {/* Konfirmasi keluar: signOut() bersifat global untuk seluruh aplikasi
          (bukan hanya mode admin), jadi menekannya tanpa sengaja akan
          mengeluarkan pemilik akun dari sesinya. */}
      {confirming && (
        <div className="fixed inset-0 z-50 bg-[#1a1c1b]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 space-y-3 shadow-2xl text-center">
            <div className="w-12 h-12 rounded-full bg-[#ffdad6] text-[#ba1a1a] flex items-center justify-center mx-auto">
              <LogOut className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-base text-[#1a1c1b]">Keluar dari akun?</h3>
            <p className="text-xs text-[#727972]">
              Ini akan mengakhiri sesi login Anda di seluruh aplikasi (bukan hanya
              panel admin). Anda perlu login lagi untuk mengakses panel.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={signingOut}
                className="flex-1 py-2.5 rounded-xl border border-[#c2c8c0] text-xs font-bold text-[#424843] hover:bg-[#f4f4f2] transition-colors cursor-pointer disabled:opacity-60"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="flex-1 py-2.5 rounded-xl bg-[#ba1a1a] text-white text-xs font-bold hover:bg-rose-700 shadow-sm transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {signingOut ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Keluar...
                  </>
                ) : (
                  'Ya, Keluar'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminLayout
