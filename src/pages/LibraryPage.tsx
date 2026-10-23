import React, { useState, useEffect } from 'react';
import { Filter, ArrowUpDown, BookOpen, Headphones, SearchX, CheckCircle2 } from 'lucide-react';
import { LibraryItem } from '../types/audiobookshelf';
import { BookCard } from '../components/common/BookCard';
import { absClient } from '../api/absClient';
import { useAuth } from '../stores/authStore';
import { SAMPLE_ITEMS } from '../utils/sampleData';

export type FilterType = 'all' | 'audiobooks' | 'ebooks' | 'in-progress' | 'finished' | 'unread' | 'favorites';
export type SortOption = 'title' | 'author' | 'added' | 'duration' | 'progress';

interface LibraryPageProps {
  searchQuery: string;
  onOpenDetails: (item: LibraryItem) => void;
  favorites: Set<string>;
  onToggleFavorite: (id: string) => void;
  initialFilter?: FilterType;
}

export const LibraryPage: React.FC<LibraryPageProps> = ({
  searchQuery,
  onOpenDetails,
  favorites,
  onToggleFavorite,
  initialFilter = 'all',
}) => {
  const { serverUrl, token, activeLibraryId, useProxy, isAuthenticated } = useAuth();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [filter, setFilter] = useState<FilterType>(initialFilter);
  const [sort, setSort] = useState<SortOption>('title');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setFilter(initialFilter);
  }, [initialFilter]);

  useEffect(() => {
    let isCancelled = false;

    async function loadLibrary() {
      setIsLoading(true);
      if (isAuthenticated && serverUrl && token && activeLibraryId) {
        try {
          const res = await absClient.getLibraryItems(
            serverUrl,
            token,
            activeLibraryId,
            { limit: 100 },
            useProxy
          );
          if (!isCancelled) {
            setItems(res.results.length > 0 ? res.results : SAMPLE_ITEMS);
          }
        } catch (err) {
          console.warn('Could not fetch remote library items, falling back to local library data:', err);
          if (!isCancelled) setItems(SAMPLE_ITEMS);
        }
      } else {
        setItems(SAMPLE_ITEMS);
      }
      setIsLoading(false);
    }

    loadLibrary();
    return () => {
      isCancelled = true;
    };
  }, [serverUrl, token, activeLibraryId, isAuthenticated]);

  // Filtering Logic
  const filteredItems = items.filter((item) => {
    const meta = item.media?.metadata || {};
    const hasAudio = !!(item.media?.duration || item.media?.numTracks || item.media?.audioFiles?.length);
    const hasEbook = !!item.media?.ebookFile;
    const audioProg = item.userMediaProgress?.progress || 0;
    const ebookProg = item.userMediaProgress?.ebookProgress || 0;
    const isFinished = item.userMediaProgress?.isFinished || audioProg >= 0.99 || ebookProg >= 0.99;
    const inProgress = (audioProg > 0 || ebookProg > 0) && !isFinished;
    const unread = !inProgress && !isFinished;

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const titleMatch = (meta.title || '').toLowerCase().includes(q);
      const authorMatch = (meta.authorName || '').toLowerCase().includes(q);
      const seriesMatch = meta.series?.some(s => s.name.toLowerCase().includes(q));
      if (!titleMatch && !authorMatch && !seriesMatch) return false;
    }

    // Category Filter
    switch (filter) {
      case 'audiobooks':
        return hasAudio;
      case 'ebooks':
        return hasEbook;
      case 'in-progress':
        return inProgress;
      case 'finished':
        return isFinished;
      case 'unread':
        return unread;
      case 'favorites':
        return favorites.has(item.id);
      case 'all':
      default:
        return true;
    }
  });

  // Sorting Logic
  const sortedItems = [...filteredItems].sort((a, b) => {
    const metaA = a.media?.metadata || {};
    const metaB = b.media?.metadata || {};

    switch (sort) {
      case 'author':
        return (metaA.authorName || '').localeCompare(metaB.authorName || '');
      case 'added':
        return (b.addedAt || 0) - (a.addedAt || 0);
      case 'duration':
        return (b.media?.duration || 0) - (a.media?.duration || 0);
      case 'progress': {
        const progA = a.userMediaProgress?.progress || a.userMediaProgress?.ebookProgress || 0;
        const progB = b.userMediaProgress?.progress || b.userMediaProgress?.ebookProgress || 0;
        return progB - progA;
      }
      case 'title':
      default:
        return (metaA.title || '').localeCompare(metaB.title || '');
    }
  });

  const filterChips: { id: FilterType; label: string }[] = [
    { id: 'all', label: 'All Items' },
    { id: 'audiobooks', label: 'Audiobooks' },
    { id: 'ebooks', label: 'Ebooks' },
    { id: 'in-progress', label: 'In Progress' },
    { id: 'finished', label: 'Completed' },
    { id: 'unread', label: 'Unread' },
    { id: 'favorites', label: 'Favorites' },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-8 flex flex-col gap-6 max-w-7xl mx-auto w-full pb-24">
      {/* Title & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#232830]">
        <div>
          <h1 className="text-2xl font-serif font-bold text-neutral-100">
            {filter === 'audiobooks' ? 'Audiobooks' : filter === 'ebooks' ? 'Ebooks' : filter === 'favorites' ? 'Favorites' : 'Library Collection'}
          </h1>
          <p className="text-xs text-stone-400 mt-1">
            Showing {sortedItems.length} {sortedItems.length === 1 ? 'title' : 'titles'}
            {searchQuery ? ` matching "${searchQuery}"` : ''}
          </p>
        </div>

        {/* Sorting Dropdown */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <ArrowUpDown className="w-3.5 h-3.5 text-stone-400" />
          <span className="text-xs text-stone-400">Sort:</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="bg-[#181c21] border border-[#232830] text-xs text-stone-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-teal-500 cursor-pointer"
          >
            <option value="title">Title (A-Z)</option>
            <option value="author">Author</option>
            <option value="duration">Duration</option>
            <option value="progress">Reading Progress</option>
            <option value="added">Recently Added</option>
          </select>
        </div>
      </div>

      {/* Filter Chips Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {filterChips.map((chip) => (
          <button
            key={chip.id}
            onClick={() => setFilter(chip.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
              filter === chip.id
                ? 'bg-teal-500 text-black font-semibold shadow-sm'
                : 'bg-[#181c21] hover:bg-neutral-800 text-stone-300 border border-[#232830]'
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Books Grid */}
      {sortedItems.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {sortedItems.map((item) => (
            <BookCard
              key={item.id}
              item={item}
              onOpenDetails={onOpenDetails}
              isFavorite={favorites.has(item.id)}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      ) : (
        /* Empty Search / Filter State */
        <div className="py-20 flex flex-col items-center justify-center text-center gap-3 border border-dashed border-neutral-800 rounded-3xl p-8">
          <SearchX className="w-12 h-12 text-stone-600 mb-2" />
          <h3 className="text-base font-semibold text-neutral-300">
            No matching books found
          </h3>
          <p className="text-xs text-stone-400 max-w-sm">
            {searchQuery
              ? `We couldn't find any titles matching "${searchQuery}". Try a different keyword.`
              : 'There are no items matching the selected filter in this library.'}
          </p>
          <button
            onClick={() => {
              setFilter('all');
            }}
            className="mt-2 text-xs font-medium text-teal-400 hover:text-teal-300"
          >
            Reset all filters
          </button>
        </div>
      )}
    </div>
  );
};
