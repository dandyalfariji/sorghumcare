import React, { useState, useEffect } from 'react';
import { 
  ChevronRight, 
  PersonStanding, 
  Bell, 
  Globe, 
  LogOut, 
  Check, 
  X, 
  Sparkles,
  Edit3,
  User,
  ChefHat,
  Search
} from 'lucide-react';
import { Recipe, SavedRecipe } from '../../types';
import { RecipeInfoCard } from './RecipeInfoCard';

interface ProfilePageProps {
  onOpenSearch: () => void;
  onViewRecipe: (recipe: Recipe) => void;
  onNavigateToEducation?: () => void;
  onExploreRecipes?: () => void;
  onGenerateRecipe?: () => void;
  initialList?: 'saved' | 'posted' | null;
  onListChange?: (list: 'saved' | 'posted' | null) => void;
  savedRecipes?: SavedRecipe[]; // from Supabase (App data layer)
  userName?: string;
  /** Status / bio singkat dari profiles.bio */
  userBio?: string | null;
  onSaveProfile?: (name: string, bio: string) => void;
  onLogout?: () => void;
  onRemoveSaved?: (recipe: Recipe) => void;
  // Google Auth
  isGoogleUser?: boolean;
  googleDisplayName?: string;
  googleAvatarUrl?: string | null;
  onSignInWithGoogle?: () => Promise<void>;
  onGoogleSignOut?: () => Promise<void>;
  // Dynamic stats
  dayStreak?: number;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({
  onOpenSearch,
  onViewRecipe,
  onExploreRecipes,
  onGenerateRecipe,
  initialList = null,
  onListChange,
  savedRecipes = [],
  userName: userNameProp = 'Guest',
  userBio: userBioProp = '',
  onSaveProfile,
  onLogout,
  onRemoveSaved,
  isGoogleUser = false,
  googleDisplayName,
  googleAvatarUrl,
  onSignInWithGoogle,
  onGoogleSignOut,
  dayStreak = 0,
}) => {
  const [googleSigningIn, setGoogleSigningIn] = useState(false);

  // State for interactive features
  const [userName, setUserName] = useState(userNameProp);
  const [userBio, setUserBio] = useState(userBioProp || '');
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [editNameInput, setEditNameInput] = useState(userName);
  const [editBioInput, setEditBioInput] = useState(userBio);
  
  const [appLanguage, setAppLanguage] = useState<'English' | 'Bahasa Indonesia'>(() => {
    try {
      const saved = localStorage.getItem('bima_app_language');
      return saved === 'Bahasa Indonesia' ? 'Bahasa Indonesia' : 'English';
    } catch {
      return 'English';
    }
  });
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showToast, setShowToast] = useState<string | null>(null);
  // Jumlah resep yang diposting user
  const [postedCount, setPostedCount] = useState(0);
  const [postedRecipes, setPostedRecipes] = useState<Recipe[]>([]);
  // Count komentar & save (like) per resep milik user
  const [commentCountMap, setCommentCountMap] = useState<Record<string, number>>({});
  const [saveCountMap, setSaveCountMap] = useState<Record<string, number>>({});
  // Halaman daftar penuh: null = profil, 'saved' | 'posted' = daftar
  const [openList, setOpenList] = useState<'saved' | 'posted' | null>(initialList);
  // Filter daftar: kata kunci + urutan
  const [listSearch, setListSearch] = useState('');
  const [listSort, setListSort] = useState<'newest' | 'az'>('newest');
  useEffect(() => {
    setOpenList(initialList);
    setListSearch('');
  }, [initialList]);
  const goList = (list: 'saved' | 'posted' | null) => {
    if (onListChange) onListChange(list);
    else setOpenList(list);
  };
  useEffect(() => {
    import('../../lib/supabase').then((m) => {
      m.fetchUserRecipeCount().then(setPostedCount);
      m.fetchUserRecipes().then(async (recipes) => {
        setPostedRecipes(recipes);
        const ids = recipes.map((r) => r.id).filter(Boolean);
        if (ids.length === 0) return;
        try {
          const counts = await m.fetchRecipeEngagement(ids);
          setCommentCountMap(counts.comments);
          setSaveCountMap(counts.saves);
        } catch {
          // abaikan — kartu tetap tampil tanpa angka
        }
      });
    });
  }, []);

