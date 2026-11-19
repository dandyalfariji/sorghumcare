import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle,
  ChefHat,
  RefreshCw,
  Search,
  Upload,
  EyeOff,
  Pencil,
  X,
  Plus,
  Save,
} from 'lucide-react'
import {
  supabase,
  adminDeleteRecipe,
  adminSetRecipePublished,
  adminUpdateRecipeDetails,
  adminLogAction,
  mapRecipe,
} from '../../lib/supabase'
import type { DbIngredientRow, DbRecipeRow, DbStepRow, AdminRecipeEdit } from '../../lib/supabase'
import type { Recipe } from '../../types'

type AdminRecipeRow = DbRecipeRow & {
  recipe_ingredients?: DbIngredientRow[] | null
  recipe_steps?: DbStepRow[] | null
}

const formatDate = (value?: string | null): string => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const shortId = (value?: string | null): string => {
  if (!value) return '-'
  return value.length > 8 ? `${value.slice(0, 8)}…` : value
}

const num = (v: string): number | null => {
  const t = v.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

const GI_OPTIONS = ['', 'Sangat Rendah', 'Rendah (Low GI)', 'Sedang']

/** Bentuk form edit — semua nilai sebagai string agar mudah dikendalikan input. */
interface EditForm {
  title: string
  subtitle: string
  imageUrl: string
  targetAgeLabel: string
  prepTime: string
  cookTime: string
  servings: string
  calories: string
  fiber: string
  protein: string
  glycemicIndex: string
  nutritionTitle: string
  nutritionDescription: string
  tags: string
  ingredients: { name: string; amount: string; notes: string }[]
  steps: { title: string; instruction: string; timer: string; tip: string }[]
}

function buildForm(row: AdminRecipeRow): EditForm {
  return {
    title: row.title ?? '',
    subtitle: row.subtitle ?? '',
    imageUrl: row.image_url ?? '',
    targetAgeLabel: row.target_age_label ?? '',
    prepTime: row.prep_time_minutes != null ? String(row.prep_time_minutes) : '',
    cookTime: row.cook_time_minutes != null ? String(row.cook_time_minutes) : '',
    servings: row.servings != null ? String(row.servings) : '1',
    calories: row.calories_estimate != null ? String(row.calories_estimate) : '',
    fiber: row.fiber_grams != null ? String(row.fiber_grams) : '',
    protein: row.protein_grams != null ? String(row.protein_grams) : '',
    glycemicIndex: row.glycemic_index ?? '',
    nutritionTitle: row.nutrition_title ?? '',
    nutritionDescription: row.nutrition_description ?? '',
    tags: (row.tags || []).join(', '),
    ingredients: (row.recipe_ingredients || [])
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((i) => ({ name: i.name ?? '', amount: i.amount ?? '', notes: i.notes ?? '' })),
    steps: (row.recipe_steps || [])
      .slice()
      .sort((a, b) => (a.step_number ?? 0) - (b.step_number ?? 0))
      .map((s) => ({
        title: s.title ?? '',
        instruction: s.instruction ?? '',
        timer: s.timer_minutes != null ? String(s.timer_minutes) : '',
        tip: s.tip ?? '',
      })),
  }
}

export const AdminRecipes: React.FC = () => {
  const [recipes, setRecipes] = useState<AdminRecipeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Recipe | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editingRow, setEditingRow] = useState<AdminRecipeRow | null>(null)
  const [form, setForm] = useState<EditForm | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  const fetchAllRecipes = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    setError(null)

    const { data, error: queryError } = await supabase
      .from('recipes')
      .select('*, recipe_ingredients(*), recipe_steps(*)')
      .order('created_at', { ascending: false })

    if (queryError) {
      setError(queryError.message)
      setRecipes([])
    } else {
      setRecipes((data as AdminRecipeRow[]) || [])
    }

    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    fetchAllRecipes()
  }, [fetchAllRecipes])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 3000)
    return () => clearTimeout(timer)
  }, [notice])

  const filteredRecipes = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return recipes
    return recipes.filter((row) =>
      [row.id, row.slug, row.title, row.created_by]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    )
  }, [recipes, search])

  const openDeleteConfirm = (row: AdminRecipeRow) => {
    setPendingDelete(mapRecipe(row, row.recipe_ingredients || [], row.recipe_steps || []))
  }

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    const success = await adminDeleteRecipe(pendingDelete.id)
    setDeleting(false)
    setPendingDelete(null)

    if (success) {
      await adminLogAction({
        action: 'recipe.delete',
        targetType: 'recipe',
        targetId: pendingDelete.id,
        detail: `"${pendingDelete.title}" (${pendingDelete.slug || '-'})`,
      })
      setNotice('Resep berhasil dihapus dari katalog.')
      fetchAllRecipes(true)
    } else {
      setError('Gagal menghapus resep. Pastikan sesi admin masih aktif.')
    }
  }

  /**
   * Terbitkan / tarik resep dari Explore.
   *
   * SEBELUMNYA tidak ada: panel hanya bisa menghapus permanen, padahal
   * `recipes.is_published` sudah ada dan badge "Terbit/Draf" sudah ditampilkan.
   */
  const handleTogglePublished = async (row: AdminRecipeRow) => {
    const next = !row.is_published
    const verb = next ? 'Terbitkan' : 'Tarik'
    const confirmed = window.confirm(
      next
        ? `Terbitkan "${row.title}"? Resep ini akan muncul di halaman Eksplorasi dan bisa dilihat semua pengunjung.`
        : `Tarik "${row.title}" dari Eksplorasi? Resep tetap tersimpan, tetapi tidak lagi terlihat publik.`,
    )
    if (!confirmed) return

    setBusyId(row.id)
    const ok = await adminSetRecipePublished(row.id, next)
    setBusyId(null)

    if (!ok) {
      setError(
        'Gagal mengubah status terbit. Pastikan migrasi 015 sudah dijalankan dan sesi admin masih aktif.',
      )
      return
    }

    await adminLogAction({
      action: next ? 'recipe.publish' : 'recipe.unpublish',
      targetType: 'recipe',
      targetId: row.id,
      detail: `${verb} "${row.title}" (${row.slug})`,
    })

    setNotice(next ? 'Resep diterbitkan ke Eksplorasi.' : 'Resep ditarik dari Eksplorasi.')
    fetchAllRecipes(true)
  }

  const openEdit = (row: AdminRecipeRow) => {
    setEditingRow(row)
    setForm(buildForm(row))
  }

  const closeEdit = () => {
    if (savingEdit) return
    setEditingRow(null)
    setForm(null)
  }

  const handleSaveEdit = async () => {
    if (!editingRow || !form) return
    if (!form.title.trim()) {
      setError('Judul resep tidak boleh kosong.')
      return
    }

    const edit: AdminRecipeEdit = {
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      image_url: form.imageUrl.trim() || null,
      target_age_label: form.targetAgeLabel.trim() || null,
      prep_time_minutes: num(form.prepTime),
      cook_time_minutes: num(form.cookTime),
      servings: num(form.servings) ?? 1,
      calories_estimate: num(form.calories),
      fiber_grams: num(form.fiber),
      protein_grams: num(form.protein),
      glycemic_index: (form.glycemicIndex || null) as DbRecipeRow['glycemic_index'] | null,
      nutrition_title: form.nutritionTitle.trim() || null,
      nutrition_description: form.nutritionDescription.trim() || null,
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      ingredients: form.ingredients
        .filter((i) => i.name.trim())
        .map((i) => ({ name: i.name.trim(), amount: i.amount.trim(), notes: i.notes.trim() || null })),
      steps: form.steps
        .filter((s) => s.instruction.trim() || s.title.trim())
        .map((s, idx) => ({
          step_number: idx + 1,
          title: s.title.trim() || `Langkah ${idx + 1}`,
          instruction: s.instruction.trim(),
          timer_minutes: num(s.timer),
          tip: s.tip.trim() || null,
        })),
    }

    setSavingEdit(true)
    const ok = await adminUpdateRecipeDetails(editingRow.id, edit)
    setSavingEdit(false)

    if (!ok) {
      setError(
        'Gagal menyimpan perubahan resep. Pastikan migrasi 015 sudah dijalankan dan sesi admin masih aktif.',
      )
      return
    }

    await adminLogAction({
      action: 'recipe.update',
      targetType: 'recipe',
      targetId: editingRow.id,
      detail: `Ubah "${edit.title}" — ${edit.ingredients.length} bahan, ${edit.steps.length} langkah`,
    })

    setNotice('Perubahan resep disimpan.')
    setEditingRow(null)
    setForm(null)
    fetchAllRecipes(true)
  }

  const publishedCount = recipes.filter((row) => row.is_published).length
  const systemCount = recipes.filter((row) => row.is_system).length

  return (
    <div className="pb-12">
      {notice && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[#163422] text-white px-5 py-2.5 rounded-full shadow-lg text-xs font-semibold flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-[#cbebc3]" />
          <span>{notice}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-[#163422] text-white flex items-center justify-center shrink-0">
          <ChefHat className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-[#163422] tracking-tight leading-tight">Kelola Resep</h1>
          <p className="text-[11px] text-[#727972]">
            {recipes.length} resep • {publishedCount} terbit • {systemCount} sistem
          </p>
        </div>
        <button
          type="button"
          onClick={() => fetchAllRecipes(true)}
          disabled={refreshing}
          aria-label="Muat ulang data resep"
          title="Muat ulang"
          className="w-9 h-9 rounded-xl bg-white border border-[#c2c8c0] text-[#424843] hover:border-[#163422]/40 hover:text-[#163422] flex items-center justify-center transition-colors cursor-pointer disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="space-y-4">
        {error && (
          <div className="bg-[#ffdad6] text-[#ba1a1a] rounded-2xl border border-[#ba1a1a]/20 px-4 py-3 text-xs font-semibold flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="cursor-pointer hover:underline">
              Tutup
            </button>
          </div>
        )}

        {/* Ringkasan + pencarian */}
        <div className="bg-white rounded-2xl border border-[#2d4b37]/10 shadow-[0_4px_12px_rgba(45,75,55,0.06)] p-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col items-center p-2 text-center">
              <span className="text-2xl font-bold text-[#163422]">{recipes.length}</span>
              <span className="text-[11px] text-[#424843] mt-1 font-medium">Total Resep</span>
            </div>
            <div className="flex flex-col items-center p-2 text-center border-l border-r border-[#c2c8c0]/30">
              <span className="text-2xl font-bold text-[#324d30]">{publishedCount}</span>
              <span className="text-[11px] text-[#424843] mt-1 font-medium">Terbit</span>
            </div>
            <div className="flex flex-col items-center p-2 text-center">
              <span className="text-2xl font-bold text-[#7c5800]">{systemCount}</span>
              <span className="text-[11px] text-[#424843] mt-1 font-medium">Sistem</span>
            </div>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-[#727972] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari judul, slug, atau ID pembuat..."
              className="w-full pl-9 pr-3 py-2 border border-[#c2c8c0] rounded-xl text-sm bg-white focus:outline-none focus:border-[#163422] placeholder:text-[#a8a8a3]"
            />
          </div>
        </div>

        {/* Tabel resep */}
        <div className="bg-white rounded-2xl border border-[#2d4b37]/10 shadow-[0_4px_12px_rgba(45,75,55,0.06)] overflow-hidden">
          {loading ? (
            <div className="p-4 space-y-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-3 w-16 rounded bg-[#e8eae6] animate-pulse" />
                  <div className="h-3 flex-1 rounded bg-[#e8eae6] animate-pulse" />
                  <div className="h-3 w-20 rounded bg-[#e8eae6] animate-pulse" />
                  <div className="h-7 w-24 rounded-lg bg-[#e8eae6] animate-pulse" />
                </div>
              ))}
              <p className="text-xs text-[#727972] text-center pt-1">Memuat daftar resep...</p>
            </div>
          ) : filteredRecipes.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-[#e2e3e1] text-[#727972] flex items-center justify-center mx-auto">
                <ChefHat className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-[#1a1c1b]">
                {recipes.length === 0 ? 'Belum ada resep' : 'Resep tidak ditemukan'}
              </p>
              <p className="text-[11px] text-[#727972]">
                {recipes.length === 0
                  ? 'Katalog resep masih kosong. Resep yang dibuat pengguna akan muncul di sini.'
                  : 'Coba kata kunci lain untuk mencari resep yang tersedia.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#c2c8c0]/40 text-[11px] uppercase tracking-wide text-[#727972]">
                    <th className="px-4 py-3 font-bold">ID</th>
                    <th className="px-4 py-3 font-bold">Judul</th>
                    <th className="px-4 py-3 font-bold">Status</th>
                    <th className="px-4 py-3 font-bold">Pembuat</th>
                    <th className="px-4 py-3 font-bold">Dibuat</th>
                    <th className="px-4 py-3 font-bold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecipes.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-[#e2e3e1]/60 last:border-b-0 hover:bg-[#f4f4f2] transition-colors"
                    >
                      <td className="px-4 py-3 text-[11px] font-mono text-[#727972] whitespace-nowrap" title={row.id}>
                        {shortId(row.id)}
                      </td>
                      <td className="px-4 py-3 max-w-[260px]">
                        <p className="text-xs font-bold text-[#1a1c1b] truncate" title={row.title}>
                          {row.title}
                        </p>
                        <p className="text-[10px] font-mono text-[#a8a8a3] truncate" title={row.slug}>
                          {row.slug}
                        </p>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {row.is_published ? (
                            <span className="bg-[#cbebc3] text-[#324d30] px-2 py-0.5 rounded-full text-[10px] font-bold">
                              Terbit
                            </span>
                          ) : (
                            <span className="bg-[#ffe8b0] text-[#745200] px-2 py-0.5 rounded-full text-[10px] font-bold">
                              Draf
                            </span>
                          )}
                          {row.is_system && (
                            <span className="bg-[#e2e3e1] text-[#424843] px-2 py-0.5 rounded-full text-[10px] font-bold">
                              Sistem
                            </span>
                          )}
                        </div>
                      </td>
                      <td
                        className="px-4 py-3 text-[11px] font-mono text-[#727972] whitespace-nowrap"
                        title={row.created_by || 'Dibuat oleh sistem'}
                      >
                        {row.created_by ? shortId(row.created_by) : 'sistem'}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-[#727972] whitespace-nowrap">
                        {formatDate(row.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Terbitkan / Tarik */}
                          <button
                            type="button"
                            onClick={() => handleTogglePublished(row)}
                            disabled={busyId === row.id}
                            aria-label={row.is_published ? `Tarik resep ${row.title}` : `Terbitkan resep ${row.title}`}
                            title={row.is_published ? 'Tarik dari Eksplorasi' : 'Terbitkan ke Eksplorasi'}
                            className={`inline-flex w-8 h-8 items-center justify-center rounded-xl border transition-colors cursor-pointer disabled:opacity-40 ${
                              row.is_published
                                ? 'border-[#7c5800]/30 text-[#7c5800] hover:bg-[#ffe8b0]'
                                : 'border-[#163422]/30 text-[#163422] hover:bg-[#cbebc3]'
                            }`}
                          >
                            {busyId === row.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : row.is_published ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Upload className="w-4 h-4" />
                            )}
                          </button>

                          {/* Edit */}
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            aria-label={`Ubah resep ${row.title}`}
                            title="Ubah resep"
                            className="inline-flex w-8 h-8 items-center justify-center rounded-xl border border-[#163422]/25 text-[#163422] hover:bg-[#e8eae6] transition-colors cursor-pointer"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>

                          {/* Hapus */}
                          <button
                            type="button"
                            onClick={() => openDeleteConfirm(row)}
                            aria-label={`Hapus resep ${row.title}`}
                            title="Hapus resep"
                            className="inline-flex w-8 h-8 items-center justify-center rounded-xl border border-[#ba1a1a]/25 text-[#ba1a1a] hover:bg-[#ffdad6] transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Konfirmasi hapus */}
      {pendingDelete && (
        <div className="fixed inset-0 z-50 bg-[#1a1c1b]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 space-y-3 shadow-2xl text-center">
            <div className="w-12 h-12 rounded-full bg-[#ffdad6] text-[#ba1a1a] flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-base text-[#1a1c1b]">Hapus Resep?</h3>
            <p className="text-xs text-[#727972]">
              Resep <strong className="text-[#424843]">{pendingDelete.title}</strong> beserta bahan
              dan langkah masaknya akan dihapus permanen dari katalog.
            </p>
            <div className="bg-[#f4f4f2] rounded-xl px-3 py-2 text-[11px] text-[#424843] text-left space-y-1">
              <p className="truncate">
                Slug: <span className="font-mono">{pendingDelete.slug || '-'}</span>
              </p>
              <p>
                {pendingDelete.ingredients.length} bahan • {pendingDelete.steps.length} langkah
              </p>
            </div>
            <p className="text-[11px] text-[#ba1a1a] font-semibold">
              Tip: kalau hanya ingin menyembunyikannya dari publik, pakai tombol "Tarik" — bukan hapus.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl border border-[#c2c8c0] text-xs font-bold text-[#424843] hover:bg-[#f4f4f2] transition-colors cursor-pointer disabled:opacity-60"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-[#ba1a1a] text-white text-xs font-bold hover:bg-rose-700 shadow-sm transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {deleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Menghapus...
                  </>
                ) : (
                  'Ya, Hapus'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal edit resep */}
      {editingRow && form && (
        <div className="fixed inset-0 z-50 bg-[#1a1c1b]/60 backdrop-blur-xs flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full my-6 p-5 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-bold text-base text-[#1a1c1b] flex items-center gap-2">
                  <Pencil className="w-4 h-4 text-[#163422]" />
                  Ubah Resep
                </h3>
                <p className="text-[11px] text-[#727972] mt-0.5 truncate">
                  {shortId(editingRow.id)} · {editingRow.slug}
                </p>
              </div>
              <button
                type="button"
                onClick={closeEdit}
                disabled={savingEdit}
                aria-label="Tutup"
                className="w-8 h-8 rounded-xl hover:bg-[#f4f4f2] flex items-center justify-center text-[#727972] cursor-pointer disabled:opacity-50 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="sm:col-span-2 space-y-1">
                <span className="text-[11px] font-bold text-[#424843]">Judul</span>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3 py-2 border border-[#c2c8c0] rounded-xl text-sm bg-white focus:outline-none focus:border-[#163422]"
                />
              </label>
              <label className="sm:col-span-2 space-y-1">
                <span className="text-[11px] font-bold text-[#424843]">Subjudul</span>
                <input
                  value={form.subtitle}
                  onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                  className="w-full px-3 py-2 border border-[#c2c8c0] rounded-xl text-sm bg-white focus:outline-none focus:border-[#163422]"
                />
              </label>
              <label className="sm:col-span-2 space-y-1">
                <span className="text-[11px] font-bold text-[#424843]">URL gambar</span>
                <input
                  value={form.imageUrl}
                  onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                  placeholder="https://…"
                  className="w-full px-3 py-2 border border-[#c2c8c0] rounded-xl text-xs font-mono bg-white focus:outline-none focus:border-[#163422]"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-bold text-[#424843]">Target konsumen</span>
                <input
                  value={form.targetAgeLabel}
                  onChange={(e) => setForm({ ...form, targetAgeLabel: e.target.value })}
                  className="w-full px-3 py-2 border border-[#c2c8c0] rounded-xl text-sm bg-white focus:outline-none focus:border-[#163422]"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-bold text-[#424843]">Indeks glikemik</span>
                <select
                  value={form.glycemicIndex}
                  onChange={(e) => setForm({ ...form, glycemicIndex: e.target.value })}
                  className="w-full px-3 py-2 border border-[#c2c8c0] rounded-xl text-sm bg-white focus:outline-none focus:border-[#163422] cursor-pointer"
                >
                  {GI_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o || '(tidak diset)'}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-bold text-[#424843]">Waktu persiapan (menit)</span>
                <input
                  inputMode="numeric"
                  value={form.prepTime}
                  onChange={(e) => setForm({ ...form, prepTime: e.target.value })}
                  className="w-full px-3 py-2 border border-[#c2c8c0] rounded-xl text-sm bg-white focus:outline-none focus:border-[#163422]"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-bold text-[#424843]">Waktu masak (menit)</span>
                <input
                  inputMode="numeric"
                  value={form.cookTime}
                  onChange={(e) => setForm({ ...form, cookTime: e.target.value })}
                  className="w-full px-3 py-2 border border-[#c2c8c0] rounded-xl text-sm bg-white focus:outline-none focus:border-[#163422]"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-bold text-[#424843]">Porsi</span>
                <input
                  inputMode="numeric"
                  value={form.servings}
                  onChange={(e) => setForm({ ...form, servings: e.target.value })}
                  className="w-full px-3 py-2 border border-[#c2c8c0] rounded-xl text-sm bg-white focus:outline-none focus:border-[#163422]"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-bold text-[#424843]">Kalori (kkal)</span>
                <input
                  inputMode="numeric"
                  value={form.calories}
                  onChange={(e) => setForm({ ...form, calories: e.target.value })}
                  className="w-full px-3 py-2 border border-[#c2c8c0] rounded-xl text-sm bg-white focus:outline-none focus:border-[#163422]"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-bold text-[#424843]">Serat (g)</span>
                <input
                  inputMode="decimal"
                  value={form.fiber}
                  onChange={(e) => setForm({ ...form, fiber: e.target.value })}
                  className="w-full px-3 py-2 border border-[#c2c8c0] rounded-xl text-sm bg-white focus:outline-none focus:border-[#163422]"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-bold text-[#424843]">Protein (g)</span>
                <input
                  inputMode="decimal"
                  value={form.protein}
                  onChange={(e) => setForm({ ...form, protein: e.target.value })}
                  className="w-full px-3 py-2 border border-[#c2c8c0] rounded-xl text-sm bg-white focus:outline-none focus:border-[#163422]"
                />
              </label>
              <label className="sm:col-span-2 space-y-1">
                <span className="text-[11px] font-bold text-[#424843]">Tag (pisahkan dengan koma)</span>
                <input
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  className="w-full px-3 py-2 border border-[#c2c8c0] rounded-xl text-sm bg-white focus:outline-none focus:border-[#163422]"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-bold text-[#424843]">Judul blok nutrisi</span>
                <input
                  value={form.nutritionTitle}
                  onChange={(e) => setForm({ ...form, nutritionTitle: e.target.value })}
                  className="w-full px-3 py-2 border border-[#c2c8c0] rounded-xl text-sm bg-white focus:outline-none focus:border-[#163422]"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-bold text-[#424843]">Deskripsi nutrisi</span>
                <input
                  value={form.nutritionDescription}
                  onChange={(e) => setForm({ ...form, nutritionDescription: e.target.value })}
                  className="w-full px-3 py-2 border border-[#c2c8c0] rounded-xl text-sm bg-white focus:outline-none focus:border-[#163422]"
                />
              </label>
            </div>

            {/* Bahan */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-[#163422]">Bahan ({form.ingredients.length})</h4>
                <button
                  type="button"
                  onClick={() =>
                    setForm({ ...form, ingredients: [...form.ingredients, { name: '', amount: '', notes: '' }] })
                  }
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-[#163422] hover:underline cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Tambah bahan
                </button>
              </div>
              {form.ingredients.map((ing, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    value={ing.name}
                    onChange={(e) => {
                      const next = form.ingredients.slice()
                      next[idx] = { ...next[idx], name: e.target.value }
                      setForm({ ...form, ingredients: next })
                    }}
                    placeholder="Nama bahan"
                    className="flex-1 px-3 py-2 border border-[#c2c8c0] rounded-xl text-xs bg-white focus:outline-none focus:border-[#163422]"
                  />
                  <input
                    value={ing.amount}
                    onChange={(e) => {
                      const next = form.ingredients.slice()
                      next[idx] = { ...next[idx], amount: e.target.value }
                      setForm({ ...form, ingredients: next })
                    }}
                    placeholder="Jumlah"
                    className="w-28 px-3 py-2 border border-[#c2c8c0] rounded-xl text-xs bg-white focus:outline-none focus:border-[#163422]"
                  />
                  <button
                    type="button"
                    aria-label="Hapus bahan"
                    onClick={() =>
                      setForm({ ...form, ingredients: form.ingredients.filter((_, i) => i !== idx) })
                    }
                    className="w-8 h-8 rounded-xl text-[#ba1a1a] hover:bg-[#ffdad6] flex items-center justify-center cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {form.ingredients.length === 0 && (
                <p className="text-[11px] text-[#a8a8a3]">Belum ada bahan.</p>
              )}
            </div>

            {/* Langkah */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-[#163422]">Langkah ({form.steps.length})</h4>
                <button
                  type="button"
                  onClick={() =>
                    setForm({ ...form, steps: [...form.steps, { title: '', instruction: '', timer: '', tip: '' }] })
                  }
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-[#163422] hover:underline cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Tambah langkah
                </button>
              </div>
              {form.steps.map((st, idx) => (
                <div key={idx} className="border border-[#e2e3e1] rounded-xl p-2.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#163422] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <input
                      value={st.title}
                      onChange={(e) => {
                        const next = form.steps.slice()
                        next[idx] = { ...next[idx], title: e.target.value }
                        setForm({ ...form, steps: next })
                      }}
                      placeholder="Judul langkah"
                      className="flex-1 px-3 py-1.5 border border-[#c2c8c0] rounded-xl text-xs bg-white focus:outline-none focus:border-[#163422]"
                    />
                    <input
                      value={st.timer}
                      onChange={(e) => {
                        const next = form.steps.slice()
                        next[idx] = { ...next[idx], timer: e.target.value }
                        setForm({ ...form, steps: next })
                      }}
                      placeholder="timer (mnt)"
                      inputMode="numeric"
                      className="w-24 px-2 py-1.5 border border-[#c2c8c0] rounded-xl text-xs bg-white focus:outline-none focus:border-[#163422]"
                    />
                    <button
                      type="button"
                      aria-label="Hapus langkah"
                      onClick={() => setForm({ ...form, steps: form.steps.filter((_, i) => i !== idx) })}
                      className="w-8 h-8 rounded-xl text-[#ba1a1a] hover:bg-[#ffdad6] flex items-center justify-center cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <textarea
                    value={st.instruction}
                    onChange={(e) => {
                      const next = form.steps.slice()
                      next[idx] = { ...next[idx], instruction: e.target.value }
                      setForm({ ...form, steps: next })
                    }}
                    rows={2}
                    placeholder="Instruksi"
                    className="w-full px-3 py-2 border border-[#c2c8c0] rounded-xl text-xs bg-white focus:outline-none focus:border-[#163422] resize-y"
                  />
                  <input
                    value={st.tip}
                    onChange={(e) => {
                      const next = form.steps.slice()
                      next[idx] = { ...next[idx], tip: e.target.value }
                      setForm({ ...form, steps: next })
                    }}
                    placeholder="Tips (opsional)"
                    className="w-full px-3 py-1.5 border border-[#c2c8c0] rounded-xl text-xs bg-white focus:outline-none focus:border-[#163422]"
                  />
                </div>
              ))}
              {form.steps.length === 0 && <p className="text-[11px] text-[#a8a8a3]">Belum ada langkah.</p>}
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={closeEdit}
                disabled={savingEdit}
                className="flex-1 py-2.5 rounded-xl border border-[#c2c8c0] text-xs font-bold text-[#424843] hover:bg-[#f4f4f2] transition-colors cursor-pointer disabled:opacity-60"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="flex-1 py-2.5 rounded-xl bg-[#163422] text-white text-xs font-bold hover:bg-[#2d4b37] shadow-sm transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {savingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {savingEdit ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminRecipes
