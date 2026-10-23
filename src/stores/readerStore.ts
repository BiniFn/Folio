import { useState, useEffect } from 'react';
import { LibraryItem, EbookFile, ReaderTheme, ReaderFont, ReaderPreferences } from '../types/audiobookshelf';
import { progressSyncManager } from '../services/progressSync';
import { authStore } from './authStore';

export interface TocChapter {
  id: string;
  title: string;
  href?: string;
  page?: number;
  subchapters?: TocChapter[];
}

export interface ReaderState {
  isOpen: boolean;
  item: LibraryItem | null;
  ebookFile: EbookFile | null;
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
    const ebookFile = item.media?.ebookFile || null;
    const initialProgress = item.userMediaProgress?.ebookProgress || 0;
    const initialLocation = item.userMediaProgress?.ebookLocation || '';

    // Estimate initial page from progress or metadata
    const estimatedTotal = 280;
    const estimatedCurrent = Math.max(1, Math.round(initialProgress * estimatedTotal)) || 1;

    globalState = {
      ...globalState,
      isOpen: true,
      item,
      ebookFile,
      currentLocation: initialLocation,
      progress: initialProgress,
      currentPage: estimatedCurrent,
      totalPages: estimatedTotal,
      currentChapterTitle: 'Chapter 1',
      totalChapters: item.media?.chapters?.length || 12,
      remainingChapters: Math.max(0, (item.media?.chapters?.length || 12) - 1),
      estimatedMinutesLeft: Math.round((1 - initialProgress) * 340), // ~5.5 hours typical light novel
      showSidebar: true,
      showToc: false,
      showSettings: false,
    };
    notify();
  },

  closeBook() {
    // Perform final sync on close
    readerStore.syncCurrentProgress(true);

    globalState = {
      ...globalState,
      isOpen: false,
      item: null,
      ebookFile: null,
    };
    notify();
  },

  updateLocation(location: string, progress: number, currentPage?: number, totalPages?: number, chapterTitle?: string) {
    const clampedProgress = Math.min(1, Math.max(0, progress));
    const curPage = currentPage ?? Math.max(1, Math.round(clampedProgress * (globalState.totalPages || 200)));
    const totPages = totalPages ?? globalState.totalPages;
    const remainingChaps = Math.max(0, Math.round((1 - clampedProgress) * globalState.totalChapters));
    const minLeft = Math.round((1 - clampedProgress) * 340);

    globalState = {
      ...globalState,
      currentLocation: location,
      progress: clampedProgress,
      currentPage: curPage,
      totalPages: totPages,
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
    closeBook: readerStore.closeBook,
    updateLocation: readerStore.updateLocation,
    setPreferences: readerStore.setPreferences,
    toggleTheme: readerStore.toggleTheme,
    setTheme: readerStore.setTheme,
    setFontFamily: readerStore.setFontFamily,
    setFontSize: readerStore.setFontSize,
    setLineHeight: readerStore.setLineHeight,
    toggleSidebar: readerStore.toggleSidebar,
    toggleToc: readerStore.toggleToc,
    toggleSettings: readerStore.toggleSettings,
    setTableOfContents: readerStore.setTableOfContents,
  };
}
