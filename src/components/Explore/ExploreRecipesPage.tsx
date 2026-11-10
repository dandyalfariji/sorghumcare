import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  SlidersHorizontal,
  Sparkles,
  Clock,
  ChevronRight,
  ChevronLeft,
  X,
  Check,
  Heart,
  Bookmark,
  ArrowUpDown,
  Star,
  User,
} from 'lucide-react';
import { Recipe } from '../../types';
import { GLOBAL_FALLBACK_FOOD_IMAGE } from '../../data/imageAssets';
import {
  EXPLORE_RECIPES_DATABASE,
  RECIPE_COLLECTIONS,
} from '../../data/exploreRecipesData';
import {
  fetchRecipeStats,
  fetchLikedRecipeIds,
  toggleRecipeLike,
  type RecipeStats,
} from '../../lib/supabase';
import {
  CardImageWithSkeleton,
  CarouselCardSkeleton,
  GridRecipeCardSkeleton
} from '../Common/CardSkeleton';
import { useData } from '../../lib/dataContext';

interface ExploreRecipesPageProps {
  onViewRecipe: (recipe: Recipe) => void;
  onToggleSaveRecipe: (recipe: Recipe) => void;
  isRecipeSaved: (recipeId: string, title?: string) => boolean;
  onStartGenerator: () => void;
  initialCategory?: string;
  onSelectCategorySlug?: (categoryKey: string) => void;
  recipesOverride?: Recipe[]; // when provided, the main grid uses DB catalog
  /** Buka modal pencarian global (header Explore dulu tidak punya pencarian). */
  onOpenSearch?: () => void;
  /** Nama tampilan pengguna untuk tombol profil di header. */
  displayName?: string;
  /** Buka halaman profil. */
  onOpenProfile?: () => void;
}

type SortOption = 'popular' | 'time-asc' | 'fiber-desc';

