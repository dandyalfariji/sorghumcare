import React, { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  CheckCircle,
  Plus,
  Save,
  SlidersHorizontal,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Image as ImageIcon,
  ImageOff,
  Bot,
  ShieldAlert,
  Settings,
  RefreshCw,
  Link2,
} from 'lucide-react'
import {
  fetchAdminConfigs,
  updateAdminConfig,
  getAdminConfigValue,
  adminLogAction,
  isAdmin as isAdminAccount,
} from '../../lib/supabase'
import { getActiveChatPath, configureAiRuntime } from '../../services/bimaClient'
import { useAuth } from '../../lib/AuthProvider'
import type { AdminConfig } from '../../types'

const DEFAULT_AI_MODEL = import.meta.env.VITE_BIMA_MODEL || 'default'

const MAIN_FEATURE_KEY = 'main_feature_enabled'
const IMAGES_KEY = 'images_enabled'
const MODEL_KEY = 'ai_model'
const ENDPOINT_KEY = 'ai_endpoint_override'

const DEDICATED_LABELS: Record<string, string> = {
  [MAIN_FEATURE_KEY]: 'Fitur Utama',
  [IMAGES_KEY]: 'Tampilan Gambar',
  [MODEL_KEY]: 'Model AI',
  [ENDPOINT_KEY]: 'Endpoint AI',
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

/** Nilai config bisa berupa boolean, number, string, object, atau array. */
const toBool = (value: unknown, fallback: boolean): boolean => {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'ya', 'on', 'aktif'].includes(normalized)) return true
    if (['false', '0', 'tidak', 'off', 'nonaktif'].includes(normalized)) return false
    return fallback
  }
  return fallback
}

/** Ubah payload jsonb menjadi teks yang bisa diedit di textarea. */
const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return ''
  }
}

/** Parse teks draft kembali menjadi payload jsonb sesuai tipe nilai aslinya. */
const parseDraft = (
  draft: string,
  original: unknown
): { ok: boolean; value: unknown } => {
  const trimmed = draft.trim()

  if (original !== null && original !== undefined && typeof original === 'object') {
    if (!trimmed) return { ok: true, value: {} }
    try {
      return { ok: true, value: JSON.parse(trimmed) }
    } catch {
      return { ok: false, value: undefined }
    }
  }

  if (typeof original === 'boolean') {
    const normalized = trimmed.toLowerCase()
    if (['true', '1', 'ya', 'on', 'aktif'].includes(normalized)) {
      return { ok: true, value: true }
    }
    if (['false', '0', 'tidak', 'off', 'nonaktif'].includes(normalized)) {
      return { ok: true, value: false }
    }
    return { ok: false, value: undefined }
  }

  if (typeof original === 'number') {
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed)) return { ok: false, value: undefined }
    return { ok: true, value: parsed }
  }

  if (!trimmed) return { ok: true, value: '' }

  try {
    const parsed = JSON.parse(trimmed)
    if (parsed !== null && typeof parsed === 'object') return { ok: true, value: parsed }
    if (typeof parsed === 'number' || typeof parsed === 'boolean') {
      return { ok: true, value: parsed }
    }
  } catch {
    return { ok: true, value: draft }
  }
  return { ok: true, value: draft }
}

const buildDrafts = (rows: AdminConfig[]): Record<string, string> => {
  const next: Record<string, string> = {}
  for (const row of rows) {
    next[row.config_key] = formatValue(row.config_value)
  }
  return next
}

interface ToggleSwitchProps {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label?: string
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  disabled,
  label,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`w-11 h-6 rounded-full p-1 flex items-center transition-colors cursor-pointer disabled:opacity-60 shrink-0 ${
      checked ? 'bg-[#163422] justify-end' : 'bg-[#c2c8c0] justify-start'
    }`}
  >
    <div className="w-4 h-4 rounded-full bg-white shadow-xs flex items-center justify-center">
      {checked ? (
        <ToggleRight className="w-3 h-3 text-[#163422]" />
      ) : (
        <ToggleLeft className="w-3 h-3 text-[#727972]" />
      )}
    </div>
  </button>
)

interface SectionCardProps {
  icon: React.ReactNode
  title: string
  description?: string
  children: React.ReactNode
}

