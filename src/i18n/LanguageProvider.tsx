/**
 * LanguageProvider — mesin fitur "App Language" SorghumCare.
 *
 * MASALAH YANG DIPERBAIKI
 * -----------------------
 * Sebelumnya tombol App Language hanya menyimpan pilihan ke localStorage dan
 * mengganti atribut `<html lang>`, TANPA mengubah satu pun teks di layar —
 * sehingga terasa "tidak berfungsi" walau pilihannya tersimpan.
 *
 * PENDEKATAN
 * ----------
 * Seluruh antarmuka ditulis dalam Bahasa Indonesia dengan string langsung di
 * JSX (bukan lewat fungsi `t()`), jadi menerjemahkan 40+ komponen satu per satu
 * berisiko: satu elemen terlewat dan UI jadi campur bahasa. Provider ini
 * menerjemahkan **di lapisan DOM**: setiap teks dicocokkan persis dengan kamus
 * (`dictionary.ts` dkk) lalu diganti saat bahasa Inggris dipilih.
 *
 * Keuntungan:
 *  - jangkauan penuh, termasuk judul/deskripsi dari `data/*.ts` dan semua
 *    `placeholder` / `title` / `aria-label`;
 *  - kode komponen tidak perlu disentuh, jadi tidak ada risiko regresi layout;
 *  - dapat dibalik: teks dasar disimpan di `WeakMap`, sehingga kembali ke
 *    Bahasa Indonesia selalu memulihkan teks aslinya.
 *
 * YANG SENGAJA DILEWATI
 * ---------------------
 *  - Subtree ber-`data-no-i18n` (gelembung chat): berisi jawaban AI.
 *  - `<script>`, `<style>`, `<textarea>`, `<code>`, `<pre>`.
 *  - Teks yang tidak ada di kamus: dibiarkan apa adanya (mis. judul resep
 *    buatan pengguna), jadi tidak pernah muncul terjemahan setengah jadi.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ID_TO_EN, type Dict } from './dictionary';
import { ID_TO_EN_CONTENT } from './dictionary.content';
import { ID_TO_EN_ADMIN } from './dictionary.admin';

export type AppLanguage = 'English' | 'Bahasa Indonesia';

const STORAGE_KEY = 'bima_app_language';
const ATTR_NAMES = ['placeholder', 'title', 'aria-label', 'alt'] as const;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE']);
/** Batas panjang teks yang boleh diterjemahkan. */
const MAX_LEN = 320;

/** Gabungan seluruh kamus (antarmuka + konten + panel admin). */
export const DICTIONARY: Dict = {
  ...ID_TO_EN,
  ...ID_TO_EN_CONTENT,
  ...ID_TO_EN_ADMIN,
};

/**
 * Teks/atribut dasar yang diganti saat diterjemahkan, agar bisa dipulihkan.
 * Memakai WeakMap, bukan atribut, supaya DOM tetap bersih di DevTools.
 */
const textBase = new WeakMap<Text, string>();
const attrBase = new WeakMap<Element, Record<string, string>>();

/** Bahasa aktif untuk pemakaian di luar React (mis. helper non-komponen). */
let currentLanguage: AppLanguage = 'Bahasa Indonesia';

/** Pola teks yang memuat angka sehingga tidak bisa jadi kunci kamus tetap. */
function translateDynamic(core: string): string | undefined {
  let m = /^Hasil generate saya \((\d+)\)$/.exec(core);
  if (m) return `My generated results (${m[1]})`;
  m = /^(\d+) resep$/.exec(core);
  if (m) return `${m[1]} recipes`;
  m = /^(\d+) menu$/.exec(core);
  if (m) return `${m[1]} menus`;
  m = /^(\d+) komentar$/.exec(core);
  if (m) return `${m[1]} comments`;
  m = /^(\d+) suka$/.exec(core);
  if (m) return `${m[1]} likes`;
  m = /^(\d+) ulasan$/.exec(core);
  if (m) return `${m[1]} reviews`;
  m = /^Langkah (\d+) dari (\d+)$/.exec(core);
  if (m) return `Step ${m[1]} of ${m[2]}`;
  m = /^(\d+)–(\d+) menit$/.exec(core);
  if (m) return `${m[1]}–${m[2]} minutes`;
  m = /^(\d+) menit$/.exec(core);
  if (m) return `${m[1]} minutes`;
  m = /^(\d+) jam$/.exec(core);
  if (m) return `${m[1]} hours`;
  m = /^(\d+) hari$/.exec(core);
  if (m) return `${m[1]} days`;
  m = /^(\d+) hari lalu$/.exec(core);
  if (m) return `${m[1]} days ago`;
  m = /^([\d.,]+)g Serat$/.exec(core);
  if (m) return `${m[1]}g Fiber`;
  return undefined;
}

