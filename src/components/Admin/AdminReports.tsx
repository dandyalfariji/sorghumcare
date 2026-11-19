import React, { useState, useEffect, useCallback } from 'react'
import { Check, X, Flag, RefreshCw, Loader2, AlertTriangle } from 'lucide-react'
import { fetchReports, acceptReport, rejectReport, adminLogAction } from '../../lib/supabase'
import type { Report } from '../../types'

/** Label status dalam bahasa Indonesia. */
const STATUS_LABEL: Record<Report['status'], string> = {
  pending: 'Menunggu',
  accepted: 'Diterima',
  rejected: 'Ditolak',
}

/** Warna badge status. */
const STATUS_STYLE: Record<Report['status'], string> = {
  pending: 'bg-[#f4f4f2] text-[#727972]',
  accepted: 'bg-[#cbebc3] text-[#324d30]',
  rejected: 'bg-[#fecaca] text-[#ba1a1a]',
}

/** Label jenis target laporan. */
const TARGET_TYPE_LABEL: Record<string, string> = {
  comment: 'Komentar',
  recipe: 'Resep',
  user: 'Pengguna',
  content: 'Konten',
}

/** Format timestamp ISO menjadi tanggal Indonesia. */
function formatDate(iso: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Tampilkan bagian awal uuid agar mudah dicocokkan tanpa memenuhi kolom. */
function shortId(id: string | null | undefined): string {
  if (!id) return '-'
  return id.length > 8 ? `${id.slice(0, 8)}…` : id
}

interface PendingAction {
  reportId: string
  type: 'accept' | 'reject'
}

/**
 * Halaman admin untuk melihat seluruh laporan (reports)
 * lalu menerima atau menolaknya. Catatan admin bersifat opsional.
 */
export const AdminReports: React.FC = () => {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [note, setNote] = useState('')
  const [processing, setProcessing] = useState(false)

  const loadReports = useCallback(async (withSpinner = true) => {
    if (withSpinner) setLoading(true)
    setError(null)

    const data = await fetchReports()
    setReports(data)

    setLoading(false)
  }, [])

  useEffect(() => {
    loadReports()
  }, [loadReports])

  const openAction = (reportId: string, type: 'accept' | 'reject') => {
    setPendingAction({ reportId, type })
    setNote('')
  }

  const cancelAction = () => {
    if (processing) return
    setPendingAction(null)
    setNote('')
  }

  const confirmAction = async () => {
    if (!pendingAction || processing) return

    setProcessing(true)
    const adminNote = note.trim() ? note.trim() : null
    const isAccept = pendingAction.type === 'accept'
    const ok = isAccept
      ? await acceptReport(pendingAction.reportId, adminNote)
      : await rejectReport(pendingAction.reportId, adminNote)

    if (!ok) {
      setError(
        isAccept
          ? 'Gagal menerima laporan. Silakan coba lagi.'
          : 'Gagal menolak laporan. Silakan coba lagi.',
      )
      setProcessing(false)
      return
    }

    // Catat ke jejak aktivitas admin (tidak pernah membatalkan tindakan di atas).
    const target = reports.find((r) => r.id === pendingAction.reportId)
    await adminLogAction({
      action: isAccept ? 'report.accept' : 'report.reject',
      targetType: 'report',
      targetId: pendingAction.reportId,
      detail: target
        ? `${TARGET_TYPE_LABEL[target.target_type] || target.target_type} — ${target.reason || 'tanpa alasan'}${adminNote ? ` | catatan: ${adminNote}` : ''}`
        : `catatan: ${adminNote || '-'}`,
    })

    setProcessing(false)
    setPendingAction(null)
    setNote('')
    await loadReports(false)
  }

  const pendingCount = reports.filter((r) => r.status === 'pending').length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Flag className="w-5 h-5 text-[#163422]" />
          <h2 className="text-base sm:text-lg font-bold text-[#1a1c1b]">Laporan</h2>
          <span className="bg-[#cbebc3] text-[#324d30] text-[10px] font-bold px-2 py-0.5 rounded-full">
            {reports.length}
          </span>
          {pendingCount > 0 && (
            <span className="bg-[#f4f4f2] text-[#727972] text-[10px] font-bold px-2 py-0.5 rounded-full">
              {pendingCount} menunggu
            </span>
          )}
        </div>
        <button
          onClick={() => loadReports()}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-bold text-[#163422] hover:text-[#2d4b37] transition-colors cursor-pointer disabled:opacity-40"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Muat ulang
        </button>
      </div>

      {/* Pesan error */}
      {error && (
        <div className="flex items-center gap-2 bg-[#fecaca] text-[#ba1a1a] text-xs font-bold px-3 py-2 rounded-xl border border-[#fca5a5]">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            className="cursor-pointer hover:underline"
            aria-label="Tutup pesan"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Tabel laporan */}
      <div className="bg-white rounded-2xl shadow-[0px_4px_12px_rgba(45,75,55,0.08)] border border-[rgba(45,75,55,0.1)] overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-[#727972]">
            <Loader2 className="w-5 h-5 animate-spin" />
            <p className="text-xs font-bold">Memuat laporan...</p>
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-[#727972]">
            <Flag className="w-6 h-6 opacity-50" />
            <p className="text-xs font-bold">Belum ada laporan masuk.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#f4f4f2] text-[#424843]">
                  <th className="text-[10px] font-bold uppercase tracking-wide px-3 py-2.5 whitespace-nowrap">Pelapor</th>
                  <th className="text-[10px] font-bold uppercase tracking-wide px-3 py-2.5 whitespace-nowrap">Jenis</th>
                  <th className="text-[10px] font-bold uppercase tracking-wide px-3 py-2.5 whitespace-nowrap">Target</th>
                  <th className="text-[10px] font-bold uppercase tracking-wide px-3 py-2.5 whitespace-nowrap">Alasan</th>
                  <th className="text-[10px] font-bold uppercase tracking-wide px-3 py-2.5 whitespace-nowrap">Status</th>
                  <th className="text-[10px] font-bold uppercase tracking-wide px-3 py-2.5 whitespace-nowrap">Dibuat</th>
                  <th className="text-[10px] font-bold uppercase tracking-wide px-3 py-2.5 text-right whitespace-nowrap">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <React.Fragment key={r.id}>
                    <tr className="border-t border-[#e2e3e1] hover:bg-[#f9f9f7] transition-colors">
                      <td className="px-3 py-2.5 text-[11px] font-mono text-[#727972] whitespace-nowrap">
                        {shortId(r.reporter_id)}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-bold text-[#163422] whitespace-nowrap">
                        {TARGET_TYPE_LABEL[r.target_type] || r.target_type}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] font-mono text-[#727972] whitespace-nowrap">
                        {shortId(r.target_id)}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-[#1a1c1b] leading-relaxed max-w-xs">
                        {r.reason || '-'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[r.status] || STATUS_STYLE.pending}`}>
                          {STATUS_LABEL[r.status] || r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-[#727972] whitespace-nowrap">
                        {formatDate(r.created_at)}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        {r.status === 'pending' ? (
                          <div className="inline-flex items-center gap-2">
                            <button
                              onClick={() => openAction(r.id, 'accept')}
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-[#324d30] bg-[#cbebc3] hover:bg-[#b7dcab] px-2 py-1 rounded-lg transition-colors cursor-pointer"
                              aria-label={`Terima laporan ${shortId(r.id)}`}
                            >
                              <Check className="w-3.5 h-3.5" />
                              Terima
                            </button>
                            <button
                              onClick={() => openAction(r.id, 'reject')}
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-[#ba1a1a] bg-[#fecaca] hover:bg-[#fca5a5] px-2 py-1 rounded-lg transition-colors cursor-pointer"
                              aria-label={`Tolak laporan ${shortId(r.id)}`}
                            >
                              <X className="w-3.5 h-3.5" />
                              Tolak
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-[#727972] font-bold">Selesai</span>
                        )}
                      </td>
                    </tr>

                    {/* Panel input catatan admin */}
                    {pendingAction?.reportId === r.id && (
                      <tr className="border-t border-[#e2e3e1] bg-[#f9f9f7]">
                        <td colSpan={7} className="px-3 py-3">
                          <label className="block text-[10px] font-bold uppercase tracking-wide text-[#424843] mb-1.5">
                            Catatan admin (opsional)
                          </label>
                          <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            rows={2}
                            placeholder={
                              pendingAction.type === 'accept'
                                ? 'Alasan laporan diterima...'
                                : 'Alasan laporan ditolak...'
                            }
                            disabled={processing}
                            className="w-full px-3 py-2 text-xs sm:text-sm border border-[#c2c8c0] rounded-xl focus:outline-none focus:border-[#163422] bg-white resize-y disabled:opacity-50"
                          />
                          <div className="flex items-center justify-end gap-2 mt-2">
                            <button
                              onClick={cancelAction}
                              disabled={processing}
                              className="text-[10px] font-bold text-[#727972] hover:text-[#424843] transition-colors cursor-pointer disabled:opacity-40"
                            >
                              Batal
                            </button>
                            <button
                              onClick={confirmAction}
                              disabled={processing}
                              className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50 ${
                                pendingAction.type === 'accept'
                                  ? 'text-[#324d30] bg-[#cbebc3] hover:bg-[#b7dcab]'
                                  : 'text-[#ba1a1a] bg-[#fecaca] hover:bg-[#fca5a5]'
                              }`}
                            >
                              {processing ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : pendingAction.type === 'accept' ? (
                                <Check className="w-3.5 h-3.5" />
                              ) : (
                                <X className="w-3.5 h-3.5" />
                              )}
                              {pendingAction.type === 'accept' ? 'Konfirmasi Terima' : 'Konfirmasi Tolak'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
