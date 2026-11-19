export type TargetConsumerId =
  | 'anak_sd'
  | 'siswa_smp'
  | 'siswa_sma'
  | 'dewasa_lansia'
  | 'balita'
  | 'anak_sekolah'
  | 'remaja_dewasa'
  | 'lansia';

export type DishCategoryId = 'makanan_berat' | 'camilan_sehat' | 'minuman_nutrisi' | 'dessert_rendah_gi';

export interface TargetConsumerOption {
  id: TargetConsumerId;
  label: string;
  subLabel?: string;
  iconName: string; // Material symbol or Lucide icon
}

export interface DishCategoryOption {
  id: DishCategoryId;
  title: string;
  description: string;
  iconName: string;
}

export interface IngredientItem {
  id: string;
  name: string;
  category: 'utama' | 'sayur' | 'protein' | 'bumbu' | 'pelengkap';
  iconName: string;
  unit: string;
}

export interface RecipeIngredient {
  name: string;
  amount: string;
  notes?: string;
}

export interface RecipeStep {
  stepNumber: number;
  title: string;
  instruction: string;
  timerMinutes?: number;
  tip?: string;
}

export interface NutritionHighlight {
  title: string;
  description: string;
  fiberGrams?: number;
  proteinGrams?: number;
  glycemicIndex?: 'Rendah (Low GI)' | 'Sedang' | 'Sangat Rendah';
  caloriesEstimate?: number;
}

export interface Recipe {
  id: string;
  slug?: string;
  title: string;
  subtitle: string;
  targetAge: string;
  dishCategory: string;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  servings: number;
  ingredients: RecipeIngredient[];
  nutritionHighlight: NutritionHighlight;
  steps: RecipeStep[];
  imageUrl?: string;
  tags: string[];
  createdAt: string;
  /** false = private (only visible to owner); true = public in Explore */
  isPublished?: boolean;
  /** whether this recipe can be published (owner's own generated recipe) */
  canPublish?: boolean;
  /** validation/robustness issues surfaced to the UI (see recipeGuard.ts) */
  aiWarnings?: { level: 'warning' | 'error'; message: string }[];
  /** full explanation text when the AI declined the request (illogical) */
  aiRefusalText?: string;
}

/** AI's recipe suggestion when it refuses nonsensical input. */
export interface RecipeSuggestion {
  title: string;
  ingredients: string[];
  description: string;
  /** Estimated total cooking time in minutes */
  estimatedTimeMinutes?: number;
  /** Which ingredients from the original request were removed/changed */
  removedIngredients?: string[];
}

/** Structured refusal from the AI (un-payload). */
export interface AiRefusalResponse {
  type: 'refusal';
  message: string;
  flaggedIngredients: string[];
  suggestions: RecipeSuggestion[];
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai' | 'system';
  text?: string;
  recipe?: Recipe;
  /** When the AI refused (nonsensical ingredients), show suggestions as buttons. */
  refusalSuggestions?: RecipeSuggestion[];
  /** True when the AI refused but provided no actionable suggestions — show retry. */
  refusalNoSuggestions?: boolean;
  timestamp: string;
  isTypingStep?: boolean;
  typingText?: string;
}

export interface SavedRecipe {
  id: string;
  recipe: Recipe;
  savedAt: string;
  isFavorite?: boolean;
  notes?: string;
}

export interface WizardFormData {
  targetConsumers: TargetConsumerId[];
  dishCategory: DishCategoryId;
  selectedIngredientIds: string[];
  customIngredients: string[];
  prepTimeLimit: string;
  notes?: string;
}

/** Konfigurasi admin (key-value payload) yang disimpan di admin_configs. */
export interface AdminConfig {
  id: string;
  config_key: string;
  config_value: any; // jsonb payload — boleh object/array/string/boolean/number
  description: string | null;
  updated_by: string | null;
  updated_at: string;
}

/** Laporan (report) dari user yang akan ditinjau/disetujui admin. */
export interface Report {
  id: string;
  reporter_id: string | null;
  target_type: 'comment' | 'recipe' | 'user' | 'content';
  target_id: string;
  reason: string;
  status: 'pending' | 'accepted' | 'rejected';
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

/**
 * Baris `profiles` + hitungan aktivitas, dipakai halaman Kelola Pengguna.
 * `email` hanya tersedia bila migrasi 015 sudah dijalankan (policy admin
 * membaca profiles); kolom hitungan diisi client dari tabel lain.
 */
export interface AdminUserRow {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  bio: string | null;
  created_at: string;
  recipe_count?: number;
  comment_count?: number;
}

/** Ulasan publik (recipe_reviews) + nama penulis, untuk moderasi admin. */
export interface AdminReviewRow {
  id: string;
  user_id: string;
  recipe_id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
  /** Judul resep, diisi client dari tabel recipes. */
  recipe_title?: string | null;
  /** Nama penulis dari profiles, diisi client. */
  author_name?: string | null;
}

/** Jejak tindakan admin (admin_audit_log). */
export interface AdminAuditEntry {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  detail: string | null;
  created_at: string;
}
