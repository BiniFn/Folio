import React, { useState, useEffect } from 'react';
import { useAuth, authStore } from './stores/authStore';
import { Header } from './components/common/Header';
import { Sidebar, NavTab } from './components/common/Sidebar';
import { HomePage } from './pages/HomePage';
import { LibraryPage, FilterType } from './pages/LibraryPage';
import { SettingsPage } from './pages/SettingsPage';
import { ConnectPage } from './pages/ConnectPage';
import { AudiobookPlayer } from './components/player/AudiobookPlayer';
import { EbookReader } from './components/reader/EbookReader';
import { BookDetailModal } from './components/common/BookDetailModal';
import { LibraryItem } from './types/audiobookshelf';
import { SAMPLE_LIBRARIES, SAMPLE_ITEMS } from './utils/sampleData';

const FAVORITES_STORAGE_KEY = 'abs_favorites_v1';

export const App: React.FC = () => {
  const { isAuthenticated, isLoading, initSession } = useAuth();
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [detailItem, setDetailItem] = useState<LibraryItem | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(FAVORITES_STORAGE_KEY);
      return saved ? new Set(JSON.parse(saved)) : new Set(['li_mushoku_17']);
    } catch {
      return new Set(['li_mushoku_17']);
    }
  });

  useEffect(() => {
    initSession();
  }, []);

  const handleToggleFavorite = (itemId: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      try {
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(next)));
      } catch (err) {
        console.error('Failed to save favorites', err);
      }
      return next;
    });
  };

  const handleExploreDemo = () => {
    // Populate demo session in memory
    authStore.login('https://abs.demo.internal', 'demo-reader', 'demo-password', false).catch(() => {
      // In demo mode, bypass network and activate demo mode directly
      setIsDemoMode(true);
    });
    setIsDemoMode(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#12161a] flex flex-col items-center justify-center text-stone-400 gap-4">
        <div className="w-10 h-10 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs uppercase tracking-widest text-stone-500 font-medium">
          Loading Library Session...
        </span>
      </div>
    );
  }

  // Not logged in and not in demo mode
  if (!isAuthenticated && !isDemoMode) {
    return (
      <ConnectPage
        onConnectSuccess={() => setIsDemoMode(false)}
        onExploreDemo={handleExploreDemo}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#13161a] text-neutral-100 flex flex-col overflow-hidden">
      {/* Top Header */}
      <Header
        searchQuery={searchQuery}
        onSearchChange={(q) => {
          setSearchQuery(q);
          if (q && activeTab === 'home') {
            setActiveTab('library');
          }
        }}
        onNavigateSettings={() => setActiveTab('settings')}
      />

      {/* Main Body with Sidebar + Active Page */}
      <div className="flex-1 flex overflow-hidden relative">
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          favoritesCount={favorites.size}
        />

        <main className="flex-1 flex overflow-hidden relative bg-[#12161a]">
          {activeTab === 'home' && (
            <HomePage
              onOpenDetails={setDetailItem}
              onNavigateLibrary={() => setActiveTab('library')}
              favorites={favorites}
              onToggleFavorite={handleToggleFavorite}
            />
          )}

          {activeTab === 'library' && (
            <LibraryPage
              searchQuery={searchQuery}
              onOpenDetails={setDetailItem}
              favorites={favorites}
              onToggleFavorite={handleToggleFavorite}
              initialFilter="all"
            />
          )}

          {activeTab === 'audiobooks' && (
            <LibraryPage
              searchQuery={searchQuery}
              onOpenDetails={setDetailItem}
              favorites={favorites}
              onToggleFavorite={handleToggleFavorite}
              initialFilter="audiobooks"
            />
          )}

          {activeTab === 'ebooks' && (
            <LibraryPage
              searchQuery={searchQuery}
              onOpenDetails={setDetailItem}
              favorites={favorites}
              onToggleFavorite={handleToggleFavorite}
              initialFilter="ebooks"
            />
          )}

          {activeTab === 'favorites' && (
            <LibraryPage
              searchQuery={searchQuery}
              onOpenDetails={setDetailItem}
              favorites={favorites}
              onToggleFavorite={handleToggleFavorite}
              initialFilter="favorites"
            />
          )}

          {activeTab === 'settings' && (
            <SettingsPage />
          )}
        </main>
      </div>

      {/* Persistent Audiobook Player bar / Full player */}
      <AudiobookPlayer />

      {/* Integrated Ebook Reader View */}
      <EbookReader />

      {/* Book Details Modal */}
      <BookDetailModal
        item={detailItem}
        onClose={() => setDetailItem(null)}
        isFavorite={detailItem ? favorites.has(detailItem.id) : false}
        onToggleFavorite={handleToggleFavorite}
      />
    </div>
  );
};
