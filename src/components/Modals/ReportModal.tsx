import React, { useState } from 'react'
import { Flag, Loader2, X, CheckCircle, AlertTriangle } from 'lucide-react'
import { submitReport } from '../../lib/supabase'
import type { Report } from '../../types'

/**
 * Modal "Laporkan".
 *
 * SEBELUMNYA TIDAK ADA UI PELAPORAN SAMA SEKALI. Tabel `reports` dan policy
 * insert-nya sudah disiapkan di migrasi 008, halaman Laporan admin sudah ada,
 * tetapi tidak ada satu pun jalur untuk pengguna membuat laporan — sehingga
 * halaman Laporan admin mustahil terisi (query REST selalu `[]`).
 */

const REASONS: { id: string; label: string }[] = [
  { id: 'spam', label: 'Spam atau promosi' },
  { id: 'kasar', label: 'Ujaran kasar / pelecehan' },
  { id: 'tidak_sesuai', label: 'Tidak sesuai topik' },
  { id: 'informasi_salah', label: 'Informasi menyesatkan atau berbahaya' },
  { id: 'lainnya', label: 'Alasan lain' },
]

interface ReportModalProps {
  open: boolean
  targetType: Report['target_type']
  targetId: string
  /** Teks ringkas objek yang dilaporkan, mis. isi komentar atau judul resep. */
  targetPreview?: string
  onClose: () => void
  /** Dipanggil setelah laporan berhasil terkirim. */
  onSubmitted?: () => void
}

export const ReportModal: React.FC<ReportModalProps> = ({
  open,
  targetType,
  targetId,
  targetPreview,
  onClose,
  onSubmitted,
}) => {
  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (!open) return null

  const handleClose = () => {
    if (sending) return
    setReason('')
    setDetail('')
    setError(null)
    setDone(false)
    onClose()
  }

  const handleSubmit = async () => {
    if (!reason) {
      setError('Pilih salah satu alasan laporan.')
      return
    }
    const label = REASONS.find((r) => r.id === reason)?.label ?? reason
    const text = detail.trim() ? `${label}: ${detail.trim()}` : label

    setSending(true)
    setError(null)
    const ok = await submitReport({ targetType, targetId, reason: text })
    setSending(false)

    if (!ok) {
      setError(
        'Gagal mengirim laporan. Pastikan Anda sudah terhubung (sesi anonim pun cukup) lalu coba lagi.',
      )
      return
    }

    setDone(true)
    onSubmitted?.()
  }

  return (
    <div className="fixed inset-0 z-[60] bg-[#1a1c1b]/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full p-5 space-y-3 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#ffe8b0] text-[#7c5800] flex items-center justify-center shrink-0">
              <Flag className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-[#1a1c1b]">
                {targetType === 'comment' ? 'Laporkan komentar' : 'Laporkan resep'}
              </h3>
              <p className="text-[11px] text-[#727972]">
                Laporan diperiksa admin sebelum ditindaklanjuti.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={sending}
            aria-label="Tutup"
            className="w-8 h-8 rounded-xl hover:bg-[#f4f4f2] flex items-center justify-center text-[#727972] cursor-pointer disabled:opacity-50 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {targetPreview && (
          <div className="bg-[#f4f4f2] rounded-xl px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#727972] mb-0.5">
              Yang dilaporkan
            </p>
            <p className="text-[11px] text-[#424843] line-clamp-3 break-words">{targetPreview}</p>
          </div>
        )}

        {done ? (
          <div className="text-center space-y-2 py-2">
            <div className="w-12 h-12 rounded-full bg-[#cbebc3] text-[#324d30] flex items-center justify-center mx-auto">
              <CheckCircle className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-[#1a1c1b]">Laporan terkirim</p>
            <p className="text-[11px] text-[#727972]">
              Terima kasih. Laporan Anda akan ditinjau oleh admin.
            </p>
            <button
              type="button"
              onClick={handleClose}
              className="mt-1 px-4 py-2 rounded-xl bg-[#163422] text-white text-xs font-bold hover:bg-[#2d4b37] transition-colors cursor-pointer"
            >
              Selesai
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              {REASONS.map((r) => (
                <label
                  key={r.id}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-colors ${
                    reason === r.id
                      ? 'border-[#163422] bg-[#163422]/5'
                      : 'border-[#e2e3e1] hover:bg-[#f9f9f7]'
                  }`}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    value={r.id}
                    checked={reason === r.id}
                    onChange={() => setReason(r.id)}
                    className="accent-[#163422]"
                  />
                  <span className="text-xs text-[#1a1c1b]">{r.label}</span>
                </label>
              ))}
            </div>

            <label className="block space-y-1">
              <span className="text-[11px] font-bold text-[#424843]">Keterangan tambahan (opsional)</span>
              <textarea
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                rows={2}
                disabled={sending}
                placeholder="Jelaskan singkat masalahnya…"
                className="w-full px-3 py-2 border border-[#c2c8c0] rounded-xl text-xs bg-white focus:outline-none focus:border-[#163422] resize-y disabled:opacity-50"
              />
            </label>

            {error && (
              <div className="flex items-start gap-2 bg-[#fecaca] text-[#ba1a1a] text-[11px] font-bold px-3 py-2 rounded-xl border border-[#fca5a5]">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                <span className="flex-1">{error}</span>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleClose}
                disabled={sending}
                className="flex-1 py-2.5 rounded-xl border border-[#c2c8c0] text-xs font-bold text-[#424843] hover:bg-[#f4f4f2] transition-colors cursor-pointer disabled:opacity-60"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={sending || !reason}
                className="flex-1 py-2.5 rounded-xl bg-[#163422] text-white text-xs font-bold hover:bg-[#2d4b37] shadow-sm transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Flag className="w-3.5 h-3.5" />}
                {sending ? 'Mengirim...' : 'Kirim Laporan'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default ReportModal