  // Count komentar & save untuk resep tersimpan
  const savedIds = savedRecipes.map((s) => s.recipe.id).filter(Boolean).join(',');
  useEffect(() => {
    if (!savedIds) return;
    import('../../lib/supabase').then(async (m) => {
      try {
        const counts = await m.fetchRecipeEngagement(savedIds.split(','));
        setCommentCountMap((prev) => ({ ...prev, ...counts.comments }));
        setSaveCountMap((prev) => ({ ...prev, ...counts.saves }));
      } catch {
        // abaikan — kartu tetap tampil tanpa angka
      }
    });
  }, [savedIds]);

  useEffect(() => {
    setUserName(userNameProp);
    setUserBio(userBioProp || '');
    setEditNameInput(userNameProp);
    setEditBioInput(userBioProp || '');
  }, [userNameProp, userBioProp]);

  const triggerToast = (msg: string) => {
    setShowToast(msg);
    setTimeout(() => setShowToast(null), 3000);
  };

  /**
   * Terapkan pilihan bahasa aplikasi.
   *
   * Sebelumnya tombol bahasa hanya mengubah state lokal + memunculkan toast,
   * tanpa efek apa pun dan tanpa tersimpan — jadi pilihannya hilang saat reload
   * (dan judul di kartu profil ikut kembali ke 'English'). Sekarang pilihan
   * disimpan ke localStorage dan atribut `<html lang>` diperbarui supaya
   * pemilihan bahasa benar-benar berlaku untuk dokumen.
   */
  const applyAppLanguage = (lang: 'English' | 'Bahasa Indonesia') => {
    setAppLanguage(lang);
    const code = lang === 'Bahasa Indonesia' ? 'id' : 'en';
    try {
      localStorage.setItem('bima_app_language', lang);
    } catch {
      /* abaikan (mode privat) */
    }
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('lang', code);
    }
    triggerToast(lang === 'Bahasa Indonesia' ? 'Bahasa diubah ke Bahasa Indonesia' : 'Language switched to English');
  };

  const handleSavePersonalInfo = () => {
    setUserName(editNameInput);
    setUserBio(editBioInput);
    setIsEditingInfo(false);
    if (onSaveProfile) onSaveProfile(editNameInput, editBioInput);
    triggerToast('Profil berhasil diperbarui!');
  };

  const handleRecipeClick = (recipe: Recipe) => {
    onViewRecipe(recipe);
  };

  // Render halaman daftar penuh saat badge diklik
  if (openList) {
    const isSaved = openList === 'saved';
    const title = isSaved ? 'Resep Tersimpan' : 'Resep yang Diposting';
    const emptyText = isSaved
      ? 'Belum ada resep tersimpan. Ketuk "Simpan Resep" pada kartu resep untuk menyimpan favorit Anda.'
      : 'Belum ada resep yang diposting. Buat resep lewat generator AI untuk mulai berbagi.';
    const q = listSearch.trim().toLowerCase();
    const matchQ = (t: string, tags: string[] = []) =>
      !q || t.toLowerCase().includes(q) || tags.some((tg) => tg.toLowerCase().includes(q));
    const sortFn = (a: string, b: string) =>
      listSort === 'az' ? a.localeCompare(b, 'id') : 0;
    const shownSaved = savedRecipes
      .filter((s) => matchQ(s.recipe.title, s.recipe.tags))
      .sort((a, b) => sortFn(a.recipe.title, b.recipe.title));
    const shownPosted = postedRecipes
      .filter((r) => matchQ(r.title, r.tags))
      .sort((a, b) => sortFn(a.title, b.title));
    return (
      <div className="bg-[#f9f9f7] text-[#1a1c1b] font-['Manrope',sans-serif] antialiased min-h-screen pb-28 pt-16">
        <header className="fixed top-0 w-full z-40 bg-[#f9f9f7]/95 backdrop-blur-md shadow-xs flex items-center gap-3 px-5 py-3 border-b border-[#e2e3e1]/70">
          <button
            type="button"
            onClick={() => goList(null)}
            className="w-9 h-9 rounded-xl bg-white border border-[#c2c8c0] text-[#424843] hover:border-[#163422]/40 hover:text-[#163422] flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Kembali ke profil"
          >
            <ChevronRight className="w-5 h-5 rotate-180" />
          </button>
          <h1 className="text-base font-bold text-[#163422] tracking-tight">{title}</h1>
        </header>
        <main className="px-5 md:px-10 max-w-4xl mx-auto pt-5 space-y-4">
          {/* Filter: cari + urutan */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#727972] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                placeholder="Cari judul atau tag..."
                className="w-full pl-9 pr-3 py-2 border border-[#c2c8c0] rounded-xl text-xs sm:text-sm bg-white focus:outline-none focus:border-[#163422] placeholder:text-[#a8a8a3]"
              />
            </div>
            <select
              value={listSort}
              onChange={(e) => setListSort(e.target.value as 'newest' | 'az')}
              className="px-3 py-2 border border-[#c2c8c0] rounded-xl text-xs font-bold bg-white text-[#424843] focus:outline-none focus:border-[#163422] cursor-pointer"
              aria-label="Urutkan"
            >
              <option value="newest">Terbaru</option>
              <option value="az">A–Z</option>
            </select>
          </div>
          {isSaved ? (
            shownSaved.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-[#c2c8c0] p-8 text-center space-y-3">
                <span className="material-symbols-outlined text-3xl text-[#c2c8c0]">bookmark</span>
                <p className="text-xs text-[#727972]">{emptyText}</p>
                {onExploreRecipes && (
                  <button
                    type="button"
                    onClick={onExploreRecipes}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#163422] text-white text-xs font-bold hover:bg-[#2d4b37] transition-colors cursor-pointer"
                  >
                    Jelajahi Resep
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {shownSaved.map((saved) => (
                  <RecipeInfoCard
                    key={saved.id}
                    recipe={saved.recipe}
                    saveCount={saveCountMap[saved.recipe.id] ?? 1}
                    commentCount={commentCountMap[saved.recipe.id]}
                    onClick={() => handleRecipeClick(saved.recipe)}
                    onRemoveSaved={onRemoveSaved ? () => onRemoveSaved(saved.recipe) : undefined}
                  />
                ))}
              </div>
            )
          ) : shownPosted.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-[#c2c8c0] p-8 text-center space-y-3">
              <ChefHat className="w-8 h-8 text-[#c2c8c0] mx-auto" />
              <p className="text-xs text-[#727972]">{emptyText}</p>
              {onGenerateRecipe && (
                <button
                  type="button"
                  onClick={onGenerateRecipe}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#163422] text-white text-xs font-bold hover:bg-[#2d4b37] transition-colors cursor-pointer"
                >
                  Buat Resep
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {shownPosted.map((recipe) => (
                <RecipeInfoCard
                  key={recipe.id}
                  recipe={recipe}
                  saveCount={saveCountMap[recipe.id]}
                  commentCount={commentCountMap[recipe.id]}
                  onClick={() => handleRecipeClick(recipe)}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="bg-[#f9f9f7] text-[#1a1c1b] font-['Manrope',sans-serif] antialiased min-h-screen pb-28 pt-16">
      {/* Toast Notification */}
      {showToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[#163422] text-white px-5 py-2.5 rounded-full shadow-lg text-xs font-semibold flex items-center gap-2 animate-bounce">
          <Sparkles className="w-4 h-4 text-[#fdc65c]" />
          <span>{showToast}</span>
        </div>
      )}

      {/* TopAppBar */}
      <header className="fixed top-0 w-full z-40 bg-[#f9f9f7]/95 backdrop-blur-md shadow-xs flex items-center justify-between px-5 py-3 border-b border-[#e2e3e1]/70">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full overflow-hidden border border-[#c2c8c0]/40 flex items-center justify-center bg-[#e2e3e1]">
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
          <span className="text-xl font-bold text-[#163422] tracking-tight">SorghumCare</span>
        </div>
        <button
          onClick={onOpenSearch}
          className="w-10 h-10 flex items-center justify-center rounded-full text-[#163422] hover:bg-[#e2e3e1] transition-colors active:scale-95 duration-150 cursor-pointer"
          title="Cari Resep"
          aria-label="Cari Resep"
        >
          <Search className="w-5 h-5" />
        </button>
      </header>

      <main className="px-5 md:px-10 max-w-4xl mx-auto space-y-6">
        {/* Profile Header */}
        <section className="flex flex-col items-center text-center mt-6">
          <div className="relative group">
            <div className="w-24 h-24 rounded-full overflow-hidden mb-3 border border-[#2d4b37]/20 shadow-[0_4px_16px_rgba(45,75,55,0.12)] flex items-center justify-center bg-[#e2e3e1]">
              {isGoogleUser && googleAvatarUrl ? (
                <img
                  alt={googleDisplayName || 'User'}
                  className="w-full h-full object-cover"
                  src={googleAvatarUrl}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <User className="w-12 h-12 text-[#727972]" />
              )}
            </div>
            <button
              onClick={() => {
                setEditNameInput(userName);
                setEditBioInput(userBio);
                setIsEditingInfo(true);
              }}
              className="absolute bottom-3 right-0 bg-[#163422] text-white p-1.5 rounded-full shadow-md hover:bg-[#2d4b37] transition-all"
              title="Edit Profil"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          </div>

          <h1 className="text-2xl md:text-3xl font-bold text-[#163422] tracking-tight">
            {userName || googleDisplayName || 'Guest'}
          </h1>
          <p className="text-sm text-[#424843] mt-1 max-w-xs mx-auto">
            {userBio || (isGoogleUser ? 'Google Account' : 'Guest Mode')}
          </p>
          
          <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
            {isGoogleUser ? (
              <>
                <span className="bg-[#cbebc3] text-[#324d30] px-3 py-1 rounded-full text-xs font-semibold tracking-wide">
                  Google Connected
                </span>
                <button
                  onClick={() => {
                    setEditNameInput(userName);
                    setEditBioInput(userBio);
                    setIsEditingInfo(true);
                  }}
                  className="bg-[#163422] text-white px-3 py-1 rounded-full text-xs font-bold hover:bg-[#2d4b37] flex items-center gap-1 transition-all shadow-xs cursor-pointer"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>Edit Profil</span>
                </button>
              </>
            ) : (
              <>
                {/* Edit profil juga tersedia untuk pengguna tamu (anonim),
                    supaya nama/bio bisa diisi tanpa login Google. */}
                <button
                  onClick={() => {
                    setEditNameInput(userName);
                    setEditBioInput(userBio);
                    setIsEditingInfo(true);
                  }}
                  className="bg-[#163422] text-white px-3 py-1 rounded-full text-xs font-bold hover:bg-[#2d4b37] flex items-center gap-1 transition-all shadow-xs cursor-pointer"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>Edit Profil</span>
                </button>
                {/* Sign in with Google button */}
                <button
                  onClick={async () => {
                    if (!onSignInWithGoogle) return;
                    setGoogleSigningIn(true);
                    try {
                      await onSignInWithGoogle();
                    } catch {
                      setGoogleSigningIn(false);
                    }
                  }}
                  disabled={googleSigningIn}
                  className="flex items-center gap-2 bg-white border border-[#c2c8c0] hover:border-[#163422]/30 hover:shadow-md px-4 py-2 rounded-full text-xs font-bold text-[#1a1c1b] transition-all cursor-pointer disabled:opacity-60"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  <span>{googleSigningIn ? 'Menghubungkan...' : 'Masuk dengan Google'}</span>
                </button>
                <span className="bg-[#fdc65c] text-[#745200] px-3 py-1 rounded-full text-xs font-semibold tracking-wide">
                  Guest Mode
                </span>
              </>
            )}
          </div>
        </section>

        {/* Stats Section */}
        <section className="grid grid-cols-3 gap-2 bg-white rounded-2xl p-4 shadow-[0_4px_12px_rgba(45,75,55,0.06)] border border-[#2d4b37]/10">
          <button
            type="button"
            onClick={() => goList('saved')}
            className="flex flex-col items-center p-2 text-center cursor-pointer hover:bg-[#f4f4f2] rounded-xl transition-colors"
            aria-label="Lihat resep tersimpan"
          >
            <span className="text-2xl font-bold text-[#163422]">{savedRecipes.length}</span>
            <span className="text-xs text-[#424843] mt-1 font-medium">Saved Recipes</span>
          </button>
          <button
            type="button"
            onClick={() => goList('posted')}
            className="flex flex-col items-center p-2 text-center border-l border-r border-[#c2c8c0]/30 cursor-pointer hover:bg-[#f4f4f2] rounded-xl transition-colors"
            aria-label="Lihat resep yang diposting"
          >
            <span className="text-2xl font-bold text-[#163422] flex items-center gap-1">
              <ChefHat className="w-5 h-5 text-[#7c5800]" />
              {postedCount}
            </span>
            <span className="text-xs text-[#424843] mt-1 font-medium">Resep Diposting</span>
          </button>
          <div className="flex flex-col items-center p-2 text-center">
            <span className="text-2xl font-bold text-[#163422]">{dayStreak}</span>
            <span className="text-xs text-[#424843] mt-1 font-medium">Day Streak</span>
          </div>
        </section>

        {/* Saved Recipes (preview) */}
        <section className="space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-[#1a1c1b] tracking-tight">
              Recent Saved Recipes
            </h2>
          </div>
          {savedRecipes.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-[#c2c8c0] p-8 text-center space-y-2">
              <span className="material-symbols-outlined text-3xl text-[#c2c8c0]">bookmark</span>
              <p className="text-xs text-[#727972]">
                Belum ada resep tersimpan. Ketuk "Simpan Resep" pada kartu resep untuk menyimpan favorit Anda.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {savedRecipes.slice(0, 3).map((saved) => (
                  <RecipeInfoCard
                    key={saved.id}
                    recipe={saved.recipe}
                    saveCount={saveCountMap[saved.recipe.id] ?? 1}
                    commentCount={commentCountMap[saved.recipe.id]}
                    onClick={() => handleRecipeClick(saved.recipe)}
                    onRemoveSaved={onRemoveSaved ? () => onRemoveSaved(saved.recipe) : undefined}
                  />
                ))}
              </div>
              {savedRecipes.length > 3 && (
                <button
                  type="button"
                  onClick={() => goList('saved')}
                  className="w-full py-2.5 rounded-xl border border-[#c2c8c0] text-xs font-bold text-[#163422] hover:bg-[#f4f4f2] transition-colors cursor-pointer"
                >
                  Show More ({savedRecipes.length - 3} lainnya)
                </button>
              )}
            </>
          )}
        </section>

        {/* Account Settings */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-[#1a1c1b] tracking-tight">Account</h2>
          <div className="bg-white rounded-2xl border border-[#2d4b37]/10 shadow-[0_4px_12px_rgba(45,75,55,0.06)] divide-y divide-[#c2c8c0]/20 overflow-hidden">
            {/* App Language */}
            <button
              onClick={() => setShowLanguageModal(true)}
              className="w-full flex items-center justify-between p-4 hover:bg-[#f4f4f2] transition-colors text-left group"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[#424843] group-hover:text-[#163422] transition-colors">
                  language
                </span>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-[#1a1c1b]">App Language</span>
                  <span className="text-xs text-[#727972]">{appLanguage}</span>
                </div>
              </div>
              <span className="material-symbols-outlined text-[#424843]">chevron_right</span>
            </button>

            {/* Log Out */}
            <button
              onClick={() => {
                if (isGoogleUser && onGoogleSignOut) {
                  setShowLogoutConfirm(true);
                } else {
                  setShowLogoutConfirm(true);
                }
              }}
              className="w-full flex items-center justify-between p-4 hover:bg-[#ffdad6]/20 transition-colors text-left group"
            >
              <div className="flex items-center gap-3 text-[#ba1a1a]">
                <span className="material-symbols-outlined">logout</span>
                <span className="text-sm font-semibold">
                  {isGoogleUser ? 'Keluar dari Google' : 'Log Out'}
                </span>
              </div>
            </button>
          </div>
        </section>

        {/* Spacing for bottom nav */}
        <div className="h-8"></div>
      </main>

      {/* Edit Personal Info Modal */}
      {isEditingInfo && (
        <div className="fixed inset-0 z-50 bg-[#1a1c1b]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg text-[#163422]">Edit Informasi Profil</h3>
              <button
                onClick={() => setIsEditingInfo(false)}
                className="w-8 h-8 rounded-full bg-[#f4f4f2] flex items-center justify-center text-[#424843] hover:bg-[#e2e3e1]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#424843] mb-1">Nama Lengkap</label>
                <input
                  type="text"
                  value={editNameInput}
                  onChange={(e) => setEditNameInput(e.target.value)}
                  className="w-full px-3 py-2 border border-[#c2c8c0] rounded-xl text-sm focus:outline-none focus:border-[#163422]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#424843] mb-1">Status / Bio Singkat</label>
                <input
                  type="text"
                  value={editBioInput}
                  onChange={(e) => setEditBioInput(e.target.value)}
                  className="w-full px-3 py-2 border border-[#c2c8c0] rounded-xl text-sm focus:outline-none focus:border-[#163422]"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setIsEditingInfo(false)}
                className="flex-1 py-2.5 rounded-xl border border-[#c2c8c0] text-xs font-bold text-[#424843] hover:bg-[#f4f4f2]"
              >
                Batal
              </button>
              <button
                onClick={handleSavePersonalInfo}
                className="flex-1 py-2.5 rounded-xl bg-[#163422] text-white text-xs font-bold hover:bg-[#2d4b37] shadow-sm"
              >
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Language Switch Modal */}
      {showLanguageModal && (
        <div className="fixed inset-0 z-50 bg-[#1a1c1b]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-base text-[#163422]">Pilih Bahasa Aplikasi</h3>
              <button
                onClick={() => setShowLanguageModal(false)}
                className="w-7 h-7 rounded-full bg-[#f4f4f2] flex items-center justify-center text-[#424843]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {(['English', 'Bahasa Indonesia'] as const).map((lang) => (
                <button
                  key={lang}
                  onClick={() => {
                    applyAppLanguage(lang);
                    setShowLanguageModal(false);
                  }}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-bold transition-all ${
                    appLanguage === lang
                      ? 'bg-[#163422]/5 border-[#163422] text-[#163422]'
                      : 'border-[#e2e3e1] text-[#424843] hover:bg-[#f4f4f2]'
                  }`}
                >
                  <span>{lang}</span>
                  {appLanguage === lang && <Check className="w-4 h-4 text-[#163422]" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirmation */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 bg-[#1a1c1b]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 space-y-3 shadow-2xl text-center">
            <div className="w-12 h-12 rounded-full bg-[#ffdad6] text-[#ba1a1a] flex items-center justify-center mx-auto">
              <LogOut className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-base text-[#1a1c1b]">Keluar Akun?</h3>
            <p className="text-xs text-[#727972]">
              Sesi Anda akan diakhiri. Data resep dan preferensi tersimpan di perangkat ini.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-[#c2c8c0] text-xs font-bold text-[#424843]"
              >
                Batal
              </button>
              <button
                onClick={async () => {
                  setShowLogoutConfirm(false);
                  if (isGoogleUser && onGoogleSignOut) {
                    await onGoogleSignOut();
                  } else if (onLogout) {
                    onLogout();
                  }
                  triggerToast('Berhasil keluar dari akun');
                }}
                className="flex-1 py-2.5 rounded-xl bg-[#ba1a1a] text-white text-xs font-bold hover:bg-rose-700"
              >
                Ya, Keluar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