/** Cari padanan sebuah potongan teks. */
function lookup(raw: string): string | undefined {
  const core = raw.trim();
  if (!core || core.length > MAX_LEN) return undefined;
  return DICTIONARY[core] ?? translateDynamic(core);
}

/**
 * Ganti isi satu node teks dengan padanannya, TANPA membuang spasi di tepinya.
 *
 * Penting untuk node yang mengandung sebagian kalimat saja: JSX seperti
 * `{totalTime} Menit` menghasilkan node " Menit" (dengan spasi di depan), dan
 * menggantinya dengan "Minutes" polos akan menempelkan angka ke kata
 * ("25Minutes"). Spasi tepi asli dikembalikan apa adanya.
 */
function replaceText(node: Text, raw: string, hit: string): void {
  const core = raw.trim();
  const start = raw.indexOf(core);
  const lead = raw.slice(0, start);
  const tail = raw.slice(start + core.length);
  node.data = lead + hit + tail;
}

/** Terjemahkan satu potongan teks (dipakai juga di luar React). */
export function tt(text: string): string {
  if (!text || currentLanguage !== 'English') return text;
  return lookup(text) ?? text;
}

/** Apakah elemen ini (atau leluhurnya) dilindungi dari terjemahan? */
function isProtected(el: Element): boolean {
  let node: Element | null = el;
  while (node) {
    if (typeof node.hasAttribute === 'function' && node.hasAttribute('data-no-i18n')) return true;
    if (SKIP_TAGS.has(node.tagName)) return true;
    node = node.parentElement;
  }
  return false;
}

function applyAttributes(el: Element, toEnglish: boolean): boolean {
  let changed = false;
  if (toEnglish) {
    let saved: Record<string, string> | null = null;
    for (const name of ATTR_NAMES) {
      const value = el.getAttribute(name);
      if (!value) continue;
      const hit = lookup(value);
      if (hit === undefined || hit === value) continue;
      saved = saved ?? {};
      saved[name] = value;
      el.setAttribute(name, hit);
      changed = true;
    }
    if (saved) {
      const prev = attrBase.get(el);
      attrBase.set(el, { ...(prev ?? {}), ...saved });
    }
  } else {
    const saved = attrBase.get(el);
    if (saved) {
      for (const [name, value] of Object.entries(saved)) {
        if (el.getAttribute(name) !== value) {
          el.setAttribute(name, value);
          changed = true;
        }
      }
      attrBase.delete(el);
    }
  }
  return changed;
}

/**
 * Terjemahkan (atau pulihkan) satu elemen beserta isinya.
 *
 * Node teks disimpan dasarnya per-node di `textBase`, sehingga elemen dengan
 * beberapa anak teks (mis. `Lihat <strong>Resep</strong>`) ikut tertangani tanpa
 * merusak markup.
 */
function walkElement(el: Element, toEnglish: boolean): boolean {
  let changed = applyAttributes(el, toEnglish);

  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === 3) {
      const node = child as Text;
      const raw = node.data;
      if (!raw || !raw.trim()) continue;

      if (toEnglish) {
        const hit = lookup(raw);
        if (hit === undefined || hit === raw) continue;
        if (!textBase.has(node)) textBase.set(node, raw);
        replaceText(node, raw, hit);
        changed = true;
      } else if (textBase.has(node)) {
        const base = textBase.get(node)!;
        if (node.data !== base) {
          node.data = base;
          changed = true;
        }
        textBase.delete(node);
      }
    } else if (child.nodeType === 1) {
      const childEl = child as Element;
      if (isProtected(childEl)) continue;
      if (walkElement(childEl, toEnglish)) changed = true;
    }
  }
  return changed;
}

