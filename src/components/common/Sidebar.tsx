import React from 'react';
import { Home, Library as LibraryIcon, Headphones, BookOpen, Heart, Settings } from 'lucide-react';

export type NavTab = 'home' | 'library' | 'audiobooks' | 'ebooks' | 'favorites' | 'settings';

interface SidebarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  favoritesCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  favoritesCount = 0,
}) => {
  const navItems = [
    { id: 'home' as NavTab, label: 'Home', icon: Home },
    { id: 'library' as NavTab, label: 'All Library', icon: LibraryIcon },
    { id: 'audiobooks' as NavTab, label: 'Audiobooks', icon: Headphones },
    { id: 'ebooks' as NavTab, label: 'Ebooks', icon: BookOpen },
    { id: 'favorites' as NavTab, label: 'Favorites', icon: Heart, badge: favoritesCount > 0 ? favoritesCount : undefined },
    { id: 'settings' as NavTab, label: 'Settings', icon: Settings },
  ];

  return (
    <>
      {/* Desktop Left Sidebar */}
      <aside className="hidden md:flex w-64 bg-[#13161a] border-r border-[#232830] flex-col justify-between p-4 shrink-0">
        <div className="flex flex-col gap-1.5">
          <div className="px-3 py-2 text-[10px] uppercase font-semibold text-stone-400 tracking-wider">
            Navigation
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-teal-500/10 text-teal-300 font-semibold border border-teal-500/30 shadow-sm'
                    : 'text-stone-400 hover:text-stone-200 hover:bg-[#181c21]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-teal-400' : 'text-stone-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-neutral-800 text-stone-300">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Minimal Footer Info */}
        <div className="p-3 bg-[#181c21] rounded-xl border border-[#232830] text-[11px] text-stone-400 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="font-medium text-stone-300">Folio</span>
            <span className="text-[10px] text-teal-400/80 font-mono">v1.0</span>
          </div>
          <p className="text-[10px] text-stone-400">
            Unified Audiobookshelf reader & listener
          </p>
        </div>
      </aside>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#13161a]/95 backdrop-blur-md border-t border-[#232830] px-2 flex items-center justify-around z-40">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`flex flex-col items-center justify-center p-2 rounded-lg transition-colors ${
                isActive ? 'text-teal-400' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] mt-0.5 font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};
