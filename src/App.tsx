import React, { useState, useEffect } from 'react';
import { 
  TargetConsumerId, 
  DishCategoryId, 
  WizardFormData, 
  ChatMessage, 
  Recipe, 
  SavedRecipe,
  AiRefusalResponse,
  RecipeSuggestion
} from './types';
import { 
  INITIAL_FEATURED_RECIPE, 
  INITIAL_SAVED_RECIPES, 
  RECENT_CHAT_TOPICS 
} from './data/mockData';
import { VideoTutorialItem } from './data/homeData';
import { generateRecipeFromWizard, generateRecipeFromWizardAsync, generateCustomRecipeQueryAsync, buildRecipeFromSuggestion, buildLocalSuggestions, inferDishCategoryFromText } from './services/recipeGenerator';
import { 
  getCurrentPath, 
  parseRoute, 
  navigateToSlug, 
  RouteSlugs 
} from './utils/slugRouter';
import { 
  findRecipeBySlug, 
  findTutorialBySlug, 
  getRecipeSlug, 
  CATEGORY_SLUG_MAP, 
  SLUG_TO_CATEGORY_MAP 
} from './utils/slugify';

import { HomePage } from './components/Home/HomePage';
import { ExploreRecipesPage } from './components/Explore/ExploreRecipesPage';
import { ProfilePage } from './components/Profile/ProfilePage';
import { LearnPage } from './components/Learn/LearnPage';
import { BottomNavBar, AppTab } from './components/Navigation/BottomNavBar';

import { AdminGuard } from './components/Admin/AdminGuard';
import { AdminLayout } from './components/Admin/AdminLayout';
import { AdminDashboard } from './components/Admin/AdminDashboard';
import { AdminComments } from './components/Admin/AdminComments';
import { AdminReports } from './components/Admin/AdminReports';
import { AdminRecipes } from './components/Admin/AdminRecipes';
import { AdminSettings } from './components/Admin/AdminSettings';

import { WizardProgressBar } from './components/Wizard/WizardProgressBar';
import { WizardStep1 } from './components/Wizard/WizardStep1';
import { WizardStep2 } from './components/Wizard/WizardStep2';
import { WizardStep3 } from './components/Wizard/WizardStep3';
import { WizardStep4 } from './components/Wizard/WizardStep4';

import { Sidebar } from './components/Sidebar/Sidebar';
import { RecipeCardView } from './components/Chat/RecipeCardView';
import { ChatInputBar } from './components/Chat/ChatInputBar';
import { RecipeSuggestionButtons } from './components/Chat/RecipeSuggestionButtons';
import MarkdownText from './components/Chat/MarkdownText';

import { CookModeModal } from './components/Modals/CookModeModal';
import { RecipeDetailPage } from './components/RecipeDetail/RecipeDetailPage';
import { VideoTutorialModal } from './components/Modals/VideoTutorialModal';
import { SearchModal } from './components/Modals/SearchModal';
import { useData } from './lib/dataContext';
import { useAuth } from './lib/AuthProvider';
import { upsertRecipe, fetchRecipeBySlug, fetchSavedRecipeIds, createChatSession, saveChatMessages, fetchChatSessions, fetchChatSessionMessages, renameChatSession, touchChatSession, mapRecipe, deleteChatSession, fetchSessionRecipeIds, deleteOwnedRecipe, getAdminConfigValue } from './lib/supabase';
import type { DbChatMessageRow } from './lib/supabase';
import { bimaChat, isAiUnavailableError, type BimaChatMessage } from './services/bimaClient';
import { preflightPrompt, type PreflightResult } from './services/preflight';
import { PreflightWarningModal } from './components/Modals/PreflightWarningModal';

import { Menu, Sparkles, Plus, ArrowLeft } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function App() {
  // Supabase data layer (catalog from DB + saved recipes per anonymous user)
  const { 
    ready, 
    recipes: dbRecipes, 
    savedRecipes: dbSavedRecipes, 
    savedIds, 
    toggleSave, 
    isSavedForRecipe, 
    generateAndSave, 
    publishRecipe: publishRecipeCtx,
    removeGeneratedRecipe: removeGeneratedRecipeCtx,
    refetchSaved, 
    getRecipeBySlug: dbGetRecipeBySlug,
    getRecipeById: dbGetRecipeById,
    recipesByCategory: dbRecipesByCategory,
    setImagesEnabled: setImagesEnabledCtx,
  } = useData();

  // Google Auth state
  const {
    isGoogleUser,
    displayName,
    profileName,
    profileBio,
    avatarUrl: googleAvatarUrl,
    signInWithGoogle,
    signOut: googleSignOut,
    refreshProfile,
  } = useAuth();
  // Nama tampilan yang dipakai seluruh halaman (Home, Profile, Sidebar, Detail
  // Resep). Berasal dari profiles.full_name (hasil "Edit Profil"), fallback ke
  // nama Google, lalu 'Guest' — bukan lagi selalu 'Guest'.
  const googleDisplayName = displayName;

  // Dynamic user stats (Day Streak)
  const [userStats, setUserStats] = useState({ dayStreak: 0 });
  useEffect(() => {
    if (!ready) return;
    import('./lib/supabase').then((m) => {
      m.fetchUserStats().then((s) => setUserStats({ dayStreak: s.dayStreak }));
    });
  }, [isGoogleUser, ready]); // refetch when auth state or data ready changes

  // Load admin feature flags (main_feature_enabled, images_enabled)
  useEffect(() => {
    if (!ready) return;
    const loadAdminConfig = async () => {
      const [mainFeature, images] = await Promise.all([
        getAdminConfigValue('main_feature_enabled'),
        getAdminConfigValue('images_enabled'),
      ]);
      // toBool inline: treat truthy-ish as enabled
      const toBool = (v: unknown, fallback: boolean) => {
        if (v === null || v === undefined) return fallback;
        if (typeof v === 'boolean') return v;
        if (typeof v === 'number') return v !== 0;
        if (typeof v === 'string') {
          const n = v.trim().toLowerCase();
          return !['false', '0', 'tidak', 'off', 'nonaktif'].includes(n);
        }
        return fallback;
      };
      setMainFeatureEnabled(toBool(mainFeature, true));
      const imgOn = toBool(images, true);
      setImagesEnabled(imgOn);
      setImagesEnabledCtx(imgOn);
      // Simpan untuk hard refresh berikutnya + sinkron atribut di <html>
      // (dipasang inline di index.html sebelum bundle dimuat).
      try {
        localStorage.setItem('bima_images_enabled', imgOn ? '1' : '0');
        if (imgOn) document.documentElement.removeAttribute('data-images-disabled');
        else document.documentElement.setAttribute('data-images-disabled', 'true');
      } catch {
        /* abaikan */
      }
    };
    loadAdminConfig();
  }, [ready, getAdminConfigValue]);

  // Navigation: 'home' is the primary home page requested by user
  const [currentTab, setCurrentTab] = useState<AppTab>('home');
  const [generatorMode, setGeneratorMode] = useState<'wizard' | 'chat'>('wizard');
  const [wizardStep, setWizardStep] = useState<number>(1);
  // Tab asal saat wizard dibuka — tombol kembali di step 1 pulang ke sini
  const [wizardOriginTab, setWizardOriginTab] = useState<AppTab>('generate');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );
  const [exploreCategoryKey, setExploreCategoryKey] = useState<string>('all');
  const [learnRoute, setLearnRoute] = useState<{ section?: string; itemId?: string }>({});

  // Admin feature flags (from admin_configs payload)
  const [mainFeatureEnabled, setMainFeatureEnabled] = useState<boolean>(true);
  // Initial dari localStorage agar hard refresh dalam mode no-image
  // langsung sembunyi (nilai final disinkron dari DB di bawah).
  const [imagesEnabled, setImagesEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('bima_images_enabled') !== '0';
    } catch {
      return true;
    }
  });
  const [adminSection, setAdminSection] = useState<string>('dashboard');
  const [profileList, setProfileList] = useState<'saved' | 'posted' | null>(null);

  const { role: authRole, isAdmin: isAdminUser } = useAuth();

  // Preflight (pre-generation sanity check) state
  const [preflight, setPreflight] = useState<{
    result: PreflightResult;
    prompt: string;
  } | null>(null);

  // Dynamic & saved recipes
  const [dynamicRecipes, setDynamicRecipes] = useState<Recipe[]>([]);
  // Saved recipes now come from Supabase (per anonymous user)
  const savedRecipes: SavedRecipe[] = dbSavedRecipes;
  const [activeChatId, setActiveChatId] = useState<string>('chat-4');
  // Chat sessions loaded from Supabase (anonymous user's history)
  const [chatSessions, setChatSessions] = useState<{ id: string; title: string; created_at?: string }[]>([]);
  // DB id of the currently-open chat session (null = fresh unsaved conversation)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  // Sync mirror so async persist doesn't double-create sessions on rapid sends.
  const currentSessionIdRef = React.useRef<string | null>(null);
  const setSessionIdBoth = (id: string | null) => {
      currentSessionIdRef.current = id;
      setCurrentSessionId(id);
    };

    // Convert persisted chat_messages rows into the same shape used by the UI.
    const rowsToChatMessages = (rows: DbChatMessageRow[]): ChatMessage[] =>
      rows.map((row) => {
        const timestamp = row.created_at
          ? new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : '';
        if (row.sender === 'user') return { id: `msg-${row.id}`, sender: 'user', text: row.content || '', timestamp };
        if (row.recipe && (row as any)._recipeWithChildren) {
          return { id: `msg-${row.id}`, sender: 'ai', recipe: (row as any)._recipeWithChildren, timestamp };
        }
        if (row.recipe && (row.recipe as unknown as Recipe)?.title) {
          return { id: `msg-${row.id}`, sender: 'ai', recipe: mapRecipe(row.recipe as any), timestamp };
        }
        return { id: `msg-${row.id}`, sender: 'ai', text: row.content || '', timestamp };
      });

  // Load chat sessions from DB once user is ready
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    fetchChatSessions().then(async (sessions) => {
      if (!alive) return;
      if (!sessions.length) return;
      const mapped = sessions.map((s) => ({ id: s.id, title: s.title, created_at: s.created_at }));
      setChatSessions(mapped);
      // 🔧 Jangan auto-open session lama — start fresh on every refresh
    });
    return () => { alive = false; };
  }, [ready]);

  // Wizard Form State
  const [wizardData, setWizardData] = useState<WizardFormData>({
    targetConsumers: ['anak_sd'],
    dishCategory: 'makanan_berat',
    selectedIngredientIds: ['biji_sorgum'],
    customIngredients: [],
    prepTimeLimit: 'Maks 30 Menit',
  });
  
  // Initial messages — start clean; the hero/empty-state shows when empty.
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [dynamicPrompts, setDynamicPrompts] = useState<string[]>([]);

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [typingStatusText, setTypingStatusText] = useState<string>('Sedang menulis langkah memasak...');

  // Modals state
  const [cookModeRecipe, setCookModeRecipe] = useState<Recipe | null>(null);
  const [selectedRecipeDetail, setSelectedRecipeDetail] = useState<Recipe | null>(null);
  const [selectedVideoTutorial, setSelectedVideoTutorial] = useState<VideoTutorialItem | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);

  // Sync state from URL slug on mount and popstate/hashchange
  useEffect(() => {
    const handleUrlChange = () => {
      const rawPath = getCurrentPath();
      const parsed = parseRoute(rawPath);

      // Admin route — set adminSection dari URL, render AdminLayout di JSX
      if (parsed.routeType === 'admin') {
        setAdminSection(parsed.slug || 'dashboard');
        return;
      }

      // Blokir generator (wizard/chat) jika fitur utama dimatikan oleh admin
      if (
        !mainFeatureEnabled &&
        (parsed.routeType === 'generate' || parsed.routeType === 'wizard')
      ) {
        setCurrentTab('home');
        setGeneratorMode('chat');
        navigateToSlug(RouteSlugs.home());
        return;
      }

      if (parsed.routeType === 'recipe' && parsed.slug) {
        const found =
          findRecipeBySlug(parsed.slug, dynamicRecipes) || dbGetRecipeBySlug(parsed.slug);
        if (found) {
          setSelectedRecipeDetail(found);
          setCookModeRecipe(null);
          setSelectedVideoTutorial(null);
          setIsSearchOpen(false);
          return;
        } else {
          // Fallback: fetch by slug from Supabase (deep-link before catalog loaded)
          fetchRecipeBySlug(parsed.slug).then((r) => {
            if (r) {
              setSelectedRecipeDetail(r);
              setCookModeRecipe(null);
              setSelectedVideoTutorial(null);
              setIsSearchOpen(false);
            }
          });
          return;
        }
      }

      if (parsed.routeType === 'cook' && parsed.slug) {
        const found =
          findRecipeBySlug(parsed.slug, dynamicRecipes) || dbGetRecipeBySlug(parsed.slug);
        if (found) {
          setCookModeRecipe(found);
          setSelectedVideoTutorial(null);
          setIsSearchOpen(false);
          return;
        } else {
          fetchRecipeBySlug(parsed.slug).then((r) => {
            if (r) {
              setCookModeRecipe(r);
              setSelectedVideoTutorial(null);
              setIsSearchOpen(false);
            }
          });
          return;
        }
      }

      if (parsed.routeType === 'tutorial' && parsed.slug) {
        const found = findTutorialBySlug(parsed.slug);
        if (found) {
          setSelectedVideoTutorial(found);
          setIsSearchOpen(false);
          return;
        }
      }

      if (parsed.routeType === 'search') {
        setIsSearchOpen(true);
        return;
      }

      // Close modal overlays if route is a standard page
      setSelectedRecipeDetail(null);
      setCookModeRecipe(null);
      setSelectedVideoTutorial(null);
      setIsSearchOpen(false);

      if (parsed.routeType === 'wizard') {
        setCurrentTab('generate');
        setGeneratorMode('wizard');
        setWizardStep(parsed.wizardStep || 1);
      } else if (parsed.routeType === 'generate') {
        setCurrentTab('generate');
        setGeneratorMode('chat');
      } else if (parsed.routeType === 'explore') {
        setCurrentTab('explore');
        if (parsed.categoryFilter) {
          setExploreCategoryKey(parsed.categoryFilter);
        }
      } else if (parsed.routeType === 'belajar') {
        setCurrentTab('belajar');
        setLearnRoute({ section: parsed.slug, itemId: parsed.subSlug });
      } else if (parsed.routeType === 'profile') {
        setCurrentTab('profile');
        setProfileList(parsed.slug === 'saved' || parsed.slug === 'posted' ? parsed.slug : null);
      } else {
        setCurrentTab('home');
      }
    };

    handleUrlChange();
    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);

    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
    };
  }, [dynamicRecipes, dbRecipes, dbGetRecipeBySlug, ready]);

  // Tab Selection with Slug Update
  const handleSelectTab = (tab: AppTab) => {
    // Jangan biarkan state detail resep menelan navigasi tab. Dulu `handleViewRecipe`
    // menyetel `selectedRecipeDetail`, dan handler yang menutupnya memakai nilai
    // state yang sudah basi — akibatnya memilih tab (mis. dari sidebar di tab
    // Generate) memindahkan URL tapi layarnya tetap menampilkan tab lama.
    setSelectedRecipeDetail(null);
    setCookModeRecipe(null);
    setSelectedVideoTutorial(null);
    setIsSearchOpen(false);

    // Blokir tab Generate jika fitur utama dimatikan oleh admin
    if (tab === 'generate' && !mainFeatureEnabled) {
      setCurrentTab('home');
      navigateToSlug(RouteSlugs.home());
      return;
    }

    setCurrentTab(tab);

    if (tab === 'generate') {
      setGeneratorMode('chat');
      navigateToSlug(RouteSlugs.generate());
    } else if (tab === 'explore') {
      navigateToSlug(RouteSlugs.explore());
    } else if (tab === 'belajar') {
      navigateToSlug(RouteSlugs.belajar());
    } else if (tab === 'profile') {
      navigateToSlug(RouteSlugs.profile());
    } else {
      navigateToSlug(RouteSlugs.home());
    }
  };

  // Recipe View Navigation
  const handleViewRecipe = (recipe: Recipe) => {
    // Ingat tab asal agar tombol back kembali ke halaman yang benar,
    // termasuk setelah hard refresh (sessionStorage bertahan saat reload).
    try {
      sessionStorage.setItem('recipeReturnTab', currentTab);
    } catch {
      /* abaikan */
    }
    setSelectedRecipeDetail(recipe);
    setCookModeRecipe(null);
    setSelectedVideoTutorial(null);
    setIsSearchOpen(false);
    navigateToSlug(RouteSlugs.recipe(recipe));
  };

  /** Kembali dari detail resep ke tab asal (bukan selalu home). */
  const handleBackFromRecipe = () => {
    let tab: AppTab = currentTab;
    try {
      const saved = sessionStorage.getItem('recipeReturnTab');
      if (saved === 'home' || saved === 'generate' || saved === 'explore' || saved === 'profile') {
        tab = saved;
      }
    } catch {
      /* abaikan */
    }
    setSelectedRecipeDetail(null);
    // Jangan timpa tab jika user sudah pindah tab lain saat detail terbuka
    if (tab !== currentTab) setCurrentTab(tab);
    navigateToSlug(RouteSlugs[tab] ? RouteSlugs[tab]() : '/home');
  };

  // Cook Mode Navigation
  const handleOpenCookMode = (recipe: Recipe) => {
    setCookModeRecipe(recipe);
    navigateToSlug(RouteSlugs.cook(recipe));
  };

  const handleCloseCookMode = () => {
    setCookModeRecipe(null);
    if (selectedRecipeDetail) {
      navigateToSlug(RouteSlugs.recipe(selectedRecipeDetail));
    } else {
      navigateToSlug(RouteSlugs[currentTab] ? RouteSlugs[currentTab]() : '/home');
    }
  };

  // Tutorial Video Navigation
  const handleOpenTutorial = (tut: VideoTutorialItem) => {
    setSelectedVideoTutorial(tut);
    navigateToSlug(RouteSlugs.tutorial(tut));
  };

  const handleCloseTutorial = () => {
    setSelectedVideoTutorial(null);
    navigateToSlug(RouteSlugs[currentTab] ? RouteSlugs[currentTab]() : '/home');
  };

  // Search Navigation — modal ditutup SECARA EKSPLISIT sebelum URL berpindah.
  // Kalau urutannya dibalik (URL dulu, tutup belakangan), handler penutup membaca
  // `selectedRecipeDetail` yang masih basi dan menimpa URL resep dengan tab lama:
  // itulah kenapa memilih hasil pencarian selalu berakhir di Beranda.
  const handleOpenSearch = () => {
    setIsSearchOpen(true);
    navigateToSlug(RouteSlugs.search());
  };

  /** URL tab yang sedang aktif (dipakai saat modal ditutup). */
  const slugForTab = (tab: AppTab) => {
    if (tab === 'generate') return RouteSlugs.generate();
    if (tab === 'explore') return RouteSlugs.explore();
    if (tab === 'belajar') return RouteSlugs.belajar();
    if (tab === 'profile') return RouteSlugs.profile();
    return RouteSlugs.home();
  };

  const handleCloseSearch = () => {
    setIsSearchOpen(false);
    // `selectedRecipeDetail` di sini sudah nilai terbaru karena modal ditutup
    // sebelum handler pemilih resep mengubah state (lihat handleSelectSearchResult).
    if (selectedRecipeDetail) {
      navigateToSlug(RouteSlugs.recipe(selectedRecipeDetail));
    } else {
      navigateToSlug(slugForTab(currentTab));
    }
  };

  /** Pilih resep dari hasil pencarian: tutup modal dulu, baru pindah halaman.
   *  Urutan ini penting — kalau tidak, `handleViewRecipe` mengubah
   *  `selectedRecipeDetail` sementara efek route /search masih berjalan. */
  const handleSelectSearchResult = (recipe: Recipe) => {
    setIsSearchOpen(false);
    handleViewRecipe(recipe);
  };

  /** Enter di kolom pencarian: tutup modal dulu, baru kirim prompt ke AI. */
  const handleSearchQuery = (query: string) => {
    setIsSearchOpen(false);
    handleSendMessage(query);
  };

  // Wizard Step Navigation
  const handleSetWizardStep = (step: number) => {
    // Baru masuk wizard (bukan pindah step): catat asal halaman
    if (!(currentTab === 'generate' && generatorMode === 'wizard')) {
      setWizardOriginTab(currentTab);
    }
    setWizardStep(step);
    setGeneratorMode('wizard');
    setCurrentTab('generate');
    navigateToSlug(RouteSlugs.wizard(step));
  };

  // Wizard Handlers
  const handleToggleConsumer = (id: TargetConsumerId) => {
    setWizardData((prev) => {
      const exists = prev.targetConsumers.includes(id);
      const next = exists
        ? prev.targetConsumers.filter((c) => c !== id)
        : [...prev.targetConsumers, id];
      return { ...prev, targetConsumers: next };
    });
  };

  const handleToggleIngredient = (id: string) => {
    setWizardData((prev) => {
      const exists = prev.selectedIngredientIds.includes(id);
      const next = exists
        ? prev.selectedIngredientIds.filter((i) => i !== id)
        : [...prev.selectedIngredientIds, id];
      return { ...prev, selectedIngredientIds: next };
    });
  };

  const handleAddCustomIngredient = (name: string) => {
    setWizardData((prev) => ({
      ...prev,
      customIngredients: [...prev.customIngredients, name],
    }));
  };

  const handleRemoveCustomIngredient = (name: string) => {
    setWizardData((prev) => ({
      ...prev,
      customIngredients: prev.customIngredients.filter((c) => c !== name),
    }));
  };

  const handleGenerateFromWizard = async () => {
    setIsGenerating(true);
    setTypingStatusText('Sedang menganalisis kandungan nutrisi sorgum...');
    
    const userPromptText = `Rekomendasi resep ${wizardData.dishCategory.replace('_', ' ')}${
      wizardData.prepTimeLimit ? ` dengan waktu persiapan ${wizardData.prepTimeLimit.toLowerCase()}` : ''
    }`;

    try {
      const result = await generateRecipeFromWizardAsync(wizardData);

      // Check if AI returned a refusal (unpayload)
      const isRefusal = 'type' in result && (result as AiRefusalResponse).type === 'refusal';

      if (isRefusal) {
        // AI refused — show explanation text + suggestion buttons
        const refusal = result as AiRefusalResponse;
        const userMsg: ChatMessage = {
          id: `msg-user-${Date.now()}`,
          sender: 'user',
          text: userPromptText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        const aiMsg: ChatMessage = {
          id: `msg-ai-${Date.now()}`,
          sender: 'ai',
          text: refusal.message,
          refusalSuggestions: refusal.suggestions.length > 0 ? refusal.suggestions : undefined,
          refusalNoSuggestions: refusal.suggestions.length === 0,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setChatMessages([userMsg, aiMsg]);
        setGeneratorMode('chat');
        setCurrentTab('generate');
        navigateToSlug(RouteSlugs.generate());
        persistChatExchange(userPromptText, refusal.message, null);
        setIsGenerating(false);
        return;
      }

      // Normal recipe flow
      const newRecipe = result as Recipe;
      setDynamicRecipes((prev) => [newRecipe, ...prev]);
      generateAndSave(newRecipe).then((stored) => {
        if (stored && stored.slug) {
          setDynamicRecipes((prev) =>
            prev.map((r) => (r.id === newRecipe.id ? { ...r, id: stored.id, slug: stored.slug } : r))
          );
        }
      });

      const userMsg: ChatMessage = {
        id: `msg-user-${Date.now()}`,
        sender: 'user',
        text: userPromptText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      const aiMsg: ChatMessage = {
        id: `msg-ai-${Date.now()}`,
        sender: 'ai',
        recipe: newRecipe,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isTypingStep: true,
        typingText: 'Sedang menulis langkah memasak...',
      };

      setChatMessages([userMsg, aiMsg]);
      setGeneratorMode('chat');
      setCurrentTab('generate');
      navigateToSlug(RouteSlugs.generate());
      persistChatExchange(userPromptText, newRecipe.title, newRecipe);

      setTimeout(() => {
        setTypingStatusText('Menghitung estimasi rincian biaya bahan...');
      }, 900);

      setTimeout(() => {
        setIsGenerating(false);
        setChatMessages((prev) =>
          prev.map((m) => (m.id === aiMsg.id ? { ...m, isTypingStep: false } : m))
        );
        confetti({
          particleCount: 70,
          spread: 70,
          origin: { y: 0.7 },
          colors: ['#163422', '#f4be55', '#7c5800', '#afcfa9'],
        });
      }, 1800);
    } catch (err) {
      console.error('Generate recipe error:', err);
      const errorMsg: ChatMessage = {
        id: `msg-user-${Date.now()}`,
        sender: 'user',
        text: userPromptText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      const errorMsgText = typeof err === 'object' && err !== null && 'message' in err && typeof (err as any).message === 'string'
        ? (err as any).message
        : 'Maaf, terjadi kendala saat menghubungi AI. Coba lagi sebentar ya.';
      // AI tidak tersedia (timeout / kuota upstream / backend error). Pesan error asli
      // dipertahankan apa adanya, lalu user tetap diberi jalan keluar: saran resep lokal
      // (tanpa panggilan AI) agar wizard tidak pernah berakhir di jalan buntu.
      const fallbackSuggestions = buildLocalSuggestions(wizardData.dishCategory);
      const aiErrorMsg: ChatMessage = {
        id: `msg-ai-${Date.now()}`,
        sender: 'ai',
        text: fallbackSuggestions.length > 0
          ? `${errorMsgText}\n\nBerikut alternatif resep yang bisa Anda pilih sementara AI belum tersedia:`
          : errorMsgText,
        refusalSuggestions: fallbackSuggestions.length > 0 ? fallbackSuggestions : undefined,
        refusalNoSuggestions: fallbackSuggestions.length > 0 ? undefined : true,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setChatMessages([errorMsg, aiErrorMsg]);
      setGeneratorMode('chat');
      setCurrentTab('generate');
      navigateToSlug(RouteSlugs.generate());
      setIsGenerating(false);
    }
  };

  /** Handle when user clicks a recipe suggestion button after AI refusal.
   *  Builds the recipe directly from suggestion data — no AI call, guaranteed consistency. */
  const handleSelectSuggestion = (suggestion: RecipeSuggestion) => {
    const newRecipe = buildRecipeFromSuggestion(suggestion, wizardData);

    const userMsg: ChatMessage = {
      id: `msg-user-${Date.now()}`,
      sender: 'user',
      text: `Pilih: ${suggestion.title}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const aiMsg: ChatMessage = {
      id: `msg-ai-${Date.now()}`,
      sender: 'ai',
      recipe: newRecipe,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isTypingStep: false,
    };

    setDynamicRecipes((prev) => [newRecipe, ...prev]);
    generateAndSave(newRecipe).then((stored) => {
      if (stored && stored.slug) {
        setDynamicRecipes((prev) =>
          prev.map((r) => (r.id === newRecipe.id ? { ...r, id: stored.id, slug: stored.slug } : r))
        );
      }
    });

    setChatMessages((prev) => [...prev, userMsg, aiMsg]);
    persistChatExchange(`Pilih: ${suggestion.title}`, newRecipe.title, newRecipe);

    confetti({
      particleCount: 70,
      spread: 70,
      origin: { y: 0.7 },
      colors: ['#163422', '#f4be55', '#7c5800', '#afcfa9'],
    });
  };

  // Chat Handlers
  const handleSendMessage = async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // 🔧 PREFLIGHT AKTIF — deteksi bahan konflik sebelum kirim ke AI
      const pf = preflightPrompt(trimmed);
      if (!pf.ok && /(buatkan?|berikan?|carikan?|resep|masak|menu|hidangan|makanan)/i.test(trimmed)) {
        setPreflight({ result: pf, prompt: trimmed });
        return;
      }

    // 1) Optimistic user message — render immediately, no waiting on the LLM.
    const userMsg: ChatMessage = {
      id: `msg-user-${Date.now()}`,
      sender: 'user',
      text: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    const aiPlaceholderId = `msg-ai-${Date.now()}`;
    const aiPlaceholder: ChatMessage = {
      id: aiPlaceholderId,
      sender: 'ai',
      text: 'Sedang menyusun respons...',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isTypingStep: true,
      typingText: 'SorghumCare AI sedang berpikir...',
    };
    setChatMessages((prev) => [...prev, userMsg, aiPlaceholder]);
    setGeneratorMode('chat');
    setCurrentTab('generate');
    navigateToSlug(RouteSlugs.generate());
    setIsGenerating(true);

    // 2) Build conversation history (for multi-turn context on general chat).
    const history = chatMessages
      .filter((m) => m.text || m.recipe)
      .map((m) => ({
        role: (m.sender === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.text || m.recipe?.title || '',
      }))
      .filter((h) => h.content.trim());

    // 3) 🔧 DETEKSI INTENT: resep keyword → JSON recipe, lainnya → chat natural
        const recipeKeywords = /(buatkan?|bikinin?|carikan?\s*(resep|menu)|resep\b|masakkan?|masak\b|hidangkan?|olahan|kreasikan?)/i;
        const explicitRecipeOrder = recipeKeywords.test(trimmed);
        const isConversational = !explicitRecipeOrder;

    try {
      if (explicitRecipeOrder) {
        // Recipe flow: generate a structured recipe (with DB persistence).
        const newRecipe = await generateCustomRecipeQueryAsync(trimmed);

        // AI may refuse an illogical request. Render the full
        // explanation as a text answer instead of a broken recipe card.
        const refusal = !newRecipe.ingredients || newRecipe.ingredients.length === 0;
        if (refusal) {
          const msg =
            (newRecipe as any).aiRefusalText ||
            (newRecipe as any).aiWarnings?.[0]?.message ||
            newRecipe.subtitle ||
            'Kombinasi bahan tidak dapat dibuat menjadi resep.';
          setChatMessages((prev) =>
            prev.map((m) =>
              m.id === aiPlaceholderId ? { ...m, text: msg, recipe: undefined, isTypingStep: false } : m
            )
          );
          persistChatExchange(trimmed, msg, null);
        } else {
          setDynamicRecipes((prev) => [newRecipe, ...prev]);
          setChatMessages((prev) =>
            prev.map((m) =>
              m.id === aiPlaceholderId
                ? { ...m, recipe: newRecipe, text: undefined, isTypingStep: false }
                : m
            )
          );
          persistChatExchange(trimmed, newRecipe.title, newRecipe);
        }
      } else {
                    // General chat flow: free-form AI answer, no recipe card.
                    // Only add system instructions for longer messages (not "halo", "hi", dll)
                    const isShortGreeting = trimmed.length < 15 || /^(halo|hi|hey|hai|hello|selamat|apa kabar|test)/i.test(trimmed);
                    const systemInstructions = isShortGreeting
                      ? `\n\n[Di akhir jawaban, tulis 4 pertanyaan lanjutan singkat (masing-masing maks 6 kata) yang relevan. Format: mulai baris dengan ">>>" tanpa nomor, satu per baris. Contoh:\n>>> Apa itu sorgum\n>>> Manfaat sorgum untuk kesehatan]`
                      : `\n\n[Instruksi: Jika pertanyaan di atas ambigu, tidak jelas, atau kamu tidak yakin apa yang diminta, JANGAN menebak — tanyakan balik dengan sopan untuk klarifikasi.]\n\n[RULES: (1) Jawab dalam bahasa Indonesia yang natural. (2) Jawab HANYA apa yang ditanya, jangan melebar. (3) JANGAN membuat resep, tabel bahan, atau analisis formulasi produk KECUALI user secara eksplisit meminta "buatkan resep", "rancangkan resep", atau "formulasikan". (4) Untuk pertanyaan umum tentang sorgum, jawab dengan penjelasan informatif saja, bukan resep. (5) FORMAT: Gunakan markdown kaya — heading (#), tabel (|), list bernomor, **bold**, > blockquote. JANGAN tulis datar tanpa formatting. (6) JANGAN membuat diagram / bagan kotak dengan garis seni ASCII (┌─┐, │, └─┘). Gunakan list bernomor, bullet list, atau tabel Markdown standar.]\n\n[Di akhir jawaban, tulis 4 pertanyaan lanjutan singkat (masing-masing maks 6 kata) yang relevan dengan topik. Format: mulai baris dengan ">>>" tanpa nomor, satu per baris. Contoh:\n>>> Apa itu sorgum\n>>> Manfaat sorgum untuk kesehatan]`;
                    const chatHistory: BimaChatMessage[] = [
                      ...history,
                      { role: 'system', content: systemInstructions }
                    ];
                    let answer = await bimaChat(trimmed, chatHistory, { useRag: false }); // RAG dimatikan: terlalu lambat (169dtk) & memicu resep otomatis
                    let replyText = answer.response?.trim() || 'Maaf, saya belum bisa memproses permintaan itu.';
                    // 🔧 Hapus metadata backend reviewer (Catatan Verifikasi, Skor kelayakan)
                    replyText = replyText.replace(/\n*### Catatan Verifikasi[\s\S]*$/i, '').trim();
                    replyText = replyText.replace(/\n*_Skor kelayakan:[\s\S]*$/i, '').trim();
                    replyText = replyText.replace(/\n*Draf perlu disusun[\s\S]*$/i, '').trim();
                    // 🔧 Hapus artefak markdown (###, ---, ***, ___) dari SELURUH respons — baris yang hanya berisi artefak
                    replyText = replyText.split('\n').filter((l: string) => !/^\s*(?:#{1,6}|---+|\*\*\*+|_{3,})\s*$/.test(l.trim())).join('\n').trim();

                    // 🔧 Extract inspirasi dari >>> atau > lines di AKHIR respons
                    const allLines = replyText.split('\n');
                    const trailingQuotes: string[] = [];
                    for (let i = allLines.length - 1; i >= 0; i--) {
                      const stripped = allLines[i].trim();
                      if (/^>{1,3}\s+/.test(stripped)) {
                        trailingQuotes.unshift(stripped.replace(/^>*\s*/, '').trim());
                      } else if (stripped === '') {
                        continue; // skip blank lines between quotes
                      } else {
                        break; // stop at first non-quote, non-blank line
                      }
                    }
                    if (trailingQuotes.length >= 2) {
                      const prompts = trailingQuotes.filter((l) => l.length > 2 && l.length < 50);
                      if (prompts.length >= 2) {
                        setDynamicPrompts(prompts.slice(0, 4));
                        // Strip trailing quote block — take only lines before the quotes
                        replyText = allLines.slice(0, allLines.length - trailingQuotes.length).join('\n').trim();
                      }
                    }

                    // 🔁 Auto-continue: hanya aktif jika kalimat benar-benar terpotong di tengah kata/huruf
                    // (Bukan tabel '|', bukan kurung ')'/']', bukan format markdown, bukan list, dan bukan tanda baca)
                    const lastLineTrimmed = replyText.trimEnd().split('\n').pop()?.trim() || '';
                    const isTableOrMarkdownBlock = lastLineTrimmed.startsWith('|') || lastLineTrimmed.endsWith('|') || lastLineTrimmed.startsWith('#') || lastLineTrimmed.startsWith('>') || lastLineTrimmed.startsWith('-');
                    const cleanedForCheck = replyText.replace(/\n*#+\s*$/g, '').replace(/\n*(?:---+|\*\*\*+|_{3,})\s*$/g, '').trim();
                    const lastChar = cleanedForCheck.slice(-1);
                    const looksComplete = isTableOrMarkdownBlock || /[.!?"'»\u201D\u2019\u2033\u270E-\u2B55\p{Emoji_Presentation}\p{Extended_Pictographic}|\]):*_~`\-]/u.test(lastChar);

                    // Dengan max_tokens=32768 di backend, auto-continue hanya sebagai fallback darurat jika teks terputus di tengah kata
                    if (!looksComplete && replyText.length > 200 && !isTableOrMarkdownBlock) {
                      const MAX_CONTINUE = 2;
                      let continueCount = 0;
                      while (replyText && continueCount < MAX_CONTINUE) {
                        const contLast = replyText.trimEnd().slice(-1);
                        const contLooksComplete = /[.!?"'\p{Emoji_Presentation}\p{Extended_Pictographic}|\]):*_~`\-]/u.test(contLast);
                        if (contLooksComplete) break;
                        setChatMessages((prev) =>
                          prev.map((m) =>
                            m.id === aiPlaceholderId
                              ? { ...m, text: replyText, isTypingStep: true, typingText: 'Melanjutkan...' }
                              : m
                          )
                        );
                        const contHistory: BimaChatMessage[] = [
                          { role: 'user', content: trimmed },
                          { role: 'assistant', content: replyText.slice(-600) },
                        ];
                        const cont = await bimaChat('Kalimat terakhir terpotong. Selesaikan HANYA kalimat/paragraf yang terpotong. JANGAN tambahkan topik atau section baru. Tulis sesedikit mungkin.', contHistory, { useRag: false });
                        if (!cont.response?.trim()) break;
                        const contText = cont.response.trim();
                        const lastLines = replyText.split('\n').filter((l: string) => l.trim()).slice(-3);
                        let cleanCont = contText;
                        for (const ll of lastLines) {
                          if (cleanCont.startsWith(ll.trim())) {
                            cleanCont = cleanCont.slice(ll.trim().length).trim();
                          }
                        }
                        if (cleanCont) replyText += ' ' + cleanCont;
                        continueCount++;
                      }
                    }

              setChatMessages((prev) =>
                prev.map((m) =>
                  m.id === aiPlaceholderId
                    ? { ...m, text: replyText, isTypingStep: false }
                    : m
                )
              );
              // Persist the FULL reply so history playback is never truncated.
              persistChatExchange(trimmed, replyText, null);
            }
} catch (e) {
      console.error('chat error:', e);
      const eMsg = e instanceof Error ? e.message : (typeof e === 'object' && e !== null && 'message' in e && typeof (e as any).message === 'string' ? (e as any).message : 'Maaf, terjadi kendala saat menghubungi AI. Coba lagi sebentar ya.');
      // AI tidak tersedia (kuota upstream / timeout / backend error) pada permintaan resep:
      // pesan error asli tetap ditampilkan, lalu user diberi jalan keluar berupa saran resep
      // lokal (tanpa panggilan AI) supaya jalur chat tidak berakhir di jalan buntu.
      const chatFallbackSuggestions = explicitRecipeOrder && isAiUnavailableError(e)
        ? buildLocalSuggestions(inferDishCategoryFromText(trimmed))
        : [];
      setChatMessages((prev) =>
        prev.map((m) => {
          if (m.id !== aiPlaceholderId) return m;
          if (m.text && m.text.length > 100 && !m.isTypingStep) return m;
          return {
            ...m,
            text: chatFallbackSuggestions.length > 0
              ? `${eMsg}\n\nBerikut alternatif resep yang bisa Anda pilih sementara AI belum tersedia:`
              : eMsg,
            refusalSuggestions: chatFallbackSuggestions.length > 0 ? chatFallbackSuggestions : undefined,
            isTypingStep: false,
          };
        })
      );
    } finally {
      setIsGenerating(false);
    }
  };

  // Called when the user fixes the preflight warnings and proceeds.
  const handlePreflightProceed = (correctedPrompt: string) => {
    setPreflight(null);
    if (correctedPrompt.trim()) {
      handleSendMessage(correctedPrompt.trim());
    }
  };

  // Derive a concise, conversational session title from a user prompt.
  const deriveSessionTitle = (userText: string, recipe: Recipe | null): string => {
    // If we generated a recipe, use its dish name — reads like a topic, like GPT.
    if (recipe?.title) {
      return recipe.title.length > 60 ? recipe.title.slice(0, 57).trimEnd() + '…' : recipe.title;
    }
    // General chat: strip leading boilerplate ("tolong", "berikan saya", ...) and
    // keep the core ask. Fall back to truncated raw text if nothing else remains.
    const cleaned = userText
      .replace(/^(tolong|bantu|bisa|mohon|kak|bang|mas|bu|pak)?\s*(saya|aku)?\s*(mau|ingin|butuh)?\s*(berikan|carikan|buatkan|buatin|kasih|resepkan|tolong)\s+(saya|aku)?\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    const base = cleaned || userText;
    return base.length > 60 ? base.slice(0, 57).trimEnd() + '…' : base;
  };

  // Persist a chat exchange to Supabase (session + messages + optional recipe).
  const persistChatExchange = async (userText: string, aiText: string, recipe: Recipe | null) => {
    try {
      let sessionId = currentSessionIdRef.current;
      if (!sessionId) {
        // Fresh conversation: create a session, title = smart summary.
        const title = deriveSessionTitle(userText, recipe);
        const session = await createChatSession(title);
        if (!session) return;
        sessionId = session.id;
        setSessionIdBoth(session.id);
        setChatSessions((prev) => [{ id: session.id, title: session.title, created_at: session.created_at }, ...prev]);
        setActiveChatId(session.id);
      }
      let recipeId: string | null = null;
      if (recipe) {
        const stored = await generateAndSave(recipe);
        recipeId = stored?.id ?? null;
        // Session title = dish name (reads like a GPT/Gemini topic summary).
        const betterTitle = recipe.title.length > 60 ? recipe.title.slice(0, 57).trimEnd() + '…' : recipe.title;
        if (sessionId && betterTitle) {
          await renameChatSession(sessionId, betterTitle);
          setChatSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, title: betterTitle } : s)));
        }
      }
      await saveChatMessages(sessionId, [
        { sender: 'user', content: userText },
        { sender: 'ai', content: aiText, recipe_id: recipeId },
      ]);
      // Keep session ordering by most-recent-activity in Recent lists.
      await touchChatSession(sessionId);
    } catch (e) {
      console.error('persistChat error:', e);
    }
  };

  const handleToggleSaveRecipe = (recipe: Recipe) => {
    // Persist toggle to Supabase (insert/delete saved_recipes), then refetch
    toggleSave(recipe).then(() => {
      refetchSaved();
    });
    // Optimistic update is handled by context state change after refetch.
  };

  // Recipes currently being uploaded (publish-to-Explore) by their db/source id.
  const [publishingIds, setPublishingIds] = useState<Set<string>>(new Set());

  const handlePublishRecipe = async (recipe: Recipe) => {
    // Ensure the recipe row exists in DB (it may still carry a client-side id).
    const stored = recipe.id.startsWith('recipe-')
      ? await generateAndSave(recipe, { publish: true })
      : recipe;
    if (!stored?.id) return;
    setPublishingIds((prev) => new Set(prev).add(stored.id));
    try {
      const ok = await publishRecipeCtx(stored.id);
      if (ok) {
        // Update any in-memory copy so the button flips to "Di Explore".
        setChatMessages((prev) =>
          prev.map((m) =>
            m.recipe && (m.recipe.id === recipe.id || m.recipe.slug === recipe.slug)
              ? { ...m, recipe: { ...m.recipe, isPublished: true } }
              : m
          )
        );
        setDynamicRecipes((prev) =>
          prev.map((r) =>
            r.id === stored.id || r.slug === stored.slug ? { ...r, isPublished: true } : r
          )
        );
        // Refresh catalog so the recipe appears in Explore immediately.
        refetchSaved();
        generateAndSave({ ...stored, isPublished: true }, { publish: true });
      }
    } finally {
      setPublishingIds((prev) => {
        const next = new Set(prev);
        next.delete(stored.id);
        return next;
      });
    }
  };

  const handleDeleteRecentSession = async (sessionId: string) => {
    try {
      // Collect recipe ids inside this session first (before messages are gone).
      const recipeIds = await fetchSessionRecipeIds(sessionId);
      const ok = await deleteChatSession(sessionId);
      if (!ok) return;
      // Remove owned generated recipes referenced by the session.
      for (const rid of recipeIds) {
        await deleteOwnedRecipe(rid);
      }
      setChatSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (currentSessionIdRef.current === sessionId) {
        setSessionIdBoth(null);
        setChatMessages([]);
        setActiveChatId(`chat-${Date.now()}`);
      }
      refetchSaved();
    } catch (e) {
      console.error('delete recent session error:', e);
    }
  };

  const isRecipeSaved = (recipeId?: string, title?: string) => {
    if (recipeId && savedIds.has(recipeId)) return true;
    return savedRecipes.some(
      (s) => (recipeId && s.recipe.id === recipeId) || (title && s.recipe.title === title)
    );
  };

  // Is this recipe currently public (in Explore catalog)?
  const isRecipePublished = (recipe: Recipe): boolean => {
    if (recipe.isPublished) return true;
    return dbRecipes.some(
      (r) => r.slug === recipe.slug || r.id === recipe.id
    );
  };

  const handleSelectRecentChat = async (chatId: string) => {
      setActiveChatId(chatId);
      setGeneratorMode('chat');
      setCurrentTab('generate');

      // Only DB session ids (uuid) can be loaded back.
      if (chatId === 'chat-1' || chatId === 'chat-2' || chatId === 'chat-3' || chatId === 'chat-4') {
        // Legacy mock topics (no persisted session): keep the preset kit.
        handleSelectMockRecent(chatId);
        return;
      }

      setSessionIdBoth(chatId);
      const rows = await fetchChatSessionMessages(chatId);
      if (!rows.length) {
        setChatMessages([]);
        return;
      }
      setChatMessages(rowsToChatMessages(rows));
    };

    // Legacy mock chat presets (shown when no DB session exists yet).
    const handleSelectMockRecent = (chatId: string) => {
      if (chatId === 'chat-1') {
        const pRecipe = INITIAL_SAVED_RECIPES[0].recipe;
        setChatMessages([
          {
            id: `msg-pancake-user`,
            sender: 'user',
            text: 'Bagikan resep gluten-free pancake sorgum yang lembut untuk balita.',
            timestamp: '10:42 AM',
          },
          {
            id: `msg-pancake-ai`,
            sender: 'ai',
            recipe: pRecipe,
            timestamp: 'Kemarin',
          },
        ]);
      } else if (chatId === 'chat-2') {
        const bRecipe = INITIAL_SAVED_RECIPES[1].recipe;
        setChatMessages([
          {
            id: `msg-bread-user`,
            sender: 'user',
            text: 'Resep roti tawar sorgum tanpa tepung gandum untuk penderita diabetes.',
            timestamp: 'Kemarin',
          },
          {
            id: `msg-bread-ai`,
            sender: 'ai',
            recipe: bRecipe,
            timestamp: 'Kemarin',
          },
        ]);
      } else {
        setChatMessages([
          {
            id: 'msg-user-1',
            sender: 'user',
            text: 'Berikan saya resep nasi goreng sorgum untuk anak SD.',
            timestamp: '10:42 AM',
          },
          {
            id: 'msg-ai-1',
            sender: 'ai',
            recipe: INITIAL_FEATURED_RECIPE,
            timestamp: 'Baru saja',
          },
        ]);
      }
    };

  const startGeneratorWithCategory = (categoryKey: string) => {
    setWizardData((prev) => ({
      ...prev,
      dishCategory: categoryKey as DishCategoryId,
    }));
    handleSetWizardStep(1);
  };

  const isAdminRoute = parseRoute(getCurrentPath()).routeType === 'admin';

  return (
    <div className="min-h-screen bg-[#F9F9F7] text-[#1A1C1B] font-['Manrope',sans-serif] flex flex-col justify-between overflow-x-hidden" data-images-disabled={imagesEnabled ? undefined : 'true'}>
      {/* Admin Panel — hanya ditampilkan saat route /admin */}
      {isAdminRoute && (
        <AdminLayout active={adminSection}>
          <AdminGuard>
            {adminSection === 'dashboard' && <AdminDashboard />}
            {adminSection === 'komentar' && <AdminComments />}
            {adminSection === 'laporan' && <AdminReports />}
            {adminSection === 'resep' && <AdminRecipes />}
            {adminSection === 'pengaturan' && <AdminSettings />}
          </AdminGuard>
        </AdminLayout>
      )}
      {/* 1. MAIN CONTENT (FULL PAGE RECIPE DETAIL OR TABS) */}
      {selectedRecipeDetail ? (
        <RecipeDetailPage
          recipe={selectedRecipeDetail}
          isSaved={isRecipeSaved(selectedRecipeDetail.id, selectedRecipeDetail.title)}
          onBack={handleBackFromRecipe}
          onToggleSave={handleToggleSaveRecipe}
          onOpenCookMode={handleOpenCookMode}
          onOpenProfile={() => {
            setSelectedRecipeDetail(null);
            handleSelectTab('profile');
          }}
          onOpenSearch={handleOpenSearch}
          onNavigateTab={handleSelectTab}
          isGoogleUser={isGoogleUser}
          googleDisplayName={googleDisplayName}
          googleAvatarUrl={googleAvatarUrl}
        />
      ) : (
        <>
          {currentTab === 'home' && (
            <HomePage
              onOpenProfile={() => {
                setSelectedRecipeDetail(null);
                handleSelectTab('profile');
              }}
              onOpenSearch={handleOpenSearch}
              onSelectCategory={startGeneratorWithCategory}
              onViewRecipe={handleViewRecipe}
              onOpenVideoTutorial={handleOpenTutorial}
              onStartGenerator={() => {
                handleSetWizardStep(1);
              }}
              onOpenLearn={() => handleSelectTab('belajar')}
              isGoogleUser={isGoogleUser}
              googleDisplayName={googleDisplayName}
              googleAvatarUrl={googleAvatarUrl}
            />
          )}

          {currentTab === 'belajar' && (
            <LearnPage
              section={learnRoute.section}
              itemId={learnRoute.itemId}
              generatedRecipes={dynamicRecipes}
              generatorEnabled={mainFeatureEnabled}
              onNavigate={(section, itemId) => navigateToSlug(RouteSlugs.belajar(section, itemId))}
              onStartGenerator={() => handleSetWizardStep(1)}
              onOpenSearch={handleOpenSearch}
              />
          )}

          {currentTab === 'explore' && (
            <ExploreRecipesPage
              initialCategory={exploreCategoryKey}
              onSelectCategorySlug={(catKey) => {
                setExploreCategoryKey(catKey);
                navigateToSlug(RouteSlugs.explore(catKey));
              }}
              onViewRecipe={handleViewRecipe}
              onToggleSaveRecipe={handleToggleSaveRecipe}
              isRecipeSaved={isRecipeSaved}
              onStartGenerator={() => {
                handleSetWizardStep(1);
              }}
              recipesOverride={dbRecipes}
              onOpenSearch={handleOpenSearch}
              displayName={googleDisplayName}
              onOpenProfile={() => {
                setSelectedRecipeDetail(null);
                handleSelectTab('profile');
              }}
            />
          )}

          {currentTab === 'profile' && (
            <ProfilePage
              onOpenSearch={handleOpenSearch}
              onViewRecipe={handleViewRecipe}
              onExploreRecipes={() => handleSelectTab('explore')}
              onGenerateRecipe={() => handleSelectTab('generate')}
              initialList={profileList}
              onListChange={(list) => {
                setProfileList(list);
                navigateToSlug(list ? RouteSlugs.profileList(list) : RouteSlugs.profile());
              }}
              savedRecipes={savedRecipes}
              onRemoveSaved={(recipe) => {
                toggleSave(recipe).then(() => refetchSaved());
              }}
              // Nama dari profil DB. Tanpa ini, halaman Profil selalu
              // menampilkan "Guest" walaupun nama sudah tersimpan di DB —
              // inilah kenapa "edit profil belum sinkron".
              userName={googleDisplayName}
              userBio={profileBio}
              onSaveProfile={(name, bio) => {
                // Simpan nama + bio ke profiles, lalu muat ulang profil dari DB
                // supaya nama baru langsung terpakai di Home/Sidebar/Profil dan
                // tetap ada setelah refresh.
                import('./lib/supabase').then(async (m) => {
                  await m.updateProfile(name, bio);
                  await refreshProfile();
                });
              }}
              isGoogleUser={isGoogleUser}
              googleDisplayName={googleDisplayName}
              googleAvatarUrl={googleAvatarUrl}
              onSignInWithGoogle={signInWithGoogle}
              onGoogleSignOut={googleSignOut}
              dayStreak={userStats.dayStreak}
            />
          )}

          {currentTab === 'generate' && (
                                <div className="flex-1 flex flex-row h-screen w-full relative overflow-hidden">
                                  {/* Sidebar (left) — hidden completely when toggled off */}
                                  {generatorMode === 'chat' && isSidebarOpen && (
                                    <Sidebar
                            isOpen={isSidebarOpen}
                            onClose={() => setIsSidebarOpen(false)}
                  onNewRecipeChat={() => {
                                      // Reset to a fresh chat session in-place (stay in chat mode).
                                      setChatMessages([]);
                                      setSessionIdBoth(null);
                                      setActiveChatId(`chat-${Date.now()}`);
                                      setGeneratorMode('chat');
                                      setCurrentTab('generate');
                                      setIsGenerating(false);
                                      setIsSidebarOpen(false);
                                      navigateToSlug(RouteSlugs.generate());
                                    }}
                  recentChats={
                    chatSessions.length
                      ? chatSessions.map((s) => ({
                          id: s.id,
                          title: s.title,
                          time: s.created_at ? new Date(s.created_at).toLocaleDateString('id-ID') : undefined,
                        }))
                      : RECENT_CHAT_TOPICS
                  }
                  activeChatId={activeChatId}
                  onSelectChat={handleSelectRecentChat}
                  onDeleteChat={handleDeleteRecentSession}
                  savedRecipes={savedRecipes}
                                    onSelectSavedRecipe={(saved) => handleViewRecipe(saved.recipe)}
                                    onSeeAllRecipes={() => {
                                      setSelectedRecipeDetail(null);
                                      handleSelectTab('profile');
                                      setIsSidebarOpen(false);
                                    }}
                  onOpenProfile={() => {
                    setSelectedRecipeDetail(null);
                    handleSelectTab('profile');
                    setIsSidebarOpen(false);
                  }}
                  onStartWizard={() => {
                    handleSetWizardStep(1);
                  }}
                  onNavigateTab={handleSelectTab}
                  isGoogleUser={isGoogleUser}
                  googleDisplayName={googleDisplayName}
                  googleAvatarUrl={googleAvatarUrl}
                />
              )}

              {/* Generator Workspace: Wizard or Chat */}
                            <div className="flex-1 flex flex-col h-full w-full relative pb-6 overflow-y-auto">
                {generatorMode === 'wizard' ? (
                  /* Wizard Flow (4-Step) */
                  <main className="flex-1 flex flex-col justify-between py-3 sm:py-6">
                    <div className="w-full flex items-center justify-between px-4 max-w-md mx-auto">
                      <WizardProgressBar
                        currentStep={wizardStep}
                        totalSteps={4}
                        showStepText={wizardStep >= 3}
                        onBack={() => {
                          if (wizardStep > 1) {
                            handleSetWizardStep(wizardStep - 1);
                          } else {
                            // Step 1: kembali ke halaman asal (mis. home),
                            // atau ke generate (chat) bila wizard dibuka dari sana.
                            handleSelectTab(wizardOriginTab);
                          }
                        }}
                      />
                    </div>

                    {wizardStep === 1 && (
                      <WizardStep1
                        selectedConsumers={wizardData.targetConsumers}
                        onToggleConsumer={handleToggleConsumer}
                        onNext={() => handleSetWizardStep(2)}
                      />
                    )}

                    {wizardStep === 2 && (
                      <WizardStep2
                        selectedCategory={wizardData.dishCategory}
                        onSelectCategory={(cat) => setWizardData((prev) => ({ ...prev, dishCategory: cat }))}
                        onPrevious={() => handleSetWizardStep(1)}
                        onNext={() => handleSetWizardStep(3)}
                      />
                    )}

                    {wizardStep === 3 && (
                      <WizardStep3
                        selectedIngredientIds={wizardData.selectedIngredientIds}
                        customIngredients={wizardData.customIngredients}
                        onToggleIngredient={handleToggleIngredient}
                        onAddCustomIngredient={handleAddCustomIngredient}
                        onRemoveCustomIngredient={handleRemoveCustomIngredient}
                        onPrevious={() => handleSetWizardStep(2)}
                        onNext={() => handleSetWizardStep(4)}
                      />
                    )}

                    {wizardStep === 4 && (
                      <WizardStep4
                        formData={wizardData}
                        onUpdatePrepTime={(time) => setWizardData((prev) => ({ ...prev, prepTimeLimit: time }))}
                        onPrevious={() => handleSetWizardStep(3)}
                        onGenerateRecipe={handleGenerateFromWizard}
                        isLoading={isGenerating}
                      />
                    )}
                  </main>
                ) : (
                  /* Chat Workspace */
                  <div className="flex-1 flex flex-col h-full w-full relative">
                    {/* TopAppBar matching clean specification */}
                    <header className="bg-[#F9F9F7]/80 backdrop-blur-md sticky top-0 w-full z-30 flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          id="btn-hamburger-menu"
                          onClick={() => setIsSidebarOpen((v) => !v)}
                          className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                            isSidebarOpen ? 'bg-[#163422] text-white' : 'text-[#1A1C1B] hover:bg-[#e2e3e1]'
                          }`}
                          aria-label={isSidebarOpen ? 'Sembunyikan Menu' : 'Tampilkan Menu'}
                          title={isSidebarOpen ? 'Sembunyikan sidebar' : 'Tampilkan sidebar'}
                        >
                          <Menu className="w-5 h-5" />
                        </button>
                      </div>

                      {/* Tombol search + kembali: workspace chat dulu tidak punya
                          pencarian sama sekali, padahal pencarian jadi navigasi
                          utama di tab lain. */}
                      <div className="flex items-center gap-1">
                        <button
                          id="btn-chat-search"
                          onClick={handleOpenSearch}
                          className="w-10 h-10 rounded-full flex items-center justify-center text-[#1A1C1B] hover:bg-[#e2e3e1] transition-colors cursor-pointer active:scale-95"
                          aria-label="Cari Resep"
                          title="Cari Resep"
                        >
                          <span className="material-symbols-outlined text-[22px]">search</span>
                        </button>
                        <button
                          id="btn-back-to-home"
                          onClick={() => handleSelectTab('home')}
                          className="flex items-center gap-1.5 h-10 pl-2.5 pr-3.5 rounded-full text-[#1A1C1B] hover:bg-[#e2e3e1] transition-colors cursor-pointer active:scale-[0.97]"
                          aria-label="Kembali ke menu utama"
                          title="Kembali ke menu utama"
                        >
                          <ArrowLeft className="w-4 h-4" />
                          <span className="text-sm font-semibold whitespace-nowrap">Menu Utama</span>
                        </button>
                      </div>
                    </header>

                    <main className="flex-1 overflow-y-auto px-4 md:px-8 pb-36 pt-6 md:pt-10 flex flex-col items-center">
                      <div className="w-full max-w-3xl flex-1 flex flex-col justify-center">
                        {chatMessages.length === 0 ? (
                          <div className="w-full max-w-3xl flex-1 flex flex-col justify-center min-h-[55vh]">
                            {/* Hero Section */}
                            <div className="text-center space-y-3 mb-10">
                              <h1 className="text-[2.3rem] sm:text-4xl md:text-5xl font-bold gemini-gradient-text tracking-tight pb-1 leading-tight">
                                Apa yang ingin Anda masak hari ini?
                              </h1>
                              <p className="text-sm sm:text-base md:text-lg text-[#424843]">
                                SorghumCare AI siap membantu Anda menemukan resep sehat dan lezat.
                              </p>
                            </div>

                            {/* Suggestions Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto w-full mb-8">
                              <button
                                onClick={() => handleSendMessage('Gluten-free sorghum pancakes dengan madu')}
                                className="flex items-center gap-3 p-3.5 rounded-2xl bg-white hover:bg-[#f4f4f2] border border-[#c2c8c0]/60 hover:border-[#163422]/50 text-left transition-all shadow-xs group cursor-pointer"
                              >
                                <span className="w-9 h-9 rounded-xl bg-[#cbebc3]/40 text-[#163422] flex items-center justify-center text-lg flex-shrink-0 group-hover:scale-105 transition-transform">
                                  🥞
                                </span>
                                <div className="min-w-0">
                                  <span className="font-bold text-xs sm:text-sm text-[#163422] block truncate">
                                    Gluten-free pancakes
                                  </span>
                                  <span className="text-[11px] text-[#727972] block truncate">
                                    Pancake lembut tanpa terigu
                                  </span>
                                </div>
                              </button>

                              <button
                                onClick={() => handleSendMessage('Resep roti tawar biji sorgum untuk sarapan sehat')}
                                className="flex items-center gap-3 p-3.5 rounded-2xl bg-white hover:bg-[#f4f4f2] border border-[#c2c8c0]/60 hover:border-[#163422]/50 text-left transition-all shadow-xs group cursor-pointer"
                              >
                                <span className="w-9 h-9 rounded-xl bg-[#ffdea7]/40 text-[#7c5800] flex items-center justify-center text-lg flex-shrink-0 group-hover:scale-105 transition-transform">
                                  🍞
                                </span>
                                <div className="min-w-0">
                                  <span className="font-bold text-xs sm:text-sm text-[#163422] block truncate">
                                    Sorghum bread recipe
                                  </span>
                                  <span className="text-[11px] text-[#727972] block truncate">
                                    Roti rustic kaya serat
                                  </span>
                                </div>
                              </button>

                              <button
                                onClick={() => handleSendMessage('Ide makan malam rendah indeks glikemik (Low GI) dengan beras sorgum')}
                                className="flex items-center gap-3 p-3.5 rounded-2xl bg-white hover:bg-[#f4f4f2] border border-[#c2c8c0]/60 hover:border-[#163422]/50 text-left transition-all shadow-xs group cursor-pointer"
                              >
                                <span className="w-9 h-9 rounded-xl bg-[#cbebc3]/40 text-[#163422] flex items-center justify-center text-lg flex-shrink-0 group-hover:scale-105 transition-transform">
                                  🥗
                                </span>
                                <div className="min-w-0">
                                  <span className="font-bold text-xs sm:text-sm text-[#163422] block truncate">
                                    Low GI dinner ideas
                                  </span>
                                  <span className="text-[11px] text-[#727972] block truncate">
                                    Aman untuk gula darah
                                  </span>
                                </div>
                              </button>

                              <button
                                id="btn-hero-smart-generate"
                                onClick={() => {
                                  handleSetWizardStep(1);
                                }}
                                className="flex items-center gap-3 p-3.5 rounded-2xl bg-[#163422] hover:bg-[#2d4b37] text-white text-left transition-all shadow-md group cursor-pointer active:scale-[0.98]"
                              >
                                <span className="w-9 h-9 rounded-xl bg-white/20 text-[#fdc65c] flex items-center justify-center text-lg flex-shrink-0 group-hover:scale-105 transition-transform">
                                  ✨
                                </span>
                                <div className="min-w-0">
                                  <span className="font-bold text-xs sm:text-sm text-white block truncate flex items-center gap-1.5">
                                    <span>Smart Generate</span>
                                    <span className="text-[10px] bg-[#fdc65c] text-[#163422] font-extrabold px-1.5 py-0.2 rounded-full uppercase">
                                      4 Langkah
                                    </span>
                                  </span>
                                  <span className="text-[11px] text-white/80 block truncate">
                                    Kustomisasi target konsumen &amp; bahan
                                  </span>
                                </div>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-6 w-full py-2">
                            {chatMessages.map((msg) => {
                              if (msg.sender === 'user') {
                                return (
                                  <div key={msg.id} className="flex flex-col w-full">
                                    <div className="bg-[#163422] text-white p-4 rounded-2xl shadow-sm">
                                      <p className="text-sm sm:text-base font-normal leading-relaxed">
                                        {msg.text}
                                      </p>
                                    </div>
                                    <span className="text-[10px] text-[#727972] mt-1 px-2 text-right">
                                      {msg.timestamp}
                                    </span>
                                  </div>
                                );
                              }

                              if (msg.recipe) {
                                return (
                                  <div key={msg.id} className="flex flex-col items-start w-full">
                                    <RecipeCardView
                                      recipe={msg.recipe}
                                      isTyping={msg.isTypingStep}
                                      typingText={msg.typingText || typingStatusText}
                                      isSaved={isRecipeSaved(msg.recipe.id, msg.recipe.title)}
                                      onToggleSave={handleToggleSaveRecipe}
                                      onOpenCookMode={handleOpenCookMode}
                                      isPublished={!!msg.recipe.isPublished || isRecipePublished(msg.recipe)}
                                      onPublish={handlePublishRecipe}
                                      isPublishing={publishingIds.has(msg.recipe.id) || publishingIds.has(msg.recipe.slug || '')}
                                      inputIngredientNames={[...wizardData.selectedIngredientIds, ...wizardData.customIngredients]}
                                    />
                                    <span className="text-[10px] text-[#727972] mt-2 px-1">
                                      {msg.timestamp}
                                    </span>
                                  </div>
                                );
                              }

                              // AI text message (general chat, no recipe card)
                              if (msg.sender === 'ai' && msg.text) {
                                return (
                                  <div key={msg.id} className="flex flex-col w-full">
                                    <div className="bg-[#f4f4f2] text-[#1A1C1B] p-4 rounded-2xl shadow-sm border border-[#e2e3e1]">
                                      {msg.isTypingStep ? (
                                        msg.text ? (
                                          // Continuing state: show existing text + skeleton animation
                                          <div>
                                            <MarkdownText text={msg.text} />
                                            <div className="mt-3 space-y-2 animate-pulse">
                                              <div className="h-3 bg-[#e2e3e1] rounded-full w-[85%]" />
                                              <div className="h-3 bg-[#e2e3e1] rounded-full w-[65%]" />
                                              <div className="h-3 bg-[#e2e3e1] rounded-full w-[75%]" />
                                            </div>
                                            <div className="flex items-center gap-2 mt-3 text-[#727972]">
                                              <span className="flex gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-[#163422] animate-bounce" style={{ animationDelay: '0ms' }} />
                                                <span className="w-1.5 h-1.5 rounded-full bg-[#163422] animate-bounce" style={{ animationDelay: '150ms' }} />
                                                <span className="w-1.5 h-1.5 rounded-full bg-[#163422] animate-bounce" style={{ animationDelay: '300ms' }} />
                                              </span>
                                              <span className="text-xs">{msg.typingText || 'Melanjutkan...'}</span>
                                            </div>
                                          </div>
                                        ) : (
                                          // Initial typing state: dots only
                                          <div className="flex items-center gap-2 text-[#727972]">
                                            <span className="flex gap-1">
                                              <span className="w-1.5 h-1.5 rounded-full bg-[#163422] animate-bounce" style={{ animationDelay: '0ms' }} />
                                              <span className="w-1.5 h-1.5 rounded-full bg-[#163422] animate-bounce" style={{ animationDelay: '150ms' }} />
                                              <span className="w-1.5 h-1.5 rounded-full bg-[#163422] animate-bounce" style={{ animationDelay: '300ms' }} />
                                            </span>
                                            <span className="text-xs">{msg.typingText || 'Mengetik...'}</span>
                                          </div>
                                        )
                                      ) : (
                                        <MarkdownText text={msg.text} />
                                      )}
                                    </div>
                                    {/* Suggestion buttons below AI refusal bubble */}
                                    {msg.refusalSuggestions && msg.refusalSuggestions.length > 0 && !msg.isTypingStep && (
                                      <RecipeSuggestionButtons
                                        suggestions={msg.refusalSuggestions}
                                        onSelect={handleSelectSuggestion}
                                        disabled={isGenerating}
                                      />
                                    )}
                                    {/* Retry button when AI refused but gave no suggestions */}
                                    {msg.refusalNoSuggestions && !msg.refusalSuggestions && !msg.isTypingStep && (
                                      <div className="flex gap-2 mt-2">
                                        <button
                                          onClick={() => handleSetWizardStep(1)}
                                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#163422] text-white hover:bg-[#2d4b37] transition-all shadow-xs active:scale-[0.98]"
                                        >
                                          Kembali ke Wizard
                                        </button>
                                      </div>
                                    )}
                                    <span className="text-[10px] text-[#727972] mt-1 px-2">
                                      {msg.timestamp}
                                    </span>
                                  </div>
                                );
                              }

                              return null;
                            })}
                          </div>
                        )}
                      </div>
                    </main>

                    {/* Input Bar docked cleanly at bottom without navbar */}
                    <div className="fixed md:absolute bottom-0 left-0 right-0 z-20">
                      <ChatInputBar
                        onSendMessage={handleSendMessage}
                        isLoading={isGenerating}
                        dynamicPrompts={dynamicPrompts}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {/* 2. BOTTOM NAVIGATION BAR (Hidden on Generate tab) */}
          {currentTab !== 'generate' && (
            <BottomNavBar
              currentTab={currentTab}
              onSelectTab={handleSelectTab}
            />
          )}

        </>
      )}
      {/* 3. MODALS & POPUPS — di luar ternary agar tetap tampil saat detail resep terbuka */}
      <>
        {/* Video Tutorial Modal */}
        {selectedVideoTutorial && (
          <VideoTutorialModal
            tutorial={selectedVideoTutorial}
            onClose={handleCloseTutorial}
          />
        )}

        {/* Search Modal */}
        <SearchModal
          isOpen={isSearchOpen}
          onClose={handleCloseSearch}
          onSelectRecipe={handleSelectSearchResult}
          recipes={dbRecipes}
          onSearchQuery={handleSearchQuery}
        />

        {/* Cook Mode Modal */}
        {cookModeRecipe && (
          <CookModeModal
            recipe={cookModeRecipe}
            onClose={handleCloseCookMode}
          />
        )}

        {/* Preflight warning modal (illogical ingredients) */}
        {preflight && (
          <PreflightWarningModal
            isOpen={true}
            result={preflight.result}
            originalPrompt={preflight.prompt}
            onClose={() => setPreflight(null)}
            onProceed={handlePreflightProceed}
          />
        )}
      </>
    </div>
  );
}
