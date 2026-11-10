import React, { useEffect, useState } from 'react';
import { Recipe } from '../../types';
import { useData } from '../../lib/dataContext';
import { FALLBACK_FOOD_IMAGE } from '../../data/homeData';
import { getIngredientThumbnail, getRecipeImage, GLOBAL_FALLBACK_FOOD_IMAGE } from '../../data/imageAssets';
import { getRecipeSlug } from '../../utils/slugify';
import { getShareableUrl, RouteSlugs } from '../../utils/slugRouter';
import {
  ArrowLeft,
  Clock,
  Users,
  Heart,
  Bookmark,
  Star,
  MessageCircle,
  Play,
  Sparkles, 
  Info, 
  Volume2, 
  Share2, 
  CheckCircle2, 
  ChefHat,
  Copy,
  Check,
  Link as LinkIcon,
  User
} from 'lucide-react';
import { CommentSection } from '../Comments/CommentSection';

interface RecipeDetailPageProps {
  recipe: Recipe;
  isSaved?: boolean;
  onBack: () => void;
  onToggleSave: (recipe: Recipe) => void;
  onOpenCookMode: (recipe: Recipe) => void;
  onOpenProfile?: () => void;
  onOpenSearch?: () => void;
  onNavigateTab?: (tab: 'home' | 'explore' | 'profile' | 'generate') => void;
  // Google Auth
  isGoogleUser?: boolean;
  googleDisplayName?: string;
  googleAvatarUrl?: string | null;
}

