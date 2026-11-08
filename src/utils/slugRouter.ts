import { AppTab } from '../components/Navigation/BottomNavBar';
import { 
  getRecipeSlug, 
  getTutorialSlug, 
  CATEGORY_SLUG_MAP, 
  SLUG_TO_CATEGORY_MAP 
} from './slugify';
import { Recipe } from '../types';
import { VideoTutorialItem } from '../data/homeData';

export type AppRouteType = 
  | 'home' 
  | 'explore' 
  | 'generate' 
  | 'wizard' 
  | 'profile' 
  | 'recipe' 
  | 'cook' 
  | 'tutorial' 
  | 'search'
  | 'admin'
  | 'belajar';

export interface ParsedRoute {
  routeType: AppRouteType;
  slug?: string;
  subSlug?: string;
  tab: AppTab;
  wizardStep?: number;
  categoryFilter?: string;
  searchQuery?: string;
}

/**
 * Normalizes browser path from both hash (#/...) and pathname (/...)
 */
export function getCurrentPath(): string {
  if (typeof window === 'undefined') return '/home';

  // Prefer hash routing if present (most reliable in sandboxed iframes)
  const hash = window.location.hash;
  if (hash && hash.startsWith('#')) {
    const cleanHash = hash.slice(1);
    if (cleanHash) return cleanHash.startsWith('/') ? cleanHash : `/${cleanHash}`;
  }

  const pathname = window.location.pathname;
  if (pathname && pathname !== '/') {
    return pathname;
  }

  return '/home';
}

/**
 * Parses current path into structured route object.
 */
export function parseRoute(path: string): ParsedRoute {
  // Strip leading/trailing slashes and split
  const cleanPath = path.split('?')[0].replace(/^\/+|\/+$/g, '');
  const segments = cleanPath ? cleanPath.split('/') : ['home'];
  const first = segments[0]?.toLowerCase() || 'home';
  const second = segments[1] || '';
  const third = segments[2] || '';

  // 1. Recipe Detail (/recipe/:slug)
  if (first === 'recipe' && second) {
    return {
      routeType: 'recipe',
      slug: second,
      tab: 'explore',
    };
  }

  // 2. Cook Mode (/cook/:slug)
  if (first === 'cook' && second) {
    return {
      routeType: 'cook',
      slug: second,
      tab: 'explore',
    };
  }

  // 3. Tutorial Video (/tutorial/:slug)
  if (first === 'tutorial' && second) {
    return {
      routeType: 'tutorial',
      slug: second,
      tab: 'home',
    };
  }

  // 4. Wizard (/wizard or /wizard/step-1..4)
  if (first === 'wizard') {
    let step = 1;
    if (second && second.startsWith('step-')) {
      const parsedNum = parseInt(second.replace('step-', ''), 10);
      if (!isNaN(parsedNum) && parsedNum >= 1 && parsedNum <= 4) {
        step = parsedNum;
      }
    }
    return {
      routeType: 'wizard',
      tab: 'generate',
      wizardStep: step,
    };
  }

  // 5. Explore (/explore or /explore/:categorySlug)
  if (first === 'explore') {
    const categoryFilter = second ? SLUG_TO_CATEGORY_MAP[second] || second : undefined;
    return {
      routeType: 'explore',
      slug: second,
      tab: 'explore',
      categoryFilter,
    };
  }

  // 6. Generate (/generate)
  if (first === 'generate') {
    return {
      routeType: 'generate',
      tab: 'generate',
    };
  }

  // 7. Profile (/profile, /profile/saved, /profile/posted)
  if (first === 'profile') {
    const list = second === 'saved' || second === 'posted' ? second : undefined;
    return {
      routeType: 'profile',
      slug: list,
      tab: 'profile',
    };
  }

  // 8. Search (/search)
  if (first === 'search') {
    return {
      routeType: 'search',
      tab: 'home',
    };
  }

  // 9. Admin (/admin, /admin/:section)
  if (first === 'admin') {
    return {
      routeType: 'admin',
      // Bagian admin (dashboard/komentar/laporan/resep/pengaturan) harus
      // diteruskan. Sebelumnya tidak diisi, sehingga semua menu admin
      // selalu menampilkan Dashboard walau URL-nya berubah.
      slug: second || undefined,
      tab: 'profile',
    };
  }

  // 10. Belajar (/belajar, /belajar/:section, /belajar/:section/:id)
  if (first === 'belajar') {
    return {
      routeType: 'belajar',
      slug: second || undefined,
      subSlug: third || undefined,
      tab: 'belajar',
    };
  }

  // Default Home
  return {
    routeType: 'home',
    tab: 'home',
  };
}

/**
 * Updates browser URL with the specified slug path safely.
 */
export function navigateToSlug(slugPath: string, replace = false): void {
  if (typeof window === 'undefined') return;

  const normalized = slugPath.startsWith('/') ? slugPath : `/${slugPath}`;
  const hashTarget = `#${normalized}`;

  try {
    if (replace) {
      window.history.replaceState({ path: normalized }, '', hashTarget);
    } else {
      window.history.pushState({ path: normalized }, '', hashTarget);
    }
    // Also trigger hash change event manually in case window listeners need it
    window.dispatchEvent(new Event('popstate'));
  } catch {
    window.location.hash = hashTarget;
  }
}

/**
 * Helpers to build slug URLs
 */
export const RouteSlugs = {
  home: () => '/home',
  explore: (categoryKey?: string) => {
    if (categoryKey && CATEGORY_SLUG_MAP[categoryKey]) {
      return `/explore/${CATEGORY_SLUG_MAP[categoryKey]}`;
    }
    return '/explore';
  },
  generate: () => '/generate',
  wizard: (step = 1) => `/wizard/step-${step}`,
  profile: () => '/profile',
  profileList: (list: 'saved' | 'posted') => `/profile/${list}`,
  recipe: (recipe: Recipe) => `/recipe/${getRecipeSlug(recipe)}`,
  recipeSlug: (slug: string) => `/recipe/${slug}`,
  cook: (recipe: Recipe) => `/cook/${getRecipeSlug(recipe)}`,
  tutorial: (tut: VideoTutorialItem) => `/tutorial/${getTutorialSlug(tut)}`,
  search: () => '/search',
  belajar: (section?: string, id?: string) =>
    ['/belajar', section, id].filter(Boolean).join('/'),
  admin: () => '/admin',
};

/**
 * Returns a clean shareable URL link for displaying or copying.
 */
export function getShareableUrl(slugPath: string): string {
  if (typeof window === 'undefined') return slugPath;
  const origin = window.location.origin;
  const normalized = slugPath.startsWith('/') ? slugPath : `/${slugPath}`;
  return `${origin}/#${normalized}`;
}
