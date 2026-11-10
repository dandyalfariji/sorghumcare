import React, { useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, ArrowLeft, Search, Sparkles } from 'lucide-react';
import { Recipe } from '../../types';
import { EXPLORE_RECIPES_DATABASE } from '../../data/exploreRecipesData';
import { SORGHUM_FORMS } from '../../data/learnData';
import { getRecipeSlug } from '../../utils/slugify';
import { CatalogView, MenuCard } from './CatalogView';
import { MenuDetailView } from './MenuDetailView';
import { PreparationView } from './PreparationView';
import { ProcessingView } from './ProcessingView';

export type LearnSection = 'pengolahan' | 'persiapan' | 'katalog' | 'menu';

interface LearnPageProps {
  section?: string;
  itemId?: string;
  /** Resep hasil generate pada sesi ini; contoh tetap tampil sampai RAG terhubung. */
  generatedRecipes: Recipe[];
  generatorEnabled: boolean;
  onNavigate: (section?: LearnSection, itemId?: string) => void;
  onStartGenerator: () => void;
  /** Buka pencarian global — supaya header Belajar konsisten dengan tab lain. */
  onOpenSearch?: () => void;
}

const JOURNEY: { id: LearnSection; label: string; description: string; icon: string }[] = [
  { id: 'pengolahan', label: 'Pengolahan', description: 'Ubah biji sorgum menjadi beras, nasi, tepung, dan olahan lain.', icon: 'grain' },
  { id: 'persiapan', label: 'Persiapan', description: 'Siapkan alat, takaran air, dan checklist sebelum memasak.', icon: 'checklist' },
  { id: 'katalog', label: 'Katalog', description: 'Temukan menu sorgum dari hasil generate.', icon: 'menu_book' },
  { id: 'menu', label: 'Detail Menu', description: 'Ikuti bahan dan langkah sampai menu tersaji.', icon: 'restaurant' },
];

/** Label tahapan untuk tombol kembali di sub-halaman (△ bukan 'menu' kalau
 *  detail menu belum dipilih, karena tahap itu melompat ke Katalog). */
const STEP_LABEL: Record<LearnSection, string> = {
  pengolahan: 'Pengolahan',
  persiapan: 'Persiapan',
  katalog: 'Katalog',
  menu: 'Detail Menu',
};