export const RecipeDetailPage: React.FC<RecipeDetailPageProps> = ({
  recipe,
  isSaved = false,
  onBack,
  onToggleSave,
  onOpenCookMode,
  onOpenProfile,
  onOpenSearch,
  onNavigateTab,
  isGoogleUser = false,
  googleDisplayName,
  googleAvatarUrl,
}) => {
  const [servingsMultiplier, setServingsMultiplier] = useState<number>(1);
  const [checkedIngredients, setCheckedIngredients] = useState<number[]>([]);
  const [favoriteState, setFavoriteState] = useState<boolean>(isSaved);
  // Sinkron saat status simpanan dari DB selesai dimuat (mis. setelah refresh)
  useEffect(() => {
    setFavoriteState(isSaved);
  }, [isSaved]);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [recipeImageUrl, setRecipeImageUrl] = useState<string>(recipe.imageUrl || GLOBAL_FALLBACK_FOOD_IMAGE);
  const [ingredientImages, setIngredientImages] = useState<Record<number, string>>({});
  const { imagesEnabled } = useData();
  // Save = koleksi pribadi; Like + rating = apresiasi publik agregat.
  const [likeCount, setLikeCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [ratingAvg, setRatingAvg] = useState<number | null>(null);
  const [reviewsCount, setReviewsCount] = useState(0);
  // Bintang yang dipilih pengguna ini (1-5) — ditampilkan langsung setelah
  // ditekan supaya ada umpan balik nyata walau rata-rata belum berubah.
  const [myRating, setMyRating] = useState<number | null>(null);
  const [commentCount, setCommentCount] = useState(0);
  const commentsRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    import('../../lib/supabase').then(async (m) => {
      const [stats, likedIds, eng, mine] = await Promise.all([
        m.fetchRecipeStats([recipe.id]),
        m.fetchLikedRecipeIds(),
        m.fetchRecipeEngagement([recipe.id]),
        m.fetchMyRecipeRating(recipe.id),
      ]);
      if (cancelled) return;
      const st = stats[recipe.id];
      setLikeCount(st?.likes || 0);
      setRatingAvg(st?.ratingAvg ?? null);
      setReviewsCount(st?.reviewsCount || 0);
      setLiked(likedIds.has(recipe.id));
      setCommentCount(eng.comments[recipe.id] ?? 0);
      setMyRating(mine);
    });
    return () => { cancelled = true; };
  }, [recipe.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const img = await getRecipeImage(recipe.title, recipe.category);
      if (!cancelled) setRecipeImageUrl(img);

      const next: Record<number, string> = {};
      await Promise.all(recipe.ingredients.map(async (ing, idx) => {
        next[idx] = await getIngredientThumbnail(ing.name, idx);
      }));
      if (!cancelled) setIngredientImages(next);
    })();
    return () => { cancelled = true; };
  }, [recipe.title, recipe.category, recipe.ingredients]);

  const scaleAmount = (amount: string, multiplier: number) => {
    return amount.replace(/(\d+)\/(\d+)|\b(\d+(?:[.,]\d+)?)\b/g, (match, fracNum, fracDen, standalone) => {
      if (fracNum !== undefined) {
        // Pecahan seperti 1/2 → hitung desimal, diskalakan, tulis ulang
        const val = (parseInt(fracNum) / parseInt(fracDen)) * multiplier;
        return Number.isInteger(val) ? String(val) : val.toFixed(1);
      }
      // Angka tunggal (termasuk yang dalam kurung, mis. 150 di (150g))
      const val = parseFloat(standalone!.replace(',', '.')) * multiplier;
      return Number.isInteger(val) ? String(val) : val.toFixed(1);
    });
  };

  const recipeSlug = getRecipeSlug(recipe);
  const fullSlugPath = RouteSlugs.recipeSlug(recipeSlug);
  const shareableUrl = getShareableUrl(fullSlugPath);

  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareableUrl);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = shareableUrl;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2200);
    } catch {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2200);
    }
  };

  const baseServings = recipe.servings || 2;
  const currentServings = baseServings * servingsMultiplier;

  const toggleIngredientCheck = (idx: number) => {
    setCheckedIngredients((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  };

  const handleFavoriteClick = () => {
    // Save = koleksi pribadi. Optimistis, selaraskan via prop isSaved dari DB.
    const next = !favoriteState;
    setFavoriteState(next);
    onToggleSave(recipe);
  };

  const handleLikeClick = async () => {
    const prevLiked = liked;
    const prevCount = likeCount;
    setLiked(!prevLiked);
    setLikeCount(Math.max(0, prevCount + (prevLiked ? -1 : 1)));
    const m = await import('../../lib/supabase');
    const res = await m.toggleRecipeLike(recipe.id);
    if (!res) {
      setLiked(prevLiked);
      setLikeCount(prevCount);
      return;
    }
    setLiked(res.liked);
    setLikeCount(res.count);
  };

  const handleRate = async (stars: number) => {
    const m = await import('../../lib/supabase');
    const ok = await m.upsertRecipeReview(recipe.id, stars);
    if (!ok) return;
    // Tampilkan pilihan pengguna lebih dulu (umpan balik langsung), lalu
    // sinkronkan rata-rata + jumlah ulasan dari view publik.
    setMyRating(stars);
    const stats = await m.fetchRecipeStats([recipe.id]);
    const st = stats[recipe.id];
    setRatingAvg(st?.ratingAvg ?? null);
    setReviewsCount(st?.reviewsCount || 0);
  };

  const handleSpeakInstructions = () => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const text = `${recipe.title}. ${recipe.subtitle || ''}. Langkah memasak: ` +
      recipe.steps.map((s) => `Langkah ${s.stepNumber}, ${s.title}. ${s.instruction}`).join('. ');
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'id-ID';
    window.speechSynthesis.speak(utterance);
  };

  // Macro estimates — DYNAMIC from the recipe's own nutrition data when present,
  // scaled by the selected servings multiplier. Falls back to sensible sorghum
  // defaults only when a value is genuinely absent.
  const nh = recipe.nutritionHighlight || {};
  const baseCalories = nh.caloriesEstimate || 380;
  const baseProtein = nh.proteinGrams || 15;
  const baseFiber = nh.fiberGrams || 8;
  // Fat is not stored per-recipe; derive a moderate share (~28% of kcal / 9 kcal per g).
  const derivedFat = Math.max(4, Math.round((baseCalories * 0.28) / 9));
  // Carbs = remaining calories after protein & fat (4 kcal per g).
  const derivedCarbs = Math.max(10, Math.round((baseCalories - baseProtein * 4 - derivedFat * 9) / 4));
  const carbs = Math.round(derivedCarbs * servingsMultiplier);
  const protein = Math.round(baseProtein * servingsMultiplier);
  const fat = Math.round(derivedFat * servingsMultiplier);
  const calories = Math.round(baseCalories * servingsMultiplier);
  const fiber = Math.round(baseFiber * servingsMultiplier);
  const totalMacro = carbs + protein + fat;
  const carbsPct = totalMacro > 0 ? Math.round((carbs / totalMacro) * 100) : 0;
  const proteinPct = totalMacro > 0 ? Math.round((protein / totalMacro) * 100) : 0;
  const fatPct = totalMacro > 0 ? Math.round((fat / totalMacro) * 100) : 0;

  return (
    <div className="bg-[#f9f9f7] text-[#1a1c1b] min-h-screen pb-24 md:pb-16 font-['Manrope',sans-serif] antialiased">
      {/* TopAppBar */}
      <header className="fixed top-0 w-full z-50 bg-[#f4f4f2] shadow-sm border-b border-[#e2e3e1]/60">
        <div className="flex items-center justify-between px-5 md:px-8 py-3 max-w-5xl mx-auto">
          <div
            onClick={onOpenProfile}
            className="w-10 h-10 rounded-full overflow-hidden bg-[#e2e3e1] flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity border border-[#c2c8c0]/60"
            title="Profil Pengguna"
          >
            {isGoogleUser && googleAvatarUrl ? (
              <img
                alt={googleDisplayName || 'User'}
                className="w-full h-full object-cover"
                src={googleAvatarUrl}
                referrerPolicy="no-referrer"
              />
            ) : (
              <User className="w-5 h-5 text-[#727972]" />
            )}
          </div>

          <h1
            onClick={onBack}
            className="text-xl md:text-2xl font-bold text-[#163422] tracking-tight cursor-pointer"
          >
            SorghumCare
          </h1>

          <button
            onClick={onOpenSearch}
            className="w-10 h-10 flex items-center justify-center text-[#163422] hover:opacity-80 transition-opacity active:scale-95 duration-150 rounded-full hover:bg-[#e2e3e1]"
            title="Cari Resep"
            aria-label="Cari Resep"
          >
            <span className="material-symbols-outlined text-[24px]">search</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="pt-[72px] pb-[40px] md:pt-[88px] px-4 md:px-8 max-w-5xl mx-auto space-y-6">
        {/* Back Navigation (Contextual) */}
        <div
          id="btn-back-to-recipes"
          onClick={onBack}
          className="flex items-center space-x-2 pt-3 text-[#424843] hover:text-[#163422] transition-colors cursor-pointer w-fit group"
        >
          <span className="material-symbols-outlined text-xl group-hover:-translate-x-1 transition-transform">
            arrow_back
          </span>
          <span className="text-sm font-semibold">Back to Recipes</span>
        </div>

        {/* Recipe Hero Section */}
        <section className="space-y-4">
          {imagesEnabled ? (
          <div className="relative w-full h-64 md:h-96 rounded-2xl overflow-hidden shadow-[0px_4px_12px_rgba(45,75,55,0.08)] border border-[rgba(45,75,55,0.1)]">
            <img
              data-food
              alt={recipe.title}
              className="w-full h-full object-cover"
              src={recipeImageUrl}
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.target as HTMLImageElement).src = GLOBAL_FALLBACK_FOOD_IMAGE;
              }}
            />

            {/* Overlay Nutritional Badges */}
            <div className="absolute bottom-4 left-4 flex flex-wrap gap-2">
              <div className="bg-[#2d4b37]/90 text-[#99baa1] px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 backdrop-blur-sm shadow-xs">
                <span className="material-symbols-outlined text-[14px]">eco</span>
                <span>High Fiber</span>
              </div>
              <div className="bg-[#fdc65c]/90 text-[#745200] px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 backdrop-blur-sm shadow-xs">
                <span className="material-symbols-outlined text-[14px]">bolt</span>
                <span>Sustained Energy</span>
              </div>
              <div className="bg-[#163422]/90 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 backdrop-blur-sm shadow-xs">
                <Sparkles className="w-3.5 h-3.5 text-[#fdc65c]" />
                <span>Bebas Gluten</span>
              </div>
            </div>
          </div>
          ) : (
          /* Varian tanpa gambar: badge nutrisi inline */
          <div className="flex flex-wrap gap-2">
            <div className="bg-[#2d4b37] text-[#99baa1] px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 shadow-xs">
              <span className="material-symbols-outlined text-[14px]">eco</span>
              <span>High Fiber</span>
            </div>
            <div className="bg-[#fdc65c] text-[#745200] px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 shadow-xs">
              <span className="material-symbols-outlined text-[14px]">bolt</span>
              <span>Sustained Energy</span>
            </div>
            <div className="bg-[#163422] text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 shadow-xs">
              <Sparkles className="w-3.5 h-3.5 text-[#fdc65c]" />
              <span>Bebas Gluten</span>
            </div>
          </div>
          )}

          <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 pt-1">
            <div className="max-w-2xl">
              <h1 className="text-2xl md:text-3xl lg:text-[32px] font-bold text-[#1a1c1b] leading-tight">
                {recipe.title}
              </h1>
              <p className="text-sm md:text-base text-[#424843] mt-1.5 leading-relaxed">
                {recipe.subtitle || 'A hearty, modern twist on a classic comfort dish, swapping white rice for nutrient-dense whole grain sorghum.'}
              </p>
            </div>

            <div className="flex items-center gap-3 text-[#424843] text-sm font-semibold flex-shrink-0">
              <div className="flex items-center gap-1 bg-[#f4f4f2] px-3 py-1.5 rounded-xl border border-[#e2e3e1]">
                <span className="material-symbols-outlined text-base text-[#163422]">schedule</span>
                <span>{recipe.prepTimeMinutes + recipe.cookTimeMinutes} min</span>
              </div>
              <div className="flex items-center gap-1 bg-[#f4f4f2] px-3 py-1.5 rounded-xl border border-[#e2e3e1]">
                <span className="material-symbols-outlined text-base text-[#163422]">restaurant</span>
                <span>{currentServings} Servings</span>
              </div>
              {/* Tombol simpan (koleksi pribadi) */}
              <button
                id="btn-favorite-recipe"
                onClick={handleFavoriteClick}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-semibold transition-all shadow-[0px_4px_12px_rgba(45,75,55,0.08)] cursor-pointer active:scale-95 ${
                  favoriteState
                    ? 'bg-[#163422] text-[#fdc65c] border-[#163422]'
                    : 'bg-[#f4f4f2] text-[#424843] border-[#e2e3e1] hover:border-[#163422]/40'
                }`}
                title={favoriteState ? 'Hapus dari koleksi' : 'Simpan ke koleksi'}
                aria-label="Simpan ke koleksi"
              >
                <Bookmark
                  className="w-4 h-4"
                  fill={favoriteState ? '#fdc65c' : 'none'}
                />
                <span>{favoriteState ? 'Tersimpan' : 'Simpan'}</span>
              </button>
              {/* Tombol suka (apresiasi publik) */}
              <button
                onClick={handleLikeClick}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-semibold transition-all shadow-[0px_4px_12px_rgba(45,75,55,0.08)] cursor-pointer active:scale-95 ${
                  liked
                    ? 'bg-rose-50 text-rose-600 border-rose-200'
                    : 'bg-[#f4f4f2] text-[#424843] border-[#e2e3e1] hover:border-rose-300'
                }`}
                title={liked ? 'Batalkan suka' : 'Suka resep ini'}
                aria-label="Suka resep ini"
              >
                <Heart
                  className="w-4 h-4"
                  fill={liked ? 'currentColor' : 'none'}
                />
                <span>{likeCount}</span>
              </button>
              {/* Rating publik: tampil agregat + beri bintang */}
              <div
                className="flex items-center gap-1 bg-[#f4f4f2] px-3 py-1.5 rounded-xl border border-[#e2e3e1]"
                title={reviewsCount > 0 ? `${reviewsCount} ulasan` : 'Belum ada ulasan'}
              >
                <span className="text-sm font-bold text-amber-600">
                  {ratingAvg != null ? ratingAvg.toFixed(1) : '–'}
                </span>
                <div className="flex items-center">
                  {[1, 2, 3, 4, 5].map((s) => {
                    // Bintang terisi mengikuti pilihan pengguna ini sendiri;
                    // kalau belum pernah menilai, pakai rata-rata publik.
                    const filled = myRating != null ? s <= myRating : ratingAvg != null && s <= Math.round(ratingAvg);
                    return (
                    <button
                      key={s}
                      onClick={() => handleRate(s)}
                      title={`Beri ${s} bintang`}
                      aria-label={`Beri ${s} bintang`}
                      aria-pressed={myRating === s}
                      className="cursor-pointer active:scale-90 transition-transform"
                    >
                      <Star
                        className={`w-3.5 h-3.5 ${
                          filled
                            ? 'fill-amber-500 text-amber-500'
                            : 'text-[#c2c8c0] hover:text-amber-400'
                        }`}
                      />
                    </button>
                    );
                  })}
                </div>
                {reviewsCount > 0 ? (
                  <span className="text-[11px] text-[#727972]">({reviewsCount})</span>
                ) : myRating != null ? (
                  <span className="text-[11px] text-[#727972]">ulasan Anda</span>
                ) : null}
              </div>
              {/* Badge jumlah komentar -> scroll ke seksi komentar */}
              <button
                type="button"
                onClick={() => commentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="flex items-center gap-1 bg-[#f4f4f2] px-3 py-1.5 rounded-xl border border-[#e2e3e1] text-sm font-semibold text-[#424843] hover:border-[#163422]/40 transition-colors cursor-pointer"
                title={`${commentCount} komentar`}
                aria-label="Lihat komentar"
              >
                <MessageCircle className="w-4 h-4 text-[#163422]" />
                <span>{commentCount}</span>
              </button>

              <button
                id="btn-share-slug-link"
                onClick={handleCopyLink}
                className="w-10 h-10 rounded-full bg-[#e8e8e6] text-[#424843] hover:bg-[#163422] hover:text-white flex items-center justify-center transition-all shadow-[0px_4px_12px_rgba(45,75,55,0.08)] cursor-pointer active:scale-95"
                title="Salin Tautan Slug Resep"
                aria-label="Salin Tautan Resep"
              >
                {copiedLink ? <Check className="w-5 h-5 text-emerald-600" /> : <Share2 className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Slug URL Bar with Copy Action */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 px-3.5 bg-[#f4f4f2] border border-[#e2e3e1] rounded-xl text-xs text-[#424843]">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#727972] bg-[#e2e3e1] px-1.5 py-0.5 rounded">
                SLUG URL
              </span>
              <code className="text-[#163422] font-mono text-[11px] sm:text-xs truncate max-w-xs sm:max-w-md">
                /recipe/{recipeSlug}
              </code>
            </div>

            <button
              onClick={handleCopyLink}
              className="flex items-center gap-1.5 font-bold text-[11px] sm:text-xs text-[#163422] hover:text-[#2d4b37] bg-white border border-[#c2c8c0]/70 hover:border-[#163422] px-2.5 py-1 rounded-lg transition-colors cursor-pointer active:scale-95"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Tersalin!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Salin Link</span>
                </>
              )}
            </button>
          </div>
        </section>

        {/* Quick Guided Cook Mode Callout Bar */}
        <div className="bg-gradient-to-r from-[#163422] to-[#2d4b37] text-white p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center text-[#fdc65c] flex-shrink-0">
              <ChefHat className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Mode Panduan Memasak Interaktif</h3>
              <p className="text-xs text-[#adcfb4]">Langkah demi langkah dengan timer memasak &amp; panduan suara.</p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleSpeakInstructions}
              className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-colors cursor-pointer"
              title="Dengarkan seluruh langkah"
            >
              <Volume2 className="w-4 h-4" />
            </button>
            <button
              id="btn-start-cook-mode"
              onClick={() => onOpenCookMode(recipe)}
              className="flex-1 sm:flex-none py-2.5 px-5 bg-[#fdc65c] text-[#163422] hover:bg-[#f4be55] rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current text-[#163422]" />
              <span>Mulai Memasak</span>
            </button>
          </div>
        </div>

        {/* Nutrition & Ingredients Grid */}
        <section className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Nutrition Facts Card (Bento Style) */}
          <div className="md:col-span-5 bg-white rounded-2xl p-5 md:p-6 shadow-[0px_4px_12px_rgba(45,75,55,0.08)] border border-[rgba(45,75,55,0.1)] flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-[#1a1c1b]">Nutrition Facts</h3>
                                <span className="text-[11px] font-bold text-[#7c5800] bg-[#fdc65c]/25 px-2.5 py-0.5 rounded-full">
                                  {recipe.tags && recipe.tags.length ? recipe.tags[0] : 'Superfood'}
                                </span>
              </div>

              {/* Macro Rings */}
              <div className="grid grid-cols-3 gap-2 mb-5 text-center">
                {/* Carbs */}
                <div className="flex flex-col items-center">
                  <div className="relative w-16 h-16 flex items-center justify-center rounded-full border-4 border-[#e2e3e1]">
                    <svg className="absolute top-0 left-0 w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                      <path
                        className="text-[#f4be55]"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="currentColor"
                        strokeDasharray={`${carbsPct}, 100`}
                        strokeWidth="4"
                      />
                    </svg>
                    <span className="text-sm font-semibold text-[#1a1c1b]">{carbs}g</span>
                  </div>
                  <span className="text-xs text-[#424843] mt-1 font-medium">Carbs</span>
                </div>

                {/* Protein */}
                <div className="flex flex-col items-center">
                  <div className="relative w-16 h-16 flex items-center justify-center rounded-full border-4 border-[#e2e3e1]">
                    <svg className="absolute top-0 left-0 w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                      <path
                        className="text-[#afcfa9]"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="currentColor"
                        strokeDasharray={`${proteinPct}, 100`}
                        strokeWidth="4"
                      />
                    </svg>
                    <span className="text-sm font-semibold text-[#1a1c1b]">{protein}g</span>
                  </div>
                  <span className="text-xs text-[#424843] mt-1 font-medium">Protein</span>
                </div>

                {/* Fat */}
                <div className="flex flex-col items-center">
                  <div className="relative w-16 h-16 flex items-center justify-center rounded-full border-4 border-[#e2e3e1]">
                    <svg className="absolute top-0 left-0 w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                      <path
                        className="text-[#adcfb4]"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="currentColor"
                        strokeDasharray={`${fatPct}, 100`}
                        strokeWidth="4"
                      />
                    </svg>
                    <span className="text-sm font-semibold text-[#1a1c1b]">{fat}g</span>
                  </div>
                  <span className="text-xs text-[#424843] mt-1 font-medium">Fat</span>
                </div>
              </div>

              {/* Micro Details */}
              <div className="space-y-1 text-sm">
                <div className="flex justify-between py-2 border-b border-[rgba(45,75,55,0.05)]">
                  <span className="text-[#424843]">Calories</span>
                  <span className="font-semibold text-[#1a1c1b]">{calories} kcal</span>
                </div>
                <div className="flex justify-between py-2 border-b border-[rgba(45,75,55,0.05)]">
                  <span className="text-[#424843]">Dietary Fiber</span>
                  <span className="font-semibold text-[#1a1c1b]">{fiber}g</span>
                </div>
                <div className="flex justify-between py-2 border-b border-[rgba(45,75,55,0.05)]">
                  <span className="text-[#424843]">Glycemic Index</span>
                  <span className="font-semibold text-[#1a1c1b]">
                    {nh.glycemicIndex || 'Rendah (Low GI)'}
                  </span>
                </div>
              </div>
            </div>

            {/* Info Callout Box */}
            <div className="mt-2 bg-[#f4f4f2] p-3 rounded-xl flex items-start gap-2 text-xs text-[#424843] border border-[#e2e3e1]">
              <span className="material-symbols-outlined text-[#163422] text-[20px] flex-shrink-0">
                info
              </span>
              <p>
                {nh.glycemicIndex
                  ? `Sorghum-based meals typically carry a ${nh.glycemicIndex.toLowerCase()} glycemic index, supporting stable blood sugar levels.`
                  : 'Sorghum provides a lower glycemic index compared to white rice, supporting stable blood sugar levels.'}
              </p>
            </div>
          </div>

          {/* Ingredients List */}
          <div className="md:col-span-7 bg-white rounded-2xl p-5 md:p-6 shadow-[0px_4px_12px_rgba(45,75,55,0.08)] border border-[rgba(45,75,55,0.1)] flex flex-col justify-between">
            <div>
              <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-base sm:text-lg font-bold text-[#1a1c1b]">Ingredients</h3>
                  {/* Tab toggle */}
                  <div className="flex items-center bg-[#163422] rounded-full border border-[#e2e3e1] overflow-hidden">
                    <button className="px-2.5 py-0.5 text-[11px] font-bold text-white">
                      Takaran
                    </button>
                  </div>
                </div>
                
                {/* Servings Multiplier Switcher */}
                <div className="flex items-center gap-1 bg-[#f4f4f2] p-1 rounded-xl border border-[#e2e3e1]">
                  <span className="text-[11px] text-[#727972] font-semibold pl-1.5 pr-0.5">Porsi:</span>
                  {[1, 2, 3, 4].map((mult) => (
                    <button
                      key={mult}
                      onClick={() => setServingsMultiplier(mult)}
                      className={`w-7 h-6 sm:w-8 sm:h-7 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center ${
                        servingsMultiplier === mult
                          ? 'bg-[#163422] text-white shadow-xs'
                          : 'text-[#424843] hover:bg-[#e2e3e1]'
                      }`}
                      title={`${mult}x Porsi`}
                    >
                      {mult}
                    </button>
                  ))}
                </div>
              </div>

              {/* Takaran view: name + amount */}
              <ul className="space-y-1">
                {recipe.ingredients.map((ing, idx) => {
                  const isChecked = checkedIngredients.includes(idx);
                  return (
                    <li
                      key={idx}
                      onClick={() => toggleIngredientCheck(idx)}
                      className={`flex items-center justify-between py-2.5 px-2.5 rounded-xl border-b border-[rgba(45,75,55,0.05)] hover:bg-[#f9f9f7] cursor-pointer transition-colors ${
                        isChecked ? 'opacity-40 line-through' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {imagesEnabled && (
                        <div className="w-11 h-11 bg-[#e8e8e6] rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0 border border-[#e2e3e1]">
                          <img
                            data-food
                            alt={ing.name}
                            className="w-full h-full object-cover"
                            src={ingredientImages[idx] || GLOBAL_FALLBACK_FOOD_IMAGE}
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = GLOBAL_FALLBACK_FOOD_IMAGE;
                            }}
                          />
                        </div>
                        )}

                        <div>
                          <p className="text-sm font-semibold text-[#1a1c1b]">{ing.name}</p>
                        </div>
                      </div>

                      {ing.amount && (
                        <span className="text-xs font-semibold text-[#727972] whitespace-nowrap bg-[#f9f9f7] px-2 py-0.5 rounded-md">
                          {scaleAmount(ing.amount, servingsMultiplier)}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

          </div>
        </section>

        {/* Instructions Section */}
        <section className="bg-white rounded-2xl p-5 md:p-6 shadow-[0px_4px_12px_rgba(45,75,55,0.08)] border border-[rgba(45,75,55,0.1)] space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-[#1a1c1b]">Instructions</h3>
            <span className="text-xs font-semibold text-[#727972]">
              {recipe.steps.length} Langkah Memasak
            </span>
          </div>

          <div className="space-y-6">
            {recipe.steps.map((step, idx) => (
              <div key={idx} className="flex gap-4 items-start">
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-xs ${
                    idx === 0
                      ? 'bg-[#2d4b37] text-[#99baa1]'
                      : 'bg-[#e2e3e1] text-[#1a1c1b]'
                  }`}
                >
                  {step.stepNumber}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm sm:text-base font-semibold text-[#1a1c1b]">
                      {step.title}
                    </h4>
                    {step.timerMinutes && step.timerMinutes > 0 ? (
                                          <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-mono font-bold text-[#7c5800] bg-[#fdc65c]/25 px-2 py-0.5 rounded-full flex-shrink-0">
                                            <Clock className="w-3.5 h-3.5 text-[#7c5800]" />
                                            {step.timerMinutes} Menit
                                          </span>
                                        ) : step.timerMinutes === 0 ? (
                                          <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-bold text-[#163422] bg-[#cbebc3]/60 px-2 py-0.5 rounded-full flex-shrink-0">
                                            <Check className="w-3.5 h-3.5 text-[#163422]" />
                                            Sajikan
                                          </span>
                                        ) : null}
                  </div>
                  <p className="text-xs sm:text-sm text-[#424843] leading-relaxed">
                    {step.instruction}
                  </p>
                  {step.tip && (
                    <div className="mt-1.5 p-2 bg-[#fdc65c]/10 rounded-lg text-xs text-[#5e4200] border border-[#fdc65c]/30">
                      <strong>Tips:</strong> {step.tip}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Bottom CTA within instructions */}
                    <div className="pt-4 border-t border-[#e2e3e1] flex justify-end">
                      <button
                        onClick={() => onOpenCookMode(recipe)}
                        className="py-3 px-6 bg-[#163422] text-white hover:bg-[#2d4b37] rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 shadow-md transition-all active:scale-95 cursor-pointer"
                      >
                        <Play className="w-4 h-4 fill-current text-[#fdc65c]" />
                        <span>Buka Panduan Langkah Interaktif (Cook Mode)</span>
                      </button>
                    </div>
                  </section>

        {/* Comments Section */}
        <div ref={commentsRef} className="scroll-mt-20">
        <CommentSection
          recipeId={recipe.id}
          recipeSlug={recipe.slug}
          isGoogleUser={isGoogleUser}
          displayName={googleDisplayName || 'Guest'}
          avatarUrl={googleAvatarUrl || null}
          onCountChange={setCommentCount}
        />
        </div>

                </main>
              </div>
            );
          };

