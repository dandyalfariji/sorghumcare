import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  History,
  Search,
  RefreshCw,
  Loader2,
  AlertTriangle,
  ShieldCheck,
  ShieldOff,
  Trash2,
  MessageSquare,
  Flag,
  BookOpen,
  Star,
  Upload,
  Settings,
  UserCog,
} from 'lucide-react'
import { supabase, adminLogAction } from '../../lib/supabase'
import type { AdminAuditEntry } from '../../types'

/**
 * Jejak Aktivitas Admin — SEBELUMNYA TIDAK ADA.
 *
 * Tabel `reports.admin_note/reviewed_by/reviewed_at` dan
 * `admin_configs.updated_by/updated_at` ada, tetapi tidak ada halaman yang
 * menunjukkan siapa mengubah apa dan kapan. Halaman ini membacanya dari
 * `admin_audit_log` (migrasi 015).
 */

const ACTION_META: Record<string, { label: string; icon: React.ReactNode; box: string }> = {
  'comment.delete': {
    label: 'Hapus komentar',
    icon: <MessageSquare className="w-4 h-4" />,
    box: 'bg-blue-50 text-blue-700',
  },
  'recipe.delete': {
    label: 'Hapus resep',
    icon: <Trash2 className="w-4 h-4" />,
    box: 'bg-[#fecaca] text-[#ba1a1a]',
  },
  'recipe.publish': {
    label: 'Terbitkan resep',
    icon: <Upload className="w-4 h-4" />,
    box: 'bg-[#cbebc3] text-[#324d30]',
  },
  'recipe.unpublish': {
    label: 'Tarik resep',
    icon: <Upload className="w-4 h-4 rotate-180" />,
    box: 'bg-[#ffe8b0] text-[#745200]',
  },
  'recipe.update': {
    label: 'Ubah resep',
    icon: <BookOpen className="w-4 h-4" />,
    box: 'bg-indigo-50 text-indigo-700',
  },
  'report.accept': {
    label: 'Terima laporan',
    icon: <Flag className="w-4 h-4" />,
    box: 'bg-[#cbebc3] text-[#324d30]',
  },
  'report.reject': {
    label: 'Tolak laporan',
    icon: <Flag className="w-4 h-4" />,
    box: 'bg-[#fecaca] text-[#ba1a1a]',
  },
  'review.delete': {
    label: 'Hapus ulasan',
    icon: <Star className="w-4 h-4" />,
    box: 'bg-amber-50 text-amber-700',
  },
  'user.role_change': {
    label: 'Ubah peran pengguna',
    icon: <UserCog className="w-4 h-4" />,
    box: 'bg-purple-50 text-purple-700',
  },
  'config.update': {
    label: 'Ubah konfigurasi',
    icon: <Settings className="w-4 h-4" />,
    box: 'bg-[#e2e3e1] text-[#424843]',
  },
}

const fallbackMeta = {
  label: 'Tindakan admin',
  icon: <ShieldCheck className="w-4 h-4" />,
  box: 'bg-[#e2e3e1] text-[#424843]',
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const shortId = (v: string | null | undefined) => (v ? (v.length > 8 ? `${v.slice(0, 8)}…` : v) : '-')

interface AdminAuditLogProps {
  /** Nama admin yang sedang aktif — dipakai saat mencatat tindakan manual. */
  currentUserName?: string
}

export const AdminAuditLog: React.FC<AdminAuditLogProps> = ({ currentUserName }) => {
  const [entries, setEntries] = useState<AdminAuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    setError(null)

    // Query langsung (bukan lewat helper) supaya pesan galat dari PostgREST
    // bisa ditampilkan: penyebab paling umum adalah migrasi 015 belum jalan,
    // dan tanpa pesan ini halaman hanya terlihat "kosong" tanpa alasan jelas.
    const { data, error: qErr } = await supabase
      .from('admin_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    if (qErr) {
      const missing = /does not exist|schema cache|relation/i.test(qErr.message)
      setError(
        missing
          ? 'Tabel admin_audit_log belum ada. Jalankan supabase/migrations/015_admin_panel_completion.sql di Supabase SQL Editor.'
          : `Gagal membaca jejak aktivitas: ${qErr.message}`,
      )
      setEntries([])
    } else {
      setEntries((data as AdminAuditEntry[]) || [])
    }

    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((e) =>
      [e.action, e.actor_name, e.target_type, e.target_id, e.detail]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    )
  }, [entries, search])

  const recalc = async () => {
    setRefreshing(true)
    // Tandai momen ini di log supaya jejaknya bisa diverifikasi sendiri oleh
    // admin tanpa harus melakukan tindakan yang merusak data.
    await adminLogAction({
      action: 'config.update',
      targetType: 'config',
      detail: 'Menyegarkan tampilan jejak aktivitas admin.',
      actorName: currentUserName ?? null,
    })
    await load(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-[#163422]" />
          <h2 className="text-base sm:text-lg font-bold text-[#1a1c1b]">Jejak Aktivitas Admin</h2>
          <span className="bg-[#cbebc3] text-[#324d30] text-[10px] font-bold px-2 py-0.5 rounded-full">
            {entries.length}
          </span>
        </div>
        <button
          onClick={recalc}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs font-bold text-[#163422] hover:text-[#2d4b37] transition-colors cursor-pointer disabled:opacity-40"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Muat ulang
        </button>
      </div>

      <p className="text-[11px] text-[#727972] leading-relaxed">
        Setiap tindakan admin yang mengubah data (hapus komentar/resep/ulasan, terbitkan atau tarik
        resep, proses laporan, ubah peran pengguna) dicatat di sini beserta pelaku dan waktunya.
        Pencatatan bersifat tambahan-saja (append-only) dan tidak pernah membatalkan tindakan utama
        walau gagal.
      </p>

      {error && (
        <div className="flex items-start gap-2 bg-[#ffe8b0] text-[#745200] text-xs font-semibold px-3 py-2 rounded-xl border border-[#e0c37a]">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      <div className="relative">
        <Search className="w-4 h-4 text-[#727972] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari tindakan, pelaku, atau target..."
          className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-[#c2c8c0] rounded-xl focus:outline-none focus:border-[#163422] bg-[#f9f9f7]"
        />
      </div>

      <div className="bg-white rounded-2xl shadow-[0px_4px_12px_rgba(45,75,55,0.08)] border border-[rgba(45,75,55,0.1)] overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-[#727972]">
            <Loader2 className="w-5 h-5 animate-spin" />
            <p className="text-xs font-bold">Memuat jejak aktivitas...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-[#727972]">
            <History className="w-6 h-6 opacity-50" />
            <p className="text-xs font-bold">
              {entries.length === 0
                ? 'Belum ada tindakan admin yang tercatat.'
                : 'Tidak ada yang cocok dengan pencarian.'}
            </p>
            <p className="text-[11px] text-[#a8a8a3] max-w-sm text-center">
              Jejak akan terisi begitu ada tindakan admin (mis. menerima laporan atau menghapus
              komentar).
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[#e2e3e1]">
            {filtered.map((e) => {
              const meta = ACTION_META[e.action] || fallbackMeta
              return (
                <li key={e.id} className="flex items-start gap-3 px-4 py-3 hover:bg-[#f9f9f7] transition-colors">
                  <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${meta.box}`}>
                    {meta.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-[#163422]">{meta.label}</span>
                      <span className="text-[10px] font-mono text-[#a8a8a3]">{e.action}</span>
                    </div>
                    {e.detail && (
                      <p className="text-[11px] text-[#424843] mt-0.5 break-words">{e.detail}</p>
                    )}
                    <p className="text-[10px] text-[#727972] mt-0.5">
                      {e.actor_name ? `oleh ${e.actor_name}` : `oleh ${shortId(e.actor_id)}`}
                      {e.target_type ? ` · ${e.target_type}: ${shortId(e.target_id)}` : ''}
                    </p>
                  </div>
                  <span className="text-[10px] text-[#727972] whitespace-nowrap shrink-0">
                    {formatDateTime(e.created_at)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

export default AdminAuditLog
