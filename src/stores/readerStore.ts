import { useState, useEffect } from 'react';
import { LibraryItem, EbookFile, ReaderTheme, ReaderFont, ReaderPreferences } from '../types/audiobookshelf';
import { progressSyncManager } from '../services/progressSync';
import { authStore } from './authStore';
import { playerStore } from './playerStore';
import { parseEpub } from '../services/epubParser';
import { extractPdfCover } from '../utils/pdfCover';
import { absClient } from '../api/absClient';

export interface TocChapter {
  id: string;
  title: string;
  href?: string;
  page?: number;
  subchapters?: TocChapter[];
}

export interface LocalBookRecord {
  id: string;
  isLocal: true;
  title: string;
  author: string;
  format: 'epub' | 'pdf';
  fileName: string;
  fileSize: number;
  lastOpened: number;
  progress: number;
  currentLocation?: string;
  coverDataUrl?: string;
}

export interface ReaderState {
  isOpen: boolean;
  item: LibraryItem | null;
  ebookFile: EbookFile | null;
  localFile: File | null;
  localBuffer: ArrayBuffer | null;
  localBlobUrl: string | null;
  currentLocation: string; // EPUB CFI or page number
  progress: number; // 0.0 - 1.0
  currentPage: number;
  totalPages: number;
  currentChapterTitle: string;
  totalChapters: number;
  remainingChapters: number;
  estimatedMinutesLeft: number;
  showSidebar: boolean;
  showToc: boolean;
  showSettings: boolean;
  preferences: ReaderPreferences;
  tableOfContents: TocChapter[];
}

const PREF_STORAGE_KEY = 'abs_reader_preferences_v1';
const LOCAL_BOOKS_STORAGE_KEY = 'folio_local_books_v1';

export function getStoredLocalBooks(): LocalBookRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_BOOKS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveStoredLocalBook(book: LocalBookRecord) {
  try {
    const list = getStoredLocalBooks().filter(b => b.id !== book.id && b.fileName !== book.fileName);
    list.unshift(book);
    localStorage.setItem(LOCAL_BOOKS_STORAGE_KEY, JSON.stringify(list.slice(0, 30)));
  } catch (err) {
    console.error('Failed to save local book record', err);
  }
}

