import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  ArrowLeft, 
  Moon, 
  Sun, 
  ChevronLeft, 
  ChevronRight, 
  ChevronUp,
  ChevronDown,
  Settings2, 
  List, 
  BookMarked,
  Search,
  Maximize2, 
  Minimize2, 
  PanelRightClose, 
  PanelRightOpen,
  Volume2,
  VolumeX,
  BookOpen,
  Headphones,
  FolderOpen,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  X,
  Check,
  Edit3,
  Bookmark
} from 'lucide-react';
import { useReader } from '../../stores/readerStore';
import { authStore } from '../../stores/authStore';
import { usePlayer, playerStore } from '../../stores/playerStore';
import { absClient } from '../../api/absClient';
import { parseEpub, ParsedEpub } from '../../services/epubParser';
import { formatDuration, formatProgressPercent } from '../../utils/formatters';
import { PdfPageReader, normalizeSearchText } from './PdfPageReader';

export const EbookReader: React.FC = () => {
  const {
    isOpen,
    item,
    ebookFile,
    localFile,
    localBuffer,
    localBlobUrl,
    progress,
    currentLocation,
    currentPage,
    totalPages,
    currentChapterTitle,
    remainingChapters,
    estimatedMinutesLeft,
    showSidebar,
    showToc,
    showSettings,
    preferences,
    tableOfContents,
    openLocalFile,
    closeBook,
    updateLocation,
    toggleTheme,
    setTheme,
    setFontFamily,
    setFontSize,
    setLineHeight,
    setMaxWidth,
    toggleSidebar,
    toggleToc,
    toggleSettings,
    setTableOfContents,
    renameBook,
  } = useReader();

  const player = usePlayer();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [parsedEpub, setParsedEpub] = useState<ParsedEpub | null>(null);
  const [activeChapterIndex, setActiveChapterIndex] = useState(0);
  const [activePdfUrl, setActivePdfUrl] = useState<string | null>(null);
  const [pdfBuffer, setPdfBuffer] = useState<ArrayBuffer | null>(localBuffer);
  const [showAudioFlyout, setShowAudioFlyout] = useState(false);
  const [showChapterFlyout, setShowChapterFlyout] = useState(false);
  const [jumpQuery, setJumpQuery] = useState('');
  const [jumpFeedback, setJumpFeedback] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [coverSrc, setCoverSrc] = useState<string>('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleText, setEditTitleText] = useState('');
  const [showFindBar, setShowFindBar] = useState(false);
  const [epubSearchQuery, setEpubSearchQuery] = useState('');
  const [epubMatches, setEpubMatches] = useState<Array<{ chapterIndex: number; chapterTitle: string; snippet: string }>>([]);
  const [epubMatchIdx, setEpubMatchIdx] = useState(-1);
  const [isSearchingEpub, setIsSearchingEpub] = useState(false);
  const [justSavedProgress, setJustSavedProgress] = useState(false);
  const [showEpubMatchesDropdown, setShowEpubMatchesDropdown] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jumpInputRef = useRef<HTMLInputElement>(null);
  const epubSearchInputRef = useRef<HTMLInputElement>(null);

  const isPdf = !!(
    ebookFile?.ext?.toLowerCase() === '.pdf' || 
    localFile?.name.toLowerCase().endsWith('.pdf') ||
    (item?.media?.ebookFile?.ext?.toLowerCase() === '.pdf')
  );

  // Load Ebook Content (EPUB or PDF, local or remote) unconditionally
  useEffect(() => {
    let isCancelled = false;
    let createdBlobUrl: string | null = null;

    async function loadContent() {
      if (!isOpen || !item) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      setParsedEpub(null);
      setActivePdfUrl(null);

      const auth = authStore.getState();

      try {
        // 1. Local PDF
        if (isPdf) {
          if (localBuffer && localBuffer.byteLength > 0 && !(localBuffer as any).detached) {
            setPdfBuffer(localBuffer);
          } else if (localFile) {
            try {
              const buf = await localFile.arrayBuffer();
              if (isCancelled) return;
              setPdfBuffer(buf);
            } catch (err) {
              console.warn('Re-reading local file buffer note:', err);
            }
          }
          if (localBlobUrl) {
            setActivePdfUrl(localBlobUrl);
          }
          setIsLoading(false);
          return;
        }

        // 2. Local EPUB Buffer
        if (localBuffer) {
          const parsed = await parseEpub(localBuffer);
          if (isCancelled) return;
          setParsedEpub(parsed);
          setTableOfContents(parsed.toc);
          setActiveChapterIndex(0);
          setIsLoading(false);
          return;
        }

        // 3. Remote Audiobookshelf Book
        if (auth.token && auth.serverUrl && !item.id.startsWith('local_')) {
          const buffer = await absClient.fetchEbookArrayBuffer(
            auth.serverUrl,
            auth.token,
            item.id,
            ebookFile?.ino,
            auth.useProxy
          );

          if (isCancelled) return;

          // Remote PDF
          if (isPdf) {
            setPdfBuffer(buffer);
            const blob = new Blob([buffer], { type: 'application/pdf' });
            createdBlobUrl = URL.createObjectURL(blob);
            setActivePdfUrl(createdBlobUrl);
            setIsLoading(false);
            return;
          }

          // Remote EPUB
          const parsed = await parseEpub(buffer);
          if (isCancelled) return;

          setParsedEpub(parsed);
          setTableOfContents(parsed.toc);

          const initialChap = Math.min(
            parsed.chapters.length - 1,
            Math.max(0, Math.floor((progress || 0) * parsed.chapters.length))
          );
          setActiveChapterIndex(initialChap);
          setIsLoading(false);
          return;
        }

        setIsLoading(false);
      } catch (err: any) {
        console.warn('Could not parse binary ebook file, using styled reading view:', err);
        setError(null);
        setIsLoading(false);
      }
    }

    loadContent();

    return () => {
      isCancelled = true;
      if (createdBlobUrl) {
        URL.revokeObjectURL(createdBlobUrl);
      }
    };
  }, [isOpen, item?.id, ebookFile?.ino, localBlobUrl, localBuffer, localFile, isPdf]);

  // Fullscreen event listener
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Keyboard navigation shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setShowFindBar(prev => !prev);
        setShowChapterFlyout(false);
        setShowAudioFlyout(false);
        setTimeout(() => epubSearchInputRef.current?.focus(), 60);
        return;
      }
      if (e.key === 'Escape' && showFindBar) {
        e.preventDefault();
        setShowFindBar(false);
        return;
      }

      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      } else if (e.key === 's' || e.key === 'S') {
        toggleSidebar();
      } else if (e.key === 'c' || e.key === 'C') {
        setShowChapterFlyout(prev => !prev);
        setShowAudioFlyout(false);
      } else if (e.key === 'a' || e.key === 'A') {
        setShowAudioFlyout(prev => !prev);
        setShowChapterFlyout(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showFindBar]);

  // Very Smart Search in EPUB across all chapters (handles quotes, accents, dashes, multi-word)
  const searchInEpub = useCallback((query: string) => {
    if (!parsedEpub || !query || query.trim().length < 2) {
      setEpubMatches([]);
      setEpubMatchIdx(-1);
      setIsSearchingEpub(false);
      return;
    }

    setIsSearchingEpub(true);
    const normQ = normalizeSearchText(query);
    const queryWords = normQ.split(' ').filter(w => w.length > 1);
    const found: Array<{ chapterIndex: number; chapterTitle: string; snippet: string }> = [];

    parsedEpub.chapters.forEach((chap, idx) => {
      // Strip HTML tags for clean text search
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = chap.html;
      const rawText = tempDiv.textContent || tempDiv.innerText || '';
      if (!rawText) return;

      const normText = normalizeSearchText(rawText);

      // 1. Direct phrase search
      let pos = 0;
      while ((pos = normText.indexOf(normQ, pos)) !== -1) {
        const start = Math.max(0, pos - 20);
        const end = Math.min(rawText.length, pos + normQ.length + 35);
        const snippet = (start > 0 ? '...' : '') + rawText.slice(start, end).trim() + (end < rawText.length ? '...' : '');
        found.push({
          chapterIndex: idx,
          chapterTitle: chap.title || `Chapter ${idx + 1}`,
          snippet,
        });
        pos += normQ.length;
        if (found.length >= 100) break;
      }

      // 2. Proximity search if multi-word phrase was not found in this chapter
      if (found.length < 100 && queryWords.length > 1 && !normText.includes(normQ)) {
        const allPresent = queryWords.every(w => normText.includes(w));
        if (allPresent) {
          const firstIdx = normText.indexOf(queryWords[0]);
          const lastIdx = normText.indexOf(queryWords[queryWords.length - 1]);
          if (firstIdx !== -1 && Math.abs(lastIdx - firstIdx) < 280) {
            const minIdx = Math.min(firstIdx, lastIdx);
            const start = Math.max(0, minIdx - 20);
            const end = Math.min(rawText.length, minIdx + 90);
            const snippet = (start > 0 ? '...' : '') + rawText.slice(start, end).trim() + (end < rawText.length ? '...' : '');
            found.push({
              chapterIndex: idx,
              chapterTitle: chap.title || `Chapter ${idx + 1}`,
              snippet,
            });
          }
        }
      }
    });

    setEpubMatches(found);
    setIsSearchingEpub(false);
    if (found.length > 0) {
      // Pick first match on or after active chapter
      const closestIdx = found.findIndex(m => m.chapterIndex >= activeChapterIndex);
      const targetIdx = closestIdx !== -1 ? closestIdx : 0;
      setEpubMatchIdx(targetIdx);
      const match = found[targetIdx];
      setActiveChapterIndex(match.chapterIndex);
      const newProgress = match.chapterIndex / parsedEpub.chapters.length;
      updateLocation(`chap_${match.chapterIndex}`, newProgress, undefined, undefined, match.chapterTitle);
      contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setEpubMatchIdx(-1);
    }
  }, [parsedEpub, activeChapterIndex, updateLocation]);

  useEffect(() => {
    if (!showFindBar) {
      setEpubMatches([]);
      setEpubMatchIdx(-1);
      return;
    }

    if (!epubSearchQuery || epubSearchQuery.trim().length < 2) {
      setEpubMatches([]);
      setEpubMatchIdx(-1);
      return;
    }

    const timer = setTimeout(() => {
      searchInEpub(epubSearchQuery);
    }, 280);

    return () => clearTimeout(timer);
  }, [epubSearchQuery, showFindBar, searchInEpub]);

  const goToNextEpubMatch = () => {
    if (epubMatches.length === 0 || !parsedEpub) return;
    const nextIdx = (epubMatchIdx + 1) % epubMatches.length;
    setEpubMatchIdx(nextIdx);
    const match = epubMatches[nextIdx];
    setActiveChapterIndex(match.chapterIndex);
    const newProgress = match.chapterIndex / parsedEpub.chapters.length;
    updateLocation(`chap_${match.chapterIndex}`, newProgress, undefined, undefined, match.chapterTitle);
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goToPrevEpubMatch = () => {
    if (epubMatches.length === 0 || !parsedEpub) return;
    const prevIdx = (epubMatchIdx - 1 + epubMatches.length) % epubMatches.length;
    setEpubMatchIdx(prevIdx);
    const match = epubMatches[prevIdx];
    setActiveChapterIndex(match.chapterIndex);
    const newProgress = match.chapterIndex / parsedEpub.chapters.length;
    updateLocation(`chap_${match.chapterIndex}`, newProgress, undefined, undefined, match.chapterTitle);
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Cover Resolution & Fallback to player artwork
  useEffect(() => {
    if (!item) {
      setCoverSrc('');
      return;
    }
    const auth = authStore.getState();
    const localCover = (item as any)?.media?.coverPath || (item as any)?.coverDataUrl;
    const serverCover = auth.token && auth.serverUrl && !item.id.startsWith('local_')
      ? absClient.getItemCoverUrl(auth.serverUrl, auth.token, item.id, 600, auth.useProxy)
      : '';
    const playerCover = player.item
      ? ((player.item as any)?.media?.coverPath || (auth.token && auth.serverUrl && !player.item.id.startsWith('local_') ? absClient.getItemCoverUrl(auth.serverUrl, auth.token, player.item.id, 600, auth.useProxy) : ''))
      : '';

    setCoverSrc(localCover || serverCover || playerCover || '');
  }, [item?.id, (item as any)?.media?.coverPath, player.item?.id]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Quick Jump Form Handler (Type Chapter # or Page #)
  const handleQuickJump = (e: React.FormEvent) => {
    e.preventDefault();
    const q = jumpQuery.trim();
    if (!q) return;

    // 1. Pure number: e.g. "118" or "6"
    const pureNum = parseInt(q, 10);
    if (!isNaN(pureNum)) {
      if (isPdf) {
        // If within page range, jump to page
        const clamped = Math.min(totalPages, Math.max(1, pureNum));
        updateLocation(String(clamped), clamped / totalPages, clamped, totalPages, `Page ${clamped}`);
        setJumpFeedback(`Jumped to Page ${clamped}`);
        setTimeout(() => setJumpFeedback(null), 2500);
        return;
      } else if (parsedEpub) {
        // Jump to chapter index (1-based input)
        const chapIdx = pureNum - 1;
        if (chapIdx >= 0 && chapIdx < parsedEpub.chapters.length) {
          setActiveChapterIndex(chapIdx);
          const newProg = (chapIdx + 1) / parsedEpub.chapters.length;
          const curP = Math.max(1, Math.round(newProg * totalPages));
          updateLocation(`chap_${chapIdx}`, newProg, curP, totalPages, parsedEpub.chapters[chapIdx].title);
          setJumpFeedback(`Jumped to Chapter ${pureNum}`);
          setTimeout(() => setJumpFeedback(null), 2500);
          return;
        }
      }
    }

    // 2. "Chapter X" or "Chap X"
    const chapMatch = q.match(/(?:chap(?:ter)?\.?\s*|c\s*)(\d+)/i);
    if (chapMatch) {
      const chapNum = parseInt(chapMatch[1], 10);
      if (parsedEpub) {
        const idx = chapNum - 1;
        if (idx >= 0 && idx < parsedEpub.chapters.length) {
          setActiveChapterIndex(idx);
          const newProg = (idx + 1) / parsedEpub.chapters.length;
          const curP = Math.max(1, Math.round(newProg * totalPages));
          updateLocation(`chap_${idx}`, newProg, curP, totalPages, parsedEpub.chapters[idx].title);
          setJumpFeedback(`Jumped to Chapter ${chapNum}`);
          setTimeout(() => setJumpFeedback(null), 2500);
          return;
        }
      } else if (isPdf) {
        const found = tableOfContents.find(t => 
          t.title.toLowerCase().includes(`chapter ${chapNum}`) || 
          t.title.toLowerCase().includes(`chap ${chapNum}`)
        );
        if (found?.page) {
          updateLocation(String(found.page), found.page / totalPages, found.page, totalPages, found.title);
          setJumpFeedback(`Jumped to ${found.title}`);
          setTimeout(() => setJumpFeedback(null), 2500);
          return;
        }
        // Approximate page jump for PDF
        const estPage = Math.min(totalPages, Math.max(1, Math.round((chapNum - 1) * 22) + 1));
        updateLocation(String(estPage), estPage / totalPages, estPage, totalPages, `Chapter ${chapNum}`);
        setJumpFeedback(`Jumped to Chapter ${chapNum}`);
        setTimeout(() => setJumpFeedback(null), 2500);
        return;
      }
    }

    // 3. "Page X"
    const pageMatch = q.match(/(?:page|p\.?)\s*(\d+)/i);
    if (pageMatch) {
      const pageNum = parseInt(pageMatch[1], 10);
      const clamped = Math.min(totalPages, Math.max(1, pageNum));
      updateLocation(String(clamped), clamped / totalPages, clamped, totalPages, `Page ${clamped}`);
      setJumpFeedback(`Jumped to Page ${clamped}`);
      setTimeout(() => setJumpFeedback(null), 2500);
      return;
    }

    // 4. Chapter title search: e.g. "on the road", "prologue"
    const lowerQ = q.toLowerCase();
    if (parsedEpub) {
      const foundIdx = parsedEpub.chapters.findIndex(c => c.title.toLowerCase().includes(lowerQ));
      if (foundIdx !== -1) {
        setActiveChapterIndex(foundIdx);
        const newProg = (foundIdx + 1) / parsedEpub.chapters.length;
        const curP = Math.max(1, Math.round(newProg * totalPages));
        updateLocation(`chap_${foundIdx}`, newProg, curP, totalPages, parsedEpub.chapters[foundIdx].title);
        setJumpFeedback(`Jumped to ${parsedEpub.chapters[foundIdx].title}`);
        setTimeout(() => setJumpFeedback(null), 2500);
        return;
      }
    }
    if (tableOfContents.length > 0) {
      const foundToc = tableOfContents.find(t => t.title.toLowerCase().includes(lowerQ));
      if (foundToc?.page) {
        updateLocation(String(foundToc.page), foundToc.page / totalPages, foundToc.page, totalPages, foundToc.title);
        setJumpFeedback(`Jumped to ${foundToc.title}`);
        setTimeout(() => setJumpFeedback(null), 2500);
        return;
      }
    }

    setJumpFeedback('No matching chapter or page found');
    setTimeout(() => setJumpFeedback(null), 2500);
  };

  if (!isOpen || !item) return null;

  const auth = authStore.getState();
  const metadata = item.media?.metadata || {};

  const playerCover = player.item
    ? ((player.item as any)?.media?.coverPath || (auth.token && auth.serverUrl && !player.item.id.startsWith('local_') ? absClient.getItemCoverUrl(auth.serverUrl, auth.token, player.item.id, 600, auth.useProxy) : ''))
    : '';

  const hasAudioCompanion = !!(
    item.media?.duration || 
    item.media?.numTracks || 
    item.media?.tracks?.length || 
    item.media?.audioFiles?.length ||
    (item as any).numAudioFiles
  );

  const handleNextChapter = () => {
    if (parsedEpub && activeChapterIndex < parsedEpub.chapters.length - 1) {
      const nextIdx = activeChapterIndex + 1;
      setActiveChapterIndex(nextIdx);
      const newProgress = (nextIdx + 1) / parsedEpub.chapters.length;
      const curPage = Math.max(1, Math.round(newProgress * totalPages));
      updateLocation(`chap_${nextIdx}`, newProgress, curPage, totalPages, parsedEpub.chapters[nextIdx].title);
      contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      const nextPage = Math.min(totalPages, currentPage + 1);
      const newProgress = nextPage / totalPages;
      updateLocation(`page_${nextPage}`, newProgress, nextPage, totalPages);
    }
  };

  const handlePrevChapter = () => {
    if (parsedEpub && activeChapterIndex > 0) {
      const prevIdx = activeChapterIndex - 1;
      setActiveChapterIndex(prevIdx);
      const newProgress = prevIdx / parsedEpub.chapters.length;
      const curPage = Math.max(1, Math.round(newProgress * totalPages));
      updateLocation(`chap_${prevIdx}`, newProgress, curPage, totalPages, parsedEpub.chapters[prevIdx].title);
      contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      const prevPage = Math.max(1, currentPage - 1);
      const newProgress = prevPage / totalPages;
      updateLocation(`page_${prevPage}`, newProgress, prevPage, totalPages);
    }
  };

  const handleLocalFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      openLocalFile(file);
    }
  };

  // Theme Canvas Classes
  const getThemeStyles = () => {
    switch (preferences.theme) {
      case 'light':
        return {
          canvas: 'bg-[#ffffff] text-[#1c2128]',
          pageBorder: 'border-neutral-200 shadow-2xl',
        };
      case 'sepia':
      case 'paper':
        return {
          canvas: 'bg-[#faf6ee] text-[#2c241c]',
          pageBorder: 'border-[#eae0d0] shadow-2xl',
        };
      case 'midnight':
        return {
          canvas: 'bg-[#000000] text-[#d4d4d8]',
          pageBorder: 'border-neutral-900 shadow-2xl',
        };
      case 'dark':
      default:
        return {
          canvas: 'bg-[#181c21] text-[#f0f3f6]',
          pageBorder: 'border-neutral-800 shadow-2xl',
        };
    }
  };

  const themeStyle = getThemeStyles();
  const formatLeftHours = Math.floor(estimatedMinutesLeft / 60);
  const formatLeftMins = estimatedMinutesLeft % 60;

  const currentChapter = parsedEpub?.chapters[activeChapterIndex];
  const activeTitle = currentChapter?.title || currentChapterTitle || metadata.title || 'Reader';

  const speedOptions = [0.75, 1.0, 1.2, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 3.5, 4.0];

  return (
    <div className="fixed inset-0 z-50 bg-[#0b0e11] flex overflow-hidden animate-fade-in font-sans select-text">
      {/* Hidden local file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleLocalFileSelect}
        accept=".epub,.pdf"
        className="hidden"
      />

      {/* LEFT TOOLBAR: Minimalist navigation & collapsed tool triggers */}
      <div className="w-14 bg-[#12161a] border-r border-[#232830] flex flex-col items-center justify-between py-5 shrink-0 z-40 relative">
        {/* Top Controls */}
        <div className="flex flex-col items-center gap-3.5">
          <button
            onClick={closeBook}
            className="p-2 rounded-xl hover:bg-neutral-800 text-stone-400 hover:text-stone-100 transition-colors"
            title="Return to library"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl hover:bg-neutral-800 text-stone-400 hover:text-stone-100 transition-colors"
            title={isFullscreen ? 'Exit Fullscreen (F)' : 'Enter Fullscreen (F)'}
          >
            {isFullscreen ? <Minimize2 className="w-5 h-5 text-teal-400" /> : <Maximize2 className="w-5 h-5" />}
          </button>

          {/* AUDIO CONTROLS TRIGGER (Collapses neatly into left toolbar) */}
          <button
            onClick={() => {
              setShowAudioFlyout(!showAudioFlyout);
              setShowChapterFlyout(false);
            }}
            className={`p-2 rounded-xl transition-all relative ${
              showAudioFlyout
                ? 'bg-teal-500 text-black shadow-lg shadow-teal-500/30'
                : player.item && player.isPlaying
                ? 'bg-teal-500/20 text-teal-400 border border-teal-500/40'
                : player.item
                ? 'hover:bg-neutral-800 text-teal-400'
                : hasAudioCompanion
                ? 'hover:bg-neutral-800 text-stone-400'
                : 'hover:bg-neutral-800 text-stone-400'
            }`}
            title="Audio Controls (Press A)"
          >
            <Headphones className="w-5 h-5" />
            {player.item && player.isPlaying && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            )}
          </button>

          {/* CHAPTER & PAGE NAVIGATION (Type Chapter or Page) */}
          <button
            onClick={() => {
              setShowChapterFlyout(!showChapterFlyout);
              setShowAudioFlyout(false);
            }}
            className={`p-2 rounded-xl transition-all relative ${
              showChapterFlyout
                ? 'bg-teal-500 text-black shadow-lg shadow-teal-500/30'
                : 'hover:bg-neutral-800 text-stone-400 hover:text-stone-100'
            }`}
            title="Jump to chapter or page by typing (Press C)"
          >
            <BookMarked className="w-5 h-5" />
          </button>

          {/* FIND IN BOOK (Jump to words / search) */}
          <button
            onClick={() => {
              setShowFindBar(!showFindBar);
              setShowChapterFlyout(false);
              setShowAudioFlyout(false);
              setTimeout(() => epubSearchInputRef.current?.focus(), 60);
            }}
            className={`p-2 rounded-xl transition-all relative ${
              showFindBar
                ? 'bg-amber-400 text-black shadow-lg shadow-amber-400/30'
                : 'hover:bg-neutral-800 text-stone-400 hover:text-stone-100'
            }`}
            title="Find words in book (Ctrl+F)"
          >
            <Search className="w-5 h-5" />
          </button>

          {/* Open Local Ebook Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-xl hover:bg-neutral-800 text-stone-400 hover:text-stone-100 transition-colors"
            title="Open local EPUB or PDF"
          >
            <FolderOpen className="w-5 h-5" />
          </button>

          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl hover:bg-neutral-800 text-stone-400 hover:text-stone-100 transition-colors"
            title="Toggle theme"
          >
            {preferences.theme === 'light' ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5" />}
          </button>

          <button
            onClick={toggleSettings}
            className={`p-2 rounded-xl hover:bg-neutral-800 transition-colors ${showSettings ? 'text-teal-400 bg-neutral-800' : 'text-stone-400 hover:text-stone-100'}`}
            title="Reader view & typography settings"
          >
            <Settings2 className="w-5 h-5" />
          </button>
        </div>

        {/* Vertical Teal Progress Indicator Bar */}
        <div className="w-1 h-28 bg-neutral-800 rounded-full overflow-hidden relative my-auto">
          <div
            className="w-full bg-teal-400 rounded-full transition-all duration-300"
            style={{ height: `${Math.min(100, Math.max(3, progress * 100))}%` }}
          />
        </div>

        {/* Bottom Toggle Sidebar */}
        <button
          onClick={toggleSidebar}
          className={`p-2 rounded-xl hover:bg-neutral-800 transition-colors ${showSidebar ? 'text-teal-400' : 'text-stone-400 hover:text-stone-100'}`}
          title={showSidebar ? 'Hide sidebar (S)' : 'Show sidebar (S)'}
        >
          {showSidebar ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
        </button>
      </div>

      {/* FLYOUT 1: COLLAPSED AUDIO CONTROLS (Slides out from Left Toolbar) */}
      {showAudioFlyout && (
        <div className="absolute left-16 top-12 z-50 w-84 bg-[#14181e] border border-teal-500/40 rounded-2xl shadow-2xl p-4 animate-fade-in text-xs text-neutral-100 flex flex-col gap-3.5">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-neutral-800 text-stone-400">
            <div className="flex items-center gap-2">
              <Headphones className="w-4 h-4 text-teal-400" />
              <span className="font-semibold text-neutral-200 tracking-wider text-[11px] uppercase">
                Audio Companion
              </span>
              {player.item && player.isPlaying && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </div>
            <button
              onClick={() => setShowAudioFlyout(false)}
              className="p-1 hover:text-white text-stone-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {player.item ? (
            <>
              {/* Active Book & Chapter Info */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-neutral-900 border border-neutral-800 shrink-0">
                  {coverSrc ? (
                    <img src={coverSrc} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <BookOpen className="w-5 h-5 m-2.5 text-stone-500" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-semibold text-neutral-100 truncate block text-xs">
                    {player.item.media?.metadata?.title}
                  </span>
                  <span className="text-[11px] text-teal-400 truncate block">
                    {player.activeChapter?.title || 'Audiobook Narration'}
                  </span>
                </div>
              </div>

              {/* Time Scrubber */}
              <div className="flex flex-col gap-1">
                <input
                  type="range"
                  min={0}
                  max={player.duration || 100}
                  value={player.currentTime}
                  onChange={(e) => player.seek(Number(e.target.value))}
                  className="w-full h-1.5 bg-neutral-800 rounded appearance-none cursor-pointer accent-teal-400"
                />
                <div className="flex justify-between items-center text-[10px] text-stone-400 font-mono">
                  <span>{formatDuration(player.currentTime, true)}</span>
                  <span>{formatDuration(player.duration, true)}</span>
                </div>
              </div>

              {/* Primary Playback Buttons */}
              <div className="flex items-center justify-center gap-4 py-1">
                <button
                  onClick={() => player.skipBackward(15)}
                  className="p-2 rounded-full hover:bg-neutral-800 text-stone-300 hover:text-white transition-colors"
                  title="Skip backward 15s"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  onClick={player.togglePlay}
                  className="w-10 h-10 rounded-full bg-teal-500 hover:bg-teal-400 text-black flex items-center justify-center transition-transform active:scale-95 shadow-lg shadow-teal-500/25"
                  title={player.isPlaying ? 'Pause' : 'Play'}
                >
                  {player.isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                </button>
                <button
                  onClick={() => player.skipForward(30)}
                  className="p-2 rounded-full hover:bg-neutral-800 text-stone-300 hover:text-white transition-colors"
                  title="Skip forward 30s"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
              </div>

              {/* Speed Buttons up to 4.0x */}
              <div className="flex items-center justify-between pt-2 border-t border-neutral-800/80">
                <span className="text-stone-400 text-[11px]">Speed:</span>
                <div className="flex flex-wrap gap-1">
                  {[0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0].map(rate => (
                    <button
                      key={rate}
                      onClick={() => player.setPlaybackRate(rate)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                        player.playbackRate === rate
                          ? 'bg-teal-500 text-black font-bold'
                          : 'bg-neutral-800 hover:bg-neutral-700 text-stone-300'
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center text-stone-400 gap-2">
              <Headphones className="w-8 h-8 text-stone-600 mb-1" />
              <p className="text-xs">No active audiobook loaded.</p>
              {hasAudioCompanion && (
                <button
                  onClick={() => playerStore.loadAndPlay(item)}
                  className="mt-2 px-3 py-1.5 rounded-xl bg-teal-500 text-black font-semibold text-xs hover:bg-teal-400 transition-colors"
                >
                  Start Companion Audio
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* FLYOUT 2: CHAPTER & PAGE NAVIGATION (Type Chapter or Page #) */}
      {showChapterFlyout && (
        <div className="absolute left-16 top-20 z-50 w-96 max-h-[85vh] bg-[#14181e] border border-neutral-700 rounded-2xl shadow-2xl p-4 animate-fade-in text-xs text-neutral-100 flex flex-col gap-3">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-neutral-800 text-stone-400">
            <div className="flex items-center gap-2">
              <BookMarked className="w-4 h-4 text-teal-400" />
              <span className="font-semibold text-neutral-200 tracking-wider text-[11px] uppercase">
                Jump To Chapter / Page
              </span>
            </div>
            <button
              onClick={() => setShowChapterFlyout(false)}
              className="p-1 hover:text-white text-stone-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Jump Input Form ("by typing what chapter so ye") */}
          <form onSubmit={handleQuickJump} className="flex flex-col gap-1.5">
            <div className="relative flex items-center">
              <input
                ref={jumpInputRef}
                type="text"
                value={jumpQuery}
                onChange={(e) => setJumpQuery(e.target.value)}
                placeholder="Type chapter # or page # (e.g. 6 or 118)..."
                autoFocus
                className="w-full bg-neutral-900 border border-neutral-700/80 rounded-xl py-2 pl-3 pr-16 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-teal-500"
              />
              <button
                type="submit"
                className="absolute right-1 px-3 py-1 rounded-lg bg-teal-500 hover:bg-teal-400 text-black font-semibold text-[11px] transition-colors"
              >
                Jump
              </button>
            </div>
            {jumpFeedback && (
              <span className="text-[11px] text-teal-400 font-medium px-1 flex items-center gap-1 animate-fade-in">
                <Check className="w-3 h-3" /> {jumpFeedback}
              </span>
            )}
          </form>

          {/* Quick Position Bar */}
          <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-neutral-900/60 border border-neutral-800 text-[11px] text-stone-400 font-mono">
            <span>Current: Page {currentPage} of {totalPages}</span>
            <span className="text-teal-400 font-semibold">{formatProgressPercent(progress)}</span>
          </div>

          {/* Table of Contents / Chapters List */}
          <div className="flex-1 flex flex-col min-h-0 pt-2 border-t border-neutral-800">
            <span className="text-[11px] font-semibold text-stone-400 mb-2 block">
              {tableOfContents.length > 0 ? 'Chapters in this volume:' : 'Pages & Markers:'}
            </span>
            <div className="overflow-y-auto space-y-1 pr-1 flex-1 max-h-64">
              {tableOfContents.length > 0 ? (
                tableOfContents
                  .filter(c => !jumpQuery || c.title.toLowerCase().includes(jumpQuery.toLowerCase()))
                  .map((chap, idx) => (
                    <button
                      key={chap.id || idx}
                      onClick={() => {
                        if (parsedEpub) {
                          const targetIdx = parsedEpub.chapters.findIndex(c => c.id === chap.id || c.href === chap.href);
                          if (targetIdx !== -1) {
                            setActiveChapterIndex(targetIdx);
                            const newProg = (targetIdx + 1) / parsedEpub.chapters.length;
                            const curP = Math.max(1, Math.round(newProg * totalPages));
                            updateLocation(`chap_${targetIdx}`, newProg, curP, totalPages, chap.title);
                          }
                        } else if (chap.page) {
                          updateLocation(String(chap.page), chap.page / totalPages, chap.page, totalPages, chap.title);
                        }
                        setShowChapterFlyout(false);
                      }}
                      className={`w-full text-left py-2 px-2.5 rounded-xl text-xs truncate transition-colors flex items-center justify-between ${
                        activeChapterIndex === idx
                          ? 'bg-teal-500/20 text-teal-300 font-medium border border-teal-500/30'
                          : 'text-stone-300 hover:text-white hover:bg-neutral-800'
                      }`}
                    >
                      <span className="truncate">{chap.title}</span>
                      {chap.page && <span className="text-[10px] text-stone-500 font-mono ml-2">p.{chap.page}</span>}
                    </button>
                  ))
              ) : (
                <div className="p-3 text-center text-stone-500 text-[11px]">
                  Use the jump box above to type any page number (1 to {totalPages}).
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CENTER: Ultra-Clean MangaDex Reading Canvas */}
      <div className="flex-1 flex flex-col items-center justify-between p-1 md:p-3 overflow-hidden relative">
        {/* Floating Settings Bar (if open) */}
        {showSettings && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-[#181c21] border border-[#232830] rounded-2xl shadow-2xl p-4 flex flex-wrap items-center gap-5 animate-fade-in text-xs text-stone-300">
            {/* Font Family */}
            <div className="flex items-center gap-2">
              <span className="text-stone-400">Font:</span>
              <div className="flex bg-neutral-900 rounded-lg p-0.5 border border-neutral-800">
                {(['serif', 'sans', 'mono', 'dyslexic'] as const).map(font => (
                  <button
                    key={font}
                    onClick={() => setFontFamily(font)}
                    className={`px-2.5 py-1 rounded capitalize ${
                      preferences.fontFamily === font ? 'bg-teal-500 text-black font-semibold' : 'text-stone-400 hover:text-white'
                    }`}
                  >
                    {font}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Size */}
            <div className="flex items-center gap-2">
              <span className="text-stone-400">Size:</span>
              <button
                onClick={() => setFontSize(preferences.fontSize - 1)}
                className="w-6 h-6 rounded bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center font-bold"
              >
                -
              </button>
              <span className="font-mono text-xs w-6 text-center">{preferences.fontSize}</span>
              <button
                onClick={() => setFontSize(preferences.fontSize + 1)}
                className="w-6 h-6 rounded bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center font-bold"
              >
                +
              </button>
            </div>

            {/* Reader Width */}
            <div className="flex items-center gap-2">
              <span className="text-stone-400">Width:</span>
              <div className="flex bg-neutral-900 rounded-lg p-0.5 border border-neutral-800">
                {[
                  { label: 'Normal', value: 760 },
                  { label: 'Wide', value: 1040 },
                  { label: 'Full', value: 9999 },
                ].map(w => (
                  <button
                    key={w.value}
                    onClick={() => setMaxWidth(w.value)}
                    className={`px-2 py-1 rounded text-[11px] ${
                      preferences.maxWidth === w.value ? 'bg-teal-500 text-black font-semibold' : 'text-stone-400 hover:text-white'
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Themes */}
            <div className="flex items-center gap-2">
              <span className="text-stone-400">Theme:</span>
              <div className="flex gap-1.5">
                {[
                  { id: 'dark', color: 'bg-neutral-900 border-neutral-700', label: 'Dark' },
                  { id: 'light', color: 'bg-white border-neutral-300', label: 'Light' },
                  { id: 'sepia', color: 'bg-[#faf6ee] border-[#eae0d0]', label: 'Warm' },
                  { id: 'midnight', color: 'bg-black border-neutral-800', label: 'Midnight' },
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id as any)}
                    className={`w-5 h-5 rounded-full border ${t.color} ${preferences.theme === t.id ? 'ring-2 ring-teal-400 ring-offset-1 ring-offset-[#181c21]' : ''}`}
                    title={t.label}
                  />
                ))}
              </div>
            </div>

            <button
              onClick={toggleSettings}
              className="text-stone-400 hover:text-white ml-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* Reading Page Canvas Area */}
        <div 
          ref={contentRef}
          style={{
            maxWidth: isPdf ? '100%' : preferences.maxWidth >= 9999 ? '100%' : `${preferences.maxWidth}px`
          }}
          className={`w-full flex-1 ${
            isPdf 
              ? 'p-0 m-0 rounded-2xl overflow-hidden bg-[#0b0e11] border border-neutral-800/80 shadow-2xl relative flex flex-col' 
              : `${themeStyle.canvas} ${themeStyle.pageBorder} rounded-2xl border overflow-hidden transition-colors shadow-2xl relative flex flex-col`
          }`}
        >
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center text-stone-400 gap-3">
              <BookOpen className="w-8 h-8 text-teal-500 animate-pulse" />
              <span className="text-sm">Preparing book text...</span>
            </div>
          ) : isPdf ? (
            /* MangaDex Page-by-Page PDF Reader with Zoom & Clean Controls */
            <PdfPageReader
              url={localBlobUrl || activePdfUrl}
              buffer={pdfBuffer && pdfBuffer.byteLength > 0 ? pdfBuffer : null}
              initialPage={currentPage || 1}
              title={metadata.title || localFile?.name || 'Document'}
              onPageChange={(page, total) => {
                const newProgress = total > 0 ? page / total : 0;
                updateLocation(String(page), newProgress, page, total, `Page ${page}`);
              }}
              onToggleFullscreen={toggleFullscreen}
              isFullscreen={isFullscreen}
              isFindOpen={showFindBar}
              onToggleFind={() => setShowFindBar(prev => !prev)}
            />
          ) : currentChapter?.html ? (
            /* EPUB Paginated Chapter View */
            <div className="relative flex-1 w-full h-full flex flex-col justify-between overflow-hidden select-text">
              {/* EPUB Floating Find in Book Bar - 100% Solid Opaque */}
              {showFindBar && (
                <div className="absolute top-4 right-6 z-40 flex flex-col gap-2 bg-[#14181e] border border-amber-500/60 rounded-xl shadow-2xl p-2.5 animate-fade-in text-xs text-neutral-100">
                  <div className="flex items-center gap-2">
                    <Search className="w-4 h-4 text-amber-400 shrink-0" />
                    <input
                      ref={epubSearchInputRef}
                      type="text"
                      value={epubSearchQuery}
                      onChange={(e) => setEpubSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (e.shiftKey) {
                            goToPrevEpubMatch();
                          } else {
                            goToNextEpubMatch();
                          }
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          setShowFindBar(false);
                        }
                      }}
                      placeholder="Smart search words, phrases..."
                      className="w-44 md:w-60 bg-neutral-900 border border-neutral-700/80 rounded-lg px-2.5 py-1.5 text-xs text-neutral-100 placeholder:text-stone-500 focus:outline-none focus:ring-1 focus:ring-amber-400 font-medium"
                    />
                    {/* Jump Button */}
                    <button
                      onClick={() => {
                        if (epubMatches.length > 0) {
                          goToNextEpubMatch();
                        } else if (epubSearchQuery.trim().length >= 2) {
                          searchInEpub(epubSearchQuery);
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-black text-xs font-semibold transition-colors shrink-0 shadow-sm"
                      title="Jump to next occurrence"
                    >
                      Jump
                    </button>
                    <div className="text-[11px] font-mono text-stone-300 px-1 min-w-[70px] text-center">
                      {isSearchingEpub ? (
                        <span className="text-amber-400 animate-pulse">Searching...</span>
                      ) : epubMatches.length > 0 ? (
                        <span>
                          <strong className="text-amber-300">{epubMatchIdx + 1}</strong> of {epubMatches.length}
                          <span className="text-[10px] text-stone-400 ml-1">({epubMatches[epubMatchIdx]?.chapterTitle})</span>
                        </span>
                      ) : epubSearchQuery.trim().length >= 2 ? (
                        <span className="text-rose-400">No matches</span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1 border-l border-neutral-800 pl-1.5">
                      <button
                        onClick={goToPrevEpubMatch}
                        disabled={epubMatches.length === 0}
                        className="flex items-center gap-1 px-2 py-1 rounded bg-[#1c2128] hover:bg-[#252b34] disabled:opacity-30 text-stone-300 hover:text-white transition-colors text-[11px] font-medium border border-neutral-700"
                        title="Previous occurrence"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                        <span>Prev</span>
                      </button>
                      <button
                        onClick={goToNextEpubMatch}
                        disabled={epubMatches.length === 0}
                        className="flex items-center gap-1 px-2 py-1 rounded bg-[#1c2128] hover:bg-[#252b34] disabled:opacity-30 text-stone-300 hover:text-white transition-colors text-[11px] font-medium border border-neutral-700"
                        title="Next occurrence"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                        <span>Next</span>
                      </button>
                      {epubMatches.length > 0 && (
                        <button
                          onClick={() => setShowEpubMatchesDropdown(prev => !prev)}
                          className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                            showEpubMatchesDropdown 
                              ? 'bg-amber-400 text-black border-amber-400 font-semibold' 
                              : 'bg-[#1c2128] hover:bg-[#252b34] text-stone-300 border-neutral-700'
                          }`}
                          title="List all match occurrences with snippets"
                        >
                          <List className="w-3.5 h-3.5" />
                          <span>List</span>
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setShowFindBar(false);
                          setShowEpubMatchesDropdown(false);
                          setEpubSearchQuery('');
                          setEpubMatches([]);
                        }}
                        className="p-1.5 rounded hover:bg-neutral-800 text-stone-400 hover:text-white transition-colors ml-0.5"
                        title="Close find (Esc)"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* All EPUB Matches Dropdown Drawer - 100% Solid Opaque */}
                  {showEpubMatchesDropdown && epubMatches.length > 0 && (
                    <div className="w-full max-h-64 bg-[#101317] border border-neutral-700 rounded-xl p-2 overflow-y-auto space-y-1 z-50 shadow-2xl">
                      <div className="flex items-center justify-between pb-1.5 px-2 border-b border-neutral-800 text-[10px] text-stone-400 font-semibold uppercase tracking-wider">
                        <span>All {epubMatches.length} matches found</span>
                        <span>Click to jump</span>
                      </div>
                      {epubMatches.map((m, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setEpubMatchIdx(idx);
                            setActiveChapterIndex(m.chapterIndex);
                            if (parsedEpub) {
                              const newProgress = m.chapterIndex / parsedEpub.chapters.length;
                              updateLocation(`chap_${m.chapterIndex}`, newProgress, undefined, undefined, m.chapterTitle);
                            }
                            contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className={`w-full text-left p-2 rounded-lg text-xs transition-colors flex flex-col gap-0.5 ${
                            epubMatchIdx === idx
                              ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                              : 'hover:bg-[#1a1f26] text-stone-300 hover:text-white'
                          }`}
                        >
                          <span className="font-mono text-[10px] text-amber-400 font-semibold">{m.chapterTitle}</span>
                          <span className="line-clamp-2 text-[11px] text-stone-300">{m.snippet}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="relative flex-1 w-full h-full overflow-y-auto px-6 md:px-14 py-8">
                <div
                  style={{
                    fontSize: `${preferences.fontSize}px`,
                    lineHeight: preferences.lineHeight,
                    fontFamily: preferences.fontFamily === 'serif' ? 'Merriweather, Georgia, serif' : preferences.fontFamily === 'sans' ? 'Inter, sans-serif' : 'JetBrains Mono, monospace',
                  }}
                  className="reader-content select-text"
                  dangerouslySetInnerHTML={{ __html: currentChapter.html }}
                />
              </div>

              {/* Clean Bottom Navigation for EPUB - 100% Solid Dark Bar (No clear bleed) */}
              <div className="px-6 py-2.5 bg-[#0c0f12] border-t border-neutral-800 flex items-center justify-between gap-4 text-xs text-stone-300 shrink-0 shadow-2xl">
                <button
                  onClick={handlePrevChapter}
                  disabled={activeChapterIndex <= 0 && currentPage <= 1}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 disabled:opacity-40 text-stone-300 hover:text-white transition-colors border border-neutral-800"
                >
                  <ChevronLeft className="w-4 h-4" /> Prev Chapter
                </button>
                <div className="flex-1 flex items-center gap-3">
                  <span className="font-mono text-[11px] text-teal-400 truncate max-w-[150px]">
                    {activeTitle}
                  </span>
                  <div className="flex-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-400 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(2, progress * 100))}%` }}
                    />
                  </div>
                  <span className="font-mono text-[11px] text-stone-400">
                    {Math.round(progress * 100)}%
                  </span>
                </div>
                <button
                  onClick={handleNextChapter}
                  disabled={parsedEpub ? activeChapterIndex >= parsedEpub.chapters.length - 1 : false}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 disabled:opacity-40 text-stone-300 hover:text-white transition-colors border border-neutral-800"
                >
                  Next Chapter <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            /* Excerpt Fallback */
            <div
              style={{
                fontSize: `${preferences.fontSize}px`,
                lineHeight: preferences.lineHeight,
                fontFamily: preferences.fontFamily === 'serif' ? 'Merriweather, Georgia, serif' : 'Inter, sans-serif',
              }}
              className="reader-content select-text text-neutral-100 p-8"
            >
              <h2 className="text-xl font-bold font-serif mb-4">{metadata.title || activeTitle}</h2>
              <p className="leading-relaxed mb-4">
                The pages of the volume lay open before you. As you read, each passage immerses you further into the narrative.
              </p>
              <p className="leading-relaxed mb-4">
                Use the toolbar on the left to toggle between themes, adjust font size, and pair your reading session with audio narration simultaneously.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: Reading Progress Sidebar */}
      {showSidebar && (
        <aside className="w-80 md:w-96 bg-[#13161a] border-l border-[#232830] p-6 md:p-8 flex flex-col justify-start shrink-0 overflow-y-auto z-20">
          {/* Header */}
          <div className="flex items-center justify-between text-xs font-bold tracking-wider uppercase text-teal-400 mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-teal-400" />
              <span>READING PROGRESS</span>
            </div>
            {player.item && (
              <span className="flex items-center gap-1 text-[10px] text-teal-300 px-2 py-0.5 rounded bg-teal-500/10 border border-teal-500/20">
                <Headphones className="w-3 h-3" /> Listening
              </span>
            )}
          </div>

          {/* Jump to Word / Search Button */}
          <button
            onClick={() => {
              setShowFindBar(true);
              setTimeout(() => {
                epubSearchInputRef.current?.focus();
              }, 60);
            }}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold transition-all mb-4 active:scale-[0.98]"
            title="Open Find / Jump to Words"
          >
            <Search className="w-3.5 h-3.5 text-amber-400" />
            <span>Jump to Word</span>
          </button>

          {/* Book Cover Artwork - 100% Uncropped Natural Presentation */}
          <div className="w-full flex items-center justify-center mb-6">
            {coverSrc ? (
              <div className="relative rounded-2xl overflow-hidden shadow-2xl bg-neutral-950 border border-neutral-800/80 p-0.5 flex items-center justify-center group">
                <img
                  src={coverSrc}
                  alt={metadata.title}
                  onError={() => setCoverSrc('')}
                  className="w-auto h-auto max-w-full max-h-[360px] object-contain rounded-xl transition-transform duration-300 group-hover:scale-[1.02] block"
                />
              </div>
            ) : (
              <div className="w-48 h-64 rounded-2xl flex flex-col items-center justify-center p-6 text-center bg-gradient-to-b from-neutral-800 to-neutral-900 text-stone-300 border border-neutral-800 shadow-2xl">
                <BookOpen className="w-16 h-16 text-teal-400/70 mb-3" />
                <span className="font-serif font-bold text-base line-clamp-3">{metadata.title || localFile?.name || 'Local Ebook'}</span>
                <span className="text-xs text-stone-400 mt-2">{metadata.authorName || 'Author'}</span>
              </div>
            )}
          </div>

          {/* Title & Volume Header with Inline Rename Support */}
          <div className="mb-4">
            {isEditingTitle ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (editTitleText.trim()) {
                    renameBook(editTitleText.trim());
                  }
                  setIsEditingTitle(false);
                }}
                className="flex flex-col gap-2 bg-neutral-900/90 p-2.5 rounded-xl border border-teal-500/40"
              >
                <input
                  type="text"
                  value={editTitleText}
                  onChange={(e) => setEditTitleText(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setIsEditingTitle(false);
                    }
                  }}
                  className="w-full bg-neutral-950 border border-neutral-700/80 rounded-lg px-2.5 py-1.5 text-sm text-neutral-100 focus:outline-none focus:ring-1 focus:ring-teal-400 font-medium"
                  placeholder="Enter novel title..."
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingTitle(false)}
                    className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-stone-400 hover:text-white text-xs font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-teal-500 hover:bg-teal-400 text-black text-xs font-semibold transition-colors shadow-md shadow-teal-500/20"
                    title="Save novel name"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Save</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="group/title flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3
                    className="text-base font-medium text-neutral-100 line-clamp-2 leading-snug cursor-pointer hover:text-teal-300 transition-colors"
                    onClick={() => {
                      setEditTitleText(metadata.title || localFile?.name || 'Local Ebook');
                      setIsEditingTitle(true);
                    }}
                    title="Click to rename"
                  >
                    {metadata.title || localFile?.name || 'Local Ebook'}
                  </h3>
                  <p className="text-xs text-stone-400 mt-1">{metadata.authorName || 'Ebook Document'}</p>
                </div>
                <button
                  onClick={() => {
                    setEditTitleText(metadata.title || localFile?.name || 'Local Ebook');
                    setIsEditingTitle(true);
                  }}
                  className="p-1.5 rounded-lg text-stone-500 hover:text-teal-400 hover:bg-neutral-800/80 transition-colors opacity-60 group-hover/title:opacity-100 shrink-0"
                  title="Rename novel"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Progress Percentage & Scrubber */}
          <div className="flex flex-col gap-2 mb-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-stone-400 font-mono">Page {currentPage} of {totalPages}</span>
              <span className="text-teal-400 font-bold font-mono">{formatProgressPercent(progress)}</span>
            </div>
            <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-400 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(2, progress * 100))}%` }}
              />
            </div>
          </div>

          {/* Dedicated Save Progress Button */}
          <button
            onClick={() => {
              if (item) {
                const progressRecord = {
                  currentPage,
                  totalPages,
                  progress,
                  location: currentLocation || String(currentPage),
                  chapterTitle: currentChapterTitle,
                  updatedAt: Date.now(),
                };
                if (localFile?.name) {
                  localStorage.setItem(`folio_progress_${localFile.name}`, JSON.stringify(progressRecord));
                }
                if (item.id) {
                  localStorage.setItem(`folio_progress_${item.id}`, JSON.stringify(progressRecord));
                }
                setJustSavedProgress(true);
                setTimeout(() => setJustSavedProgress(false), 2200);
              }
            }}
            className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-medium transition-all active:scale-[0.98] ${
              justSavedProgress 
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-md shadow-emerald-500/20' 
                : 'bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border-teal-500/30'
            }`}
            title="Save reading progress to local storage"
          >
            {justSavedProgress ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold text-emerald-300">Progress Saved!</span>
              </>
            ) : (
              <>
                <Bookmark className="w-4 h-4 text-teal-400" />
                <span>Save Progress</span>
              </>
            )}
          </button>

          {/* Estimated Stats - Live updating with each page turn */}
          <div className="mt-4 pt-4 border-t border-neutral-800/80 grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-stone-500 block mb-1">Time Remaining</span>
              <span className="text-neutral-200 font-medium">
                {formatLeftHours > 0 ? `${formatLeftHours}h ` : ''}{formatLeftMins}m left
              </span>
            </div>
            <div>
              <span className="text-stone-500 block mb-1">Chapters Left</span>
              <span className="text-neutral-200 font-medium">{remainingChapters} remaining</span>
            </div>
          </div>

          {/* Table of Contents Drawer if toggled */}
          {showToc && tableOfContents.length > 0 && (
            <div className="mt-6 pt-4 border-t border-neutral-800 flex-1 flex flex-col">
              <span className="text-xs font-semibold text-stone-400 mb-3 block">Table of Contents</span>
              <div className="overflow-y-auto space-y-1 pr-1 flex-1 max-h-60">
                {tableOfContents.map((chap, idx) => (
                  <button
                    key={chap.id || idx}
                    onClick={() => {
                      if (parsedEpub) {
                        const targetIdx = parsedEpub.chapters.findIndex(c => c.id === chap.id || c.href === chap.href);
                        if (targetIdx !== -1) {
                          setActiveChapterIndex(targetIdx);
                          const newProgress = targetIdx / parsedEpub.chapters.length;
                          updateLocation(`chap_${targetIdx}`, newProgress, undefined, undefined, chap.title);
                          contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                        }
                      }
                    }}
                    className={`w-full text-left py-1.5 px-2 rounded text-xs truncate transition-colors ${
                      activeChapterIndex === idx ? 'bg-teal-500/20 text-teal-300 font-medium' : 'text-stone-400 hover:text-white hover:bg-neutral-800'
                    }`}
                  >
                    {chap.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>
      )}
    </div>
  );
};
