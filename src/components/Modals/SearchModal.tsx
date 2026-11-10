import React, { useState } from 'react';
import { X, Search, Sparkles, ChefHat } from 'lucide-react';
import { Recipe } from '../../types';
import { HOME_CATEGORIES } from '../../data/homeData';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRecipe: (recipe: Recipe) => void;
  onSearchQuery: (query: string) => void;
  recipes: Recipe[]; // full catalog from Supabase
}

/** Kata kunci tambahan (Indonesia/Inggris) per kategori hidangan. Judul resep di
 *  database sebagian berbahasa Inggris ("Rustic Sorghum Loaf Bread"), sehingga
 *  pencarian "roti" dulu kosong walau resepnya ada. */
const CATEGORY_ALIASES: Record<string, string[]> = {
  makanan_berat: ['berat', 'utama', 'nasi', 'rice', 'main course', 'makan siang', 'makan malam', 'lauk', 'bubur'],
  camilan_sehat: ['camilan', 'snack', 'snacks', 'kudapan', 'cookies', 'kue', 'biskuit', 'gorengan'],
  minuman_nutrisi: ['minuman', 'drink', 'jus', 'smoothie', 'cendol', 'dawet', 'susu', 'nutrisi'],
  dessert_rendah_gi: ['dessert', 'pencuci mulut', 'manis', 'puding', 'bolu', 'cake', 'kue'],
};

/** Terjemahan istilah bahan/istilah masak supaya satu kata kunci menemukan
 *  resep yang judulnya memakai bahasa lain. */
const TERM_ALIASES: Record<string, string[]> = {
  roti: ['bread', 'loaf', 'roti'],
  nasi: ['rice', 'nasi', 'beras'],
  // "beras sorgum" adalah sebutan lain untuk nasi/beras sorgum.
  beras: ['beras', 'nasi', 'rice'],
  mie: ['noodle', 'noodles', 'mie'],
  sup: ['soup', 'chowder', 'sup', 'krim'],
  bolu: ['cake', 'bolu'],
  kue: ['cookies', 'cookie', 'cake', 'kue', 'bolu'],
  bubur: ['porridge', 'bubur', 'tinutuan'],
  sehat: ['healthy', 'sehat'],
  manis: ['sweet', 'manis'],
  gurih: ['savory', 'gurih'],
  rendah: ['low', 'rendah'],
  gula: ['sugar', 'gula'],
  gandum: ['wheat', 'gandum'],
  sarapan: ['breakfast', 'sarapan'],
  bekal: ['lunchbox', 'bekal', 'school'],
  cahaya: ['light'],
};

