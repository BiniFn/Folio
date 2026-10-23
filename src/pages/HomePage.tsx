import React, { useState, useEffect } from 'react';
import { Play, BookOpen, Headphones, Compass, Sparkles } from 'lucide-react';
import { LibraryItem, PersonalizedShelf } from '../types/audiobookshelf';
import { BookCard } from '../components/common/BookCard';
import { absClient } from '../api/absClient';
import { useAuth } from '../stores/authStore';
import { playerStore } from '../stores/playerStore';
import { readerStore } from '../stores/readerStore';
import { SAMPLE_SHELVES, SAMPLE_ITEMS } from '../utils/sampleData';
import { formatDuration, formatTimeRemaining } from '../utils/formatters';

interface HomePageProps {
  onOpenDetails: (item: LibraryItem) => void;
  onNavigateLibrary: () => void;
  favorites: Set<string>;
  onToggleFavorite: (id: string) => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  onOpenDetails,
  onNavigateLibrary,
  favorites,
  onToggleFavorite,
}) => {
  const { serverUrl, token, activeLibraryId, useProxy, isAuthenticated } = useAuth();
  const [shelves, setShelves] = useState<PersonalizedShelf[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;

    async function loadShelves() {
      setIsLoading(true);
      if (isAuthenticated && serverUrl && token && activeLibraryId) {
        try {
          const remoteShelves = await absClient.getPersonalizedShelves(
            serverUrl,
            token,
            activeLibraryId,
            useProxy
          );
          if (!isCancelled) {
            setShelves(remoteShelves.length > 0 ? remoteShelves : SAMPLE_SHELVES);
          }
        } catch (err) {
          console.warn('Could not load remote shelves, falling back to local library data:', err);
          if (!isCancelled) setShelves(SAMPLE_SHELVES);
        }
      } else {
        setShelves(SAMPLE_SHELVES);
      }
      setIsLoading(false);
    }

    loadShelves();
    return () => {
      isCancelled = true;
    };
  }, [serverUrl, token, activeLibraryId, isAuthenticated]);

  // Find most recent in-progress audiobook and ebook for quick resume
  const continueListeningShelf = shelves.find(s => s.id === 'continue-listening')?.entities || [];
  const continueReadingShelf = shelves.find(s => s.id === 'continue-reading')?.entities || [];
  const recentlyAddedShelf = shelves.find(s => s.id === 'recently-added' || s.id === 'recent')?.entities || [];

  const heroItem = continueListeningShelf[0] || continueReadingShelf[0] || SAMPLE_ITEMS[0];
  const heroAudio = !!heroItem?.media?.duration;
  const heroProgress = heroItem?.userMediaProgress?.progress || heroItem?.userMediaProgress?.ebookProgress || 0;

  const handleHeroResume = () => {
    if (heroAudio) {
      playerStore.loadAndPlay(heroItem);
    } else {
      readerStore.openBook(heroItem);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-8 flex flex-col gap-10 max-w-7xl mx-auto w-full pb-24">
      {/* Editorial Hero Banner for Instant Resume */}
      {heroItem && (
        <div className="relative rounded-3xl bg-gradient-to-r from-[#181c21] via-[#1a1f26] to-[#14171c] border border-[#232830] p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden shadow-2xl">
          <div className="flex-1 flex flex-col gap-2 z-10 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-2 text-xs font-semibold uppercase tracking-wider text-teal-400">
              <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
              <span>Resume Where You Left Off</span>
            </div>

            <h1 className="text-2xl md:text-3xl font-serif font-bold text-neutral-100 line-clamp-2">
              {heroItem.media?.metadata?.title}
            </h1>
            <p className="text-sm text-stone-400 font-medium">
              by <span className="text-stone-200">{heroItem.media?.metadata?.authorName}</span>
              {heroItem.media?.metadata?.series?.[0] && ` · ${heroItem.media.metadata.series[0].name}`}
            </p>

            {/* Progress stats */}
            <div className="flex items-center justify-center md:justify-start gap-4 mt-2 text-xs text-stone-400">
              <div className="w-40 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-400 rounded-full"
                  style={{ width: `${Math.min(100, Math.max(5, heroProgress * 100))}%` }}
                />
              </div>
              <span className="font-semibold text-teal-400">
                {Math.round(heroProgress * 100)}% complete
              </span>
              {heroAudio && heroItem.media?.duration ? (
                <span className="text-stone-500 hidden sm:inline">
                  {formatTimeRemaining(heroItem.userMediaProgress?.currentTime || 0, heroItem.media.duration)}
                </span>
              ) : null}
            </div>

            {/* Resume CTA */}
            <div className="flex items-center justify-center md:justify-start gap-3 mt-4">
              <button
                onClick={handleHeroResume}
                className="py-3 px-6 rounded-xl font-medium bg-teal-500 hover:bg-teal-400 text-black flex items-center gap-2.5 transition-all shadow-lg shadow-teal-500/20 active:scale-95 text-xs font-semibold"
              >
                {heroAudio ? (
                  <>
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                    <span>Resume Listening</span>
                  </>
                ) : (
                  <>
                    <BookOpen className="w-4 h-4 text-black" />
                    <span>Continue Reading</span>
                  </>
                )}
              </button>

              <button
                onClick={() => onOpenDetails(heroItem)}
                className="py-3 px-5 rounded-xl font-medium bg-neutral-800/80 hover:bg-neutral-700 text-stone-200 text-xs transition-colors border border-neutral-700/60"
              >
                View Details
              </button>
            </div>
          </div>

          {/* Hero Artwork Thumbnail */}
          <div
            onClick={() => onOpenDetails(heroItem)}
            className="w-36 md:w-44 aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl bg-neutral-900 border border-neutral-700/60 shrink-0 cursor-pointer hover:scale-105 transition-transform duration-300"
          >
            {token ? (
              <img
                src={absClient.getItemCoverUrl(serverUrl, token, heroItem.id, 500, useProxy)}
                alt={heroItem.media?.metadata?.title}
                className="w-full h-full object-cover"
              />
            ) : null}
          </div>
        </div>
      )}

      {/* Continue Listening Shelf */}
      {continueListeningShelf.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Headphones className="w-4 h-4 text-teal-400" />
              <h2 className="text-lg font-serif font-bold text-neutral-100">
                Continue Listening
              </h2>
            </div>
            <span className="text-xs text-stone-400">
              {continueListeningShelf.length} audiobooks in progress
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {continueListeningShelf.map((item) => (
              <BookCard
                key={item.id}
                item={item}
                onOpenDetails={onOpenDetails}
                isFavorite={favorites.has(item.id)}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
        </section>
      )}

      {/* Continue Reading Shelf */}
      {continueReadingShelf.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-amber-400" />
              <h2 className="text-lg font-serif font-bold text-neutral-100">
                Continue Reading
              </h2>
            </div>
            <span className="text-xs text-stone-400">
              {continueReadingShelf.length} ebooks open
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {continueReadingShelf.map((item) => (
              <BookCard
                key={item.id}
                item={item}
                onOpenDetails={onOpenDetails}
                isFavorite={favorites.has(item.id)}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
        </section>
      )}

      {/* Recently Added Shelf */}
      {recentlyAddedShelf.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-teal-400" />
              <h2 className="text-lg font-serif font-bold text-neutral-100">
                Recently Added
              </h2>
            </div>
            <button
              onClick={onNavigateLibrary}
              className="text-xs text-teal-400 hover:text-teal-300 font-medium"
            >
              Browse entire library →
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {recentlyAddedShelf.slice(0, 12).map((item) => (
              <BookCard
                key={item.id}
                item={item}
                onOpenDetails={onOpenDetails}
                isFavorite={favorites.has(item.id)}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
        </section>
      )}

      {/* Empty State when no history exists */}
      {!isLoading && continueListeningShelf.length === 0 && continueReadingShelf.length === 0 && (
        <div className="py-16 flex flex-col items-center text-center gap-4 border border-dashed border-neutral-800 rounded-3xl p-8">
          <Compass className="w-12 h-12 text-teal-500/60" />
          <h3 className="text-lg font-serif font-semibold text-neutral-200">
            Welcome to your library
          </h3>
          <p className="text-xs text-stone-400 max-w-sm">
            You don’t have any active audiobooks or ebooks in progress yet. Browse your collection to begin reading or listening.
          </p>
          <button
            onClick={onNavigateLibrary}
            className="py-2.5 px-5 rounded-xl text-xs font-semibold bg-teal-500 text-black hover:bg-teal-400 transition-colors mt-2"
          >
            Explore Library
          </button>
        </div>
      )}
    </div>
  );
};
