import React, { useState, useRef, useMemo } from 'react';
import { 
  HOME_CATEGORIES,
  HOME_VIDEO_TUTORIALS,
  DAILY_TIPS, 
  FALLBACK_FOOD_IMAGE,
  CategoryItem,
  VideoTutorialItem,
} from '../../data/homeData';
import { Recipe } from '../../types';
import { useData, categoryLabelToKey } from '../../lib/dataContext';
import {
  Sparkles,
  ArrowRight,
  Play,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coffee,
  UtensilsCrossed,
  Cookie,
  CakeSlice
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  CardImageWithSkeleton,
  HomeCarouselSectionSkeleton,
} from '../Common/CardSkeleton';

interface HomePageProps {
  onOpenProfile: () => void;
  onOpenSearch: () => void;
  onSelectCategory: (categoryKey: string) => void;
  onViewRecipe: (recipe: Recipe) => void;
  onOpenVideoTutorial: (tutorial: VideoTutorialItem) => void;
  onStartGenerator: () => void;
  onOpenLearn?: () => void;
  // Google Auth
  isGoogleUser?: boolean;
  googleDisplayName?: string;
  googleAvatarUrl?: string | null;
}

/** Shuffle array deterministically from a seed (simple LCG). */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    const j = s % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Derive a category tag from dishCategory string. */
function categoryTag(cat: string): string {
  const map: Record<string, string> = {
    makanan_berat: 'Makanan Berat',
    camilan_sehat: 'Camilan Sehat',
    minuman_nutrisi: 'Minuman Nutrisi',
    dessert_rendah_gi: 'Dessert Rendah GI',
  };
  return map[cat] || cat || 'Sorgum';
}

/** Format total time as "X Min" string. */
function timeTag(recipe: Recipe): string {
  const total = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);
  return total > 0 ? `${total} Min` : '';
}

/** Get time tag for a recipe card. */