/** Perluas kata kunci pencarian dengan padanan bahasa lain (dua arah). */
function expandQuery(q: string): string[] {
  const base = q.toLowerCase().trim();
  if (!base) return [];
  const terms = new Set<string>([base]);
  for (const [k, list] of Object.entries(TERM_ALIASES)) {
    if (base.includes(k) || list.some((x) => base.includes(x))) {
      terms.add(k);
      list.forEach((x) => terms.add(x));
    }
  }
  return [...terms];
}

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  onSelectRecipe,
  onSearchQuery,
  recipes,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  const allAvailableRecipes: Recipe[] = recipes;

  const q = searchTerm.toLowerCase().trim();
  const terms = expandQuery(searchTerm);
  const dishes = terms.map((t) => t.replace(/\s+/g, '_'));

  /** Cocok kalau: ada kata kunci yang ketemu di judul/subtag/tag/bahan, ATAU
   *  kategorinya dikenali dari sinonim (mis. "roti" -> tak ada hasil judul,
   *  tapi "camilan/kue" masuk kategori yang cocok). */
  const matches = (r: Recipe) => {
    const haystack = [r.title, r.subtitle, r.dishCategory, r.targetAge, ...(r.tags || []), ...r.ingredients.map((i) => i.name)]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const directHit = terms.some((t) => t.length > 1 && haystack.includes(t));
    if (directHit) return true;
    const aliases = CATEGORY_ALIASES[dishes.find((d) => CATEGORY_ALIASES[d]) || ''];
    if (aliases) return aliases.some((a) => haystack.includes(a) || q.includes(a));
    return false;
  };

  const filteredRecipes = allAvailableRecipes.filter(matches);

  const quickKeywords = [
    'Nasi Goreng',
    'Bebas Gluten',
    'Low GI',
    'Pancake',
    'Roti Sorgum',
    'Resep Hemat',
    'Anak SD',
  ];

  return (
    <div className="fixed inset-0 z-50 bg-[#1A1C1B]/70 backdrop-blur-sm flex items-start justify-center pt-16 sm:pt-24 px-4">
      <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
        {/* Search Header */}
        <div className="p-4 border-b border-[#e2e3e1] flex items-center gap-3">
          <Search className="w-5 h-5 text-[#727972] flex-shrink-0" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari resep, bahan, atau kebutuhan diet..."
            autoFocus
            className="flex-1 text-sm sm:text-base outline-none text-[#1A1C1B] placeholder-[#727972]"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchTerm.trim()) {
                // Hanya panggil aksinya. `onSelectRecipe`/`onSearchQuery` sudah
                // menutup modal + memindahkan URL; memanggil onClose() SETELAHNYA
                // membuat URL ditimpa kembali ke tab lama (bug: cari lalu Enter
                // selalu berakhir di Beranda).
                onSearchQuery(searchTerm.trim());
              }
            }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="p-1 rounded-full text-[#727972] hover:bg-[#f4f4f2]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="text-xs font-bold text-[#163422] px-2 py-1 rounded-lg hover:bg-[#f4f4f2]"
          >
            Batal
          </button>
        </div>

        {/* Quick keywords */}
        <div className="px-4 py-2.5 bg-[#f9f9f7] border-b border-[#e2e3e1] flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <span className="text-[11px] font-bold text-[#727972] flex-shrink-0">
            Saran:
          </span>
          {quickKeywords.map((kw, i) => (
            <button
              key={i}
              onClick={() => setSearchTerm(kw)}
              className="text-[11px] px-2.5 py-0.5 rounded-full bg-white border border-[#e2e3e1] text-[#424843] hover:border-[#163422] whitespace-nowrap"
            >
              {kw}
            </button>
          ))}
        </div>

        {/* Results List */}
        <div className="p-4 overflow-y-auto space-y-2 flex-1">
          {searchTerm ? (
            filteredRecipes.length > 0 ? (
              filteredRecipes.map((rec) => (
                <div
                  key={rec.id}
                  onClick={() => onSelectRecipe(rec)}
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#f9f9f7] border border-[#e2e3e1] cursor-pointer transition-all"
                >
                  <div className="w-12 h-12 rounded-lg bg-[#f4f4f2] overflow-hidden flex-shrink-0">
                    <img
                      data-food
                      src={rec.imageUrl}
                      alt={rec.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-xs sm:text-sm text-[#163422] truncate">
                      {rec.title}
                    </h4>
                    <span className="text-[11px] text-[#727972]">
                      {rec.dishCategory}
                    </span>
                  </div>
                  <span className="text-xs font-bold text-[#163422] flex items-center gap-1">
                    Lihat →
                  </span>
                </div>
              ))
            ) : (
              <div className="text-center py-8 space-y-3">
                <ChefHat className="w-10 h-10 text-[#c2c8c0] mx-auto" />
                <p className="text-xs text-[#727972]">
                  Tidak ada resep lokal tersimpan untuk &ldquo;{searchTerm}&rdquo;.
                </p>
                <button
                  onClick={() => {
                    onSearchQuery(`Buatkan resep sorgum kreatif dengan kata kunci: ${searchTerm}`);
                    onClose();
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#163422] text-white text-xs font-bold rounded-xl shadow-xs"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#fdc65c]" />
                  Tanyakan pada AI Generator
                </button>
              </div>
            )
          ) : (
            <div className="space-y-3 py-2">
              <span className="text-xs font-bold text-[#163422] uppercase tracking-wider block">
                Kategori Populer
              </span>
              <div className="grid grid-cols-2 gap-2">
                {HOME_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSearchTerm(cat.name)}
                    className="p-2.5 rounded-xl border border-[#e2e3e1] text-left hover:border-[#163422] hover:bg-[#f9f9f7] transition-all flex items-center justify-between"
                  >
                    <span className="font-bold text-xs text-[#163422]">
                      {cat.name}
                    </span>
                    <span className="text-[11px] text-[#727972]">
                      {cat.nameId}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
