import React, { useState, useEffect, useRef } from 'react';
import { Filter, ArrowUpDown, BookOpen, Headphones, SearchX, CheckCircle2, FolderOpen, UploadCloud } from 'lucide-react';
import { LibraryItem } from '../types/audiobookshelf';
import { BookCard } from '../components/common/BookCard';
import { absClient } from '../api/absClient';
import { useAuth } from '../stores/authStore';
import { readerStore, getStoredLocalBooks, LocalBookRecord } from '../stores/readerStore';
import { SAMPLE_ITEMS } from '../utils/sampleData';

export type FilterType = 'all' | 'audiobooks' | 'ebooks' | 'local' | 'in-progress' | 'finished' | 'unread' | 'favorites';
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
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFilter(initialFilter);
  }, [initialFilter]);

  // Convert stored local books to LibraryItem format
  const getLocalItems = (): LibraryItem[] => {
    const records = getStoredLocalBooks();
    return records.map(r => ({
      id: r.id,
      libraryId: 'local_library',
      mediaType: 'book',
      media: {
        metadata: {
          title: r.title,
          authorName: r.author,
        },
        ebookFile: {
          ino: 'local',
          filename: r.fileName,
          ext: r.format === 'pdf' ? '.pdf' : '.epub',
          size: r.fileSize,
        },
      },
      userMediaProgress: {
        userId: 'local-user',
        libraryItemId: r.id,
        progress: r.progress,
        ebookProgress: r.progress,
        isFinished: r.progress >= 0.99,
        lastUpdate: r.lastOpened,
      },
    }));
  };

  useEffect(() => {
    let isCancelled = false;

    async function loadLibrary() {
      setIsLoading(true);
      const localBooks = getLocalItems();

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
            const fetched = res.results.length > 0 ? res.results : SAMPLE_ITEMS;
            setItems([...localBooks, ...fetched]);
          }
        } catch (err) {
          console.warn('Could not fetch remote library items, falling back to local library data:', err);
          if (!isCancelled) setItems([...localBooks, ...SAMPLE_ITEMS]);
        }
      } else {
        setItems([...localBooks, ...SAMPLE_ITEMS]);
      }
      setIsLoading(false);
    }

    loadLibrary();
    return () => {
      isCancelled = true;
    };
  }, [serverUrl, token, activeLibraryId, isAuthenticated]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.name.toLowerCase().endsWith('.epub') || file.name.toLowerCase().endsWith('.pdf')) {
        readerStore.openLocalFile(file);
      }
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      readerStore.openLocalFile(file);
    }
  };

  // Filtering Logic
  const filteredItems = items.filter((item) => {
    const meta = item.media?.metadata || {};
    const hasAudio = !!(
      item.media?.duration || 
      item.media?.numTracks || 
      item.media?.tracks?.length || 
      item.media?.audioFiles?.length || 
      (item as any).numAudioFiles
    );
    const hasEbook = !!(
      item.media?.ebookFile ||
      item.media?.ebookFormat ||
      item.mediaType === 'book' ||
      (item.media as any)?.libraryFiles?.some((f: any) => {
        const ext = (f.metadata?.ext || f.ext || '').toLowerCase();
        return ext === '.epub' || ext === '.pdf' || ext === 'epub' || ext === 'pdf';
      })
    );
    const isLocal = item.id.startsWith('local_');

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
      case 'local':
        return isLocal;
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
    { id: 'local', label: 'Local Files' },
    { id: 'in-progress', label: 'In Progress' },
    { id: 'finished', label: 'Completed' },
    { id: 'unread', label: 'Unread' },
    { id: 'favorites', label: 'Favorites' },
  ];

  return (
    <div 
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex-1 overflow-y-auto px-4 md:px-8 py-8 flex flex-col gap-6 max-w-7xl mx-auto w-full pb-24 transition-colors relative ${
        isDragging ? 'bg-teal-950/20' : ''
      }`}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInput}
        accept=".epub,.pdf"
        className="hidden"
      />

      {/* Drag & Drop Overlay */}
      {isDragging && (
        <div className="absolute inset-4 z-40 rounded-3xl border-2 border-dashed border-teal-400 bg-neutral-900/90 backdrop-blur-md flex flex-col items-center justify-center text-teal-400 gap-3 pointer-events-none animate-fade-in">
          <UploadCloud className="w-16 h-16 animate-bounce" />
          <h3 className="text-xl font-bold font-serif">Drop your EPUB or PDF here</h3>
          <p className="text-xs text-stone-300">Folio will open it instantly in the reader</p>
        </div>
      )}

      {/* Title & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#232830]">
        <div>
          <h1 className="text-2xl font-serif font-bold text-neutral-100">
            {filter === 'audiobooks' ? 'Audiobooks' : filter === 'ebooks' ? 'Ebooks' : filter === 'local' ? 'Local Books' : filter === 'favorites' ? 'Favorites' : 'Library Collection'}
          </h1>
          <p className="text-xs text-stone-400 mt-1">
            Showing {sortedItems.length} {sortedItems.length === 1 ? 'title' : 'titles'}
            {searchQuery ? ` matching "${searchQuery}"` : ''}
          </p>
        </div>

        {/* Right side controls: Upload book & Sort */}
        <div className="flex items-center gap-3 self-start sm:self-auto">
          {/* Upload Local Book Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-[#181c21] hover:bg-[#20252b] border border-[#232830] hover:border-teal-500/40 text-xs font-medium text-teal-300 hover:text-teal-200 transition-colors shadow-sm"
          >
            <FolderOpen className="w-3.5 h-3.5 text-teal-400" />
            <span>Open File</span>
          </button>

          {/* Sorting Dropdown */}
          <div className="flex items-center gap-2">
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
          <div className="flex gap-3 mt-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-1.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-black text-xs font-medium transition-colors"
            >
              Open a local book
            </button>
            <button
              onClick={() => {
                setFilter('all');
              }}
              className="px-3.5 py-1.5 rounded-xl bg-[#181c21] text-stone-300 hover:text-white border border-[#232830] text-xs font-medium"
            >
              Reset filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
