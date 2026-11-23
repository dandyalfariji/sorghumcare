import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Users,
  Search,
  RefreshCw,
  Loader2,
  AlertTriangle,
  CheckCircle,
  ShieldCheck,
  ShieldOff,
  Crown,
} from 'lucide-react'
import { adminFetchUsers, adminSetUserRole, adminLogAction, isAdmin as isAdminAccount } from '../../lib/supabase'
import type { AdminUserRow } from '../../types'

/**
 * Kelola Pengguna — SEBELUMNYA TIDAK ADA SAMA SEKALI.
 *
 * `profiles.role` sudah dipakai sebagai gerbang panel admin, tetapi tidak ada
 * halaman yang bisa mengubahnya, dan `grep -rn "profiles" src/components/Admin/`
 * kosong. Akibatnya satu-satunya cara mengangkat admin adalah lewat SQL Editor
 * Supabase. Halaman ini menutup celah itu.
 */

const ROLE_LABEL: Record<string, string> = {
  user: 'Pengguna',
  admin: 'Admin',
  nutritionist: 'Ahli Gizi',
}

const ROLE_STYLE: Record<string, string> = {
  user: 'bg-[#e2e3e1] text-[#424843]',
  admin: 'bg-[#163422] text-white',
  nutritionist: 'bg-[#cbebc3] text-[#324d30]',
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

const shortId = (v: string) => (v.length > 8 ? `${v.slice(0, 8)}…` : v)

export const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [changingId, setChangingId] = useState<string | null>(null)
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [selfId, setSelfId] = useState<string | null>(null)

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    setError(null)

    const canManage = await isAdminAccount()
    setAuthorized(canManage)

    const rows = await adminFetchUsers()
    setUsers(rows)

    const { data } = await import('../../lib/supabase').then((m) => m.supabase.auth.getUser())
    setSelfId(data.user?.id ?? null)

    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 3200)
    return () => clearTimeout(t)
  }, [notice])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) =>
      [u.id, u.full_name, u.role, u.bio]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    )
  }, [users, search])

  const handleRoleChange = async (user: AdminUserRow, nextRole: string) => {
    if (user.role === nextRole) return
    const label = ROLE_LABEL[nextRole] ?? nextRole
    const confirmed = window.confirm(
      `Ubah peran ${user.full_name || shortId(user.id)} menjadi "${label}"?`,
    )
    if (!confirmed) return

    setChangingId(user.id)
    const ok = await adminSetUserRole(user.id, nextRole)
    setChangingId(null)

    if (!ok) {
      setError(
        'Gagal mengubah peran. Pastikan migrasi 015 sudah dijalankan dan sesi admin masih aktif.',
      )
      return
    }

    await adminLogAction({
      action: 'user.role_change',
      targetType: 'profile',
      targetId: user.id,
      detail: `${user.role} -> ${nextRole} untuk ${user.full_name || shortId(user.id)}`,
    })

    setNotice(`Peran ${user.full_name || shortId(user.id)} diubah menjadi ${label}.`)
    load(true)
  }

  const adminCount = users.filter((u) => u.role === 'admin').length

  return (
    <div className="space-y-4">
      {notice && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[#163422] text-white px-5 py-2.5 rounded-full shadow-lg text-xs font-semibold flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-[#cbebc3]" />
          <span>{notice}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-[#163422]" />
          <h2 className="text-base sm:text-lg font-bold text-[#1a1c1b]">Kelola Pengguna</h2>
          <span className="bg-[#cbebc3] text-[#324d30] text-[10px] font-bold px-2 py-0.5 rounded-full">
            {users.length}
          </span>
          <span className="bg-[#e2e3e1] text-[#424843] text-[10px] font-bold px-2 py-0.5 rounded-full">
            {adminCount} admin
          </span>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs font-bold text-[#163422] hover:text-[#2d4b37] transition-colors cursor-pointer disabled:opacity-40"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Muat ulang
        </button>
      </div>

      {/* Tanpa policy "admins can read all profiles" (migrasi 015), Supabase
          hanya mengembalikan baris milik pemanggil — jadi daftar akan terlihat
          seperti cuma berisi satu orang. */}
      {authorized === false && (
        <div className="flex items-start gap-2 bg-[#ffe8b0] text-[#745200] text-xs font-semibold px-3 py-2 rounded-xl border border-[#e0c37a]">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
          <span className="flex-1">
            Akun ini bukan admin, sehingga daftar pengguna tidak bisa dibaca. Halaman ini hanya
            berfungsi untuk sesi dengan peran admin.
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-[#fecaca] text-[#ba1a1a] text-xs font-bold px-3 py-2 rounded-xl border border-[#fca5a5]">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="cursor-pointer hover:underline">
            Tutup
          </button>
        </div>
      )}

      <div className="relative">
        <Search className="w-4 h-4 text-[#727972] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama, peran, atau ID pengguna..."
          className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-[#c2c8c0] rounded-xl focus:outline-none focus:border-[#163422] bg-[#f9f9f7]"
        />
      </div>

      <div className="bg-white rounded-2xl shadow-[0px_4px_12px_rgba(45,75,55,0.08)] border border-[rgba(45,75,55,0.1)] overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-[#727972]">
            <Loader2 className="w-5 h-5 animate-spin" />
            <p className="text-xs font-bold">Memuat pengguna...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-[#727972]">
            <Users className="w-6 h-6 opacity-50" />
            <p className="text-xs font-bold">
              {users.length === 0 ? 'Belum ada profil pengguna terbaca.' : 'Tidak ada yang cocok.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left border-collapse">
              <thead>
                <tr className="bg-[#f4f4f2] text-[#424843]">
                  <th className="text-[10px] font-bold uppercase tracking-wide px-3 py-2.5">Pengguna</th>
                  <th className="text-[10px] font-bold uppercase tracking-wide px-3 py-2.5">Peran</th>
                  <th className="text-[10px] font-bold uppercase tracking-wide px-3 py-2.5 text-center">Resep</th>
                  <th className="text-[10px] font-bold uppercase tracking-wide px-3 py-2.5 text-center">Komentar</th>
                  <th className="text-[10px] font-bold uppercase tracking-wide px-3 py-2.5">Terdaftar</th>
                  <th className="text-[10px] font-bold uppercase tracking-wide px-3 py-2.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const isSelf = selfId === u.id
                  const busy = changingId === u.id
                  return (
                    <tr key={u.id} className="border-t border-[#e2e3e1] hover:bg-[#f9f9f7] transition-colors">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <img
                            src={
                              u.avatar_url ||
                              `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                                u.full_name || 'Anonim',
                              )}&backgroundColor=cbebc3&textColor=163422`
                            }
                            alt=""
                            referrerPolicy="no-referrer"
                            className="w-7 h-7 rounded-full bg-[#e8eae6] shrink-0"
                          loading="lazy"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-[#163422] truncate">
                              {u.full_name || 'Tanpa nama'}
                              {isSelf && (
                                <span className="ml-1.5 text-[9px] bg-[#cbebc3] text-[#324d30] px-1.5 py-0.5 rounded-full">
                                  Anda
                                </span>
                              )}
                            </p>
                            <p className="text-[10px] font-mono text-[#727972] truncate" title={u.id}>
                              {shortId(u.id)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            ROLE_STYLE[u.role] || ROLE_STYLE.user
                          }`}
                        >
                          {ROLE_LABEL[u.role] || u.role}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-center text-[#424843]">{u.recipe_count ?? 0}</td>
                      <td className="px-3 py-2.5 text-xs text-center text-[#424843]">{u.comment_count ?? 0}</td>
                      <td className="px-3 py-2.5 text-[11px] text-[#727972] whitespace-nowrap">
                        {formatDate(u.created_at)}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {u.role === 'admin' ? (
                            <button
                              type="button"
                              disabled={busy || isSelf}
                              onClick={() => handleRoleChange(u, 'user')}
                              title={
                                isSelf
                                  ? 'Admin tidak bisa menurunkan perannya sendiri'
                                  : 'Turunkan menjadi pengguna'
                              }
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-[#ba1a1a] bg-[#fecaca] hover:bg-[#fca5a5] px-2 py-1 rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {busy ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <ShieldOff className="w-3.5 h-3.5" />
                              )}
                              Turunkan
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleRoleChange(u, 'admin')}
                                title="Jadikan admin"
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-[#324d30] bg-[#cbebc3] hover:bg-[#b7dcab] px-2 py-1 rounded-lg transition-colors cursor-pointer disabled:opacity-40"
                              >
                                {busy ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                )}
                                Jadikan Admin
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleRoleChange(u, 'nutritionist')}
                                title="Tandai sebagai ahli gizi"
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-[#7c5800] bg-[#ffe8b0] hover:bg-[#ffdf95] px-2 py-1 rounded-lg transition-colors cursor-pointer disabled:opacity-40"
                              >
                                <Crown className="w-3.5 h-3.5" />
                                Ahli Gizi
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] text-[#727972] leading-relaxed">
        Perubahan peran memakai fungsi database <span className="font-mono">admin_set_user_role</span> yang
        memverifikasi ulang status admin di sisi server, dan hanya menyentuh kolom{' '}
        <span className="font-mono">role</span> — nama serta bio pengguna tidak ikut berubah. Admin tidak
        dapat menurunkan perannya sendiri agar panel tidak terkunci.
      </p>
    </div>
  )
}

export default AdminUsers