/** Telusuri seluruh root dan terjemahkan (atau pulihkan). */
function translateTree(root: Element, toEnglish: boolean): boolean {
  if (!root) return false;
  return walkElement(root, toEnglish);
}

interface LanguageContextValue {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  isEnglish: boolean;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'Bahasa Indonesia',
  setLanguage: () => {},
  isEnglish: false,
});

function readStoredLanguage(): AppLanguage {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'English' ? 'English' : 'Bahasa Indonesia';
  } catch {
    return 'Bahasa Indonesia';
  }
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<AppLanguage>(readStoredLanguage);
  const observerRef = useRef<MutationObserver | null>(null);
  const scheduledRef = useRef<number | null>(null);

  currentLanguage = language;

  const observe = useCallback(() => {
    const obs = observerRef.current;
    if (!obs || typeof document === 'undefined' || !document.body) return;
    obs.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributeFilter: [...ATTR_NAMES],
    });
  }, []);

  /**
   * Jalankan penerjemahan dengan observer DIMATIKAN lebih dulu.
   *
   * Mutasi yang kita hasilkan sendiri akan mengantre sebagai record dan
   * callback-nya baru dijalankan pada microtask berikutnya — jadi penanda
   * sinkron tidak cukup untuk mencegah lingkaran. `disconnect()` membuang
   * antrean record, sehingga umpan balik ke diri sendiri tidak mungkin terjadi.
   */
  const run = useCallback(
    (lang: AppLanguage) => {
      if (typeof document === 'undefined' || !document.body) return;
      // Selalu perbarui penanda bahasa sebelum menyentuh DOM: `run` bisa
      // dipanggil dari `scheduleRun` tanpa melewati `setLanguage` (mis. saat
      // penulisan ulang React memicu observer), dan penanda yang basi bisa
      // membuat penerjemahan "membalikkan" dirinya sendiri.
      currentLanguage = lang;
      // `index.html` selalu memuat lang="id"; atribut ini harus disinkronkan
      // setiap kali bahasa diterapkan, termasuk saat halaman baru dimuat ulang
      // (kalau hanya diandalkan pada `setLanguage`, reload akan mengembalikannya
      // ke "id" walau teksnya sudah berbahasa Inggris).
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('lang', lang === 'English' ? 'en' : 'id');
      }
      observerRef.current?.disconnect();
      try {
        translateTree(document.body, lang === 'English');
      } finally {
        observe();
      }
    },
    [observe],
  );

  /** Gabungkan beberapa mutasi beruntun menjadi satu penerjemahan. */
  const scheduleRun = useCallback(
    (lang: AppLanguage) => {
      if (scheduledRef.current !== null) return;
      const raf: number =
        typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame(() => {
              scheduledRef.current = null;
              run(lang);
            })
          : (setTimeout(() => {
              scheduledRef.current = null;
              run(lang);
            }, 16) as unknown as number);
      scheduledRef.current = raf;
      void raf;
    },
    [run],
  );

  const setLanguage = useCallback(
    (lang: AppLanguage) => {
      try {
        localStorage.setItem(STORAGE_KEY, lang);
      } catch {
        /* mode privat — abaikan */
      }
      currentLanguage = lang;
      setLanguageState(lang);
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('lang', lang === 'English' ? 'en' : 'id');
      }
      run(lang);
    },
    [run],
  );

  // Pantau DOM: React merender ulang tanpa memuat ulang halaman (pindah tab,
  // memuat data), sehingga teks baru terus bermunculan dan perlu ikut
  // diterjemahkan saat bahasa Inggris aktif.
  useEffect(() => {
    if (typeof document === 'undefined' || !document.body) return;
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() => {
      if (currentLanguage !== 'English') return;
      scheduleRun(currentLanguage);
    });
    observerRef.current = observer;

    // Terapkan bahasa tersimpan begitu provider terpasang.
    run(language);
    observe();

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Terapkan saat bahasa berganti.
  useEffect(() => {
    run(language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({ language, setLanguage, isEnglish: language === 'English' }),
    [language, setLanguage],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}

/** Dipakai di luar komponen (mis. helper) untuk membaca bahasa aktif. */
export function getActiveLanguage(): AppLanguage {
  return currentLanguage;
}
