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

export function cleanBookTitle(rawName: string): string {
  if (!rawName) return '';
  let cleaned = rawName
    .replace(/\.(epub|pdf)$/i, '')
    .replace(/\[[^\]]*\]/g, '') // remove bracket tags like [Seven Seas], [Kobo_LNWNCentral]
    .replace(/\([^\)]*(?:digital|v\d+|c\d+|scan|official)[^\)]*\)/gi, '') // remove (Digital)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || rawName;
}

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

    // Check for custom renamed title in localStorage
    const savedCustomTitle = localStorage.getItem(`folio_custom_title_${item.id}`);
    if (savedCustomTitle && item.media?.metadata) {
      item.media.metadata.title = savedCustomTitle;
    }

    // Check for saved progress in localStorage
    let initialProgress = item.userMediaProgress?.ebookProgress || 0;
    let initialLocation = item.userMediaProgress?.ebookLocation || '';
    let estimatedTotal = 280;
    let estimatedCurrent = Math.max(1, Math.round(initialProgress * estimatedTotal)) || 1;

    try {
      const savedRaw = localStorage.getItem(`folio_progress_${item.id}`);
      if (savedRaw) {
        const saved = JSON.parse(savedRaw);
        if (saved.currentPage) estimatedCurrent = Number(saved.currentPage);
        if (saved.totalPages) estimatedTotal = Number(saved.totalPages);
        if (saved.progress) initialProgress = Number(saved.progress);
        if (saved.location) initialLocation = saved.location;
      }
    } catch {}

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
      estimatedMinutesLeft: Math.round((estimatedTotal - estimatedCurrent) * 1.4),
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

    // Check for custom renamed title first, otherwise clean title of ugly release tags
    const savedCustomTitle = localStorage.getItem(`folio_custom_title_${file.name}`);
    if (savedCustomTitle) {
      title = savedCustomTitle;
    } else {
      title = cleanBookTitle(title);
    }

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
          title = savedCustomTitle || parsed.title;
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

    // Check saved progress in localStorage
    let initialPage = 1;
    let initialProgress = 0;
    let initialTotalPages = isPdf ? 1 : 100;
    let initialChapterTitle = isPdf ? 'Page 1' : 'Beginning';

    try {
      const savedRaw = localStorage.getItem(`folio_progress_${file.name}`);
      if (savedRaw) {
        const saved = JSON.parse(savedRaw);
        if (saved.currentPage) initialPage = Number(saved.currentPage);
        if (saved.totalPages) initialTotalPages = Number(saved.totalPages);
        if (saved.progress) initialProgress = Number(saved.progress);
        if (saved.chapterTitle) initialChapterTitle = saved.chapterTitle;
      } else {
        const stored = getStoredLocalBooks().find(b => b.fileName === file.name);
        if (stored && stored.progress) {
          initialProgress = stored.progress;
          if (stored.currentLocation) initialPage = Number(stored.currentLocation) || 1;
        }
      }
    } catch {}

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
      progress: initialProgress,
      currentLocation: String(initialPage),
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
      currentLocation: String(initialPage),
      progress: initialProgress,
      currentPage: initialPage,
      totalPages: initialTotalPages,
      currentChapterTitle: initialChapterTitle,
      totalChapters: Math.max(1, Math.round(initialTotalPages / 22)),
      remainingChapters: Math.max(0, Math.round((1 - initialProgress) * 12)),
      estimatedMinutesLeft: Math.round((initialTotalPages - initialPage) * 1.4),
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

    // Persist progress to localStorage on EVERY page turn / update
    try {
      const progressRecord = {
        currentPage: curPage,
        totalPages: totPages,
        progress: clampedProgress,
        location,
        chapterTitle: chapterTitle || globalState.currentChapterTitle,
        updatedAt: Date.now(),
      };

      if (globalState.localFile?.name) {
        localStorage.setItem(`folio_progress_${globalState.localFile.name}`, JSON.stringify(progressRecord));
      }
      if (globalState.item?.id) {
        localStorage.setItem(`folio_progress_${globalState.item.id}`, JSON.stringify(progressRecord));
      }

      // Also update in stored local books if applicable
      const books = getStoredLocalBooks();
      let changed = false;
      for (const b of books) {
        if ((globalState.localFile && b.fileName === globalState.localFile.name) || (globalState.item && b.id === globalState.item.id)) {
          b.progress = clampedProgress;
          b.currentLocation = String(curPage);
          b.lastOpened = Date.now();
          changed = true;
        }
      }
      if (changed) {
        localStorage.setItem(LOCAL_BOOKS_STORAGE_KEY, JSON.stringify(books));
      }
    } catch (err) {
      console.warn('Failed to persist progress to localStorage', err);
    }

    readerStore.syncCurrentProgress(false);
  },

  renameBook(newTitle: string) {
    const trimmed = newTitle.trim();
    if (!trimmed || !globalState.item) return;

    const keyName = globalState.localFile?.name;
    const keyId = globalState.item.id;

    if (keyName) {
      localStorage.setItem(`folio_custom_title_${keyName}`, trimmed);
    }
    if (keyId) {
      localStorage.setItem(`folio_custom_title_${keyId}`, trimmed);
    }

    // Update stored local book records if exists
    try {
      const books = getStoredLocalBooks();
      let changed = false;
      for (const b of books) {
        if ((keyName && b.fileName === keyName) || (keyId && b.id === keyId)) {
          b.title = trimmed;
          changed = true;
        }
      }
      if (changed) {
        localStorage.setItem(LOCAL_BOOKS_STORAGE_KEY, JSON.stringify(books));
      }
    } catch (err) {
      console.warn('Failed to update local book record title', err);
    }

    globalState = {
      ...globalState,
      item: {
        ...globalState.item,
        media: {
          ...globalState.item.media,
          metadata: {
            ...globalState.item.media.metadata,
            title: trimmed,
          },
        },
      },
    };
    notify();
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
    renameBook: readerStore.renameBook,
  };
}
