import React, { useState, useEffect, useCallback } from 'react'
import { Trash2, MessageCircle, RefreshCw, Loader2, AlertTriangle, Search } from 'lucide-react'
import { supabase, adminDeleteComment, adminLogAction } from '../../lib/supabase'
import type { RecipeComment } from '../../lib/supabase'

/** Potong teks panjang agar tabel tetap ringkas. */
function truncate(text: string, max = 80): string {
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max)}…` : text
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

/**
 * Halaman admin untuk melihat SEMUA komentar dari seluruh resep
 * dan menghapus komentar mana pun (admin melewati RLS pemilik).
 */
export const AdminComments: React.FC = () => {
  const [comments, setComments] = useState<RecipeComment[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const loadComments = useCallback(async (withSpinner = true) => {
    if (withSpinner) setLoading(true)
    setError(null)

    const { data, error: queryError } = await supabase
      .from('recipe_comments')
      .select('*')
      .order('created_at', { ascending: false })

    if (queryError) {
      console.error('AdminComments query error:', queryError.message)
      setError('Gagal memuat komentar. Silakan coba lagi.')
      setComments([])
    } else {
      setComments((data as RecipeComment[]) || [])
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    loadComments()
  }, [loadComments])

  const handleDelete = async (comment: RecipeComment) => {
    const confirmed = window.confirm(
      `Hapus komentar ini?\n\n"${truncate(comment.content, 60)}"\n\nTindakan ini tidak dapat dibatalkan.`
    )
    if (!confirmed) return

    setDeletingId(comment.id)
    const ok = await adminDeleteComment(comment.id)

    if (!ok) {
      setError('Gagal menghapus komentar. Silakan coba lagi.')
    } else {
      await adminLogAction({
        action: 'comment.delete',
        targetType: 'comment',
        targetId: comment.id,
        detail: `"${truncate(comment.content, 80)}" oleh ${comment.display_name || 'Anonim'}`,
      })
    }

    setDeletingId(null)
    await loadComments(false)
  }

  const filtered = comments.filter((c) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      c.display_name?.toLowerCase().includes(q) ||
      c.content?.toLowerCase().includes(q) ||
      c.recipe_id?.toLowerCase().includes(q) ||
      c.id?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-[#163422]" />
          <h2 className="text-base sm:text-lg font-bold text-[#1a1c1b]">Komentar</h2>
          <span className="bg-[#cbebc3] text-[#324d30] text-[10px] font-bold px-2 py-0.5 rounded-full">
            {comments.length}
          </span>
        </div>
        <button
          onClick={() => loadComments()}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-bold text-[#163422] hover:text-[#2d4b37] transition-colors cursor-pointer disabled:opacity-40"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Muat ulang
        </button>
      </div>

      {/* Pencarian */}
      <div className="relative">
        <Search className="w-4 h-4 text-[#727972] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama, isi, atau ID komentar/resep..."
          className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-[#c2c8c0] rounded-xl focus:outline-none focus:border-[#163422] bg-[#f9f9f7]"
        />
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

      {/* Tabel komentar */}
      <div className="bg-white rounded-2xl shadow-[0px_4px_12px_rgba(45,75,55,0.08)] border border-[rgba(45,75,55,0.1)] overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-[#727972]">
            <Loader2 className="w-5 h-5 animate-spin" />
            <p className="text-xs font-bold">Memuat komentar...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-[#727972]">
            <MessageCircle className="w-6 h-6 opacity-50" />
            <p className="text-xs font-bold">
              {search.trim() ? 'Tidak ada komentar yang cocok dengan pencarian.' : 'Belum ada komentar di aplikasi.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#f4f4f2] text-[#424843]">
                  <th className="text-[10px] font-bold uppercase tracking-wide px-3 py-2.5 whitespace-nowrap">ID</th>
                  <th className="text-[10px] font-bold uppercase tracking-wide px-3 py-2.5 whitespace-nowrap">Resep</th>
                  <th className="text-[10px] font-bold uppercase tracking-wide px-3 py-2.5 whitespace-nowrap">Nama</th>
                  <th className="text-[10px] font-bold uppercase tracking-wide px-3 py-2.5 whitespace-nowrap">Komentar</th>
                  <th className="text-[10px] font-bold uppercase tracking-wide px-3 py-2.5 whitespace-nowrap">Dibuat</th>
                  <th className="text-[10px] font-bold uppercase tracking-wide px-3 py-2.5 text-right whitespace-nowrap">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-t border-[#e2e3e1] hover:bg-[#f9f9f7] transition-colors">
                    <td className="px-3 py-2.5 text-[11px] font-mono text-[#727972] whitespace-nowrap">
                      {shortId(c.id)}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono text-[#727972] whitespace-nowrap">
                      {shortId(c.recipe_id)}
                    </td>
                    <td className="px-3 py-2.5 text-xs font-bold text-[#163422] whitespace-nowrap">
                      {c.display_name || 'Anonim'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[#1a1c1b] leading-relaxed max-w-xs">
                      {truncate(c.content, 90)}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-[#727972] whitespace-nowrap">
                      {formatDate(c.created_at)}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <button
                        onClick={() => handleDelete(c)}
                        disabled={deletingId === c.id}
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-[#ba1a1a]/70 hover:text-[#ba1a1a] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label={`Hapus komentar dari ${c.display_name || 'pengguna'}`}
                      >
                        {deletingId === c.id ? (
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