export const LearnPage: React.FC<LearnPageProps> = ({
  section,
  itemId,
  generatedRecipes,
  generatorEnabled,
  onNavigate,
  onStartGenerator,
  onOpenSearch,
}) => {
  const generated = useMemo(
    () => generatedRecipes.filter((r) => !r.aiRefusalText && (r.steps?.length ?? 0) > 0),
    [generatedRecipes]
  );
  const generatedIds = useMemo(() => new Set(generated.map((r) => r.id)), [generated]);

  const catalog = useMemo(() => {
    const seen = new Set<string>();
    return [...generated, ...EXPLORE_RECIPES_DATABASE].filter((r) => {
      const slug = getRecipeSlug(r);
      if (seen.has(slug)) return false;
      seen.add(slug);
      return true;
    });
  }, [generated]);

  const openMenu = (recipe: Recipe) => onNavigate('menu', getRecipeSlug(recipe));

  const selectedMenu =
    section === 'menu' && itemId ? catalog.find((r) => getRecipeSlug(r) === itemId) || null : null;

  const active: LearnSection | null =
    section === 'pengolahan' || section === 'persiapan' || section === 'katalog' || section === 'menu'
      ? section
      : null;

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [section, itemId]);

  const activeIndex = JOURNEY.findIndex((j) => j.id === active);

  /**
   * Tujuan tombol kembali untuk tiap sub-halaman.
   *
   * Halaman ini dulu TIDAK punya tombol kembali sama sekali: setelah menekan
   * "Mulai Belajar" (atau salah satu kartu Alur belajar / Bentuk olahan sorgum)
   * pengguna hanya bisa keluar lewat navbar bawah — dan navbar itu sendiri
   * hilang begitu masuk tab Generate. Kini setiap sub-halaman punya jalan pulang
   * yang terlihat: naik satu tahap, atau kembali ke halaman utama Belajar.
   */
  const backTarget: { label: string; go: () => void } | null = !active
    ? null
    : active === 'pengolahan'
      ? { label: 'Belajar Sorgum', go: () => onNavigate() }
      : active === 'persiapan'
        ? { label: STEP_LABEL.pengolahan, go: () => onNavigate('pengolahan') }
        : active === 'katalog'
          ? { label: STEP_LABEL.persiapan, go: () => onNavigate('persiapan') }
          : { label: STEP_LABEL.katalog, go: () => onNavigate('katalog') };

  return (
    <div className="min-h-screen bg-[#F9F9F7] text-[#1A1C1B] font-['Manrope',sans-serif] pb-28">
      <header className="sticky top-0 z-30 bg-[#F9F9F7]/95 backdrop-blur-sm border-b border-[#c2c8c0]/40">
        <div className="max-w-7xl mx-auto px-4 md:px-8 pt-3 pb-2">
          <div className="flex items-center gap-3">
            {backTarget && (
              <button
                onClick={backTarget.go}
                className="inline-flex items-center gap-1.5 h-9 pl-2 pr-3 rounded-xl bg-white border border-[#c2c8c0]/70 text-[#163422] text-xs font-bold hover:border-[#163422]/50 hover:bg-[#f4f5f2] transition-colors cursor-pointer shrink-0"
                aria-label={`Kembali ke ${backTarget.label}`}
                title={`Kembali ke ${backTarget.label}`}
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">{backTarget.label}</span>
                <span className="sm:hidden">Kembali</span>
              </button>
            )}
            <button
              onClick={() => onNavigate()}
              className="text-lg sm:text-xl font-bold text-[#163422] tracking-tight cursor-pointer"
            >
              Belajar Sorgum
            </button>
            {onOpenSearch && (
              <button
                onClick={onOpenSearch}
                className="ml-auto w-10 h-10 rounded-full flex items-center justify-center text-[#163422] hover:bg-[#e2e3e1] transition-colors cursor-pointer shrink-0"
                title="Cari Resep"
                aria-label="Cari Resep"
              >
                <Search className="w-5 h-5" />
              </button>
            )}
          </div>

          {active && (
            <nav aria-label="Tahapan belajar" className="mt-2">
              <ol className="grid grid-cols-4 gap-1">
                {JOURNEY.map((stage, idx) => {
                  const isCurrent = stage.id === active;
                  const isPast = idx < activeIndex;
                  const target: LearnSection = stage.id === 'menu' && !selectedMenu ? 'katalog' : stage.id;
                  return (
                    <li key={stage.id}>
                      <button
                        onClick={() => onNavigate(target, stage.id === 'menu' && selectedMenu ? itemId : undefined)}
                        aria-current={isCurrent ? 'step' : undefined}
                        className="w-full text-left cursor-pointer group"
                      >
                        <span
                          data-keep
                          className={`block h-1 rounded-full transition-colors ${
                            isCurrent ? 'bg-[#2d4b37]' : isPast ? 'bg-[#2d4b37]/50' : 'bg-[#c2c8c0]/60 group-hover:bg-[#c2c8c0]'
                          }`}
                        />
                        <span
                          className={`block mt-1 text-[10px] sm:text-xs truncate ${
                            isCurrent ? 'font-extrabold text-[#163422]' : 'font-semibold text-[#727972]'
                          }`}
                        >
                          {stage.label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </nav>
          )}
        </div>
      </header>

      <main className="px-4 md:px-8 max-w-7xl mx-auto mt-4">
        {active === 'pengolahan' && (
          <ProcessingView
            formId={itemId}
            onSelectForm={(id) => onNavigate('pengolahan', id)}
            onNext={() => onNavigate('persiapan')}
          />
        )}

        {active === 'persiapan' && <PreparationView onNext={() => onNavigate('katalog')} />}

        {active === 'katalog' && (
          <CatalogView
            recipes={catalog}
            generatedIds={generatedIds}
            generatorEnabled={generatorEnabled}
            onOpenMenu={openMenu}
            onStartGenerator={onStartGenerator}
          />
        )}

        {active === 'menu' &&
          (selectedMenu ? (
            <MenuDetailView
              key={itemId}
              recipe={selectedMenu}
              isGenerated={generatedIds.has(selectedMenu.id)}
              generatorEnabled={generatorEnabled}
              onBack={() => onNavigate('katalog')}
              onOpenForm={(id) => onNavigate('pengolahan', id)}
              onOpenPreparation={() => onNavigate('persiapan')}
              onStartGenerator={onStartGenerator}
            />
          ) : (
            <div className="bg-white rounded-2xl border border-dashed border-[#c2c8c0] p-8 text-center">
              <h2 className="text-base font-bold text-[#163422]">Menu tidak ditemukan</h2>
              <p className="text-sm text-[#424843] mt-1">Menu ini tidak tersedia di katalog.</p>
              <button
                onClick={() => onNavigate('katalog')}
                className="mt-4 py-2.5 px-4 bg-[#2d4b37] hover:bg-[#163422] text-white rounded-2xl font-bold text-sm cursor-pointer"
              >
                Buka Katalog
              </button>
            </div>
          ))}

        {!active && (
          <div className="space-y-8">
            <section className="bg-gradient-to-r from-[#163422] to-[#2d4b37] text-white rounded-3xl p-5 sm:p-6 shadow-md relative overflow-hidden">
              <div className="relative z-10 max-w-xl space-y-2">
                <h2 className="text-xl sm:text-2xl font-extrabold leading-tight">Dari biji sorgum sampai jadi menu</h2>
                <p className="text-xs sm:text-sm text-white/85 leading-relaxed">
                  Pelajari cara mengolah dan menyiapkan sorgum, lalu pilih menu untuk dimasak.
                </p>
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  whileHover={{ scale: 1.02 }}
                  transition={{ type: 'spring', stiffness: 450, damping: 22 }}
                  onClick={() => onNavigate('pengolahan')}
                  className="!mt-4 py-3 px-5 bg-[#fdc65c] text-[#163422] hover:bg-[#f4be55] rounded-2xl font-bold text-xs sm:text-sm inline-flex items-center gap-2 shadow-lg transition-colors cursor-pointer"
                >
                  Mulai Belajar
                  <ArrowRight className="w-4 h-4" />
                </motion.button>
              </div>
              <div className="absolute right-2 -bottom-8 opacity-10 text-9xl select-none pointer-events-none" aria-hidden="true">
                🌾
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-lg sm:text-xl font-bold text-[#163422] tracking-tight">Alur belajar</h3>
              <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {JOURNEY.map((stage, idx) => (
                  <li key={stage.id}>
                    <button
                      onClick={() => onNavigate(stage.id === 'menu' ? 'katalog' : stage.id)}
                      className="w-full h-full flex flex-col text-left bg-white rounded-2xl border border-[#c2c8c0]/60 p-4 shadow-xs hover:shadow-md transition-shadow cursor-pointer"
                    >
                      <div className="flex items-center justify-between">
                        <span className="w-9 h-9 rounded-xl bg-[#eef3ec] text-[#2d4b37] flex items-center justify-center">
                          <span className="material-symbols-outlined text-[20px]">{stage.icon}</span>
                        </span>
                        <span className="text-xs font-extrabold text-[#727972]">Tahap {idx + 1}</span>
                      </div>
                      <h4 className="text-sm font-bold text-[#163422] mt-3">{stage.label}</h4>
                      <p className="text-xs text-[#424843] leading-relaxed mt-1">{stage.description}</p>
                    </button>
                  </li>
                ))}
              </ol>
            </section>

            <section className="space-y-3">
              <h3 className="text-lg sm:text-xl font-bold text-[#163422] tracking-tight">Bentuk olahan sorgum</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {SORGHUM_FORMS.map((form) => (
                  <button
                    key={form.id}
                    onClick={() => onNavigate('pengolahan', form.id)}
                    className="text-left bg-white rounded-2xl border border-[#c2c8c0]/60 p-4 shadow-xs hover:shadow-md transition-shadow cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[26px] text-[#7c5800]">{form.icon}</span>
                    <h4 className="text-sm font-bold text-[#163422] mt-1.5">{form.name}</h4>
                    <p className="text-[11px] text-[#424843] leading-relaxed mt-0.5">{form.tagline}</p>
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-[#163422] tracking-tight">Katalog menu</h3>
                  <p className="text-xs text-[#727972] mt-0.5">Menu sorgum dari hasil generate</p>
                </div>
                <button
                  onClick={() => onNavigate('katalog')}
                  className="text-xs font-bold text-[#163422] hover:underline shrink-0 cursor-pointer"
                >
                  Lihat semua
                </button>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0">
                {catalog.slice(0, 8).map((recipe) => (
                  <MenuCard
                    key={recipe.id}
                    recipe={recipe}
                    isGenerated={generatedIds.has(recipe.id)}
                    onOpen={openMenu}
                    className="w-[185px] sm:w-[200px] shrink-0"
                  />
                ))}
              </div>
              {generatorEnabled && generated.length === 0 && (
                <button
                  onClick={onStartGenerator}
                  className="inline-flex items-center gap-2 text-xs font-bold text-[#7c5800] hover:underline cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  Generate menu pertamamu
                </button>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
};
