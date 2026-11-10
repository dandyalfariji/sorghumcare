import React from 'react';
import { Plus, MessageSquare, Settings, X, Sparkles, BookOpen, ArrowLeft, Trash2, User } from 'lucide-react';
import { SavedRecipe } from '../../types';
import { GLOBAL_FALLBACK_FOOD_IMAGE } from '../../data/imageAssets';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onNewRecipeChat: () => void;
  recentChats: { id: string; title: string; time?: string; preview?: string }[];
  activeChatId: string;
  onSelectChat: (chatId: string) => void;
  onDeleteChat?: (chatId: string) => void;
  savedRecipes: SavedRecipe[];
  onSelectSavedRecipe: (saved: SavedRecipe) => void;
  onSeeAllRecipes?: () => void;
  onOpenProfile: () => void;
  onStartWizard: () => void;
  onNavigateTab?: (tab: 'home' | 'explore' | 'generate' | 'profile') => void;
  isGoogleUser?: boolean;
  googleDisplayName?: string;
  googleAvatarUrl?: string | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  onNewRecipeChat,
  recentChats,
  activeChatId,
  onSelectChat,
  onDeleteChat,
  savedRecipes,
  onSelectSavedRecipe,
  onSeeAllRecipes,
  onOpenProfile,
  onStartWizard,
  onNavigateTab,
  isGoogleUser = false,
  googleDisplayName,
  googleAvatarUrl,
}) => {
  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          id="sidebar-overlay"
          onClick={onClose}
          className="fixed inset-0 bg-[#1A1C1B]/30 z-40 md:hidden backdrop-blur-xs transition-opacity"
        />
      )}

      {/* Sidebar Container */}
      <aside
        id="sidebar"
        className={`fixed md:sticky inset-y-0 left-0 w-[280px] bg-white z-50 md:top-0 md:self-start md:h-screen shadow-2xl md:shadow-none flex flex-col h-full overflow-y-auto border-r border-[#e2e3e1] transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Top Branding & Close Header */}
        <div className="p-4 flex items-center justify-between gap-3 border-b border-[#f4f4f2]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#163422] flex items-center justify-center text-white font-bold text-base">
              🌾
            </div>
            <span className="font-bold text-xl text-[#163422] tracking-tight">
              SorghumCare
            </span>
          </div>

          {/* Close Sidebar Button in Header */}
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-[#424843] hover:text-[#163422] hover:bg-[#e2e3e1] transition-colors cursor-pointer active:scale-95"
            aria-label="Tutup Menu Sidebar"
            title="Tutup Menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Buttons & Navigation Content */}
        <div className="flex-grow px-3.5 py-4 space-y-6">
          {/* Back Action Bar */}
          {onNavigateTab && (
            <div className="pb-1">
              <button
                onClick={() => {
                  onNavigateTab('home');
                  onClose();
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-[#f4f4f2] hover:bg-[#163422]/10 text-[#163422] text-xs font-bold transition-all border border-[#e2e3e1] active:scale-95 cursor-pointer"
                title="Kembali ke Beranda"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Kembali ke Beranda</span>
              </button>
            </div>
          )}

          {/* New Chat Button */}
          <div className="space-y-2">
            <button
              id="btn-new-recipe-chat"
              onClick={() => {
                onNewRecipeChat();
                if (window.innerWidth < 768) onClose();
              }}
              className="w-full flex items-center gap-3 bg-[#f9f9f7] hover:bg-[#163422]/10 border border-[#c2c8c0]/70 rounded-2xl p-3 transition-all text-[#163422] font-semibold text-sm shadow-xs active:scale-[0.98]"
            >
              <Plus className="w-5 h-5 text-[#163422]" />
              <span>New Recipe Chat</span>
            </button>

          </div>

          {/* Recent Sessions */}
          <div>
            <h3 className="px-3 text-xs font-bold text-[#727972] uppercase tracking-wider mb-2">
              Recent
            </h3>
            <ul className="space-y-1">
              {recentChats.map((chat) => {
                const isActive = activeChatId === chat.id;
                const isLegacy = chat.id.startsWith('chat-');
                return (
                  <li key={chat.id} className="group flex items-center gap-1">
                    <button
                      onClick={() => {
                        onSelectChat(chat.id);
                        if (window.innerWidth < 768) onClose();
                      }}
                      className={`flex-1 min-w-0 flex items-center gap-3 p-2.5 rounded-xl transition-all text-left text-xs sm:text-sm ${
                        isActive
                          ? 'bg-[#163422]/10 text-[#163422] font-semibold'
                          : 'text-[#424843] hover:bg-[#f4f4f2] hover:text-[#163422]'
                      }`}
                    >
                      <MessageSquare className="w-4 h-4 text-[#727972] flex-shrink-0" />
                      <span className="truncate flex-1">{chat.title}</span>
                    </button>
                    {!isLegacy && onDeleteChat && (
                      <button
                        onClick={() => onDeleteChat(chat.id)}
                        title="Hapus sesi & resepnya"
                        aria-label="Hapus sesi"
                        className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-[#b0b5af] hover:text-[#ba1a1a] hover:bg-[#ffdad6]/40 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Recipe Catalog matching the HTML */}
          <div>
            <div className="flex items-center justify-between px-3 mb-2">
              <h3 className="text-xs font-bold text-[#727972] uppercase tracking-wider">
                My Recipes
              </h3>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-[#163422] bg-[#163422]/10 px-1.5 py-0.5 rounded-full">
                  {savedRecipes.length}
                </span>
                {onSeeAllRecipes && (
                  <button
                    onClick={onSeeAllRecipes}
                    className="text-[10px] font-bold text-[#163422] border border-[#163422]/30 hover:bg-[#163422] hover:text-white px-2 py-0.5 rounded-full transition-colors cursor-pointer"
                    title="Lihat semua resep tersimpan"
                  >
                    See All
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 px-1">
              {savedRecipes.slice(0, 3).map((saved) => (
                <div
                  key={saved.id}
                  onClick={() => {
                    onSelectSavedRecipe(saved);
                    if (window.innerWidth < 768) onClose();
                  }}
                  className="bg-[#e2e3e1] rounded-xl aspect-square overflow-hidden group cursor-pointer relative shadow-xs hover:shadow-md transition-all border border-[#e2e3e1]"
                >
                  <img
                    data-food
                    alt={saved.recipe.title}
                    src={saved.recipe.imageUrl || GLOBAL_FALLBACK_FOOD_IMAGE}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = GLOBAL_FALLBACK_FOOD_IMAGE;
                    }}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-90 group-hover:opacity-100 transition-opacity flex items-end p-2">
                    <span className="text-white text-[11px] font-medium leading-tight truncate">
                      {saved.recipe.title.replace(' (SD Edition)', '').replace(' Bebas Gluten', '')}
                    </span>
                  </div>
                </div>
              ))}

              {/* Add New Recipe Card */}
              <div
                onClick={() => {
                  onStartWizard();
                  if (window.innerWidth < 768) onClose();
                }}
                className="bg-[#f4f4f2] rounded-xl aspect-square flex flex-col items-center justify-center border border-dashed border-[#c2c8c0] hover:bg-[#e2e3e1]/50 transition-colors cursor-pointer text-[#424843] group p-2 text-center"
              >
                <Plus className="w-5 h-5 text-[#163422] group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-semibold text-[#163422] mt-1">
                  Buat Resep
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* User Profile Footer matching the HTML */}
        <div className="p-3.5 border-t border-[#e2e3e1] bg-[#f9f9f7] mt-auto">
          <button
            onClick={onOpenProfile}
            className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-[#e2e3e1]/60 transition-colors text-left text-sm text-[#1A1C1B]"
          >
            <div className="w-9 h-9 rounded-full bg-[#e2e3e1] overflow-hidden flex-shrink-0 border border-[#c2c8c0] flex items-center justify-center">
              {isGoogleUser && googleAvatarUrl ? (
                <img
                  alt={googleDisplayName || 'User'}
                  src={googleAvatarUrl}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-5 h-5 text-[#727972]" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <span className="font-semibold text-xs text-[#163422] block truncate">
                {googleDisplayName || 'Guest'}
              </span>
              <span className="text-[10px] text-[#727972] block truncate">
                {isGoogleUser ? 'Google Account' : 'Guest Mode'}
              </span>
            </div>
            <Settings className="w-4 h-4 text-[#727972] flex-shrink-0" />
          </button>
        </div>
      </aside>
    </>
  );
};