export const HomePage: React.FC<HomePageProps> = ({
  onOpenProfile,
  onOpenSearch,
  onSelectCategory,
  onViewRecipe,
  onOpenVideoTutorial,
  onStartGenerator,
  onOpenLearn,
  isGoogleUser = false,
  googleDisplayName,
  googleAvatarUrl,
}) => {
  const { recipes, ready, imagesEnabled } = useData();
  const [tipIndex, setTipIndex] = useState(0);
  const [hasLoadedMore, setHasLoadedMore] = useState(false);
  const videoCarouselRef = useRef<HTMLDivElement>(null);
  const favoriteCarouselRef = useRef<HTMLDivElement>(null);
  const communityCarouselRef = useRef<HTMLDivElement>(null);
  const hotCarouselRef = useRef<HTMLDivElement>(null);
  const newCarouselRef = useRef<HTMLDivElement>(null);

  // Derive sections from live Supabase data — no hardcoded recipes
  const todaySeed = useMemo(() => {
    const d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }, []);

  // New Creations = latest 8 (already sorted DESC by created_at)
  const newRecipes = useMemo(() => recipes.slice(0, 8), [recipes]);

  // Student Favorites = next 8 after the newest
  const studentFavorites = useMemo(() => recipes.slice(8, 16), [recipes]);

  // Featured Community = different 8 (seeded shuffle picks from rest)
  const communityRecipes = useMemo(() => {
    const pool = recipes.slice(16);
    if (pool.length === 0) return recipes.slice(0, 8);
    return seededShuffle(pool, todaySeed + 1).slice(0, 8);
  }, [recipes, todaySeed]);

  // Trending & Hot = seeded shuffle from all recipes (simulates "trending")
  const hotRecipes = useMemo(() => {
    if (recipes.length <= 8) return recipes;
    return seededShuffle(recipes, todaySeed + 2).slice(0, 8);
  }, [recipes, todaySeed]);

  const isLoading = !ready;

  const scrollCarousel = (ref: React.RefObject<HTMLDivElement | null>, direction: 'left' | 'right') => {
    if (ref.current) {
      const container = ref.current;
      const scrollAmount = 260;
      const maxScroll = container.scrollWidth - container.clientWidth;
      
      if (direction === 'left') {
        if (container.scrollLeft <= 5) {
          container.scrollTo({ left: 35, behavior: 'smooth' });
          setTimeout(() => container.scrollTo({ left: 0, behavior: 'smooth' }), 180);
        } else {
          container.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
        }
      } else {
        if (container.scrollLeft >= maxScroll - 5) {
          container.scrollTo({ left: maxScroll - 35, behavior: 'smooth' });
          setTimeout(() => container.scrollTo({ left: maxScroll, behavior: 'smooth' }), 180);
        } else {
          container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
        }
      }
    }
  };

  const nextTip = () => {
    setTipIndex((prev) => (prev + 1) % DAILY_TIPS.length);
  };

  /** Render a recipe card used by all carousels. */
  const renderRecipeCard = (recipe: Recipe, idx: number) => (
    <motion.div
      key={recipe.id}
      whileTap={{ scale: 0.93, filter: 'brightness(0.96)' }}
      whileHover={{ y: -3 }}
      transition={{ type: 'spring', stiffness: 450, damping: 25 }}
      onClick={() => onViewRecipe(recipe)}
      className="w-[185px] sm:w-[200px] bg-white rounded-2xl border border-[#c2c8c0]/60 overflow-hidden cursor-pointer group shadow-xs hover:shadow-md transition-all shrink-0 snap-start flex flex-col justify-between select-none"
    >
      {imagesEnabled && (
      <div className="relative h-28 bg-[#e8eae6] overflow-hidden">
        <CardImageWithSkeleton
          src={recipe.imageUrl || FALLBACK_FOOD_IMAGE}
          alt={recipe.title}
          fallbackSrc={FALLBACK_FOOD_IMAGE}
          containerClassName="w-full h-full relative"
          imageClassName="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none"
        />
        {timeTag(recipe) && (
          <div className="absolute bottom-1.5 right-1.5 bg-black/75 text-white text-[10px] px-1.5 py-0.5 rounded font-mono font-bold pointer-events-none">
            {timeTag(recipe)}
          </div>
        )}
      </div>
      )}

      <div className="p-2.5 flex-grow flex flex-col justify-between">
        <div>
          <h4 className="font-bold text-xs sm:text-sm text-[#1A1C1B] group-hover:text-[#163422] transition-colors line-clamp-1">
            {recipe.title}
          </h4>
          <p className="text-[11px] text-[#424843] mt-0.5 line-clamp-1">
            {recipe.subtitle}
          </p>
          {!imagesEnabled && timeTag(recipe) && (
            <span className="inline-flex items-center gap-1 mt-1.5 bg-[#f4f4f2] text-[#424843] text-[10px] font-bold px-2 py-0.5 rounded-lg">
              <Clock className="w-3 h-3 text-[#7c5800]" />
              {timeTag(recipe)}
            </span>
          )}
        </div>

        <div className="mt-2 pt-1.5 border-t border-[#f4f4f2] flex items-center justify-between text-[10px] text-[#163422] font-semibold">
          <span className="flex items-center gap-0.5 group-hover:translate-x-0.5 group-active:scale-90 group-active:text-[#7c5800] transition-all">
            <Play className="w-2.5 h-2.5 text-[#163422] fill-current" /> Lihat Resep
          </span>
          <span className="text-[#7c5800] bg-[#fdc65c]/25 px-1.5 py-0.5 rounded text-[9px] font-bold group-active:scale-95 transition-transform">
            {categoryTag(recipe.dishCategory)}
          </span>
        </div>
      </div>
    </motion.div>
  );

  /** Generic carousel section wrapper. */
  const CarouselSection: React.FC<{
    title: string;
    subtitle: string;
    carouselRef: React.RefObject<HTMLDivElement | null>;
    recipes: Recipe[];
    emptyMessage?: string;
    skeletonTitleWidth?: string;
  }> = ({ title, subtitle, carouselRef, recipes: items, emptyMessage, skeletonTitleWidth }) => {
    if (isLoading) {
      return (
        <HomeCarouselSectionSkeleton
          titleWidth={skeletonTitleWidth}
          withImage={imagesEnabled}
        />
      );
    }
    return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg sm:text-xl font-bold text-[#163422] tracking-tight">
            {title}
          </h3>
          <p className="text-xs text-[#727972] font-semibold mt-0.5">
            {subtitle}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <motion.button
            type="button"
            whileTap={{ scale: 0.8 }}
            whileHover={{ scale: 1.12 }}
            transition={{ type: 'spring', stiffness: 500, damping: 20 }}
            onClick={() => scrollCarousel(carouselRef, 'left')}
            className="w-8 h-8 rounded-full border border-[#c2c8c0]/70 bg-white hover:bg-[#163422] text-[#163422] hover:text-white flex items-center justify-center transition-colors shadow-xs cursor-pointer"
            aria-label="Geser ke Kiri"
            title="Sebelumnya"
          >
            <ChevronLeft className="w-4 h-4" />
          </motion.button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.8 }}
            whileHover={{ scale: 1.12 }}
            transition={{ type: 'spring', stiffness: 500, damping: 20 }}
            onClick={() => scrollCarousel(carouselRef, 'right')}
            className="w-8 h-8 rounded-full border border-[#c2c8c0]/70 bg-white hover:bg-[#163422] text-[#163422] hover:text-white flex items-center justify-center transition-colors shadow-xs cursor-pointer"
            aria-label="Geser ke Kanan"
            title="Berikutnya"
          >
            <ChevronRight className="w-4 h-4" />
          </motion.button>
        </div>
      </div>

      <div
        ref={carouselRef}
        className="flex overflow-x-auto gap-3 pb-2 hide-scrollbar -mx-4 px-4 md:mx-0 md:px-0 scroll-smooth snap-x snap-mandatory"
      >
        {items.length > 0 ? (
          items.map((r, i) => renderRecipeCard(r, i))
        ) : (
          <div className="text-sm text-[#727972] py-6 px-4">
            {emptyMessage || 'Belum ada resep. Mulai buat resep pertama Anda!'}
          </div>
        )}
      </div>
    </section>
    );
  };

  return (
    <div className="min-h-screen bg-[#F9F9F7] text-[#1A1C1B] font-['Manrope',sans-serif] pt-[72px] pb-[100px]">
      {/* 1. TopAppBar matching HTML exactly */}
      <header className="fixed top-0 left-0 right-0 w-full z-50 bg-[#F9F9F7]/95 backdrop-blur-md shadow-xs flex items-center justify-between px-4 sm:px-6 py-3 border-b border-[#e2e3e1]/60 max-w-7xl mx-auto">
        <div 
          onClick={onOpenProfile}
          className="flex items-center gap-2.5 cursor-pointer hover:opacity-90 transition-opacity"
          title="Buka Profil Pengguna"
        >
          <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-[#163422]/20 shadow-xs bg-[#e2e3e1]">
            <img
              className="w-full h-full object-cover"
              alt={isGoogleUser ? (googleDisplayName || 'User') : 'SorghumCare'}
              src={isGoogleUser && googleAvatarUrl ? googleAvatarUrl : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80';
              }}
            />
          </div>
          <div className="hidden sm:block">
            <span className="text-xs font-bold text-[#163422] block leading-none">
              {googleDisplayName || 'Guest'}
            </span>
            <span className="text-[10px] text-[#727972]">
              {isGoogleUser ? 'Health Explorer' : 'Guest Mode'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <h1 className="text-xl sm:text-2xl font-bold text-[#163422] tracking-tight">
            SorghumCare
          </h1>
          <span className="text-[10px] font-extrabold uppercase text-[#7c5800] bg-[#fdc65c]/30 px-2 py-0.5 rounded-full">
            AI Chef
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onOpenSearch}
            className="w-10 h-10 flex items-center justify-center rounded-full text-[#163422] hover:bg-[#e2e3e1] transition-colors active:scale-95 duration-150"
            title="Cari Resep"
          >
            <span className="material-symbols-outlined text-[24px]">search</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="px-4 md:px-8 max-w-7xl mx-auto space-y-8 mt-4">
        {/* Quick AI Generator Banner */}
        <section className="bg-gradient-to-r from-[#163422] to-[#2d4b37] text-white rounded-3xl p-5 sm:p-6 shadow-md relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1.5 z-10 max-w-lg">
            <div className="flex items-center gap-2">
              <span className="bg-[#fdc65c] text-[#163422] text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                Fitur Unggulan
              </span>
              <span className="text-xs text-[#adcfb4] font-semibold">
                Panduan Pintar 4 Langkah
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold leading-tight">
              Ingin Resep Sorgum Sesuai Bahan Dapur Anda?
            </h2>
            <p className="text-xs sm:text-sm text-white/85 leading-relaxed">
              Pilih target usia, jenis hidangan, dan bahan yang ada.
            </p>
          </div>

          <motion.button
            id="btn-home-start-smart-generate"
            whileTap={{ scale: 0.94 }}
            whileHover={{ scale: 1.02 }}
            transition={{ type: 'spring', stiffness: 450, damping: 22 }}
            onClick={onStartGenerator}
            className="z-10 py-3 px-5 bg-[#fdc65c] text-[#163422] hover:bg-[#f4be55] rounded-2xl font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg transition-colors flex-shrink-0 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-[#163422]" />
            <span>Mulai Smart Generate</span>
            <ArrowRight className="w-4 h-4" />
          </motion.button>

          {/* Decorative background grain shape */}
          <div className="absolute right-0 -bottom-10 opacity-10 text-9xl select-none pointer-events-none">
            🌾
          </div>
        </section>

        {/* Pintu masuk modul edukasi Belajar */}
        {onOpenLearn && (
          <button
            onClick={onOpenLearn}
            className="w-full text-left bg-white rounded-2xl border border-[#c2c8c0]/60 p-4 shadow-xs hover:shadow-md transition-shadow flex items-center gap-3 cursor-pointer"
          >
            <span className="w-11 h-11 rounded-xl bg-[#eef3ec] text-[#2d4b37] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">menu_book</span>
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold text-[#163422]">Belajar Mengolah Sorgum</span>
              <span className="block text-xs text-[#424843]">Dari pengolahan biji, persiapan, sampai katalog menu.</span>
            </span>
            <ArrowRight className="w-4 h-4 text-[#2d4b37] shrink-0" />
          </button>
        )}

        {/* 2. New Creations (newest from DB) */}
        <CarouselSection
          title="New Creations & Fresh Arrivals"
          subtitle={`${Math.min(newRecipes.length, 8)} Resep Terbaru dari Database`}
          carouselRef={newCarouselRef}
          recipes={newRecipes}
        />

        {/* 3. Student Favorites (next batch from DB) */}
        <CarouselSection
          title="Student Favorites"
          subtitle={`${Math.min(studentFavorites.length, 8)} Pilihan Favorit Mahasiswa & Pelajar`}
          carouselRef={favoriteCarouselRef}
          recipes={studentFavorites}
        />

        {/* 4. Browse by Category matching HTML */}
        <section className="space-y-3">
          <h3 className="text-lg sm:text-xl font-bold text-[#163422] tracking-tight">
            Browse by Category
          </h3>
          <div className={`grid gap-2 ${imagesEnabled ? 'grid-cols-2 sm:grid-cols-4 gap-3' : 'grid-cols-4'}`}>
            {HOME_CATEGORIES.map((cat) => {
              const Icon = cat.id === 'cat-breakfast' ? Coffee
                : cat.id === 'cat-main' ? UtensilsCrossed
                : cat.id === 'cat-snacks' ? Cookie
                : CakeSlice;
              const count = recipes.filter((r) => categoryLabelToKey(r.dishCategory) === cat.categoryKey).length;
              return (
              <motion.div
                key={cat.id}
                whileTap={{ scale: 0.95 }}
                whileHover={{ scale: 1.02 }}
                transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                onClick={() => onSelectCategory(cat.categoryKey)}
                className={`rounded-2xl overflow-hidden relative shrink-0 group cursor-pointer shadow-xs hover:shadow-lg transition-all select-none ${imagesEnabled ? 'aspect-square bg-[#e8eae6]' : 'bg-gradient-to-br from-[#163422] to-[#2d4b37] p-2.5 text-center'}`}
              >
                {imagesEnabled ? (
                <>
                <CardImageWithSkeleton
                  src={cat.imageUrl}
                  alt={cat.name}
                  fallbackSrc={FALLBACK_FOOD_IMAGE}
                  containerClassName="w-full h-full relative"
                  imageClassName="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 pointer-events-none"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/10 group-hover:from-black/90 transition-colors pointer-events-none" />
                <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center pointer-events-none">
                  <Icon className="w-6 h-6 text-white mb-1 drop-shadow-sm" />
                  <span className="text-base sm:text-lg text-white font-extrabold tracking-wide drop-shadow-sm">
                    {cat.nameId}
                  </span>
                  <span className="text-[11px] text-white/80 font-medium mt-0.5">
                    {count} resep
                  </span>
                </div>
                </>
                ) : (
                <div className="flex flex-col items-center justify-center text-center">
                  <Icon className="w-6 h-6 text-[#fdc65c] mb-1" />
                  <span className="text-sm text-white font-extrabold tracking-wide leading-tight">
                    {cat.nameId}
                  </span>
                  <span className="text-[11px] text-white/80 font-medium mt-0.5">
                    {count} resep
                  </span>
                </div>
                )}
              </motion.div>
              );
            })}
          </div>
        </section>

        {/* 5. Cooking Basics with Sorghum (Video Tutorials Carousel) — stays static */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-[#163422] tracking-tight">
                Cooking Basics with Sorghum
              </h3>
              <p className="text-xs text-[#727972] font-semibold mt-0.5">
                8 Panduan Video Tutorial Interaktif
              </p>
            </div>
            
            {/* Carousel Arrow Controls */}
            <div className="flex items-center gap-1.5">
              <motion.button
                type="button"
                whileTap={{ scale: 0.8 }}
                whileHover={{ scale: 1.12 }}
                transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                onClick={() => scrollCarousel(videoCarouselRef, 'left')}
                className="w-8 h-8 rounded-full border border-[#c2c8c0]/70 bg-white hover:bg-[#163422] text-[#163422] hover:text-white flex items-center justify-center transition-colors shadow-xs cursor-pointer"
                aria-label="Geser ke Kiri"
                title="Sebelumnya"
              >
                <ChevronLeft className="w-4 h-4" />
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.8 }}
                whileHover={{ scale: 1.12 }}
                transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                onClick={() => scrollCarousel(videoCarouselRef, 'right')}
                className="w-8 h-8 rounded-full border border-[#c2c8c0]/70 bg-white hover:bg-[#163422] text-[#163422] hover:text-white flex items-center justify-center transition-colors shadow-xs cursor-pointer"
                aria-label="Geser ke Kanan"
                title="Berikutnya"
              >
                <ChevronRight className="w-4 h-4" />
              </motion.button>
            </div>
          </div>

          <div 
            ref={videoCarouselRef}
            className="flex overflow-x-auto gap-3 pb-2 hide-scrollbar -mx-4 px-4 md:mx-0 md:px-0 scroll-smooth snap-x snap-mandatory"
          >
            {HOME_VIDEO_TUTORIALS.map((tut) => (
              <motion.div
                key={tut.id}
                whileTap={{ scale: 0.93, filter: 'brightness(0.96)' }}
                whileHover={{ y: -3 }}
                transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                onClick={() => onOpenVideoTutorial(tut)}
                className="w-[185px] sm:w-[200px] bg-white rounded-2xl border border-[#c2c8c0]/60 overflow-hidden cursor-pointer group shadow-xs hover:shadow-md transition-all shrink-0 snap-start flex flex-col justify-between select-none"
              >
                {imagesEnabled && (
                <div className="relative h-28 bg-[#e8eae6] overflow-hidden">
                  <CardImageWithSkeleton
                    src={tut.imageUrl}
                    alt={tut.title}
                    fallbackSrc={FALLBACK_FOOD_IMAGE}
                    containerClassName="w-full h-full relative"
                    imageClassName="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none"
                  />
                  <div className="absolute inset-0 bg-black/25 group-hover:bg-black/40 transition-colors pointer-events-none" />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-9 h-9 rounded-full bg-white/90 text-[#163422] flex items-center justify-center shadow-lg group-hover:scale-110 group-active:scale-90 transition-transform">
                      <Play className="w-4 h-4 fill-current text-[#163422] ml-0.5" />
                    </div>
                  </div>
                  <div className="absolute bottom-1.5 right-1.5 bg-black/75 text-white text-[10px] px-1.5 py-0.5 rounded font-mono font-bold pointer-events-none">
                    {tut.duration}
                  </div>
                </div>
                )}

                <div className="p-2.5 flex-grow flex flex-col justify-between">
                  <div>
                    <h4 className="font-bold text-xs sm:text-sm text-[#1A1C1B] group-hover:text-[#163422] transition-colors line-clamp-1">
                      {tut.title}
                    </h4>
                    <p className="text-[11px] text-[#424843] mt-0.5 line-clamp-1">
                      {tut.subtitle}
                    </p>
                    {!imagesEnabled && (
                      <span className="inline-flex items-center gap-1 mt-1.5 bg-[#f4f4f2] text-[#424843] text-[10px] font-bold px-2 py-0.5 rounded-lg font-mono">
                        {tut.duration}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 pt-1.5 border-t border-[#f4f4f2] flex items-center justify-between text-[10px] text-[#163422] font-semibold">
                    <span className="flex items-center gap-0.5 group-hover:translate-x-0.5 group-active:scale-90 group-active:text-[#7c5800] transition-all">
                      <Play className="w-2.5 h-2.5 text-[#163422] fill-current" /> Tonton Panduan
                    </span>
                    <span className="text-[#7c5800] bg-[#fdc65c]/25 px-1.5 py-0.5 rounded text-[9px] font-bold group-active:scale-95 transition-transform">
                      Tips Olah
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* 6. Featured Community Recipes */}
        <CarouselSection
          title="Featured Community Recipes"
          subtitle={`${Math.min(communityRecipes.length, 8)} Resep Kreasi Komunitas & Chef Lokal`}
          carouselRef={communityCarouselRef}
          recipes={communityRecipes}
        />

        {/* 7. Trending & Hot Recipes */}
        <CarouselSection
          title="Trending & Hot Recipes"
          subtitle={`${Math.min(hotRecipes.length, 8)} Resep Paling Populer Minggu Ini`}
          carouselRef={hotCarouselRef}
          recipes={hotRecipes}
        />

        {/* 8. Sorghum Impact Infographic matching HTML — stays static */}
        <section className="bg-[#ffdea7] text-[#271900] rounded-3xl p-5 sm:p-7 border border-[#fdc65c]/50 shadow-md">
          <div className="max-w-xl mx-auto space-y-4">
            <div className="text-center space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#7c5800] bg-white/60 px-3 py-0.5 rounded-full inline-block">
                Fakta Gizi Superfood
              </span>
              <h3 className="text-xl sm:text-2xl font-extrabold text-[#163422]">
                Sorghum Impact
              </h3>
              <p className="text-xs sm:text-sm text-[#5e4200] leading-relaxed">
                Dibandingkan 100g nasi putih matang, Biji Sorgum memberikan keunggulan nutrisi luar biasa:
              </p>
            </div>

            {/* Visual comparison bars matching HTML */}
            <div className="space-y-3 bg-white/70 backdrop-blur-xs p-4 rounded-2xl border border-white/50">
              {/* Dietary Fiber */}
              <div>
                <div className="flex justify-between text-xs font-bold mb-1 text-[#163422]">
                  <span>Dietary Fiber (Serat Pangan)</span>
                  <span className="text-[#7c5800]">6.7g vs 0.4g (16x Lebih Tinggi)</span>
                </div>
                <div className="w-full bg-[#f4be55]/40 rounded-full h-3 overflow-hidden">
                  <div 
                    data-keep className="bg-[#163422] h-full rounded-full transition-all duration-1000"
                    style={{ width: '88%' }}
                  />
                </div>
              </div>

              {/* Protein */}
              <div>
                <div className="flex justify-between text-xs font-bold mb-1 text-[#163422]">
                  <span>Protein Nabati</span>
                  <span className="text-[#7c5800]">11.3g vs 2.7g (4x Lebih Tinggi)</span>
                </div>
                <div className="w-full bg-[#f4be55]/40 rounded-full h-3 overflow-hidden">
                  <div 
                    data-keep className="bg-[#163422] h-full rounded-full transition-all duration-1000"
                    style={{ width: '78%' }}
                  />
                </div>
              </div>

              {/* Iron */}
              <div>
                <div className="flex justify-between text-xs font-bold mb-1 text-[#163422]">
                  <span>Zat Besi (Iron &amp; Prebiotik)</span>
                  <span className="text-[#7c5800]">4.4mg vs 0.2mg (22x Lebih Tinggi)</span>
                </div>
                <div className="w-full bg-[#f4be55]/40 rounded-full h-3 overflow-hidden">
                  <div 
                    data-keep className="bg-[#163422] h-full rounded-full transition-all duration-1000"
                    style={{ width: '92%' }}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 9. Daily Tip matching HTML — stays static */}
        <section className="bg-[#2d4b37] text-white rounded-3xl p-5 flex items-start justify-between gap-3.5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0 text-[#fdc65c]">
              <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                eco
              </span>
            </div>
            <div>
              <h4 className="font-bold text-xs sm:text-sm text-[#fdc65c] uppercase tracking-wider mb-1">
                Daily Nutrition Tip
              </h4>
              <p className="text-xs sm:text-sm text-white/90 leading-relaxed">
                {DAILY_TIPS[tipIndex]}
              </p>
            </div>
          </div>

          <button
            onClick={nextTip}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors flex-shrink-0"
            title="Ganti Tips"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </section>

        {/* 10. Load More Inspiration button matching HTML */}
        <div className="flex justify-center pt-2 pb-6">
          <button
            onClick={hasLoadedMore ? onStartGenerator : () => setHasLoadedMore(true)}
            className="px-6 py-3 bg-white border border-[#727972]/40 rounded-full font-bold text-xs sm:text-sm text-[#163422] hover:bg-[#e2e3e1] transition-all shadow-xs flex items-center gap-2 active:scale-95"
          >
            <Sparkles className="w-4 h-4 text-[#7c5800]" />
            {hasLoadedMore ? 'Buat Resep Baru dengan AI Wizard' : 'Load More Inspiration'}
          </button>
        </div>
      </main>
    </div>
  );
};