export function removeStoredLocalBook(id: string) {
  try {
    const list = getStoredLocalBooks().filter(b => b.id !== id);
    localStorage.setItem(LOCAL_BOOKS_STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

const defaultPreferences: ReaderPreferences = {
  theme: 'dark',
  fontFamily: 'serif',
  fontSize: 18,
  lineHeight: 1.85,
  maxWidth: 760,
  margin: 32,
};

function loadStoredPreferences(): ReaderPreferences {
  try {
    const saved = localStorage.getItem(PREF_STORAGE_KEY);
    if (saved) {
      return { ...defaultPreferences, ...JSON.parse(saved) };
    }
  } catch {}
  return defaultPreferences;
}

let globalState: ReaderState = {
  isOpen: false,
  item: null,
  ebookFile: null,
  localFile: null,
  localBuffer: null,
  localBlobUrl: null,
  currentLocation: '',
  progress: 0,
  currentPage: 1,
  totalPages: 1,
  currentChapterTitle: '',
  totalChapters: 0,
  remainingChapters: 0,
  estimatedMinutesLeft: 0,
  showSidebar: true,
  showToc: false,
  showSettings: false,
  preferences: loadStoredPreferences(),
  tableOfContents: [],
};

const listeners = new Set<(state: ReaderState) => void>();

function notify() {
  listeners.forEach(listener => listener(globalState));
}

function savePreferences(prefs: ReaderPreferences) {
  try {
    localStorage.setItem(PREF_STORAGE_KEY, JSON.stringify(prefs));
  } catch (err) {
    console.error('Failed to save reader preferences', err);
  }
}

export const readerStore = {
  getState(): ReaderState {
    return globalState;
  },

  subscribe(listener: (state: ReaderState) => void) {
    listeners.add(listener);
    listener(globalState);
    return () => {
      listeners.delete(listener);
    };
  },

  openBook(item: LibraryItem) {
    // If ebookFile is not explicitly attached, synthesize one from libraryFiles or item info
    let ebookFile = item.media?.ebookFile || null;
    if (!ebookFile && (item.media as any)?.libraryFiles) {
      const files: any[] = (item.media as any).libraryFiles || [];
      const ebookItem = files.find(f => {
        const ext = (f.metadata?.ext || f.ext || '').toLowerCase();
        return ext === '.epub' || ext === '.pdf' || ext === 'epub' || ext === 'pdf';
      });
      if (ebookItem) {
        ebookFile = {
          ino: ebookItem.ino || item.id,
          filename: ebookItem.metadata?.filename || `${item.media.metadata.title}.${ebookItem.metadata?.ext || 'epub'}`,
          ext: ebookItem.metadata?.ext?.startsWith('.') ? ebookItem.metadata.ext : `.${ebookItem.metadata?.ext || 'epub'}`,
          size: ebookItem.metadata?.size || 0,
        };
      }
    }

    // Default fallback if mediaType is book
    if (!ebookFile && item.mediaType === 'book') {
      ebookFile = {
        ino: item.id,
        filename: `${item.media.metadata.title}.epub`,
        ext: '.epub',
        size: 0,
      };
    }

    const initialProgress = item.userMediaProgress?.ebookProgress || 0;
    const initialLocation = item.userMediaProgress?.ebookLocation || '';

    const estimatedTotal = 280;
    const estimatedCurrent = Math.max(1, Math.round(initialProgress * estimatedTotal)) || 1;

    globalState = {
      ...globalState,
      isOpen: true,
      item,
      ebookFile,
      localFile: null,
      localBuffer: null,
      localBlobUrl: null,
      currentLocation: initialLocation,
      progress: initialProgress,
      currentPage: estimatedCurrent,
      totalPages: estimatedTotal,
      currentChapterTitle: 'Chapter 1',
      totalChapters: item.media?.chapters?.length || 12,
      remainingChapters: Math.max(0, (item.media?.chapters?.length || 12) - 1),
      estimatedMinutesLeft: Math.round((1 - initialProgress) * 340),
      showSidebar: true,
      showToc: false,
      showSettings: false,
    };
    notify();
  },

  async openLocalFile(file: File) {
    const isPdf = file.name.toLowerCase().endsWith('.pdf');
    const isEpub = file.name.toLowerCase().endsWith('.epub');

    let title = file.name.replace(/\.(epub|pdf)$/i, '');
    let author = 'Local Document';
    let coverUrl: string | undefined = undefined;
    let buffer: ArrayBuffer | null = null;
    let localBlobUrl: string | null = null;

    if (isPdf) {
      localBlobUrl = URL.createObjectURL(file);
      try {
        const rawBuffer = await file.arrayBuffer();
        coverUrl = await extractPdfCover(rawBuffer.slice(0));
        if (rawBuffer.byteLength > 0) {
          buffer = rawBuffer;
        }
      } catch (err) {
        console.warn('PDF inspection failed:', err);
      }
    } else if (isEpub) {
      buffer = await file.arrayBuffer();
      try {
        const parsed = await parseEpub(buffer);
        if (parsed.title && parsed.title !== 'Untitled') {
          title = parsed.title;
        }
        if (parsed.author && parsed.author !== 'Unknown Author') {
          author = parsed.author;
        }
        if (parsed.coverDataUrl) {
          coverUrl = parsed.coverDataUrl;
        }
      } catch (err) {
        console.warn('EPUB quick inspection note:', err);
      }
    }

    // Fallback: If no cover was extracted, inherit cover from currently playing audiobook or server
    if (!coverUrl) {
      const activePlayerItem = playerStore.getState().item;
      const auth = authStore.getState();
      if (activePlayerItem) {
        if (activePlayerItem.media?.coverPath) {
          coverUrl = activePlayerItem.media.coverPath;
        } else if (auth.serverUrl && auth.token && !activePlayerItem.id.startsWith('local_')) {
          coverUrl = absClient.getItemCoverUrl(auth.serverUrl, auth.token, activePlayerItem.id, 600, auth.useProxy);
        }
      }
    }

    const localItem: LibraryItem = {
      id: `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      libraryId: 'local_library',
      mediaType: 'book',
      media: {
        coverPath: coverUrl,
        metadata: {
          title,
          authorName: author,
        },
        ebookFile: {
          ino: 'local',
          filename: file.name,
          ext: isPdf ? '.pdf' : '.epub',
          size: file.size,
        },
      },
    };

    saveStoredLocalBook({
      id: localItem.id,
      isLocal: true,
      title,
      author,
      format: isPdf ? 'pdf' : 'epub',
      fileName: file.name,
      fileSize: file.size,
      lastOpened: Date.now(),
      progress: 0,
      coverDataUrl: coverUrl,
    });

    globalState = {
      ...globalState,
      isOpen: true,
      item: localItem,
      ebookFile: localItem.media.ebookFile || null,
      localFile: file,
      localBuffer: buffer,
      localBlobUrl: localBlobUrl,
      currentLocation: '',
      progress: 0,
      currentPage: 1,
      totalPages: isPdf ? 1 : 100,
      currentChapterTitle: isPdf ? 'Page 1' : 'Beginning',
      totalChapters: 12,
      remainingChapters: 11,
      estimatedMinutesLeft: 240,
      showSidebar: true,
      showToc: false,
      showSettings: false,
    };
    notify();
  },

  closeBook() {
    readerStore.syncCurrentProgress(true);

    if (globalState.localBlobUrl) {
      URL.revokeObjectURL(globalState.localBlobUrl);
    }

    globalState = {
      ...globalState,
      isOpen: false,
      item: null,
      ebookFile: null,
      localFile: null,
      localBuffer: null,
      localBlobUrl: null,
    };
    notify();
  },

  updateLocation(location: string, progress: number, currentPage?: number, totalPages?: number, chapterTitle?: string) {
    const clampedProgress = Math.min(1, Math.max(0, progress));
    const totPages = totalPages ?? (globalState.totalPages || 200);
    const curPage = currentPage ?? Math.max(1, Math.round(clampedProgress * totPages));
    const pagesLeft = Math.max(0, totPages - curPage);

    // Calculate remaining chapters based on TOC or estimated ~22 pages per chapter
    const totalChaps = globalState.tableOfContents.length > 0 
      ? globalState.tableOfContents.length 
      : Math.max(1, Math.round(totPages / 22));
    const remainingChaps = Math.max(0, Math.round((1 - clampedProgress) * totalChaps));

    // Calculate time left based on pages left (~1.5 min per book page)
    const minLeft = Math.max(1, Math.round(pagesLeft * 1.4));

    globalState = {
      ...globalState,
      currentLocation: location,
      progress: clampedProgress,
      currentPage: curPage,
      totalPages: totPages,
      totalChapters: totalChaps,
      currentChapterTitle: chapterTitle || globalState.currentChapterTitle,
      remainingChapters: remainingChaps,
      estimatedMinutesLeft: minLeft,
    };
    notify();

    readerStore.syncCurrentProgress(false);
  },

  syncCurrentProgress(isImmediate: boolean = false) {
    if (!globalState.item) return;
    const auth = authStore.getState();
    if (!auth.serverUrl || !auth.token) return;

    const isFinished = globalState.progress >= 0.99;

    if (isImmediate) {
      progressSyncManager.syncEbookProgressNow(
        auth.serverUrl,
        auth.token,
        globalState.item.id,
        globalState.currentLocation,
        globalState.progress,
        isFinished,
        auth.useProxy
      );
    } else {
      progressSyncManager.syncEbookProgressDebounced(
        auth.serverUrl,
        auth.token,
        globalState.item.id,
        globalState.currentLocation,
        globalState.progress,
        isFinished,
        auth.useProxy
      );
    }
  },

  setPreferences(updates: Partial<ReaderPreferences>) {
    const newPrefs = { ...globalState.preferences, ...updates };
    globalState = { ...globalState, preferences: newPrefs };
    savePreferences(newPrefs);
    notify();
  },

  toggleTheme() {
    const themes: ReaderTheme[] = ['dark', 'light', 'sepia', 'paper', 'midnight'];
    const currentIdx = themes.indexOf(globalState.preferences.theme);
    const nextTheme = themes[(currentIdx + 1) % themes.length];
    readerStore.setPreferences({ theme: nextTheme });
  },

  setTheme(theme: ReaderTheme) {
    readerStore.setPreferences({ theme });
  },

  setFontFamily(fontFamily: ReaderFont) {
    readerStore.setPreferences({ fontFamily });
  },

  setFontSize(fontSize: number) {
    readerStore.setPreferences({ fontSize: Math.min(32, Math.max(12, fontSize)) });
  },

  setLineHeight(lineHeight: number) {
    readerStore.setPreferences({ lineHeight: Math.min(2.5, Math.max(1.2, lineHeight)) });
  },

  setMaxWidth(maxWidth: number) {
    readerStore.setPreferences({ maxWidth });
  },

  toggleSidebar() {
    globalState = { ...globalState, showSidebar: !globalState.showSidebar };
    notify();
  },

  toggleToc() {
    globalState = { ...globalState, showToc: !globalState.showToc };
    notify();
  },

  toggleSettings() {
    globalState = { ...globalState, showSettings: !globalState.showSettings };
    notify();
  },

  setTableOfContents(toc: TocChapter[]) {
    globalState = {
      ...globalState,
      tableOfContents: toc,
      totalChapters: toc.length || globalState.totalChapters,
      remainingChapters: Math.max(0, (toc.length || globalState.totalChapters) - 1),
    };
    notify();
  },
};

export function useReader() {
  const [state, setState] = useState<ReaderState>(globalState);

  useEffect(() => {
    return readerStore.subscribe(setState);
  }, []);

  return {
    ...state,
    openBook: readerStore.openBook,
    openLocalFile: readerStore.openLocalFile,
    closeBook: readerStore.closeBook,
    updateLocation: readerStore.updateLocation,
    setPreferences: readerStore.setPreferences,
    toggleTheme: readerStore.toggleTheme,
    setTheme: readerStore.setTheme,
    setFontFamily: readerStore.setFontFamily,
    setFontSize: readerStore.setFontSize,
    setLineHeight: readerStore.setLineHeight,
    setMaxWidth: readerStore.setMaxWidth,
    toggleSidebar: readerStore.toggleSidebar,
    toggleToc: readerStore.toggleToc,
    toggleSettings: readerStore.toggleSettings,
    setTableOfContents: readerStore.setTableOfContents,
  };
}
