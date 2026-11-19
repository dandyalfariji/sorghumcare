import React, { useEffect, useState } from 'react'
import {
  MessageSquare,
  Flag,
  BookOpen,
  Star,
  Users,
  Settings,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { supabase, fetchAdminConfigs, fetchReports } from '../../lib/supabase'
import { getActiveChatPath } from '../../services/bimaClient'
import { navigateToSlug } from '../../utils/slugRouter'

interface AdminStats {
  totalComments: number
  pendingReports: number
  totalRecipes: number
  publishedRecipes: number
  totalReviews: number
  totalUsers: number
  activeConfigs: number
}

interface HealthItem {
  label: string
  state: 'ok' | 'warn' | 'error' | 'checking'
  detail: string
}

export function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats>({
    totalComments: 0,
    pendingReports: 0,
    totalRecipes: 0,
    publishedRecipes: 0,
    totalReviews: 0,
    totalUsers: 0,
    activeConfigs: 0,
  })
  const [loading, setLoading] = useState(true)
  const [health, setHealth] = useState<HealthItem[]>([])

  const loadStats = async () => {
    try {
      setLoading(true)
      const count = (table: string, filter?: (q: any) => any) => {
        let q = supabase.from(table).select('id', { count: 'exact', head: true })
        if (filter) q = filter(q)
        return q
      }

      const [
        reports,
        configs,
        comments,
        recipes,
        published,
        reviews,
        users,
      ] = await Promise.all([
        fetchReports(),
        fetchAdminConfigs(),
        count('recipe_comments'),
        count('recipes'),
        count('recipes', (q) => q.eq('is_published', true)),
        count('recipe_reviews'),
        count('profiles'),
      ])

      setStats({
        totalComments: comments.count || 0,
        pendingReports: reports.filter((r) => r.status === 'pending').length,
        totalRecipes: recipes.count || 0,
        publishedRecipes: published.count || 0,
        totalReviews: reviews.count || 0,
        totalUsers: users.count || 0,
        activeConfigs: configs.length,
      })
    } catch (error) {
      console.error('Error loading admin stats:', error)
    } finally {
      setLoading(false)
    }
  }

  /**
   * Health check NYATA.
   *
   * Sebelumnya baris "Sistem Berjalan Normal / Aktif" adalah teks hardcoded:
   * dashboard tetap bilang "Aktif" walau backend AI mati (persis kasus proxy
   * /bima-api 405 di produksi). Sekarang status diambil dari backend dan dari
   * Supabase.
   */
  const runHealthCheck = async () => {
    setHealth([
      { label: 'Database (Supabase)', state: 'checking', detail: 'memeriksa…' },
      { label: 'Backend AI', state: 'checking', detail: 'memeriksa…' },
    ])

    // 1. Supabase
    const dbProbe = await supabase.from('recipes').select('id', { count: 'exact', head: true })
    const dbItem: HealthItem = dbProbe.error
      ? {
          label: 'Database (Supabase)',
          state: 'error',
          detail: `Tidak bisa membaca tabel recipes: ${dbProbe.error.message}`,
        }
      : {
          label: 'Database (Supabase)',
          state: 'ok',
          detail: `Terhubung — ${dbProbe.count ?? 0} resep terbaca.`,
        }

    // 2. Backend AI — lewat jalur yang sama yang dipakai aplikasi, supaya yang
    //    diuji benar-benar path yang dipakai pengguna (termasuk override admin).
    const chatPath = getActiveChatPath()
    const healthPath = chatPath.replace(/\/chat\/?$/, '/health')
    let aiItem: HealthItem
    try {
      const res = await fetch(healthPath, { method: 'GET' })
      const ct = res.headers.get('content-type') || ''
      if (ct.includes('text/html')) {
        aiItem = {
          label: 'Backend AI',
          state: 'error',
          detail:
            `Jalur ${healthPath} menjawab HTML (HTTP ${res.status}) — proxy tidak punya ` +
            'proses Node di baliknya (host statis). Isi "Endpoint AI (override)" di Pengaturan.',
        }
      } else if (!res.ok) {
        aiItem = {
          label: 'Backend AI',
          state: 'warn',
          detail: `${healthPath} → HTTP ${res.status}. Proxy hidup, tetapi backend menolak permintaan.`,
        }
      } else {
        const body = await res.text()
        aiItem = {
          label: 'Backend AI',
          state: 'ok',
          detail: `${healthPath} → HTTP ${res.status}. ${body.slice(0, 120)}`,
        }
      }
    } catch (e) {
      aiItem = {
        label: 'Backend AI',
        state: 'error',
        detail: `Tidak bisa menghubungi ${healthPath} (${(e as Error).message}).`,
      }
    }

    setHealth([dbItem, aiItem])
  }

  useEffect(() => {
    loadStats()
    runHealthCheck()
  }, [])

  const statCards = [
    { title: 'Total Komentar', value: stats.totalComments, icon: MessageSquare, color: 'bg-blue-50 text-blue-600', section: 'komentar' },
    { title: 'Laporan Menunggu', value: stats.pendingReports, icon: Flag, color: 'bg-orange-50 text-orange-600', section: 'laporan' },
    { title: 'Total Resep', value: stats.totalRecipes, icon: BookOpen, color: 'bg-green-50 text-green-600', section: 'resep' },
    { title: 'Resep Terbit', value: stats.publishedRecipes, icon: BookOpen, color: 'bg-emerald-50 text-emerald-700', section: 'resep' },
    { title: 'Total Ulasan', value: stats.totalReviews, icon: Star, color: 'bg-amber-50 text-amber-600', section: 'ulasan' },
    { title: 'Total Pengguna', value: stats.totalUsers, icon: Users, color: 'bg-indigo-50 text-indigo-600', section: 'pengguna' },
    { title: 'Konfigurasi', value: stats.activeConfigs, icon: Settings, color: 'bg-purple-50 text-purple-600', section: 'pengaturan' },
  ]

  const quickActions = [
    { label: 'Kelola Komentar', icon: MessageSquare, section: 'komentar' },
    { label: 'Tinjau Laporan', icon: Flag, section: 'laporan' },
    { label: 'Kelola Resep', icon: BookOpen, section: 'resep' },
    { label: 'Moderasi Ulasan', icon: Star, section: 'ulasan' },
    { label: 'Kelola Pengguna', icon: Users, section: 'pengguna' },
    { label: 'Lihat Aktivitas', icon: Settings, section: 'aktivitas' },
    { label: 'Pengaturan Sistem', icon: Settings, section: 'pengaturan' },
  ]

  const healthStyle: Record<HealthItem['state'], { box: string; icon: React.ReactNode }> = {
    ok: {
      box: 'bg-green-50',
      icon: <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />,
    },
    warn: {
      box: 'bg-amber-50',
      icon: <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />,
    },
    error: {
      box: 'bg-[#fecaca]',
      icon: <XCircle className="w-5 h-5 text-[#ba1a1a] shrink-0" />,
    },
    checking: {
      box: 'bg-[#f4f4f2]',
      icon: <Loader2 className="w-5 h-5 text-[#727972] animate-spin shrink-0" />,
    },
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1C1B]">Dashboard Admin</h1>
          <p className="text-gray-600 mt-1">Ringkasan statistik dan tindakan cepat</p>
        </div>
        <button
          type="button"
          onClick={() => {
            loadStats()
            runHealthCheck()
          }}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#c2c8c0] text-xs font-bold text-[#424843] hover:border-[#163422]/40 hover:text-[#163422] transition-colors cursor-pointer disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Muat ulang
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <button
              key={card.title}
              type="button"
              onClick={() => navigateToSlug(`/admin/${card.section}`)}
              title={`Buka ${card.title}`}
              className="bg-white rounded-2xl shadow-sm border border-[#c2c8c0]/60 p-6 text-left hover:border-[#163422]/40 hover:shadow-md transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">{card.title}</p>
                  <p className="text-2xl font-bold text-[#1A1C1B] mt-1">
                    {loading ? '-' : card.value}
                  </p>
                </div>
                <div className={`w-12 h-12 rounded-2xl ${card.color} flex items-center justify-center`}>
                  <Icon className="w-6 h-6" />
                </div>
              </div>
            </button>
          )
        })}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-[#c2c8c0]/60 p-6">
        <h2 className="text-lg font-semibold text-[#1A1C1B] mb-4">Tindakan Cepat</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <button
                key={action.label}
                type="button"
                // SEBELUMNYA tombol ini tidak punya onClick sama sekali,
                // sehingga seluruh "Tindakan Cepat" mati walau objeknya sudah
                // menyimpan `section`.
                onClick={() => navigateToSlug(`/admin/${action.section}`)}
                className="flex items-center gap-3 p-4 rounded-2xl border border-[#c2c8c0]/60 hover:bg-[#F9F9F7] hover:border-[#163422]/40 transition-colors text-left cursor-pointer"
              >
                <div className="w-10 h-10 rounded-2xl bg-[#163422]/10 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-[#163422]" />
                </div>
                <span className="text-sm font-medium text-[#1A1C1B]">{action.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-[#c2c8c0]/60 p-6">
        <h2 className="text-lg font-semibold text-[#1A1C1B] mb-4">Status Sistem</h2>
        <div className="space-y-3">
          {health.map((item) => {
            const s = healthStyle[item.state]
            return (
              <div key={item.label} className={`flex items-start gap-3 p-3 rounded-2xl ${s.box}`}>
                {s.icon}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#1A1C1B]">{item.label}</p>
                  <p className="text-[11px] text-[#424843] mt-0.5 break-words">{item.detail}</p>
                </div>
              </div>
            )
          })}

          {stats.pendingReports > 0 && (
            <button
              type="button"
              onClick={() => navigateToSlug('/admin/laporan')}
              className="w-full flex items-center gap-3 p-3 rounded-2xl bg-orange-50 hover:bg-orange-100 transition-colors text-left cursor-pointer"
            >
              <AlertCircle className="w-5 h-5 text-orange-600 shrink-0" />
              <span className="text-sm text-[#1A1C1B]">
                {stats.pendingReports} laporan menunggu tinjauan — buka halaman Laporan
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default AdminDashboard
