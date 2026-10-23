import React from 'react';
import { Search, Library as LibraryIcon, ChevronDown, LogOut, Radio, User } from 'lucide-react';
import { useAuth } from '../../stores/authStore';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onNavigateSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  onSearchChange,
  onNavigateSettings,
}) => {
  const { user, serverUrl, libraries, activeLibraryId, setActiveLibrary, logout } = useAuth();
  const [showLibMenu, setShowLibMenu] = React.useState(false);
  const [showUserMenu, setShowUserMenu] = React.useState(false);

  const activeLib = libraries.find(l => l.id === activeLibraryId);
  const serverHost = serverUrl ? new URL(serverUrl).host : 'Connected';

  return (
    <header className="h-16 bg-[#13161a] border-b border-[#232830] px-4 md:px-8 flex items-center justify-between gap-4 sticky top-0 z-30">
      {/* Brand & Library Selector */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center">
            <Radio className="w-4 h-4 text-teal-400" />
          </div>
          <span className="font-serif font-bold text-lg text-neutral-100 tracking-tight hidden sm:inline">
            Folio
          </span>
        </div>

        {/* Library Switcher */}
        {libraries.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowLibMenu(!showLibMenu)}
              className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-[#181c21] hover:bg-[#20252b] border border-[#232830] text-xs font-medium text-stone-300 transition-colors"
            >
              <LibraryIcon className="w-3.5 h-3.5 text-teal-400" />
              <span className="max-w-[140px] truncate">{activeLib?.name || 'Select Library'}</span>
              <ChevronDown className="w-3.5 h-3.5 text-stone-500" />
            </button>

            {showLibMenu && (
              <div
                className="absolute top-full left-0 mt-1.5 w-52 rounded-xl bg-[#181c21] border border-[#232830] shadow-2xl py-1 z-40 animate-fade-in"
                onMouseLeave={() => setShowLibMenu(false)}
              >
                <div className="px-3 py-1.5 text-[10px] uppercase font-semibold text-stone-400 tracking-wider">
                  Libraries
                </div>
                {libraries.map((lib) => (
                  <button
                    key={lib.id}
                    onClick={() => {
                      setActiveLibrary(lib.id);
                      setShowLibMenu(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-neutral-800 transition-colors ${
                      lib.id === activeLibraryId ? 'text-teal-400 font-medium bg-teal-500/5' : 'text-stone-300'
                    }`}
                  >
                    <span className="truncate">{lib.name}</span>
                    <span className="text-[10px] text-stone-400 capitalize">{lib.mediaType}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Global Search Bar */}
      <div className="flex-1 max-w-md mx-2">
        <div className="relative">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search titles, authors, series..."
            className="w-full bg-[#181c21] border border-[#232830] focus:border-teal-500/60 rounded-full pl-9 pr-4 py-1.5 text-xs text-neutral-100 placeholder-stone-500 outline-none transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-white text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Server Status & User Profile */}
      <div className="flex items-center gap-3">
        {/* Server Indicator Pill */}
        <div className="hidden lg:flex items-center gap-2 py-1 px-3 rounded-full bg-teal-950/40 border border-teal-800/40 text-[11px] text-teal-300">
          <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
          <span className="truncate max-w-[150px]">{serverHost}</span>
        </div>

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 p-1.5 rounded-full hover:bg-neutral-800 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 flex items-center justify-center text-xs font-semibold">
              {user?.username ? user.username[0].toUpperCase() : <User className="w-3.5 h-3.5" />}
            </div>
          </button>

          {showUserMenu && (
            <div
              className="absolute top-full right-0 mt-2 w-48 rounded-xl bg-[#181c21] border border-[#232830] shadow-2xl py-1 z-40 animate-fade-in"
              onMouseLeave={() => setShowUserMenu(false)}
            >
              <div className="px-3 py-2 border-b border-neutral-800/60">
                <span className="block text-xs font-semibold text-neutral-100">{user?.username}</span>
                <span className="block text-[10px] text-stone-400 truncate">{serverHost}</span>
              </div>
              <button
                onClick={() => {
                  setShowUserMenu(false);
                  onNavigateSettings();
                }}
                className="w-full text-left px-3 py-2 text-xs text-stone-300 hover:bg-neutral-800 transition-colors"
              >
                Settings & Preferences
              </button>
              <button
                onClick={() => {
                  setShowUserMenu(false);
                  logout();
                }}
                className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2"
              >
                <LogOut className="w-3.5 h-3.5" /> Disconnect
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
