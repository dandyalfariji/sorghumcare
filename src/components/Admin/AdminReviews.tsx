import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Star,
  Search,
  RefreshCw,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Trash2,
} from 'lucide-react'
import { adminFetchReviews, adminDeleteReview, adminLogAction } from '../../lib/supabase'
import type { AdminReviewRow } from '../../types'

/**
 * Moderasi Ulasan — SEBELUMNYA TIDAK ADA.
 *
 * Tabel `recipe_reviews` + `recipe_likes` + view `v_recipe_stats` sudah dibuat
 * di migrasi 013 dan publik bisa membacanya, tetapi tidak ada satu pun jalur
 * admin untuk menindak ulasan kasar atau rating palsu: RLS "own reviews all"
 * hanya mengizinkan pemiliknya mengubah/menghapus barisnya sendiri.
 */
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

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`${rating} dari 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`w-3.5 h-3.5 ${n <= rating ? 'text-[#e0a500] fill-[#e0a500]' : 'text-[#c2c8c0]'}`}
        />
      ))}
    </span>
  )
}

export const AdminReviews: React.FC = () => {
  const [reviews, setReviews] = useState<AdminReviewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [minRating, setMinRating] = useState<number | null>(null)

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    setError(null)
    const rows = await adminFetchReviews()
    setReviews(rows)
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
    return reviews.filter((r) => {
      if (minRating !== null && r.rating > minRating) return false
      if (!q) return true
      return [r.review_text, r.recipe_title, r.author_name, r.recipe_id, r.user_id]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    })
  }, [reviews, search, minRating])

  const handleDelete = async (review: AdminReviewRow) => {
    const who = review.author_name || shortId(review.user_id)
    const confirmed = window.confirm(
      `Hapus ulasan dari ${who}?\n\n` +
        `Resep: ${review.recipe_title || shortId(review.recipe_id)}\n` +
        `Rating: ${review.rating}/5\n` +
        `Teks: "${(review.review_text || '(tanpa teks)').slice(0, 100)}"\n\n` +
        'Tindakan ini tidak dapat dibatalkan dan akan mengubah rata-rata rating publik.',
    )
    if (!confirmed) return

    setDeletingId(review.id)
    const ok = await adminDeleteReview(review.id)
    setDeletingId(null)

    if (!ok) {
      setError('Gagal menghapus ulasan. Pastikan migrasi 015 sudah dijalankan dan sesi admin aktif.')
      return
    }

    await adminLogAction({
      action: 'review.delete',
      targetType: 'review',
      targetId: review.id,
      detail: `rating ${review.rating}/5 oleh ${who} pada resep ${review.recipe_title || shortId(review.recipe_id)}`,
    })

    setNotice('Ulasan dihapus.')
    load(true)
  }

  const lowRatings = reviews.filter((r) => r.rating <= 2).length
  const avg =
    reviews.length > 0
      ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10
      : 0

  return (
    <div className="space-y-4">
      {notice && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[#163422] text-white px-5 py-2.5 rounded-full shadow-lg text-xs font-semibold flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-[#cbebc3]" />
          <span>{notice}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Star className="w-5 h-5 text-[#163422]" />
          <h2 className="text-base sm:text-lg font-bold text-[#1a1c1b]">Moderasi Ulasan</h2>
          <span className="bg-[#cbebc3] text-[#324d30] text-[10px] font-bold px-2 py-0.5 rounded-full">
            {reviews.length}
          </span>
          {reviews.length > 0 && (
            <span className="bg-[#e2e3e1] text-[#424843] text-[10px] font-bold px-2 py-0.5 rounded-full">
              rata-rata {avg}/5
            </span>
          )}
          {lowRatings > 0 && (
            <span className="bg-[#fecaca] text-[#ba1a1a] text-[10px] font-bold px-2 py-0.5 rounded-full">
              {lowRatings} rating ≤ 2
            </span>
          )}
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

      {error && (
        <div className="flex items-center gap-2 bg-[#fecaca] text-[#ba1a1a] text-xs font-bold px-3 py-2 rounded-xl border border-[#fca5a5]">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="cursor-pointer hover:underline">
            Tutup
          </button>
        </div>
      )}

      {/* Filter cepat untuk menemukan ulasan bermasalah. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-[#727972] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari isi ulasan, resep, atau penulis..."
            className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-[#c2c8c0] rounded-xl focus:outline-none focus:border-[#163422] bg-[#f9f9f7]"
          />
        </div>
        <button
          type="button"
          onClick={() => setMinRating(minRating === 2 ? null : 2)}
          className={`px-3 py-2 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer ${
            minRating === 2
              ? 'bg-[#ba1a1a] text-white border-[#ba1a1a]'
              : 'bg-white text-[#424843] border-[#c2c8c0] hover:border-[#163422]/40'
          }`}
        >
          {minRating === 2 ? 'Tampilkan semua' : 'Hanya rating ≤ 2'}
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-[0px_4px_12px_rgba(45,75,55,0.08)] border border-[rgba(45,75,55,0.1)] overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-[#727972]">
            <Loader2 className="w-5 h-5 animate-spin" />
            <p className="text-xs font-bold">Memuat ulasan...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-[#727972]">
            <Star className="w-6 h-6 opacity-50" />
            <p className="text-xs font-bold">
              {reviews.length === 0
                ? 'Belum ada ulasan dari pengguna.'
                : 'Tidak ada ulasan yang cocok dengan filter.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left border-collapse">
              <thead>
                <tr className="bg-[#f4f4f2] text-[#424843]">
                  <th className="text-[10px] font-bold uppercase tracking-wide px-3 py-2.5">Resep</th>
                  <th className="text-[10px] font-bold uppercase tracking-wide px-3 py-2.5">Penulis</th>
                  <th className="text-[10px] font-bold uppercase tracking-wide px-3 py-2.5">Rating</th>
                  <th className="text-[10px] font-bold uppercase tracking-wide px-3 py-2.5">Teks Ulasan</th>
                  <th className="text-[10px] font-bold uppercase tracking-wide px-3 py-2.5">Dibuat</th>
                  <th className="text-[10px] font-bold uppercase tracking-wide px-3 py-2.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t border-[#e2e3e1] hover:bg-[#f9f9f7] transition-colors">
                    <td className="px-3 py-2.5 text-xs font-bold text-[#163422] max-w-[200px] truncate">
                      {r.recipe_title || shortId(r.recipe_id)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[#1a1c1b] max-w-[140px] truncate">
                      {r.author_name || shortId(r.user_id)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <Stars rating={r.rating} />
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[#1a1c1b] max-w-xs leading-relaxed">
                      {r.review_text ? r.review_text : <span className="text-[#a8a8a3]">(tanpa teks)</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-[#727972] whitespace-nowrap">
                      {formatDateTime(r.created_at)}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <button
                        onClick={() => handleDelete(r)}
                        disabled={deletingId === r.id}
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-[#ba1a1a]/70 hover:text-[#ba1a1a] transition-colors cursor-pointer disabled:opacity-40"
                      >
                        {deletingId === r.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        Hapus
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminReviews
