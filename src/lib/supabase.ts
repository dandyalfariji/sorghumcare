import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  Recipe,
  RecipeIngredient,
  RecipeStep,
  SavedRecipe,
  ChatMessage,
  NutritionHighlight,
  AdminConfig,
  Report,
} from '../types';
import { getRecipeImageSync } from '../data/imageAssets';

/**
 * SorghumCare — Supabase data layer.
 *
 * Anonymous sign-in (enabled on the project) gives every visitor a stable
 * per-browser identity which gates RLS on saved_recipes / chat_sessions.
 *
 * Runtime config comes from Vite env vars: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY.
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY env var.');
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});

/** Ensure an anonymous session exists (idempotent). Returns user id or null. */
export async function ensureAnonymousSession(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) return session.user.id;

  const { data: { session: anon }, error } = await supabase.auth.signInAnonymously();
  if (error) {
    console.error('Anonymous sign-in failed:', error.message);
    return null;
  }
  return anon?.user?.id ?? null;
}

/** Current user id (sync read of the in-memory session) — use getUserIdAsync instead */


/** Async current user id */
export async function getUserIdAsync(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

/* ================================================================== *
 *  ID RESOLUTION — slug / source_id -> uuid baris `recipes`
 * ================================================================== */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True bila string berbentuk uuid Postgres. */
export function isUuid(value: string | null | undefined): boolean {
  return !!value && UUID_RE.test(value);
}

/**
 * Petakan ID resep apa pun (uuid DB, slug, atau kode seed seperti
 * `nasi-goreng-sorgum-sd`) menjadi uuid baris `recipes`.
 *
 * WAJIB dipakai sebelum menyentuh tabel yang punya foreign key ke
 * `recipes(id)` — `recipe_likes`, `recipe_reviews`, `saved_recipes`,
 * `recipe_ingredients`, dst. Kalau tidak, PostgREST menolak dengan
 * `22P02 invalid input syntax for type uuid`, dan fitur itu diam-diam
 * gagal (inilah penyebab tombol rating tidak berfungsi sampai 10 Nov 2026:
 * kartu mengirim `source_id`, bukan uuid).
 */
export async function resolveRecipeIds(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const uniq = [...new Set(ids.filter(Boolean))];
  const unknown: string[] = [];
  for (const id of uniq) {
    if (isUuid(id)) map.set(id, id);
    else unknown.push(id);
  }
  if (unknown.length === 0) return map;

  const [bySlug, bySource] = await Promise.all([
    supabase.from('recipes').select('id, slug').in('slug', unknown),
    supabase.from('recipes').select('id, source_id').in('source_id', unknown),
  ]);
  for (const row of (bySlug.data as { id: string; slug: string }[]) || []) {
    map.set(row.slug, row.id);
  }
  for (const row of (bySource.data as { id: string; source_id: string | null }[]) || []) {
    if (row.source_id) map.set(row.source_id, row.id);
  }
  return map;
}

/** Versi satu-ID dari {@link resolveRecipeIds}. Null bila tidak ketemu. */
export async function resolveRecipeId(idOrSlug: string | null | undefined): Promise<string | null> {
  if (!idOrSlug) return null;
  if (isUuid(idOrSlug)) return idOrSlug;
  const map = await resolveRecipeIds([idOrSlug]);
  return map.get(idOrSlug) ?? null;
}

/* ================================================================== *
 *  DB row types (mirror public schema)
 * ================================================================== */

export interface DbRecipeRow {
  id: string;
  source_id: string | null;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  image_url: string | null;
  tags: string[] | null;
  target_age_label: string | null;
  dish_category: 'makanan_berat' | 'camilan_sehat' | 'minuman_nutrisi' | 'dessert_rendah_gi' | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  servings: number | null;
  calories_estimate: number | null;
  fiber_grams: number | null;
  protein_grams: number | null;
  glycemic_index: string | null;
  nutrition_title: string | null;
  nutrition_description: string | null;
  prep_time_limit: string | null;
  is_system: boolean;
  is_published: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbIngredientRow {
  id: string;
  recipe_id: string;
  ingredient_ref: string | null;
  name: string;
  amount: string;
  notes: string | null;
  sort_order: number;
}

export interface DbStepRow {
  id: string;
  recipe_id: string;
  step_number: number;
  title: string;
  instruction: string;
  timer_minutes: number | null;
  tip: string | null;
}

export interface DbTargetRow {
  recipe_id: string;
  target: string;
}

export interface DbSavedRow {
  id: string;
  user_id: string;
  recipe_id: string;
  is_favorite: boolean;
  notes: string | null;
  created_at: string;
}

export interface DbChatSessionRow {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface DbChatMessageRow {
  id: string;
  session_id: string;
  sender: 'user' | 'ai' | 'system';
  content: string | null;
  recipe_id: string | null;
  created_at: string;
  // populated when selecting '*, recipe:recipes(*)'
  recipe?: DbRecipeRow | null;
}

/* ================================================================== *
 *  Mappers DB -> domain (Recipe)
 * ================================================================== */

export const CATEGORY_LABEL: Record<string, string> = {
  makanan_berat: 'Makanan Berat',
  camilan_sehat: 'Camilan Sehat',
  minuman_nutrisi: 'Minuman Nutrisi',
  dessert_rendah_gi: 'Dessert Rendah GI',
};

/** Build a domain Recipe from a db row + its child rows. */
export function mapRecipe(
  r: DbRecipeRow,
  ingredients: DbIngredientRow[] = [],
  steps: DbStepRow[] = []
): Recipe {
  const nh: NutritionHighlight = {
    title: r.nutrition_title || 'Nutrisi Unggulan',
    description:
      r.nutrition_description ||
      'Resep sorgum sehat kaya serat, bebas gluten, dan ramah gula darah.',
    fiberGrams: r.fiber_grams ?? undefined,
    proteinGrams: r.protein_grams ?? undefined,
    glycemicIndex:
      (r.glycemic_index as NutritionHighlight['glycemicIndex']) ?? undefined,
    caloriesEstimate: r.calories_estimate ?? undefined,
  };

  const ingList: RecipeIngredient[] = [...ingredients]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((i) => ({
      name: i.name,
      amount: i.amount,
      notes: i.notes ?? undefined,
    }));

  const stepList: RecipeStep[] = [...steps]
    .sort((a, b) => a.step_number - b.step_number)
    .map((s) => ({
      stepNumber: s.step_number,
      title: s.title,
      instruction: s.instruction,
      timerMinutes: s.timer_minutes ?? undefined,
      tip: s.tip ?? undefined,
    }));

  const categoryLabel = r.dish_category
    ? CATEGORY_LABEL[r.dish_category] || r.dish_category
    : 'Makanan Berat';

  return {
    id: r.id, // uuid from DB — used for detail routing by slug instead
    slug: r.slug,
    title: r.title,
    subtitle: r.subtitle || '',
    targetAge: r.target_age_label || 'Semua Usia',
    dishCategory: categoryLabel,
    prepTimeMinutes: r.prep_time_minutes ?? 0,
    cookTimeMinutes: r.cook_time_minutes ?? 0,
    servings: r.servings ?? 1,
    ingredients: ingList,
    nutritionHighlight: nh,
    steps: stepList,
    imageUrl: r.image_url || getRecipeImageSync(r.title, r.dish_category || undefined),
    tags: r.tags || [],
    createdAt: r.created_at || new Date().toISOString(),
    isPublished: r.is_published,
    canPublish: !!r.created_by && !r.is_system,
  };
}

/* ================================================================== *
 *  READ — recipe catalog
 * ================================================================== */

export interface CatalogQuery {
  category?: string; // dish_category key ('makanan_berat' etc.)
  search?: string;
  limit?: number;
}

/**
 * Fetch full recipe catalog (published, system + user) with children.
 * If `ids` provided, only those recipe uuids are returned.
 */
export async function fetchRecipes(opts: CatalogQuery = {}): Promise<Recipe[]> {
  let query = supabase
    .from('recipes')
    .select('*')
    .eq('is_published', true)
    .order('created_at', { ascending: false });

  if (opts.category && opts.category !== 'all') {
    query = query.eq('dish_category', opts.category);
  }
  if (opts.search) {
    query = query.ilike('title', `%${opts.search}%`);
  }
  if (opts.limit) {
    query = query.limit(opts.limit);
  }

  const { data: rows, error } = await query;
  if (error) {
    console.error('fetchRecipes error:', error.message);
    return [];
  }

  const recipes = rows as DbRecipeRow[];
  const recipeIds = recipes.map((r) => r.id);
  if (recipeIds.length === 0) return [];

  // children in one round each
  const [ing, st, tg] = await Promise.all([
    supabase.from('recipe_ingredients').select('*').in('recipe_id', recipeIds),
    supabase.from('recipe_steps').select('*').in('recipe_id', recipeIds),
    supabase.from('recipe_targets').select('*').in('recipe_id', recipeIds),
  ]);

  const ingBy = groupBy((ing.data as DbIngredientRow[]) || [], 'recipe_id');
  const stBy = groupBy((st.data as DbStepRow[]) || [], 'recipe_id');
  const tgBy = groupBy((tg.data as DbTargetRow[]) || [], 'recipe_id');

  return recipes.map((r) => {
    const recipe = mapRecipe(r, ingBy.get(r.id) || [], stBy.get(r.id) || []);
    // attach targets as synthetic tags (optional; not part of Recipe type)
    (recipe as any)._targets = (tgBy.get(r.id) || []).map((t) => t.target);
    return recipe;
  });
}

/** Fetch a single recipe by its SLUG (used by /recipe/:slug). */
export async function fetchRecipeBySlug(slug: string): Promise<Recipe | null> {
  const { data: row, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();
  if (error || !row) return null;

  const r = row as DbRecipeRow;
  const [ing, st] = await Promise.all([
    supabase.from('recipe_ingredients').select('*').eq('recipe_id', r.id).order('sort_order'),
    supabase.from('recipe_steps').select('*').eq('recipe_id', r.id).order('step_number'),
  ]);
  return mapRecipe(
    r,
    (ing.data as DbIngredientRow[]) || [],
    (st.data as DbStepRow[]) || []
  );
}

function groupBy<T>(arr: T[], key: keyof T): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const item of arr) {
    const k = String(item[key]);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(item);
  }
  return m;
}

/* ================================================================== *
 *  WRITE — recipe (used when wizard/chat "generates" a recipe:
 *  we store a user-created recipe row + children)
 * ================================================================== */

/** Persist a generated recipe (PRIVATE by default). Returns stored recipe (with slug) or null. */
export async function upsertRecipe(
  recipe: Recipe,
  opts: { publish?: boolean } = {}
): Promise<Recipe | null> {
  const publish = !!opts.publish || !!recipe.isPublished;
  let slug = recipe.slug || slugifyTitle(recipe.title);
  const userId = await getUserIdAsync();
  let wasPublished = false;

  // User-generated recipe that collides with a system/other-user slug must
  // get a unique slug (system rows are public-read, not user-owned, so an
  // upsert-by-slug update would violate RLS). Appending a short suffix keeps
  // every generated recipe as its own saved creation. Check happens for ANY
  // incoming slug (generated recipes often carry a system slug already).
  if (userId) {
    const { data: existing } = await supabase
      .from('recipes')
      .select('id, created_by, is_published')
      .eq('slug', slug)
      .maybeSingle();
    if (existing && existing.created_by !== userId) {
      slug = `${slug}-${Date.now().toString(36).slice(-5)}`;
    } else if (existing) {
      wasPublished = !!existing.is_published;
    }
  }
  const nh: NutritionHighlight = recipe.nutritionHighlight ?? {
    title: 'Nutrisi Unggulan',
    description: 'Kaya serat dan gizi untuk pertumbuhan.',
  };
  const categoryKey = categoryToKey(recipe.dishCategory);

  // Normalize glycemic_index to the DB check constraint values.
  const giRaw = (nh.glycemicIndex || '').toLowerCase();
  const glycemicIndex =
    giRaw.includes('sangat') ? 'Sangat Rendah'
    : giRaw.includes('rendah') || giRaw.includes('low') ? 'Rendah (Low GI)'
    : giRaw.includes('sedang') || giRaw.includes('medium') || giRaw.includes('moderate') ? 'Sedang'
    : null;

  const row: Partial<DbRecipeRow> = {
    source_id: recipe.id || `user-${Date.now()}`,
    slug,
    title: recipe.title,
    subtitle: recipe.subtitle || '',
    image_url: recipe.imageUrl || null,
    tags: recipe.tags || [],
    target_age_label: recipe.targetAge || null,
    dish_category: categoryKey,
    prep_time_minutes: recipe.prepTimeMinutes,
    cook_time_minutes: recipe.cookTimeMinutes,
    servings: recipe.servings,
    calories_estimate: nh.caloriesEstimate,
    fiber_grams: nh.fiberGrams,
    protein_grams: nh.proteinGrams,
    glycemic_index: glycemicIndex,
    nutrition_title: nh.title || null,
    nutrition_description: nh.description || null,
    is_system: false,
    // New generations stay PRIVATE until the owner presses "Unggah";
    // system catalog rows keep is_published=true from the seed.
    is_published: publish || wasPublished,
    created_by: userId ?? undefined,
  };

  const { data, error } = await supabase
    .from('recipes')
    .upsert(row, { onConflict: 'slug' })
    .select()
    .single();
  if (error || !data) {
    console.error('upsertRecipe error:', error?.message);
    return null;
  }
  const saved = data as DbRecipeRow;

  // Replace children (delete + insert) to keep in sync.
  await supabase.from('recipe_ingredients').delete().eq('recipe_id', saved.id);
  if (recipe.ingredients?.length) {
    const ingRows = recipe.ingredients.map((ing, idx) => ({
      recipe_id: saved.id,
      name: ing.name,
      amount: ing.amount,
      notes: ing.notes || null,
      sort_order: idx,
    }));
    await supabase.from('recipe_ingredients').insert(ingRows);
  }

  await supabase.from('recipe_steps').delete().eq('recipe_id', saved.id);
  if (recipe.steps?.length) {
    const stepRows = recipe.steps.map((s) => ({
      recipe_id: saved.id,
      step_number: s.stepNumber,
      title: s.title,
      instruction: s.instruction,
      timer_minutes: s.timerMinutes ?? null,
      tip: s.tip || null,
    }));
    await supabase.from('recipe_steps').insert(stepRows);
  }

  return mapRecipe(saved);
}

export function slugifyTitle(title: string): string {
  return title
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function categoryToKey(label: string): DbRecipeRow['dish_category'] {
  const l = label.toLowerCase();
  if (l.includes('camilan')) return 'camilan_sehat';
  if (l.includes('minuman')) return 'minuman_nutrisi';
  if (l.includes('dessert') || l.includes('rendah gi') || l.includes('kue')) return 'dessert_rendah_gi';
  return 'makanan_berat';
}

/** Publish an owned recipe so it appears in the public Explore catalog. */
export async function publishRecipe(recipeId: string): Promise<boolean> {
  const userId = await getUserIdAsync();
  if (!userId) return false;
  const { error } = await supabase
    .from('recipes')
    .update({ is_published: true })
    .eq('id', recipeId)
    .eq('created_by', userId);
  if (error) {
    console.error('publishRecipe error:', error.message);
    return false;
  }
  return true;
}

/* ================================================================== *
 *  SAVED RECIPES (per anonymous user)
 * ================================================================== */

/** Fetch saved recipe rows for current user, joined with recipe + children. */
export async function fetchSavedRecipes(): Promise<SavedRecipe[]> {
  const userId = await getUserIdAsync();
  if (!userId) return [];

  const { data: saved, error } = await supabase
    .from('saved_recipes')
    .select('*, recipe:recipes(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !saved) {
    console.error('fetchSavedRecipes:', error?.message);
    return [];
  }

  const result: SavedRecipe[] = [];
  for (const s of saved as any[]) {
    const recipeRow = s.recipe as DbRecipeRow | null;
    if (!recipeRow) continue;
    const ing = await supabase
      .from('recipe_ingredients')
      .select('*')
      .eq('recipe_id', recipeRow.id)
      .order('sort_order');
    const st = await supabase
      .from('recipe_steps')
      .select('*')
      .eq('recipe_id', recipeRow.id)
      .order('step_number');
    result.push({
      id: s.id,
      recipe: mapRecipe(
        recipeRow,
        (ing.data as DbIngredientRow[]) || [],
        (st.data as DbStepRow[]) || []
      ),
      savedAt: s.created_at,
      isFavorite: s.is_favorite,
      notes: s.notes || undefined,
    });
  }
  return result;
}

/** Save a recipe (by its db uuid). Anonymous identity required. */
export async function saveRecipeForUser(recipeId: string): Promise<boolean> {
  const userId = await getUserIdAsync();
  if (!userId) return false;
  const { error } = await supabase.from('saved_recipes').upsert(
    { user_id: userId, recipe_id: recipeId, is_favorite: true },
    { onConflict: 'user_id,recipe_id' }
  );
  if (error) {
    console.error('saveRecipeForUser:', error.message);
    return false;
  }
  return true;
}

/** Remove a saved recipe for current user. */
export async function unsaveRecipeForUser(recipeId: string): Promise<boolean> {
  const userId = await getUserIdAsync();
  if (!userId) return false;
  const { error } = await supabase
    .from('saved_recipes')
    .delete()
    .eq('user_id', userId)
    .eq('recipe_id', recipeId);
  if (error) {
    console.error('unsaveRecipeForUser:', error.message);
    return false;
  }
  return true;
}

/** Resolve saved (uuid set) for current user in one query. */
export async function fetchSavedRecipeIds(): Promise<Set<string>> {
  const userId = await getUserIdAsync();
  if (!userId) return new Set();
  const { data, error } = await supabase
    .from('saved_recipes')
    .select('recipe_id')
    .eq('user_id', userId);
  if (error || !data) return new Set();
  return new Set((data as { recipe_id: string }[]).map((d) => d.recipe_id));
}

/* ================================================================== *
 *  CHAT SESSIONS & MESSAGES
 * ================================================================== */

export async function fetchChatSessions(): Promise<DbChatSessionRow[]> {
  const userId = await getUserIdAsync();
  if (!userId) return [];
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) return [];
  return (data as DbChatSessionRow[]) || [];
}

/** Fetch full messages (with optional recipe embed) for a chat session. */
export async function fetchChatSessionMessages(
  sessionId: string
): Promise<DbChatMessageRow[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*, recipe:recipes(*)')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('fetchChatSessionMessages error:', error.message);
    return [];
  }
  const rows = (data as DbChatMessageRow[]) || [];
  // Hydrate full recipe cards: fetch children (ingredients/steps) for any
  // embedded recipe so re-opened sessions show complete recipes.
  const recipeRows = rows.filter((r) => r.recipe).map((r) => r.recipe as DbRecipeRow);
  if (recipeRows.length) {
    const [ings, sts] = await Promise.all([
      supabase.from('recipe_ingredients').select('*').in('recipe_id', recipeRows.map((r) => r.id)),
      supabase.from('recipe_steps').select('*').in('recipe_id', recipeRows.map((r) => r.id)),
    ]);
    const ingBy = groupBy((ings.data as DbIngredientRow[]) || [], 'recipe_id');
    const stBy = groupBy((sts.data as DbStepRow[]) || [], 'recipe_id');
    for (const row of rows) {
      if (row.recipe) {
        (row as any)._recipeWithChildren = mapRecipe(
          row.recipe,
          ingBy.get(row.recipe.id) || [],
          stBy.get(row.recipe.id) || []
        );
      }
    }
  }
  return rows;
}

/** Rename an existing chat session (smart summary titles). */
export async function renameChatSession(
  sessionId: string,
  title: string
): Promise<boolean> {
  const { error } = await supabase
    .from('chat_sessions')
    .update({ title })
    .eq('id', sessionId);
  if (error) {
    console.error('renameChatSession error:', error.message);
    return false;
  }
  return true;
}

/** Bump updated_at so "Recent" sorts by most recent activity. */
export async function touchChatSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('chat_sessions')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', sessionId);
  if (error) console.error('touchChatSession error:', error.message);
}

export async function createChatSession(title: string): Promise<DbChatSessionRow | null> {
  const userId = await getUserIdAsync();
  if (!userId) return null;
  const { data, error } = await supabase
    .from('chat_sessions')
    .insert({ user_id: userId, title })
    .select()
    .single();
  if (error) return null;
  return data as DbChatSessionRow;
}

export async function saveChatMessages(
  sessionId: string,
  messages: { sender: 'user' | 'ai'; content: string; recipe_id?: string | null }[]
): Promise<boolean> {
  if (!messages.length) return true;
  const rows = messages.map((m) => ({
    session_id: sessionId,
    sender: m.sender,
    content: m.content ?? null,
    recipe_id: m.recipe_id ?? null,
  }));
  const { error } = await supabase.from('chat_messages').insert(rows);
  return !error;
}

/** Delete a chat session (messages cascade). Returns true on success. */
export async function deleteChatSession(sessionId: string): Promise<boolean> {
  const userId = await getUserIdAsync();
  if (!userId) return false;
  const { error } = await supabase
    .from('chat_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('user_id', userId);
  if (error) {
    console.error('deleteChatSession error:', error.message);
    return false;
  }
  return true;
}

/** Get recipe ids referenced by messages in a session (to also delete user recipes). */
export async function fetchSessionRecipeIds(sessionId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('recipe_id')
    .eq('session_id', sessionId)
    .not('recipe_id', 'is', null);
  if (error || !data) return [];
  return Array.from(new Set((data as { recipe_id: string }[]).map((d) => d.recipe_id!)));
}

/** Delete an owned recipe (only user-generated, not system). Cascade removes children. */
export async function deleteOwnedRecipe(recipeId: string): Promise<boolean> {
  const userId = await getUserIdAsync();
  if (!userId) return false;
  const { error } = await supabase
    .from('recipes')
    .delete()
    .eq('id', recipeId)
    .eq('created_by', userId)
    .eq('is_system', false);
  if (error) {
    console.error('deleteOwnedRecipe error:', error.message);
    return false;
  }
  return true;
}

/** Count recipes created by current user (for profile badge). */
export async function fetchUserRecipeCount(): Promise<number> {
  const userId = await getUserIdAsync();
  if (!userId) return 0;
  const { count, error } = await supabase
    .from('recipes')
    .select('id', { count: 'exact', head: true })
    .eq('created_by', userId);
  if (error) return 0;
  return count || 0;
}

/** Fetch full recipes created by current user (for profile "posted" list). */
export async function fetchUserRecipes(): Promise<Recipe[]> {
  const userId = await getUserIdAsync();
  if (!userId) return [];
  const { data: rows, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('created_by', userId)
    .order('created_at', { ascending: false });
  if (error || !rows) return [];
  const recipes = rows as DbRecipeRow[];
  const recipeIds = recipes.map((r) => r.id);
  if (recipeIds.length === 0) return [];
  const [ing, st] = await Promise.all([
    supabase.from('recipe_ingredients').select('*').in('recipe_id', recipeIds),
    supabase.from('recipe_steps').select('*').in('recipe_id', recipeIds),
  ]);
  const ingBy = groupBy((ing.data as DbIngredientRow[]) || [], 'recipe_id');
  const stBy = groupBy((st.data as DbStepRow[]) || [], 'recipe_id');
  return recipes.map((r) => mapRecipe(r, ingBy.get(r.id) || [], stBy.get(r.id) || []));
}

/* ================================================================== *
 *  PROFILES (anonymous user info)
 * ================================================================== */

/** Kunci penyimpanan lokal untuk bio, dipakai bila kolom `bio` belum ada di DB. */
const BIO_STORAGE_KEY = 'bima_profile_bio';

/**
 * Penanda modul: kolom `profiles.bio` belum ada di database.
 *
 * Diisi begitu PostgREST mengeluh kolomnya tidak dikenal, supaya percobaan
 * berikutnya tidak mengirim `bio` lagi (menghindari request 400 berulang).
 * Otomatis "terbuka" lagi setelah halaman dimuat ulang — jadi begitu migrasi
 * 014_profiles_bio.sql dijalankan, bio langsung ikut tersimpan ke DB.
 */
let bioColumnKnownMissing = false;
/** Uji sekali saja per pemuatan halaman (dibagi antar pemanggil / StrictMode). */
let bioProbe: Promise<boolean> | null = null;

/** Adakah kolom `profiles.bio` di database? Hasilnya di-cache per pemuatan. */
async function bioColumnExists(): Promise<boolean> {
  if (bioColumnKnownMissing) return false;
  if (!bioProbe) {
    bioProbe = (async () => {
      const userId = await getUserIdAsync();
      if (!userId) return false;
      const { error } = await supabase.from('profiles').select('bio').eq('id', userId).maybeSingle();
      if (error) {
        bioColumnKnownMissing = true;
        return false;
      }
      return true;
    })();
  }
  return bioProbe;
}

function readLocalBio(): string | null {
  try {
    return localStorage.getItem(BIO_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeLocalBio(bio: string): void {
  try {
    localStorage.setItem(BIO_STORAGE_KEY, bio);
  } catch {
    /* abaikan */
  }
}

/**
 * Ambil profil pengguna (nama, bio, avatar, role).
 *
 * `bio` adalah kolom baru (migrasi 014_profiles_bio.sql). Selama migrasi itu
 * belum dijalankan, query dengan `bio` gagal 400 dan SELURUH profil jadi null —
 * nama yang sudah disimpan pun ikut hilang saat reload (itu penyebab utama
 * "edit profil belum sinkron"). Jadi: coba dengan `bio`, kalau gagal ulangi
 * tanpa `bio` dan ambil bio dari penyimpanan lokal.
 */
export async function fetchProfile(): Promise<{ full_name: string | null; bio: string | null; avatar_url: string | null; role: string } | null> {
  const userId = await getUserIdAsync();
  if (!userId) return null;

  if (await bioColumnExists()) {
    const full = await supabase
      .from('profiles')
      .select('full_name, bio, avatar_url, role')
      .eq('id', userId)
      .maybeSingle();
    if (!full.error) {
      const row = full.data as { full_name: string | null; bio: string | null; avatar_url: string | null; role: string };
      // Kolom ada tapi kosong -> pakai nilai lokal (mis. diisi sebelum migrasi).
      return { ...row, bio: row.bio ?? readLocalBio() };
    }
  }

  // Fallback: kolom `bio` belum ada di DB.
  const base = await supabase
    .from('profiles')
    .select('full_name, avatar_url, role')
    .eq('id', userId)
    .maybeSingle();
  if (base.error || !base.data) return null;
  return {
    ...(base.data as { full_name: string | null; avatar_url: string | null; role: string }),
    bio: readLocalBio(),
  };
}

export async function isAdmin(): Promise<boolean> {
  const userId = await getUserIdAsync();
  if (!userId) return false;
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return false;
  return (data as { role: string }).role === 'admin';
}

/**
 * Simpan nama lengkap + status/bio ke `profiles`.
 *
 * Dua hal yang dulu bikin rusak:
 * 1. `upsert({id, full_name})` bisa meng-reset kolom `role`; dan
 * 2. satu percobaan yang gagal (mis. kolom `bio` belum ada) membuat SELURUH
 *    penyimpanan gagal — termasuk nama.
 *
 * Sekarang: bio selalu disimpan lokal sebagai cadangan, lalu di-commit ke DB.
 * Ada baris -> UPDATE (hanya kolom yang diubah); belum ada -> INSERT.
 * Kalau `bio` ditolak server, ulangi tanpa `bio` supaya `full_name` tetap masuk.
 */
export async function updateProfile(
  fullName: string,
  bio?: string,
): Promise<boolean> {
  const userId = await getUserIdAsync();
  if (!userId) return false;

  // Cadangan lokal: membuat "Status / Bio" tetap bertahan walau kolom `bio`
  // belum ditambahkan ke DB (migrasi 014_profiles_bio.sql belum dijalankan).
  if (bio !== undefined) writeLocalBio(bio);

  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  const attempt = async (withBio: boolean) => {
    const patch: Record<string, unknown> = { full_name: fullName };
    if (withBio && bio !== undefined) patch.bio = bio;
    return existing
      ? await supabase.from('profiles').update(patch).eq('id', userId)
      : await supabase.from('profiles').insert({ id: userId, ...patch });
  };

  const wantBio = bio !== undefined && (await bioColumnExists());
  let { error } = await attempt(wantBio);
  // Kolom `bio` belum ada di DB -> simpan nama saja, jangan gagalkan semuanya
  // (dan jangan coba lagi di permintaan berikutnya sampai halaman dimuat ulang).
  if (error && wantBio) {
    bioColumnKnownMissing = true;
    ({ error } = await attempt(false));
  }
  if (error) {
    console.error('updateProfile:', error.message);
    return false;
  }
  return true;
}

/** Kompatibilitas nama lama. */
export async function updateProfileName(fullName: string): Promise<boolean> {
  return updateProfile(fullName);
}

/* ================================================================== *
 *  USER STATS — Sorghum Impact & Day Streak
 * ================================================================== */

export interface UserStats {
  sorghumImpact: number;
  dayStreak: number;
}

/** Calculate user engagement stats from Supabase activity tables. */
export async function fetchUserStats(): Promise<UserStats> {
  const userId = await getUserIdAsync();
  if (!userId) return { sorghumImpact: 0, dayStreak: 0 };

  // Fetch activity timestamps in parallel
  const [savedRes, sessionsRes, commentsRes] = await Promise.all([
    supabase
      .from('saved_recipes')
      .select('created_at')
      .eq('user_id', userId),
    supabase
      .from('chat_sessions')
      .select('created_at, updated_at')
      .eq('user_id', userId),
    supabase
      .from('recipe_comments')
      .select('created_at')
      .eq('user_id', userId),
  ]);

  const savedCount = (savedRes.data?.length || 0);
  const sessionCount = (sessionsRes.data?.length || 0);
  const commentCount = (commentsRes.data?.length || 0);

  // Sorghum Impact: engagement score
  // saved=10, generated recipe session=50, comment=20
  const sorghumImpact = savedCount * 10 + sessionCount * 50 + commentCount * 20;

  // Day Streak: consecutive days with any activity
  const allDates = new Set<string>();
  const addDate = (ts: string | undefined) => {
    if (ts) allDates.add(ts.substring(0, 10)); // YYYY-MM-DD
  };

  for (const row of savedRes.data || []) addDate(row.created_at);
  for (const row of sessionsRes.data || []) {
    addDate(row.created_at);
    addDate(row.updated_at);
  }
  for (const row of commentsRes.data || []) addDate(row.created_at);

  // Sort dates descending and count consecutive days from today
  const sorted = Array.from(allDates).sort().reverse();
  let dayStreak = 0;

  // Use local date (YYYY-MM-DD) to avoid UTC offset issues
  const fmtLocal = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };

  const today = new Date();

  for (let i = 0; i < sorted.length; i++) {
    const expected = new Date(today);
    expected.setDate(expected.getDate() - i);
    const expectedStr = fmtLocal(expected);
    if (sorted[i] === expectedStr) {
      dayStreak++;
    } else if (i === 0) {
      // Today has no activity, check if yesterday does
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = fmtLocal(yesterday);
      if (sorted[i] === yesterdayStr) {
        dayStreak++;
        for (let j = 1; j < sorted.length; j++) {
          const exp = new Date(yesterday);
          exp.setDate(exp.getDate() - (j - 1));
          if (sorted[j] === fmtLocal(exp)) {
            dayStreak++;
          } else break;
        }
      }
      break;
    } else break;
  }

  return { sorghumImpact, dayStreak };
}

export interface RecipeComment {
  id: string;
  recipe_id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  content: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbAdminConfigRow {
  id: string;
  config_key: string;
  config_value: any;
  description: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface DbReportRow {
  id: string;
  reporter_id: string | null;
  target_type: string;
  target_id: string;
  reason: string;
  status: string;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

/** Fetch all comments for a recipe, flat list. */
export async function fetchComments(recipeId: string): Promise<RecipeComment[]> {
  const { data, error } = await supabase
    .from('recipe_comments')
    .select('*')
    .eq('recipe_id', recipeId)
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return data as RecipeComment[];
}

/** Post a new comment (or reply if parentId given). */
export async function postComment(
  recipeId: string,
  content: string,
  displayName: string,
  avatarUrl: string | null,
  parentId: string | null = null,
): Promise<RecipeComment | null> {
  const userId = await getUserIdAsync();
  if (!userId) return null;
  const { data, error } = await supabase
    .from('recipe_comments')
    .insert({
      recipe_id: recipeId,
      user_id: userId,
      display_name: displayName,
      avatar_url: avatarUrl,
      content,
      parent_id: parentId,
    })
    .select()
    .single();
  if (error || !data) return null;
  return data as RecipeComment;
}

/** Delete own comment. */
export async function deleteComment(commentId: string): Promise<boolean> {
  const userId = await getUserIdAsync();
  if (!userId) return false;
  const { error } = await supabase
    .from('recipe_comments')
    .delete()
    .eq('id', commentId)
    .eq('user_id', userId);
  return !error;
}

/* ================================================================== *
 *  COMMENT LIKES — comment_likes table
 * ================================================================== */

export interface CommentLike {
  id: string;
  comment_id: string;
  user_id: string;
  created_at: string;
}

/** Fetch like counts + current user's liked comment IDs for a set of comments. */
export async function fetchLikesForComments(
  commentIds: string[],
  userId: string | null,
): Promise<{ counts: Record<string, number>; likedByUser: Set<string> }> {
  const counts: Record<string, number> = {};
  const likedByUser = new Set<string>();
  if (commentIds.length === 0) return { counts, likedByUser };

  // Fetch all likes for these comments
  const { data, error } = await supabase
    .from('comment_likes')
    .select('comment_id, user_id')
    .in('comment_id', commentIds);
  if (error || !data) return { counts, likedByUser };

  for (const row of data) {
    counts[row.comment_id] = (counts[row.comment_id] || 0) + 1;
    if (userId && row.user_id === userId) {
      likedByUser.add(row.comment_id);
    }
  }
  return { counts, likedByUser };
}

/** Toggle like on a comment. Returns true if now liked, false if unliked. */
export async function toggleCommentLike(
  commentId: string,
): Promise<{ liked: boolean; count: number } | null> {
  const userId = await getUserIdAsync();
  if (!userId) return null;

  // Check if already liked
  const { data: existing } = await supabase
    .from('comment_likes')
    .select('id')
    .eq('comment_id', commentId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    // Unlike
    await supabase.from('comment_likes').delete().eq('id', existing.id);
    // Get new count
    const { count } = await supabase
      .from('comment_likes')
      .select('*', { count: 'exact', head: true })
      .eq('comment_id', commentId);
    return { liked: false, count: count || 0 };
  } else {
    // Like
    await supabase.from('comment_likes').insert({
      comment_id: commentId,
      user_id: userId,
    });
    const { count } = await supabase
      .from('comment_likes')
      .select('*', { count: 'exact', head: true })
      .eq('comment_id', commentId);
    return { liked: true, count: count || 0 };
  }
}

/* ================================================================== *
 *  RECIPE ENGAGEMENT — comment & save counts per recipe
 *  (dipakai badge profil "Resep yang Diposting")
 * ================================================================== */

/** Count komentar + save per recipe_id dalam 2 query (RLS: komen publik, save milik sendiri). */
export async function fetchRecipeEngagement(
  recipeIds: string[],
): Promise<{ comments: Record<string, number>; saves: Record<string, number> }> {
  const comments: Record<string, number> = {};
  const saves: Record<string, number> = {};
  // Tabel ini ber-FK ke recipes(id): ID harus uuid, bukan slug/source_id.
  const map = await resolveRecipeIds(recipeIds);
  const ids = [...new Set([...map.values()])];
  if (ids.length === 0) return { comments, saves };
  const [cRes, sRes] = await Promise.all([
    supabase.from('recipe_comments').select('recipe_id').in('recipe_id', ids),
    supabase.from('saved_recipes').select('recipe_id').in('recipe_id', ids),
  ]);
  for (const row of (cRes.data as { recipe_id: string }[]) || []) {
    comments[row.recipe_id] = (comments[row.recipe_id] || 0) + 1;
  }
  for (const row of (sRes.data as { recipe_id: string }[]) || []) {
    saves[row.recipe_id] = (saves[row.recipe_id] || 0) + 1;
  }
  // Kembalikan juga di bawah kunci asli, supaya pemanggil yang memakai
  // slug/source_id (kartu dari data statis) tetap menemukan angkanya.
  for (const [original, uuid] of map) {
    if (original === uuid) continue;
    if (comments[uuid] !== undefined) comments[original] = comments[uuid];
    if (saves[uuid] !== undefined) saves[original] = saves[uuid];
  }
  return { comments, saves };
}

/* ================================================================== *
 *  RECIPE LIKES (publik) — apresiasi semua user, bukan koleksi pribadi
 * ================================================================== */

export interface RecipeStats {
  likes: number;
  reviewsCount: number;
  ratingAvg: number | null;
}

/** Agregat like/review per resep dari view publik (tanpa login bisa baca). */
export async function fetchRecipeStats(
  recipeIds: string[],
): Promise<Record<string, RecipeStats>> {
  const out: Record<string, RecipeStats> = {};
  // View memakai recipes.id sebagai kunci, jadi slug/source_id harus dipetakan
  // dulu — kalau tidak, PostgREST menolak dengan 22P02 dan semua angka 0.
  const map = await resolveRecipeIds(recipeIds);
  const ids = [...new Set([...map.values()])];
  if (ids.length === 0) return out;
  const { data } = await supabase.from('v_recipe_stats').select('*').in('recipe_id', ids);
  for (const row of (data as any[]) || []) {
    out[row.recipe_id] = {
      likes: Number(row.likes) || 0,
      reviewsCount: Number(row.reviews_count) || 0,
      ratingAvg: row.rating_avg != null ? Number(row.rating_avg) : null,
    };
  }
  // Cermin ke kunci asli (slug/source_id) agar kartu statis ikut menampilkan.
  for (const [original, uuid] of map) {
    if (original === uuid) continue;
    const hit = out[uuid];
    if (hit) out[original] = { ...hit };
  }
  return out;
}

/** Resep yang di-like user saat ini (untuk state hati). */
export async function fetchLikedRecipeIds(): Promise<Set<string>> {
  const userId = await getUserIdAsync();
  if (!userId) return new Set();
  const { data } = await supabase.from('recipe_likes').select('recipe_id').eq('user_id', userId);
  return new Set(((data as { recipe_id: string }[]) || []).map((d) => d.recipe_id));
}

/** Like/rating user untuk sekumpulan resep, dikembalikan dengan kunci ASLI
 *  (uuid DB *dan* slug/source_id) supaya kartu dari data statis tetap cocok. */
async function fetchEngagementKeyed(
  table: 'recipe_likes' | 'recipe_reviews',
  recipeIds: string[],
  userId: string,
): Promise<Set<string>> {
  const map = await resolveRecipeIds(recipeIds);
  const ids = [...new Set([...map.values()])];
  const result = new Set<string>();
  if (ids.length === 0) return result;
  const { data } = await supabase.from(table).select('recipe_id').eq('user_id', userId).in('recipe_id', ids);
  const found = new Set(((data as { recipe_id: string }[]) || []).map((d) => d.recipe_id));
  for (const [original, uuid] of map) {
    if (found.has(uuid)) result.add(original);
  }
  return result;
}

/** Resep (oleh user ini) yang sudah diberi rating, dengan kunci asli. */
export async function fetchRatedRecipeIds(recipeIds: string[]): Promise<Set<string>> {
  const userId = await getUserIdAsync();
  if (!userId) return new Set();
  return fetchEngagementKeyed('recipe_reviews', recipeIds, userId);
}

/** Rating yang diberikan pengguna ini untuk satu resep (null bila belum). */
export async function fetchMyRecipeRating(recipeId: string): Promise<number | null> {
  const userId = await getUserIdAsync();
  if (!userId) return null;
  const dbId = await resolveRecipeId(recipeId);
  if (!dbId) return null;
  const { data } = await supabase
    .from('recipe_reviews')
    .select('rating')
    .eq('recipe_id', dbId)
    .eq('user_id', userId)
    .maybeSingle();
  const row = data as { rating: number } | null;
  return row?.rating ?? null;
}

/** Toggle like publik. Return state baru + count, null bila belum login. */
export async function toggleRecipeLike(
  recipeId: string,
): Promise<{ liked: boolean; count: number } | null> {
  const userId = await getUserIdAsync();
  if (!userId) return null;
  // Baris recipe_likes ber-FK ke recipes(id) — wajib uuid.
  const dbId = await resolveRecipeId(recipeId);
  if (!dbId) return null;
  const { data: existing } = await supabase
    .from('recipe_likes')
    .select('id')
    .eq('recipe_id', dbId)
    .eq('user_id', userId)
    .maybeSingle();
  if (existing) {
    await supabase.from('recipe_likes').delete().eq('id', (existing as { id: string }).id);
  } else {
    await supabase.from('recipe_likes').insert({ recipe_id: dbId, user_id: userId });
  }
  const { count } = await supabase
    .from('recipe_likes')
    .select('*', { count: 'exact', head: true })
    .eq('recipe_id', dbId);
  return { liked: !existing, count: count || 0 };
}

/* ================================================================== *
 *  RECIPE REVIEWS (publik) — rating 1-5 + ulasan
 * ================================================================== */

export interface RecipeReview {
  id: string;
  user_id: string;
  recipe_id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
}

/** Ambil review publik per resep (terbaru dulu). */
export async function fetchRecipeReviews(recipeId: string): Promise<RecipeReview[]> {
  const { data } = await supabase
    .from('recipe_reviews')
    .select('*')
    .eq('recipe_id', recipeId)
    .order('created_at', { ascending: false })
    .limit(50);
  return (data as RecipeReview[]) || [];
}

/** Simpan/update rating user (satu per user per resep). */
export async function upsertRecipeReview(
  recipeId: string,
  rating: number,
  reviewText?: string,
): Promise<boolean> {
  const userId = await getUserIdAsync();
  if (!userId || rating < 1 || rating > 5) return false;
  // recipe_id ber-FK ke recipes(id): terima uuid, slug, atau source_id —
  // lalu petakan ke uuid. (Bug lama: kartu mengirim `source_id` sehingga
  // PostgREST menolak dengan 22P02 dan rating tampak "tidak berfungsi".)
  const dbId = await resolveRecipeId(recipeId);
  if (!dbId) {
    console.error('upsertRecipeReview: recipe tidak ditemukan untuk', recipeId);
    return false;
  }
  const { error } = await supabase.from('recipe_reviews').upsert(
    { user_id: userId, recipe_id: dbId, rating, review_text: reviewText || null },
    { onConflict: 'user_id,recipe_id' },
  );
  if (error) {
    console.error('upsertRecipeReview:', error.message);
    return false;
  }
  return true;
}

/* ================================================================== *
 *  ADMIN — konfigurasi payload (admin_configs)
 * ================================================================== */

/** Fetch all admin config rows (key-value payloads). Admin only (RLS enforced). */
export async function fetchAdminConfigs(): Promise<AdminConfig[]> {
  const { data, error } = await supabase
    .from('admin_configs')
    .select('*')
    .order('config_key', { ascending: true });
  if (error || !data) return [];
  return data as AdminConfig[];
}

/** Upsert (create or update) a single admin config payload. Admin only. */
export async function updateAdminConfig(
  configKey: string,
  configValue: any,
  description: string | null = null,
): Promise<boolean> {
  const userId = await getUserIdAsync();
  if (!userId) return false;
  const { error } = await supabase
    .from('admin_configs')
    .upsert(
      { config_key: configKey, config_value: configValue, description, updated_by: userId },
      { onConflict: 'config_key' }
    );
  if (error) {
    console.error('updateAdminConfig error:', error.message);
    return false;
  }
  return true;
}

/** Get a single config value by key. Returns null if not found. */
export async function getAdminConfigValue(configKey: string): Promise<any> {
  const { data, error } = await supabase
    .from('admin_configs')
    .select('config_value')
    .eq('config_key', configKey)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { config_value: any }).config_value;
}

/* ================================================================== *
 *  ADMIN — laporan (reports)
 * ================================================================== */

/** Fetch all reports (newest first). Admin only (RLS allows select for all, but UI should gate). */
export async function fetchReports(): Promise<Report[]> {
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data as Report[];
}

/** Accept (setujui) a report. Admin only. */
export async function acceptReport(reportId: string, adminNote: string | null = null): Promise<boolean> {
  const userId = await getUserIdAsync();
  if (!userId) return false;
  const { error } = await supabase
    .from('reports')
    .update({ status: 'accepted', admin_note: adminNote, reviewed_by: userId, reviewed_at: new Date().toISOString() })
    .eq('id', reportId);
  if (error) {
    console.error('acceptReport error:', error.message);
    return false;
  }
  return true;
}

/** Reject (tolak) a report. Admin only. */
export async function rejectReport(reportId: string, adminNote: string | null = null): Promise<boolean> {
  const userId = await getUserIdAsync();
  if (!userId) return false;
  const { error } = await supabase
    .from('reports')
    .update({ status: 'rejected', admin_note: adminNote, reviewed_by: userId, reviewed_at: new Date().toISOString() })
    .eq('id', reportId);
  if (error) {
    console.error('rejectReport error:', error.message);
    return false;
  }
  return true;
}

/* ================================================================== *
 *  ADMIN — hapus konten (komentar & resep) oleh admin
 * ================================================================== */

/** Delete ANY comment as admin (bypasses owner-only RLS via admin policy). */
export async function adminDeleteComment(commentId: string): Promise<boolean> {
  const { error } = await supabase
    .from('recipe_comments')
    .delete()
    .eq('id', commentId);
  if (error) {
    console.error('adminDeleteComment error:', error.message);
    return false;
  }
  return true;
}

/** Delete ANY recipe as admin (cascade removes children). Admin only. */
export async function adminDeleteRecipe(recipeId: string): Promise<boolean> {
  const { error } = await supabase
    .from('recipes')
    .delete()
    .eq('id', recipeId);
  if (error) {
    console.error('adminDeleteRecipe error:', error.message);
    return false;
  }
  return true;
}