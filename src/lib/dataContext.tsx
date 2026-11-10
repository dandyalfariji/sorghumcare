import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from 'react';
import type { Recipe, SavedRecipe } from '../types';
import {
  ensureAnonymousSession,
  fetchRecipes,
  fetchSavedRecipes,
  fetchSavedRecipeIds,
  saveRecipeForUser,
  unsaveRecipeForUser,
  upsertRecipe,
  fetchRecipeBySlug,
  publishRecipe as publishRecipeDb,
  deleteOwnedRecipe,
} from './supabase';

interface DataContextValue {
  ready: boolean;
  recipes: Recipe[]; // full catalog
  savedRecipes: SavedRecipe[];
  savedIds: Set<string>;
  // derived category collection helpers
  recipesByCategory: (key: string) => Recipe[];
  getRecipeBySlug: (slug: string) => Recipe | null;
  getRecipeById: (id: string) => Recipe | null;
  toggleSave: (recipe: Recipe) => Promise<boolean>;
  isSavedForRecipe: (recipe: Recipe) => boolean;
  generateAndSave: (recipe: Recipe, opts?: { publish?: boolean }) => Promise<Recipe | null>;
  /** Publish an owned recipe (sets is_published = true) so it shows in Explore. */
  publishRecipe: (recipeId: string) => Promise<boolean>;
  /** Remove a generated recipe owned by the user. */
  removeGeneratedRecipe: (recipeId: string) => Promise<boolean>;
  refetchSaved: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Global image toggle from admin_configs (false = hide all food images). */
  imagesEnabled: boolean;
  setImagesEnabled: (v: boolean) => void;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [savedRecipes, setSavedRecipes] = useState<SavedRecipe[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  // Samakan dengan App: dari localStorage agar varian tanpa gambar langsung dipakai.
  const [imagesEnabled, setImagesEnabled] = useState(() => {
    try {
      return localStorage.getItem('bima_images_enabled') !== '0';
    } catch {
      return true;
    }
  });

  const loadCatalog = useCallback(async () => {
    const data = await fetchRecipes();
    setRecipes(data);
    setReady(true);
  }, []);

  const refetchSaved = useCallback(async () => {
    const [saved, ids] = await Promise.all([fetchSavedRecipes(), fetchSavedRecipeIds()]);
    setSavedRecipes(saved);
    setSavedIds(ids);
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([loadCatalog(), refetchSaved()]);
  }, [loadCatalog, refetchSaved]);

  useEffect(() => {
    let alive = true;
    (async () => {
      await ensureAnonymousSession();
      if (!alive) return;
      await Promise.all([loadCatalog(), refetchSaved()]);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recipesByCategory = useCallback(
    (key: string) => {
      if (!key || key === 'all') return recipes;
      return recipes.filter((r) => categoryLabelToKey(r.dishCategory) === key);
    },
    [recipes]
  );

  const getRecipeBySlug = useCallback(
    (slug: string) => recipes.find((r) => r.slug === slug) || null,
    [recipes]
  );

  const getRecipeById = useCallback(
    (id: string) => recipes.find((r) => r.id === id) || null,
    [recipes]
  );

  const isSavedForRecipe = useCallback(
    (recipe: Recipe) => {
      if (savedRecipes.some((s) => s.recipe.slug === recipe.slug)) return true;
      return savedIds.has(recipe.id);
    },
    [savedRecipes, savedIds]
  );

  const toggleSave = useCallback(
    async (recipe: Recipe) => {
      const isSaved = isSavedForRecipe(recipe);
      // Resolve the db uuid for this recipe. Generated recipes carry a
      // client-side fake id (recipe-ai-...), so upsert-by-slug first to get
      // the real uuid before writing saved_recipes (FK requires recipes.id).
      let dbRecipe = getRecipeById(recipe.id) || getRecipeBySlug(recipe.slug || '');
      if (!dbRecipe) {
        const stored = await upsertRecipe(recipe);
        if (stored) {
          // Keep the catalog clean: only public recipes belong in Explore.
          setRecipes((prev) =>
            stored.isPublished
              ? [stored, ...prev.filter((r) => r.slug !== stored.slug)]
              : prev.filter((r) => r.slug !== stored.slug)
          );
          dbRecipe = stored;
        }
      }
      const recipeId = (dbRecipe || recipe).id;
      if (isSaved) {
        const ok = await unsaveRecipeForUser(recipeId);
        if (ok) await refetchSaved();
        return !ok; // returns new state if success
      } else {
        const ok = await saveRecipeForUser(recipeId);
        if (ok) await refetchSaved();
        return ok;
      }
    },
    [getRecipeById, getRecipeBySlug, isSavedForRecipe, refetchSaved]
  );

  const generateAndSave = useCallback(
    async (recipe: Recipe, opts?: { publish?: boolean }) => {
      const stored = await upsertRecipe(recipe, opts);
      if (stored) {
        setRecipes((prev) => {
          // Only public recipes belong in the Explore catalog list.
          // Saring dengan id DAN slug: satu resep bisa muncul dua kali (uuid dari
          // DB vs source_id/slug di kartu statis) dan duplikat itu membuat React
          // mengeluh "two children with the same key" saat merender daftar.
          const withoutDupe = prev.filter((r) => r.id !== stored.id && r.slug !== stored.slug);
          if (!stored.isPublished) {
            return withoutDupe;
          }
          return [stored, ...withoutDupe];
        });
      }
      return stored;
    },
    []
  );

  const publishRecipe = useCallback(async (recipeId: string) => {
    const ok = await publishRecipeDb(recipeId);
    if (ok) await refetchSaved();
    return ok;
  }, [refetchSaved]);

  const removeGeneratedRecipe = useCallback(async (recipeId: string) => {
    const ok = await deleteOwnedRecipe(recipeId);
    if (ok) {
      await Promise.all([refetchSaved(), loadCatalog()]);
    }
    return ok;
  }, [refetchSaved, loadCatalog]);

  const value = useMemo<DataContextValue>(
    () => ({
      ready,
      recipes,
      savedRecipes,
      savedIds,
      recipesByCategory,
      getRecipeBySlug,
      getRecipeById,
      toggleSave,
      isSavedForRecipe,
      generateAndSave,
      publishRecipe,
      removeGeneratedRecipe,
      refetchSaved,
      refresh,
      imagesEnabled,
      setImagesEnabled,
    }),
    [
      ready,
      recipes,
      savedRecipes,
      savedIds,
      recipesByCategory,
      getRecipeBySlug,
      getRecipeById,
      toggleSave,
      isSavedForRecipe,
      generateAndSave,
      publishRecipe,
      removeGeneratedRecipe,
      refetchSaved,
      refresh,
      imagesEnabled,
      setImagesEnabled,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}

export function categoryLabelToKey(label: string): string {
  const l = label.toLowerCase();
  if (l.includes('camilan')) return 'camilan_sehat';
  if (l.includes('minuman')) return 'minuman_nutrisi';
  if (l.includes('dessert') || l.includes('rendah gi')) return 'dessert_rendah_gi';
  return 'makanan_berat';
}

export { fetchRecipeBySlug };