const SectionCard: React.FC<SectionCardProps> = ({
  icon,
  title,
  description,
  children,
}) => (
  <section className="bg-white rounded-2xl border border-[#2d4b37]/10 shadow-[0_4px_12px_rgba(45,75,55,0.06)] overflow-hidden">
    <div className="flex items-start gap-3 px-4 py-3 border-b border-[#e2e3e1]/70 bg-[#f4f4f2]/40">
      <div className="w-8 h-8 rounded-xl bg-[#163422]/10 text-[#163422] flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <h2 className="text-sm font-bold text-[#163422] tracking-tight">{title}</h2>
        {description && <p className="text-[11px] text-[#727972] mt-0.5">{description}</p>}
      </div>
    </div>
    <div className="p-4 space-y-3">{children}</div>
  </section>
)

export const AdminSettings: React.FC = () => {
  const { isAdmin: isAdminUser, displayName } = useAuth()
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [configs, setConfigs] = useState<AdminConfig[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [togglingKey, setTogglingKey] = useState<string | null>(null)
  const [savingExtra, setSavingExtra] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [mainFeatureEnabled, setMainFeatureEnabled] = useState(true)
  const [imagesEnabled, setImagesEnabled] = useState(true)
  const [modelValue, setModelValue] = useState(DEFAULT_AI_MODEL)
  const [endpointValue, setEndpointValue] = useState('')
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [newDescription, setNewDescription] = useState('')

  const loadConfigs = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    setError(null)

    const [rows, mainFeature, images, model, endpoint] = await Promise.all([
      fetchAdminConfigs(),
      getAdminConfigValue(MAIN_FEATURE_KEY),
      getAdminConfigValue(IMAGES_KEY),
      getAdminConfigValue(MODEL_KEY),
      getAdminConfigValue(ENDPOINT_KEY),
    ])

    setConfigs(rows)
    setDrafts(buildDrafts(rows))
    setMainFeatureEnabled(toBool(mainFeature, true))
    setImagesEnabled(toBool(images, true))
    setModelValue(typeof model === 'string' && model.trim() ? model : DEFAULT_AI_MODEL)
    setEndpointValue(typeof endpoint === 'string' ? endpoint : '')

    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    let alive = true
    isAdminAccount().then((ok) => {
      if (!alive) return
      setAuthorized(ok)
      if (ok || isAdminUser) {
        loadConfigs()
      } else {
        setLoading(false)
      }
    })
    return () => {
      alive = false
    }
  }, [loadConfigs, isAdminUser])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 3000)
    return () => clearTimeout(timer)
  }, [notice])

  const canAccess = isAdminUser || authorized === true
  const showLoader = !canAccess && authorized === null
  const activeEndpoint = getActiveChatPath()

  const handleSaveConfig = async (config: AdminConfig) => {
    const draft = drafts[config.config_key] ?? ''
    const parsed = parseDraft(draft, config.config_value)
    if (!parsed.ok) {
      setError(`Nilai untuk "${config.config_key}" tidak valid. Pastikan format JSON benar.`)
      return
    }

    setSavingKey(config.config_key)
    setError(null)
    const success = await updateAdminConfig(config.config_key, parsed.value, config.description)
    setSavingKey(null)

    if (success) {
      // Jejak aktivitas admin (tidak memblokir tindakan utama).
      await adminLogAction({
        action: 'config.update',
        targetType: 'config',
        targetId: config.config_key,
        detail: `"${config.config_key}" diubah`, 
        actorName: displayName,
      })
      setNotice(`Konfigurasi "${config.config_key}" berhasil disimpan.`)
      loadConfigs(true)
    } else {
      setError('Gagal menyimpan konfigurasi. Periksa izin admin Anda.')
    }
  }

  const handleAddConfig = async () => {
    const key = newKey.trim()
    if (!key) {
      setError('Key konfigurasi wajib diisi.')
      return
    }
    if (configs.some((row) => row.config_key === key)) {
      setError(`Key "${key}" sudah ada. Edit nilainya langsung pada daftar konfigurasi.`)
      return
    }

    const parsed = parseDraft(newValue, undefined)
    if (!parsed.ok) {
      setError('Nilai konfigurasi tidak valid. Pastikan format JSON benar.')
      return
    }

    setSavingKey('__new__')
    setError(null)
    const success = await updateAdminConfig(
      key,
      parsed.value === '' ? {} : parsed.value,
      newDescription.trim() || null
    )
    setSavingKey(null)

    if (success) {
      setNotice(`Konfigurasi "${key}" berhasil ditambahkan.`)
      setNewKey('')
      setNewValue('')
      setNewDescription('')
      loadConfigs(true)
    } else {
      setError('Gagal menambahkan konfigurasi baru.')
    }
  }

  const handleToggleFeature = async (
    key: typeof MAIN_FEATURE_KEY | typeof IMAGES_KEY,
    next: boolean
  ) => {
    setTogglingKey(key)
    setError(null)
    const success = await updateAdminConfig(key, next)
    setTogglingKey(null)

    if (!success) {
      setError('Gagal menyimpan pengaturan fitur. Periksa izin admin Anda.')
      return
    }

    if (key === MAIN_FEATURE_KEY) {
      setMainFeatureEnabled(next)
      setNotice(
        `Generator AI ${next ? 'diaktifkan' : 'dinonaktifkan'} untuk seluruh pengguna.`
      )
    } else {
      setImagesEnabled(next)
      setNotice(
        `Tampilan gambar ${next ? 'diaktifkan' : 'dinonaktifkan'} untuk seluruh pengguna.`
      )
    }

    await adminLogAction({
      action: 'config.update',
      targetType: 'config',
      targetId: key,
      detail: `${key} = ${next ? 'aktif' : 'nonaktif'}`,
      actorName: displayName,
    })
  }

  const handleSaveModel = async () => {
    const model = modelValue.trim()

    const existing = configs.find((row) => row.config_key === MODEL_KEY)
    setSavingExtra(MODEL_KEY)
    setError(null)
    // Kosong = sengaja memakai default backend, bukan galat. Dulu nilai kosong
    // ditolak ('tidak boleh kosong'), padahal justru itu satu-satunya cara
    // mengembalikan kendali ke backend.
    const success = await updateAdminConfig(
      MODEL_KEY,
      model,
      existing?.description ?? 'Model AI yang dipakai backend saat membuat resep'
    )
    setSavingExtra(null)

    if (success) {
      await adminLogAction({
        action: 'config.update',
        targetType: 'config',
        targetId: MODEL_KEY,
        detail: model ? `ai_model = ${model}` : 'ai_model dikosongkan (pakai default backend)',
        actorName: displayName,
      })
      setNotice(model ? 'Model AI berhasil disimpan.' : 'Model AI dikosongkan (memakai default backend).')
      loadConfigs(true)
    } else {
      setError('Gagal menyimpan model AI.')
    }
  }

  /**
   * Simpan override endpoint AI. Ini yang membuat perbaikan proxy /bima-api
   * bisa dilakukan dari panel, TANPA build + deploy ulang.
   */
  const handleSaveEndpoint = async () => {
    const endpoint = endpointValue.trim()
    if (endpoint && !/^(\/|https?:\/\/)/i.test(endpoint)) {
      setError('Endpoint harus berupa path (diawali "/") atau URL http(s):// — nilai lain ditolak.')
      return
    }

    const existing = configs.find((row) => row.config_key === ENDPOINT_KEY)
    setSavingExtra(ENDPOINT_KEY)
    setError(null)
    const success = await updateAdminConfig(
      ENDPOINT_KEY,
      endpoint,
      existing?.description ?? 'Override endpoint chat AI (kosong = /bima-api/chat)'
    )
    setSavingExtra(null)

    if (!success) {
      setError('Gagal menyimpan endpoint AI. Periksa izin admin Anda.')
      return
    }

    await adminLogAction({
      action: 'config.update',
      targetType: 'config',
      targetId: ENDPOINT_KEY,
      detail: endpoint ? `ai_endpoint_override = ${endpoint}` : 'ai_endpoint_override dikosongkan',
      actorName: displayName,
    })

    // Terapkan langsung ke klien supaya tidak perlu reload.
    configureAiRuntime({ endpointOverride: endpoint })
    setNotice(endpoint ? 'Endpoint AI disimpan & langsung dipakai.' : 'Endpoint AI kembali ke default.')
    loadConfigs(true)
  }

  if (showLoader) {
    return (
      <div className="min-h-screen bg-[#f9f9f7] text-[#1a1c1b] font-['Manrope',sans-serif] antialiased flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 text-[#163422] animate-spin" />
        <p className="text-xs text-[#727972]">Memverifikasi akses admin...</p>
      </div>
    )
  }

  if (!canAccess) {
    return (
      <div className="min-h-screen bg-[#f9f9f7] text-[#1a1c1b] font-['Manrope',sans-serif] antialiased flex flex-col items-center justify-center px-6 text-center gap-3">
        <div className="w-14 h-14 rounded-full bg-[#ffdad6] text-[#ba1a1a] flex items-center justify-center">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h1 className="text-base font-bold text-[#1a1c1b]">Akses Ditolak</h1>
        <p className="text-xs text-[#727972] max-w-xs">
          Halaman pengaturan hanya dapat diakses oleh akun dengan peran admin.
        </p>
      </div>
    )
  }

  return (
    <div className="pb-12">
      {/* Toast notifikasi */}
      {notice && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[#163422] text-white px-5 py-2.5 rounded-full shadow-lg text-xs font-semibold flex items-center gap-2 animate-bounce">
          <CheckCircle className="w-4 h-4 text-[#cbebc3]" />
          <span>{notice}</span>
        </div>
      )}

      {/* Header — tidak sticky & tanpa padding halaman lagi: kerangka halaman
          sudah disediakan AdminLayout (dulu halaman ini membawa header
          sendiri berikut `min-h-screen`, sehingga header tampil dua kali). */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-[#163422] text-white flex items-center justify-center shrink-0">
          <SlidersHorizontal className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-[#163422] tracking-tight leading-tight">
            Pengaturan Admin
          </h1>
          <p className="text-[11px] text-[#727972]">
            Konfigurasi payload &amp; fitur utama aplikasi
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadConfigs(true)}
          disabled={refreshing}
          aria-label="Muat ulang konfigurasi"
          title="Muat ulang"
          className="w-9 h-9 rounded-xl bg-white border border-[#c2c8c0] text-[#424843] hover:border-[#163422]/40 hover:text-[#163422] flex items-center justify-center transition-colors cursor-pointer disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="space-y-4">
        {/* Pesan error */}
        {error && (
          <div className="bg-[#ffdad6] text-[#ba1a1a] rounded-2xl border border-[#ba1a1a]/20 px-4 py-3 text-xs font-semibold flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-2xl border border-[#2d4b37]/10 shadow-[0_4px_12px_rgba(45,75,55,0.06)] p-6 space-y-3">
            <div className="h-4 w-40 rounded bg-[#e8eae6] animate-pulse" />
            <div className="h-10 rounded-xl bg-[#e8eae6] animate-pulse" />
            <div className="h-10 rounded-xl bg-[#e8eae6] animate-pulse" />
            <p className="text-xs text-[#727972] text-center">Memuat konfigurasi...</p>
          </div>
        ) : (
          <>
            {/* BAGIAN A — Konfigurasi Payload */}
            <SectionCard
              icon={<Settings className="w-4 h-4" />}
              title="A. Konfigurasi Payload"
              description="Seluruh key-value tersimpan di tabel admin_configs."
            >
              {configs.length === 0 ? (
                <div className="bg-[#f4f4f2] rounded-xl border border-dashed border-[#c2c8c0] p-6 text-center">
                  <p className="text-xs font-bold text-[#1a1c1b]">Belum ada konfigurasi</p>
                  <p className="text-[11px] text-[#727972] mt-1">
                    Tambahkan key baru di bawah untuk mulai mengatur payload aplikasi.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {configs.map((row) => (
                    <div
                      key={row.config_key}
                      className="border border-[#e2e3e1] rounded-xl p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <label className="block text-xs font-bold text-[#163422] font-mono truncate">
                            {row.config_key}
                          </label>
                          {row.description && (
                            <p className="text-[11px] text-[#727972] mt-0.5">{row.description}</p>
                          )}
                        </div>
                        {DEDICATED_LABELS[row.config_key] && (
                          <span className="bg-[#e2e3e1] text-[#424843] px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0">
                            {DEDICATED_LABELS[row.config_key]}
                          </span>
                        )}
                      </div>

                      <textarea
                        value={drafts[row.config_key] ?? ''}
                        onChange={(e) =>
                          setDrafts((prev) => ({ ...prev, [row.config_key]: e.target.value }))
                        }
                        rows={2}
                        spellCheck={false}
                        className="w-full px-3 py-2 border border-[#c2c8c0] rounded-xl text-xs font-mono text-[#1a1c1b] bg-white focus:outline-none focus:border-[#163422]"
                      />

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-[#a8a8a3]">
                          Diperbarui: {formatDate(row.updated_at)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleSaveConfig(row)}
                          disabled={savingKey === row.config_key}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#163422] text-white text-[11px] font-bold hover:bg-[#2d4b37] transition-colors cursor-pointer disabled:opacity-60"
                        >
                          {savingKey === row.config_key ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Save className="w-3.5 h-3.5" />
                          )}
                          Simpan
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Tambah konfigurasi baru */}
              <div className="border border-dashed border-[#c2c8c0] rounded-xl p-3 space-y-2 bg-[#f9f9f7]">
                <p className="text-xs font-bold text-[#163422] flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  Tambah Konfigurasi Baru
                </p>
                <input
                  type="text"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="config_key (contoh: app_theme)"
                  className="w-full px-3 py-2 border border-[#c2c8c0] rounded-xl text-xs font-mono bg-white focus:outline-none focus:border-[#163422] placeholder:text-[#a8a8a3]"
                />
                <textarea
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  rows={2}
                  spellCheck={false}
                  placeholder='config_value (JSON, teks, angka, atau true/false)'
                  className="w-full px-3 py-2 border border-[#c2c8c0] rounded-xl text-xs font-mono bg-white focus:outline-none focus:border-[#163422] placeholder:text-[#a8a8a3]"
                />
                <input
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Deskripsi (opsional)"
                  className="w-full px-3 py-2 border border-[#c2c8c0] rounded-xl text-xs bg-white focus:outline-none focus:border-[#163422] placeholder:text-[#a8a8a3]"
                />
                <button
                  type="button"
                  onClick={handleAddConfig}
                  disabled={savingKey === '__new__'}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#163422] text-white text-xs font-bold hover:bg-[#2d4b37] transition-colors cursor-pointer disabled:opacity-60"
                >
                  {savingKey === '__new__' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  Tambahkan
                </button>
              </div>
            </SectionCard>

            {/* BAGIAN B — Fitur Utama */}
            <SectionCard
              icon={<ToggleRight className="w-4 h-4" />}
              title="B. Fitur Utama"
              description="Generator resep AI (wizard & chat) untuk seluruh pengguna."
            >
              <div className="flex items-center justify-between gap-3 border border-[#e2e3e1] rounded-xl p-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#1a1c1b]">Generator Resep AI</p>
                  <p className="text-[11px] text-[#727972] mt-0.5">
                    {mainFeatureEnabled
                      ? 'Aktif — wizard dan chat generate resep tersedia.'
                      : 'Nonaktif — wizard dan chat generate resep disembunyikan.'}
                  </p>
                </div>
                <ToggleSwitch
                  checked={mainFeatureEnabled}
                  onChange={(next) => handleToggleFeature(MAIN_FEATURE_KEY, next)}
                  disabled={togglingKey === MAIN_FEATURE_KEY}
                  label="Aktifkan generator resep AI"
                />
              </div>
            </SectionCard>

            {/* BAGIAN C — Tampilan Gambar */}
            <SectionCard
              icon={<ImageIcon className="w-4 h-4" />}
              title="C. Tampilan Gambar"
              description="Menampilkan atau menyembunyikan seluruh gambar di aplikasi."
            >
              <div className="flex items-center justify-between gap-3 border border-[#e2e3e1] rounded-xl p-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#1a1c1b] flex items-center gap-1.5">
                    {imagesEnabled ? (
                      <ImageIcon className="w-3.5 h-3.5 text-[#163422]" />
                    ) : (
                      <ImageOff className="w-3.5 h-3.5 text-[#727972]" />
                    )}
                    Tampilkan Gambar
                  </p>
                  <p className="text-[11px] text-[#727972] mt-0.5">
                    {imagesEnabled
                      ? 'Aktif — gambar resep dan materi ditampilkan.'
                      : 'Nonaktif — semua gambar disembunyikan dari pengguna.'}
                  </p>
                </div>
                <ToggleSwitch
                  checked={imagesEnabled}
                  onChange={(next) => handleToggleFeature(IMAGES_KEY, next)}
                  disabled={togglingKey === IMAGES_KEY}
                  label="Aktifkan tampilan gambar"
                />
              </div>
            </SectionCard>

            {/* BAGIAN D — Konfigurasi Lainnya */}
            <SectionCard
              icon={<Bot className="w-4 h-4" />}
              title="D. Konfigurasi Lainnya"
              description="Parameter pendukung yang dipakai saat generate resep."
            >
              <div className="space-y-2">
                <label className="block text-xs font-bold text-[#424843] flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5" />
                  Model AI
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={modelValue}
                    onChange={(e) => setModelValue(e.target.value)}
                    placeholder="default"
                    className="flex-1 px-3 py-2 border border-[#c2c8c0] rounded-xl text-sm bg-white focus:outline-none focus:border-[#163422] placeholder:text-[#a8a8a3]"
                  />
                  <button
                    type="button"
                    onClick={handleSaveModel}
                    disabled={savingExtra === MODEL_KEY}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#163422] text-white text-xs font-bold hover:bg-[#2d4b37] transition-colors cursor-pointer disabled:opacity-60 shrink-0"
                  >
                    {savingExtra === MODEL_KEY ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    Simpan
                  </button>
                </div>
              </div>
            </SectionCard>

            {/* BAGIAN E — Endpoint AI (jalur darurat tanpa build ulang) */}
            <SectionCard
              icon={<Link2 className="w-4 h-4" />}
              title="E. Endpoint AI"
              description="Jalur darurat bila proxy /bima-api mati di host produksi — berlaku tanpa build ulang."
            >
              <div className="space-y-2">
                <label className="block text-xs font-bold text-[#424843] flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5" />
                  Endpoint AI (override)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={endpointValue}
                    onChange={(e) => setEndpointValue(e.target.value)}
                    placeholder="/bima-api/chat (default)"
                    spellCheck={false}
                    className="flex-1 px-3 py-2 border border-[#c2c8c0] rounded-xl text-xs font-mono bg-white focus:outline-none focus:border-[#163422] placeholder:text-[#a8a8a3]"
                  />
                  <button
                    type="button"
                    onClick={handleSaveEndpoint}
                    disabled={savingExtra === ENDPOINT_KEY}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#163422] text-white text-xs font-bold hover:bg-[#2d4b37] transition-colors cursor-pointer disabled:opacity-60 shrink-0"
                  >
                    {savingExtra === ENDPOINT_KEY ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    Simpan
                  </button>
                </div>
                <div className="bg-[#f4f4f2] rounded-xl px-3 py-2 text-[11px] text-[#424843] space-y-1">
                  <p>
                    Endpoint aktif sekarang:{' '}
                    <span className="font-mono font-bold text-[#163422]">{activeEndpoint}</span>
                  </p>
                  <p className="text-[#727972]">
                    Kosongkan untuk memakai default. Isi URL penuh backend (mis.{' '}
                    <span className="font-mono">https://api.llmsorgum.online/api/chat</span>) kalau
                    situs di-deploy sebagai berkas statis sehingga proxy <span className="font-mono">/bima-api</span>{' '}
                    tidak punya proses Node di baliknya (nginx menjawab 405). Hanya skema{' '}
                    <span className="font-mono">/path</span> atau <span className="font-mono">http(s)://</span>{' '}
                    yang diterima; nilai lain diabaikan demi keamanan.
                  </p>
                </div>
              </div>
            </SectionCard>
          </>
        )}
      </div>
    </div>
  )
}

export default AdminSettings