export const ExploreRecipesPage: React.FC<ExploreRecipesPageProps> = ({
  onViewRecipe,
  onToggleSaveRecipe,
  isRecipeSaved,
  onStartGenerator,
    initialCategory,
    onSelectCategorySlug,
    recipesOverride,
    onOpenSearch,
    displayName,
    onOpenProfile,
  }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory || 'all');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [selectedConsumer, setSelectedConsumer] = useState<string>('all');
  const [maxTime, setMaxTime] = useState<number | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortOption>('popular');
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Varian kartu tanpa gambar saat toggle admin off
  const { imagesEnabled } = useData();

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 450);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (initialCategory) {
      setSelectedCategory(initialCategory);
    }
  }, [initialCategory]);

  // Carousel container ref, width measurement & sliding index state
  const carouselContainerRef = useRef<HTMLDivElement>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const updateWidth = () => {
      if (carouselContainerRef.current) {
        setContainerWidth(carouselContainerRef.current.clientWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Card dimensions & slide boundaries
  const cardWidth = containerWidth > 0 && containerWidth < 640 
    ? Math.min(Math.max(containerWidth - 48, 260), 300) 
    : 310;
  const cardGap = 16;
  const itemFullWidth = cardWidth + cardGap;

  const visibleCards = containerWidth > 0
    ? Math.max(1, Math.floor((containerWidth + cardGap) / itemFullWidth))
    : 1;

  // Like publik (agregat real) + resep yang di-like user — pisah dari Save/koleksi.
  const [statsMap, setStatsMap] = useState<Record<string, RecipeStats>>({});
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

  // Kandidat carousel: katalog DB bila ada, fallback data statis.
  const topCandidates: Recipe[] = useMemo(() => {
    const base = recipesOverride && recipesOverride.length > 0 ? recipesOverride : EXPLORE_RECIPES_DATABASE;
    return [...base].sort((a, b) => (statsMap[b.id]?.likes || 0) - (statsMap[a.id]?.likes || 0)).slice(0, 8);
  }, [recipesOverride, statsMap]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const base = recipesOverride && recipesOverride.length > 0 ? recipesOverride : EXPLORE_RECIPES_DATABASE;
      const [stats, liked] = await Promise.all([
        fetchRecipeStats(base.map((r) => r.id)),
        fetchLikedRecipeIds(),
      ]);
      if (!alive) return;
      setStatsMap(stats);
      setLikedIds(liked);
    })();
    return () => {
      alive = false;
    };
  }, [recipesOverride]);

  const handleToggleLike = async (recipeId: string) => {
    const prevLiked = likedIds.has(recipeId);
    const prevCount = statsMap[recipeId]?.likes || 0;
    // Optimistic update
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (prevLiked) next.delete(recipeId);
      else next.add(recipeId);
      return next;
    });
    setStatsMap((prev) => ({
      ...prev,
      [recipeId]: { ...prev[recipeId], likes: Math.max(0, prevCount + (prevLiked ? -1 : 1)), reviewsCount: prev[recipeId]?.reviewsCount || 0, ratingAvg: prev[recipeId]?.ratingAvg ?? null },
    }));
    const res = await toggleRecipeLike(recipeId);
    if (!res) {
      // Belum login — kembalikan.
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (prevLiked) next.add(recipeId);
        else next.delete(recipeId);
        return next;
      });
      setStatsMap((prev) => ({
        ...prev,
        [recipeId]: { ...prev[recipeId], likes: prevCount, reviewsCount: prev[recipeId]?.reviewsCount || 0, ratingAvg: prev[recipeId]?.ratingAvg ?? null },
      }));
      return;
    }
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (res.liked) next.add(recipeId);
      else next.delete(recipeId);
      return next;
    });
    setStatsMap((prev) => ({
      ...prev,
      [recipeId]: { ...prev[recipeId], likes: res.count, reviewsCount: prev[recipeId]?.reviewsCount || 0, ratingAvg: prev[recipeId]?.ratingAvg ?? null },
    }));
  };
  const maxCarouselIndex = Math.max(0, topCandidates.length - visibleCards);

  const canScrollLeft = carouselIndex > 0;
  const canScrollRight = carouselIndex < maxCarouselIndex;

  const scrollCarousel = (direction: 'left' | 'right') => {
    if (direction === 'left') {
      setCarouselIndex((prev) => Math.max(0, prev - 1));
    } else {
      setCarouselIndex((prev) => Math.min(maxCarouselIndex, prev + 1));
    }
  };

  const scrollCarouselToIndex = (index: number) => {
    setCarouselIndex(Math.min(maxCarouselIndex, Math.max(0, index)));
  };

  // Filter Categories
  const categories = [
    { id: 'all', label: 'Semua Resep', icon: 'restaurant_menu' },
    { id: 'Makanan Berat', label: 'Makanan Berat', icon: 'restaurant' },
    { id: 'Camilan Sehat', label: 'Camilan Sehat', icon: 'cookie' },
    { id: 'Minuman Nutrisi', label: 'Minuman Nutrisi', icon: 'local_cafe' },
    { id: 'Dessert Rendah GI', label: 'Dessert Sehat', icon: 'cake' },
  ];

  // Filter Quick Tags
  const quickTags = [
    { id: 'all', label: 'Semua Tag' },
    { id: 'Bebas Gluten', label: '🌾 Bebas Gluten' },
    { id: 'Low GI', label: '📉 Low GI (Diabetes)' },
    { id: 'Tinggi Serat', label: '🥗 Tinggi Serat' },
    { id: 'Bekal Sekolah', label: '🎒 Bekal Anak' },
    { id: 'Plant-Based', label: '🌱 Plant-Based' },
  ];

  // Active filters count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedCategory !== 'all') count++;
    if (selectedTag !== 'all') count++;
    if (selectedConsumer !== 'all') count++;
    if (maxTime !== 'all') count++;
    if (activeCollectionId !== null) count++;
    return count;
  }, [selectedCategory, selectedTag, selectedConsumer, maxTime, activeCollectionId]);

  const clearAllFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setSelectedTag('all');
    setSelectedConsumer('all');
    setMaxTime('all');
    setSortBy('popular');
    setActiveCollectionId(null);
  };

  // Filter & Sorting Logic
  const filteredRecipes = useMemo(() => {
    let list = recipesOverride && recipesOverride.length > 0 ? [...recipesOverride] : [...EXPLORE_RECIPES_DATABASE];

    // Filter by collection if active
    if (activeCollectionId) {
      const collection = RECIPE_COLLECTIONS.find((c) => c.id === activeCollectionId);
      if (collection) {
        list = list.filter((r) => collection.recipeIds.includes(r.id));
      }
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.subtitle.toLowerCase().includes(q) ||
          r.dishCategory.toLowerCase().includes(q) ||
          r.tags?.some((t) => t.toLowerCase().includes(q)) ||
          r.ingredients.some((i) => i.name.toLowerCase().includes(q))
      );
    }

    // Category filter
    if (selectedCategory !== 'all') {
      list = list.filter((r) => r.dishCategory === selectedCategory);
    }

    // Tag filter
    if (selectedTag !== 'all') {
      list = list.filter((r) =>
        r.tags?.some((t) => t.toLowerCase().includes(selectedTag.toLowerCase()))
      );
    }

    // Target Consumer filter
    if (selectedConsumer !== 'all') {
      list = list.filter((r) =>
        r.targetAge.toLowerCase().includes(selectedConsumer.toLowerCase())
      );
    }

    // Prep/Cook time limit filter
    if (maxTime !== 'all') {
      list = list.filter((r) => (r.prepTimeMinutes + r.cookTimeMinutes) <= maxTime);
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === 'time-asc') {
        return (
          a.prepTimeMinutes + a.cookTimeMinutes - (b.prepTimeMinutes + b.cookTimeMinutes)
        );
      }
      if (sortBy === 'fiber-desc') {
        return (b.nutritionHighlight?.fiberGrams || 0) - (a.nutritionHighlight?.fiberGrams || 0);
      }
      return 0; // popular/default
    });

    return list;
  }, [
    searchQuery,
    selectedCategory,
    selectedTag,
    selectedConsumer,
    maxTime,
    sortBy,
    activeCollectionId,
    recipesOverride,
  ]);

  return (
    <div className="bg-[#f9f9f7] text-[#1a1c1b] font-['Manrope',sans-serif] min-h-screen pb-32">
      {/* Header konsisten dengan tab lain (Home/Profil): avatar -> Profil,
          judul, tombol cari. Sebelumnya tab Explore tidak punya header sama
          sekali, jadi tidak ada jalan ke Profil maupun Cari dari sini. */}
      <header className="sticky top-0 z-40 bg-[#f9f9f7]/95 backdrop-blur-md border-b border-[#e2e3e1]/60">
        <div className="px-4 md:px-8 max-w-6xl mx-auto flex items-center justify-between py-3">
          <button
            onClick={onOpenProfile}
            className="flex items-center gap-2.5 cursor-pointer hover:opacity-90 transition-opacity"
            title="Buka Profil Pengguna"
            aria-label="Buka Profil Pengguna"
          >
            <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-[#163422]/20 shadow-xs bg-[#e2e3e1] flex items-center justify-center">
              <User className="w-5 h-5 text-[#727972]" />
            </div>
            <div className="hidden sm:block text-left">
              <span className="text-xs font-bold text-[#163422] block leading-none">{displayName || 'Guest'}</span>
              <span className="text-[10px] text-[#727972]">Health Explorer</span>
            </div>
          </button>

          <h1 className="text-xl sm:text-2xl font-bold text-[#163422] tracking-tight">SorghumCare</h1>

          <button
            onClick={onOpenSearch}
            className="w-10 h-10 flex items-center justify-center rounded-full text-[#163422] hover:bg-[#e2e3e1] transition-colors active:scale-95 duration-150 cursor-pointer"
            title="Cari Resep"
            aria-label="Cari Resep"
          >
            <span className="material-symbols-outlined text-[24px]">search</span>
          </button>
        </div>
      </header>

      <div className="px-4 md:px-8 max-w-6xl mx-auto space-y-6 pt-5">
        
        {/* Clean Hero Section at the top */}
        <div 
          id="explore-hero-section"
          className="relative overflow-hidden rounded-2xl bg-[#163422] text-white p-6 sm:p-7 shadow-sm"
        >
          <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-[#2d4b37]/60 blur-2xl pointer-events-none" />
          <div className="absolute right-8 -bottom-8 w-36 h-36 rounded-full bg-[#fdc65c]/15 blur-xl pointer-events-none" />
          
          <div className="relative z-10 max-w-2xl">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Eksplorasi Resep Sorgum
            </h1>
            <p className="mt-2 text-xs sm:text-sm text-[#d4e2d7] leading-relaxed font-normal">
              Temukan ragam olahan pangan sorgum bergizi tinggi, bebas gluten, dan ramah untuk santapan harian seluruh keluarga.
            </p>
          </div>
        </div>

        {/* Most Liked Recipes Carousel */}
        {!searchQuery && selectedCategory === 'all' && selectedTag === 'all' && (
          <section className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider bg-red-100 text-red-700 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                    <Heart className="w-3 h-3 fill-red-600 text-red-600" />
                    Top Komunitas
                  </span>
                </div>
                <h2 className="text-lg sm:text-xl font-extrabold text-[#163422] flex items-center gap-2 tracking-tight">
                  Paling Banyak Disukai
                </h2>
                <p className="text-xs text-[#5e635f]">
                  Resep pilihan komunitas berdasarkan jumlah suka
                </p>
              </div>

              {/* Carousel Navigation Buttons & Pagination Indicator */}
              <div className="flex items-center gap-2 self-end">
                {/* Visual Slide Dots Indicator */}
                <div className="hidden sm:flex items-center gap-1 bg-[#f0f2ef] px-2 py-1 rounded-full border border-[#e2e3e1]">
                  {topCandidates.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => scrollCarouselToIndex(idx)}
                      className={`transition-all duration-300 rounded-full ${
                        carouselIndex === idx
                          ? 'w-4 h-1.5 bg-[#163422]'
                          : 'w-1.5 h-1.5 bg-[#c2c8c0] hover:bg-[#8e948e]'
                      }`}
                      aria-label={`Lihat Slide ${idx + 1}`}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-1.5">
                  <motion.button
                    whileTap={{ scale: 0.88, x: -3 }}
                    whileHover={{ scale: 1.08 }}
                    onClick={() => scrollCarousel('left')}
                    disabled={!canScrollLeft}
                    className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full border flex items-center justify-center transition-colors shadow-xs ${
                      canScrollLeft
                        ? 'bg-white border-[#c2c8c0]/70 text-[#163422] hover:bg-[#163422] hover:text-white cursor-pointer'
                        : 'bg-[#f4f4f2] border-transparent text-[#b0b5af] cursor-not-allowed opacity-50'
                    }`}
                    aria-label="Geser ke Kiri"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.88, x: 3 }}
                    whileHover={{ scale: 1.08 }}
                    onClick={() => scrollCarousel('right')}
                    disabled={!canScrollRight}
                    className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full border flex items-center justify-center transition-colors shadow-xs ${
                      canScrollRight
                        ? 'bg-white border-[#c2c8c0]/70 text-[#163422] hover:bg-[#163422] hover:text-white cursor-pointer'
                        : 'bg-[#f4f4f2] border-transparent text-[#b0b5af] cursor-not-allowed opacity-50'
                    }`}
                    aria-label="Geser ke Kanan"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </motion.button>
                </div>
              </div>
            </div>

            {/* Scrollable Carousel Track with Motion Slide Animation / Skeletons */}
            <div
              ref={carouselContainerRef}
              className="overflow-hidden relative -mx-4 px-4 md:mx-0 md:px-0 py-2 select-none"
            >
              {isLoading ? (
                <div className="flex items-stretch gap-4 overflow-hidden">
                  {[1, 2, 3].map((n) => (
                    <CarouselCardSkeleton key={n} width={cardWidth} />
                  ))}
                </div>
              ) : (
                <motion.div
                  animate={{ x: -carouselIndex * itemFullWidth }}
                  transition={{ type: 'spring', stiffness: 240, damping: 28, mass: 0.8 }}
                  drag="x"
                  dragConstraints={{
                    left: -maxCarouselIndex * itemFullWidth,
                    right: 0,
                  }}
                  dragElastic={0.12}
                  onDragEnd={(_, info) => {
                    const swipeThreshold = 35;
                    if (info.offset.x < -swipeThreshold) {
                      setCarouselIndex((prev) => Math.min(maxCarouselIndex, prev + 1));
                    } else if (info.offset.x > swipeThreshold) {
                      setCarouselIndex((prev) => Math.max(0, prev - 1));
                    }
                  }}
                  className="flex items-stretch gap-4 cursor-grab active:cursor-grabbing"
                >
                  {topCandidates.map((recipe, idx) => {
                    const isLiked = likedIds.has(recipe.id);
                    const st = statsMap[recipe.id];
                    const currentLikes = st?.likes || 0;
                    const totalTime = recipe.prepTimeMinutes + recipe.cookTimeMinutes;
                    const isFocused = idx === carouselIndex;
                    const rank = idx + 1;

                    return (
                      <motion.div
                        key={recipe.id}
                        onClick={() => onViewRecipe(recipe)}
                        animate={{
                          scale: isFocused ? 1 : 0.985,
                          opacity: 1,
                        }}
                        whileHover={{ y: -4, scale: 1.01 }}
                        transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                        style={{ width: `${cardWidth}px` }}
                        className="shrink-0 bg-white rounded-3xl overflow-hidden border border-[#c2c8c0]/60 hover:border-[#163422]/50 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between group cursor-pointer"
                      >
                        {/* Media Card Top */}
                        <div>
                          {imagesEnabled ? (
                          <div className="relative h-40 w-full overflow-hidden bg-[#e8eae6]">
                            <CardImageWithSkeleton
                              src={recipe.imageUrl || GLOBAL_FALLBACK_FOOD_IMAGE}
                              alt={recipe.title}
                              fallbackSrc={GLOBAL_FALLBACK_FOOD_IMAGE}
                              containerClassName="w-full h-full relative"
                              imageClassName="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />

                          {/* Top Badges: Rank & Like */}
                          <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between">
                            {/* Rank Badge */}
                            <span
                              className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wide shadow-xs flex items-center gap-1 backdrop-blur-xs ${
                                rank === 1
                                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white'
                                  : rank === 2
                                  ? 'bg-gradient-to-r from-slate-600 to-slate-700 text-white'
                                  : rank === 3
                                  ? 'bg-gradient-to-r from-amber-700 to-amber-800 text-white'
                                  : 'bg-[#163422]/90 text-[#fdc65c]'
                              }`}
                            >
                              {rank === 1 ? '🏆 #1' : rank === 2 ? '🥈 #2' : rank === 3 ? '🥉 #3' : `#${rank}`}
                              <span className="font-bold">Favorit</span>
                            </span>

                            {/* Interactive Like Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleLike(recipe.id);
                              }}
                              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold transition-all backdrop-blur-md active:scale-90 cursor-pointer ${
                                isLiked
                                  ? 'bg-red-500 text-white shadow-xs'
                                  : 'bg-black/40 text-white hover:bg-black/60'
                              }`}
                              title="Sukai Resep Ini"
                            >
                              <Heart
                                className={`w-3.5 h-3.5 ${
                                  isLiked ? 'fill-white text-white' : 'text-white'
                                }`}
                              />
                              <span className="text-[11px] font-bold">
                                {currentLikes >= 1000
                                  ? `${(currentLikes / 1000).toFixed(1)}k`
                                  : currentLikes}
                              </span>
                            </button>
                          </div>

                          {/* Bottom Overlay Info */}
                          <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center text-white text-[11px] font-semibold pointer-events-none">
                            <span className="flex items-center gap-1 bg-black/50 backdrop-blur-xs px-2 py-0.5 rounded-lg">
                              <Clock className="w-3 h-3 text-[#fdc65c]" />
                              {totalTime} Menit
                            </span>
                          </div>
                          </div>
                          ) : (
                          /* Varian tanpa gambar: header info ringkas */
                          <div className="px-3.5 pt-3.5">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wide shadow-xs flex items-center gap-1 ${
                                  rank === 1
                                    ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white'
                                    : rank === 2
                                    ? 'bg-gradient-to-r from-slate-600 to-slate-700 text-white'
                                    : rank === 3
                                    ? 'bg-gradient-to-r from-amber-700 to-amber-800 text-white'
                                    : 'bg-[#163422]/90 text-[#fdc65c]'
                                }`}
                              >
                                {rank === 1 ? '🏆 #1' : rank === 2 ? '🥈 #2' : rank === 3 ? '🥉 #3' : `#${rank}`}
                                <span className="font-bold">Favorit</span>
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleLike(recipe.id);
                                }}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold transition-all active:scale-90 cursor-pointer ${
                                  isLiked
                                    ? 'bg-red-500 text-white shadow-xs'
                                    : 'bg-[#f4f4f2] text-[#163422] hover:bg-[#e2e3e1]'
                                }`}
                                title="Sukai Resep Ini"
                              >
                                <Heart
                                  className={`w-3.5 h-3.5 ${
                                    isLiked ? 'fill-white text-white' : 'text-red-500 fill-red-500'
                                  }`}
                                />
                                <span className="text-[11px] font-bold">
                                  {currentLikes >= 1000
                                    ? `${(currentLikes / 1000).toFixed(1)}k`
                                    : currentLikes}
                                </span>
                              </button>
                            </div>
                            <div className="flex items-center gap-2 mt-2 text-[11px] font-semibold text-[#424843]">
                              <span className="flex items-center gap-1 bg-[#f4f4f2] px-2 py-0.5 rounded-lg">
                                <Clock className="w-3 h-3 text-[#7c5800]" />
                                {totalTime} Menit
                              </span>
                            </div>
                          </div>
                          )}

                        {/* Content Info */}
                        <div className="p-3.5 space-y-2.5">
                          {/* Rating & Category */}
                          <div className="flex items-center justify-between text-[11px]">
                            {st?.ratingAvg != null ? (
                              <div className="flex items-center gap-1 text-amber-600 font-bold">
                                <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                                <span>{st.ratingAvg.toFixed(1)}</span>
                                <span className="text-[#727972] font-normal">
                                  ({st.reviewsCount})
                                </span>
                              </div>
                            ) : (
                              <span className="text-[10px] font-bold text-[#2d4b37] bg-[#cbebc3]/40 px-2 py-0.5 rounded-md">
                                Pilihan Editor
                              </span>
                            )}
                            <span className="text-[10px] font-bold bg-[#f4f4f2] text-[#424843] px-2 py-0.5 rounded-md">
                              {recipe.dishCategory}
                            </span>
                          </div>

                          <div>
                            <h3 className="font-bold text-sm text-[#163422] line-clamp-1 group-hover:text-[#2d4b37] transition-colors">
                              {recipe.title}
                            </h3>
                            <p className="text-xs text-[#424843] line-clamp-2 mt-0.5 leading-relaxed">
                              {recipe.subtitle}
                            </p>
                          </div>

                          {/* Nutrition Highlight Chip */}
                          {recipe.nutritionHighlight && (
                            <div className="flex items-center gap-1.5 text-[10px] text-[#2d4b37] font-semibold bg-[#cbebc3]/30 px-2 py-1 rounded-lg">
                              <span>🌾 Serat {recipe.nutritionHighlight.fiberGrams}g</span>
                              <span>•</span>
                              <span>{recipe.nutritionHighlight.glycemicIndex}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action Card Bottom */}
                      <div className="p-3.5 pt-0">
                        <button
                          onClick={() => onViewRecipe(recipe)}
                          className="w-full py-2 rounded-xl bg-[#163422] hover:bg-[#2d4b37] text-white text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-xs active:scale-95 cursor-pointer"
                        >
                          <span>Lihat Resep</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
            </div>
          </section>
        )}

        {/* Explore Search & Advance Filter Control Bar */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#727972] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari resep, bahan (bayam, jamur, kelapa), atau manfaat..."
                className="w-full pl-10 pr-10 py-2.5 bg-white rounded-xl border border-[#c2c8c0]/80 text-xs sm:text-sm text-[#1a1c1b] placeholder-[#8e948e] focus:outline-none focus:border-[#163422] focus:ring-1 focus:ring-[#163422] shadow-xs transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-md bg-[#f4f4f2] text-[#424843] flex items-center justify-center hover:bg-[#e2e3e1]"
                  title="Hapus pencarian"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Advance Filter Toggle Button (Triggers Right Sidebar) */}
            <motion.button
              whileTap={{ scale: 0.95 }}
              whileHover={{ scale: 1.02 }}
              onClick={() => setShowFilterDrawer(true)}
              className={`flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-bold transition-colors shadow-xs shrink-0 select-none cursor-pointer ${
                activeFiltersCount > 0
                  ? 'bg-[#163422] text-white border-[#163422] shadow-sm'
                  : 'bg-white text-[#163422] border-[#c2c8c0]/80 hover:bg-[#f4f4f2]'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4 text-[#fdc65c]" />
              <span className="hidden sm:inline">Advance Filter</span>
              <span className="sm:hidden">Filter</span>
              {activeFiltersCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-[#fdc65c] text-[#745200] text-[10px] font-extrabold flex items-center justify-center">
                  {activeFiltersCount}
                </span>
              )}
            </motion.button>

            {/* Quick Sort Selector */}
            <div className="relative min-w-[130px] sm:min-w-[150px] hidden xs:block">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="w-full py-2.5 pl-3 pr-8 bg-white rounded-xl border border-[#c2c8c0]/80 text-xs sm:text-sm font-semibold text-[#1a1c1b] focus:outline-none focus:border-[#163422] shadow-xs appearance-none cursor-pointer"
              >
                <option value="popular">🔥 Terpopuler</option>
                <option value="time-asc">⏱️ Waktu Cepat</option>
                <option value="fiber-desc">🥗 Serat Tinggi</option>
              </select>
              <ArrowUpDown className="w-3.5 h-3.5 text-[#727972] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Active Filter Chips Bar */}
          {(activeFiltersCount > 0 || searchQuery) && (
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              <span className="text-[11px] font-bold text-[#5e635f] mr-1">Filter Aktif:</span>

              {searchQuery && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#163422] text-white text-[11px] font-semibold">
                  <span>"{searchQuery}"</span>
                  <button onClick={() => setSearchQuery('')} className="hover:opacity-75">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {selectedCategory !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#cbebc3] text-[#163422] text-[11px] font-semibold">
                  <span>Kategori: {selectedCategory}</span>
                  <button onClick={() => setSelectedCategory('all')} className="hover:opacity-75">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {selectedTag !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#cbebc3] text-[#163422] text-[11px] font-semibold">
                  <span>Tag: {quickTags.find((t) => t.id === selectedTag)?.label || selectedTag}</span>
                  <button onClick={() => setSelectedTag('all')} className="hover:opacity-75">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {selectedConsumer !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#fdc65c]/40 text-[#745200] text-[11px] font-semibold">
                  <span>Usia: {selectedConsumer}</span>
                  <button onClick={() => setSelectedConsumer('all')} className="hover:opacity-75">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {maxTime !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#f4f4f2] text-[#424843] border border-[#c2c8c0] text-[11px] font-semibold">
                  <span>Waktu ≤ {maxTime}m</span>
                  <button onClick={() => setMaxTime('all')} className="hover:opacity-75">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              <button
                onClick={clearAllFilters}
                className="text-[11px] font-bold text-red-600 hover:text-red-700 hover:underline px-2 py-0.5"
              >
                Reset Semua
              </button>
            </div>
          )}
        </div>

        {/* Recipe Cards Grid with Skeletons */}
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 md:gap-6">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <GridRecipeCardSkeleton key={n} />
            ))}
          </div>
        ) : filteredRecipes.length === 0 ? (
          /* Empty State */
          <div className="bg-white rounded-3xl p-8 sm:p-12 text-center border border-[#c2c8c0]/60 space-y-4 shadow-xs">
            <div className="w-16 h-16 rounded-full bg-[#f4f4f2] text-[#163422] flex items-center justify-center mx-auto text-3xl">
              🔍
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <h3 className="text-lg font-bold text-[#163422]">
                Tidak ada resep yang sesuai kriteria
              </h3>
              <p className="text-xs text-[#727972] leading-relaxed">
                Coba ubah kata kunci pencarian, sesuaikan filter, atau minta AI Chef kami meracik resep khusus untuk Anda.
              </p>
            </div>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
              <button
                onClick={clearAllFilters}
                className="px-4 py-2.5 rounded-xl border border-[#c2c8c0] text-xs font-bold text-[#424843] hover:bg-[#f4f4f2]"
              >
                Reset Semua Filter
              </button>
              <button
                onClick={onStartGenerator}
                className="px-5 py-2.5 rounded-xl bg-[#163422] text-white text-xs font-bold hover:bg-[#2d4b37] flex items-center gap-2 shadow-sm"
              >
                <Sparkles className="w-4 h-4 text-[#fdc65c]" />
                Buat Resep AI Baru
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 md:gap-6">
            {filteredRecipes.map((recipe) => {
              const saved = isRecipeSaved(recipe.id, recipe.title);
              const totalTime = recipe.prepTimeMinutes + recipe.cookTimeMinutes;

              return (
                <div
                  key={recipe.id}
                  onClick={() => onViewRecipe(recipe)}
                  className="bg-white rounded-2xl sm:rounded-3xl overflow-hidden border border-[#c2c8c0]/50 hover:border-[#163422]/60 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between group cursor-pointer hover:-translate-y-0.5 active:scale-[0.99]"
                >
                  {/* Card Media Header */}
                  <div>
                    {imagesEnabled ? (
                    <div className="relative h-32 xs:h-36 sm:h-48 md:h-52 w-full overflow-hidden bg-[#e8eae6]">
                      <CardImageWithSkeleton
                        src={recipe.imageUrl || GLOBAL_FALLBACK_FOOD_IMAGE}
                        alt={recipe.title}
                        fallbackSrc={GLOBAL_FALLBACK_FOOD_IMAGE}
                        containerClassName="w-full h-full relative"
                        imageClassName="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10 pointer-events-none" />

                      {/* Top Badges */}
                      <div className="absolute top-2 sm:top-3 left-2 sm:left-3 right-2 sm:right-3 flex items-center justify-between">
                        <span className="bg-[#163422]/90 backdrop-blur-xs text-[#fdc65c] text-[9px] sm:text-[10px] font-extrabold px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full uppercase tracking-wider shadow-xs truncate max-w-[70%]">
                          {recipe.dishCategory}
                        </span>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleSaveRecipe(recipe);
                          }}
                          className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center backdrop-blur-md transition-transform active:scale-90 ${
                            saved
                              ? 'bg-[#163422] text-[#fdc65c]'
                              : 'bg-black/40 text-white hover:bg-black/60'
                          }`}
                          aria-label={saved ? 'Hapus dari koleksi' : 'Simpan ke koleksi'}
                          title={saved ? 'Hapus dari koleksi' : 'Simpan ke koleksi'}
                        >
                          <Bookmark
                            className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                            fill={saved ? '#fdc65c' : 'none'}
                          />
                        </button>
                      </div>

                      {/* Bottom Info overlay on Image */}
                      <div className="absolute bottom-2 sm:bottom-2.5 left-2 sm:left-3 right-2 sm:right-3 flex items-center justify-between text-white text-[10px] sm:text-xs font-semibold">
                        <span className="flex items-center gap-1 bg-black/40 backdrop-blur-xs px-1.5 sm:px-2 py-0.5 rounded-md sm:rounded-lg text-[10px] sm:text-[11px]">
                          <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-[#fdc65c]" />
                          {totalTime} Min
                        </span>
                      </div>
                    </div>
                    ) : (
                    /* Varian tanpa gambar: badge + info di atas konten */
                    <div className="px-2.5 sm:px-4 pt-2.5 sm:pt-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="bg-[#163422]/90 text-[#fdc65c] text-[9px] sm:text-[10px] font-extrabold px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full uppercase tracking-wider shadow-xs truncate max-w-[70%]">
                          {recipe.dishCategory}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleSaveRecipe(recipe);
                          }}
                          className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-transform active:scale-90 shrink-0 ${
                            saved
                              ? 'bg-[#163422] text-[#fdc65c]'
                              : 'bg-[#f4f4f2] text-[#424843] hover:bg-[#e2e3e1]'
                          }`}
                          aria-label={saved ? 'Hapus dari koleksi' : 'Simpan ke koleksi'}
                          title={saved ? 'Hapus dari koleksi' : 'Simpan ke koleksi'}
                        >
                          <Bookmark
                            className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                            fill={saved ? '#fdc65c' : 'none'}
                          />
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5 mt-2 text-[10px] sm:text-[11px] font-semibold text-[#424843]">
                        <span className="flex items-center gap-1 bg-[#f4f4f2] px-1.5 sm:px-2 py-0.5 rounded-md sm:rounded-lg">
                          <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-[#7c5800]" />
                          {totalTime} Min
                        </span>
                      </div>
                    </div>
                    )}

                    {/* Card Content Body */}
                    <div className="p-2.5 sm:p-4 space-y-2 sm:space-y-3">
                      <div>
                        <h3 className="font-bold text-xs sm:text-base text-[#163422] line-clamp-1 group-hover:text-[#2d4b37] transition-colors">
                          {recipe.title}
                        </h3>
                        <p className="text-[11px] sm:text-xs text-[#424843] line-clamp-2 mt-0.5 sm:mt-1 leading-relaxed">
                          {recipe.subtitle}
                        </p>
                      </div>

                      {/* Tag Chips */}
                      <div className="flex flex-wrap gap-1 sm:gap-1.5">
                        {recipe.tags?.slice(0, 2).map((tag, idx) => (
                          <span
                            key={idx}
                            className="bg-[#f4f4f2] text-[#424843] text-[9px] sm:text-[10px] font-semibold px-1.5 sm:px-2 py-0.5 rounded-md truncate max-w-full"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>

                      {/* Nutrition Strip */}
                      {recipe.nutritionHighlight && (
                        <div className="bg-[#F9F9F7] rounded-lg sm:rounded-xl p-1.5 sm:p-2.5 border border-[#e2e3e1] flex items-center justify-between text-[9px] sm:text-[11px]">
                          <div className="text-center">
                            <span className="block text-[8px] sm:text-[9px] text-[#727972] uppercase font-bold">Serat</span>
                            <span className="font-bold text-[#163422]">{recipe.nutritionHighlight.fiberGrams}g</span>
                          </div>
                          <div className="w-[1px] h-4 sm:h-5 bg-[#e2e3e1]" />
                          <div className="text-center">
                            <span className="block text-[8px] sm:text-[9px] text-[#727972] uppercase font-bold">Protein</span>
                            <span className="font-bold text-[#163422]">{recipe.nutritionHighlight.proteinGrams}g</span>
                          </div>
                          <div className="w-[1px] h-4 sm:h-5 bg-[#e2e3e1]" />
                          <div className="text-center">
                            <span className="block text-[8px] sm:text-[9px] text-[#727972] uppercase font-bold">Glikemik</span>
                            <span className="font-bold text-[#7c5800]">Low GI</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Action Footer */}
                  <div className="p-2.5 sm:p-4 pt-0">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleLike(recipe.id);
                        }}
                        title={likedIds.has(recipe.id) ? 'Batalkan suka' : 'Suka resep ini'}
                        className={`flex items-center gap-1 px-2.5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                          likedIds.has(recipe.id)
                            ? 'bg-red-500 text-white'
                            : 'bg-[#f4f4f2] text-[#424843] hover:bg-[#e2e3e1]'
                        }`}
                      >
                        <Heart
                          className="w-3.5 h-3.5"
                          fill={likedIds.has(recipe.id) ? '#fff' : 'none'}
                        />
                        <span>{statsMap[recipe.id]?.likes || 0}</span>
                      </button>
                      <button
                        onClick={() => onViewRecipe(recipe)}
                        className="flex-1 py-2 sm:py-2.5 rounded-lg sm:rounded-xl bg-[#163422]/10 hover:bg-[#163422] text-[#163422] hover:text-white text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95"
                      >
                        <span>Lihat Resep</span>
                        <ChevronRight className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* MangaDex-style Right Sidebar Drawer for Advance Filter with Smooth Slide Animation */}
      <AnimatePresence>
        {showFilterDrawer && (
          <div className="fixed inset-0 z-50 overflow-hidden">
            {/* Backdrop Overlay with Fade Animation */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              onClick={() => setShowFilterDrawer(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            />

            {/* Sliding Sidebar Container on the Right with Spring / Slide Animation */}
            <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                className="w-screen max-w-md bg-white shadow-2xl flex flex-col justify-between border-l border-[#c2c8c0]/50"
              >
                
                {/* Sidebar Header */}
                <div className="p-4 sm:p-5 border-b border-[#e2e3e1] flex items-center justify-between bg-[#f8f9f8]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-[#163422] text-[#fdc65c] flex items-center justify-center shadow-xs">
                      <SlidersHorizontal className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm sm:text-base text-[#163422] leading-tight">
                        Advance Filter Resep
                      </h3>
                      <p className="text-[11px] text-[#5e635f]">
                        Sesuaikan kriteria resep tanpa mengubah struktur halaman
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {activeFiltersCount > 0 && (
                      <button
                        onClick={clearAllFilters}
                        className="text-xs font-bold text-red-600 hover:text-red-700 hover:underline px-2 py-1"
                      >
                        Reset
                      </button>
                    )}
                    <button
                      onClick={() => setShowFilterDrawer(false)}
                      className="w-8 h-8 rounded-xl bg-[#e8eae7] text-[#424843] hover:bg-[#163422] hover:text-white flex items-center justify-center transition-all"
                      title="Tutup Filter"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Sidebar Scrollable Body */}
                <div className="p-4 sm:p-5 overflow-y-auto space-y-5 flex-1 divide-y divide-[#f0f2ef]">
                  
                  {/* 1. Kategori Hidangan */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-[#163422] uppercase tracking-wider">
                        1. Kategori Hidangan
                      </span>
                      {selectedCategory !== 'all' && (
                        <span className="text-[10px] font-bold text-[#163422] bg-[#cbebc3] px-2 py-0.5 rounded-md">
                          Aktif
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {categories.map((cat) => {
                        const isSelected = selectedCategory === cat.id;
                        return (
                          <button
                            key={cat.id}
                            onClick={() => setSelectedCategory(cat.id)}
                            className={`flex items-center gap-2 p-2.5 rounded-xl text-xs font-bold transition-all border text-left ${
                              isSelected
                                ? 'bg-[#163422] text-white border-[#163422] shadow-xs'
                                : 'bg-[#f4f4f2] text-[#424843] border-[#e2e3e1] hover:bg-[#e8eae7]'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[18px]">{cat.icon}</span>
                            <span className="truncate flex-1">{cat.label}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-[#fdc65c] shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2. Label Nutrisi & Kesehatan */}
                  <div className="space-y-2.5 pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-[#163422] uppercase tracking-wider">
                        2. Label & Nutrisi Khusus
                      </span>
                      {selectedTag !== 'all' && (
                        <span className="text-[10px] font-bold text-[#163422] bg-[#cbebc3] px-2 py-0.5 rounded-md">
                          Aktif
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {quickTags.map((tag) => {
                        const isSelected = selectedTag === tag.id;
                        return (
                          <button
                            key={tag.id}
                            onClick={() => setSelectedTag(tag.id)}
                            className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
                              isSelected
                                ? 'bg-[#cbebc3] text-[#163422] border-[#163422]/40 font-bold shadow-xs'
                                : 'bg-[#f4f4f2] text-[#5e635f] border-[#e2e3e1] hover:bg-[#e8eae7]'
                            }`}
                          >
                            {tag.label}
                            {isSelected && tag.id !== 'all' && (
                              <span className="ml-1 text-[11px] font-bold">✓</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 3. Target Usia & Konsumen */}
                  <div className="space-y-2.5 pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-[#163422] uppercase tracking-wider">
                        3. Target Konsumen
                      </span>
                      {selectedConsumer !== 'all' && (
                        <span className="text-[10px] font-bold text-[#163422] bg-[#cbebc3] px-2 py-0.5 rounded-md">
                          Aktif
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { id: 'all', label: 'Semua Usia' },
                        { id: 'Balita', label: '👶 Balita (1-5 thn)' },
                        { id: 'Anak Sekolah', label: '🎒 Anak Sekolah' },
                        { id: 'Remaja', label: '🧑 Remaja & Dewasa' },
                        { id: 'Lansia', label: '👴 Lansia (Ramah Gula)' },
                      ].map((item) => {
                        const isSelected = selectedConsumer === item.id;
                        return (
                          <button
                            key={item.id}
                            onClick={() => setSelectedConsumer(item.id)}
                            className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
                              isSelected
                                ? 'bg-[#cbebc3] text-[#163422] border-[#163422]/40 font-bold shadow-xs'
                                : 'bg-[#f4f4f2] text-[#5e635f] border-[#e2e3e1] hover:bg-[#e8eae7]'
                            }`}
                          >
                            {item.label}
                            {isSelected && item.id !== 'all' && (
                              <span className="ml-1 text-[11px] font-bold">✓</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 4. Waktu Memasak & Urutan */}
                  <div className="space-y-3 pt-4">
                    <div className="space-y-2">
                      <span className="text-xs font-extrabold text-[#163422] uppercase tracking-wider block">
                        5. Waktu Memasak Maksimal
                      </span>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { value: 'all', label: 'Bebas' },
                          { value: 15, label: '≤ 15 mnt' },
                          { value: 30, label: '≤ 30 mnt' },
                        ].map((item) => (
                          <button
                            key={String(item.value)}
                            onClick={() => setMaxTime(item.value as any)}
                            className={`py-2 px-2 rounded-xl text-xs font-semibold text-center transition-all border ${
                              maxTime === item.value
                                ? 'bg-[#163422] text-white border-[#163422]'
                                : 'bg-[#f4f4f2] text-[#424843] border-[#e2e3e1] hover:bg-[#e8eae7]'
                            }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2.5 pt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-[#163422] uppercase tracking-wider">
                          5. Urutkan Hasil Berdasarkan
                        </span>
                        {sortBy !== 'popular' && (
                          <span className="text-[10px] font-bold text-[#163422] bg-[#cbebc3] px-2 py-0.5 rounded-md">
                            Kustom
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { id: 'popular', label: '🔥 Terpopuler' },
                          { id: 'time-asc', label: '⏱️ Waktu Tercepat' },
                          { id: 'fiber-desc', label: '🥗 Serat Tertinggi' },
                        ].map((item) => {
                          const isSelected = sortBy === item.id;
                          return (
                            <button
                              key={item.id}
                              onClick={() => setSortBy(item.id as SortOption)}
                              className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
                                isSelected
                                  ? 'bg-[#cbebc3] text-[#163422] border-[#163422]/40 font-bold shadow-xs'
                                  : 'bg-[#f4f4f2] text-[#5e635f] border-[#e2e3e1] hover:bg-[#e8eae7]'
                              }`}
                            >
                              {item.label}
                              {isSelected && (
                                <span className="ml-1 text-[11px] font-bold">✓</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                </div>

                {/* Sidebar Sticky Footer */}
                <div className="p-4 sm:p-5 border-t border-[#e2e3e1] bg-[#f8f9f8] flex items-center justify-between gap-3">
                  <div>
                    <span className="text-[11px] text-[#5e635f] block">Hasil Sesuai Filter</span>
                    <span className="text-sm font-extrabold text-[#163422]">
                      {filteredRecipes.length} Resep Terpilih
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={clearAllFilters}
                      className="px-3.5 py-2.5 rounded-xl border border-[#c2c8c0] text-xs font-bold text-[#424843] hover:bg-white transition-all"
                    >
                      Reset
                    </button>
                    <button
                      onClick={() => setShowFilterDrawer(false)}
                      className="px-5 py-2.5 rounded-xl bg-[#163422] text-white text-xs font-bold hover:bg-[#2d4b37] shadow-sm flex items-center gap-1.5 active:scale-95 transition-all"
                    >
                      <Check className="w-3.5 h-3.5 text-[#fdc65c]" />
                      <span>Lihat Hasil</span>
                    </button>
                  </div>
                </div>

              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
