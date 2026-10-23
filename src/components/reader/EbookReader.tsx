import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, 
  Moon, 
  Sun, 
  ChevronLeft, 
  ChevronRight, 
  Settings2, 
  List, 
  Maximize2, 
  Minimize2, 
  PanelRightClose,
  PanelRightOpen,
  ZoomIn, 
  ZoomOut,
  BookOpen,
  Headphones,
  FolderOpen,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  X
} from 'lucide-react';
import { useReader } from '../../stores/readerStore';
import { authStore } from '../../stores/authStore';
import { usePlayer, playerStore } from '../../stores/playerStore';
import { absClient } from '../../api/absClient';
import { parseEpub, ParsedEpub } from '../../services/epubParser';
import { formatDuration, formatProgressPercent } from '../../utils/formatters';
import { PdfPageReader } from './PdfPageReader';

export const EbookReader: React.FC = () => {
  const {
    isOpen,
    item,
    ebookFile,
    localFile,
    localBuffer,
    localBlobUrl,
    progress,
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
  } = useReader();

  const player = usePlayer();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [parsedEpub, setParsedEpub] = useState<ParsedEpub | null>(null);
  const [activeChapterIndex, setActiveChapterIndex] = useState(0);
  const [pdfZoom, setPdfZoom] = useState(100);
  const [activePdfUrl, setActivePdfUrl] = useState<string | null>(null);
  const [pdfBuffer, setPdfBuffer] = useState<ArrayBuffer | null>(localBuffer);
  const [showAudioCompanion, setShowAudioCompanion] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [coverSrc, setCoverSrc] = useState<string>('');

  const contentRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      } else if (e.key === 's' || e.key === 'S') {
        toggleSidebar();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

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

  if (!isOpen || !item) return null;

  const auth = authStore.getState();
  const metadata = item.media?.metadata || {};

  const playerCover = player.item
    ? ((player.item as any)?.media?.coverPath || (auth.token && auth.serverUrl && !player.item.id.startsWith('local_') ? absClient.getItemCoverUrl(auth.serverUrl, auth.token, player.item.id, 600, auth.useProxy) : ''))
    : '';

  // Check if this book or any book has audio
  const hasAudioCompanion = !!(
    item.media?.duration || 
    item.media?.numTracks || 
    item.media?.tracks?.length || 
    item.media?.audioFiles?.length ||
    (item as any).numAudioFiles
  );

  // Handle Scroll Progress inside chapter (for fallback)
  const handleScroll = () => {
    if (!contentRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
    const scrollFraction = scrollHeight > clientHeight ? scrollTop / (scrollHeight - clientHeight) : 0;

    let overallProgress = progress;
    if (parsedEpub && parsedEpub.chapters.length > 0) {
      const chapterWeight = 1 / parsedEpub.chapters.length;
      overallProgress = (activeChapterIndex * chapterWeight) + (scrollFraction * chapterWeight);
    } else {
      overallProgress = Math.min(1, Math.max(0, scrollFraction));
    }

    const curPage = Math.max(1, Math.round(overallProgress * totalPages));
    updateLocation(`page_${curPage}`, overallProgress, curPage, totalPages);
  };

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

  const handleToggleAudio = () => {
    if (player.item) {
      player.togglePlay();
      setShowAudioCompanion(true);
    } else if (hasAudioCompanion) {
      playerStore.loadAndPlay(item);
      setShowAudioCompanion(true);
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

      {/* LEFT TOOLBAR: Minimalist navigation & tools */}
      <div className="w-14 bg-[#12161a] border-r border-[#232830] flex flex-col items-center justify-between py-5 shrink-0 z-20">
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

          {/* Audio Companion Toggle (Simultaneous Reading & Listening) */}
          <button
            onClick={handleToggleAudio}
            className={`p-2 rounded-xl transition-all relative ${
              player.item && player.isPlaying
                ? 'bg-teal-500 text-black shadow-lg shadow-teal-500/30'
                : player.item
                ? 'bg-teal-500/20 text-teal-400 border border-teal-500/40'
                : hasAudioCompanion
                ? 'hover:bg-neutral-800 text-teal-400'
                : 'hover:bg-neutral-800 text-stone-400'
            }`}
            title={player.item ? (player.isPlaying ? 'Audio companion playing (click to pause)' : 'Audio companion paused (click to play)') : 'Start audio companion'}
          >
            <Headphones className="w-5 h-5" />
            {player.item && player.isPlaying && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            )}
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

          {tableOfContents.length > 0 && (
            <button
              onClick={toggleToc}
              className={`p-2 rounded-xl hover:bg-neutral-800 transition-colors ${showToc ? 'text-teal-400 bg-neutral-800' : 'text-stone-400 hover:text-stone-100'}`}
              title="Table of contents"
            >
              <List className="w-5 h-5" />
            </button>
          )}
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

      {/* CENTER: MangaDex-style Reading Canvas */}
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
            /* MangaDex Page-by-Page PDF Reader */
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
            />
          ) : currentChapter?.html ? (
            /* EPUB Paginated Chapter View */
            <div className="relative flex-1 w-full h-full flex flex-col justify-between overflow-hidden select-text">
              {/* Paged Content Area */}
              <div 
                className="relative flex-1 w-full h-full overflow-y-auto px-6 md:px-14 py-8"
                onScroll={handleScroll}
              >
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

              {/* MangaDex Bottom Scrubber for EPUB */}
              <div className="px-6 py-2.5 bg-[#14181e]/95 backdrop-blur-md border-t border-neutral-800/80 flex items-center justify-between gap-4 text-xs text-stone-300 shrink-0">
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

        {/* DOCKED AUDIO COMPANION BAR (Simultaneous Reading & Listening!) */}
        {player.item && showAudioCompanion && (
          <div className="w-full max-w-2xl mx-auto mt-2 px-4 py-2.5 rounded-2xl bg-[#14181e]/95 backdrop-blur-xl border border-teal-500/30 shadow-2xl flex items-center justify-between gap-3 text-xs text-neutral-100 z-30 animate-slide-up">
            {/* Left: Indicator & Title */}
            <div className="flex items-center gap-2.5 min-w-0 max-w-xs">
              <div className="w-8 h-8 rounded-lg overflow-hidden bg-neutral-900 border border-teal-500/40 shrink-0 relative flex items-center justify-center">
                <Headphones className={`w-4 h-4 ${player.isPlaying ? 'text-teal-400 animate-pulse' : 'text-stone-400'}`} />
              </div>
              <div className="min-w-0">
                <span className="font-semibold text-neutral-100 truncate block text-[11px]">
                  {player.item.media?.metadata?.title}
                </span>
                <span className="text-[10px] text-teal-400 truncate block">
                  {player.activeChapter?.title || 'Audio Companion'}
                </span>
              </div>
            </div>

            {/* Center: Controls & Scrubber */}
            <div className="flex-1 max-w-sm flex items-center gap-2">
              <button
                onClick={() => player.skipBackward(15)}
                className="p-1 text-stone-400 hover:text-white transition-colors"
                title="Skip 15s"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={player.togglePlay}
                className="w-7 h-7 rounded-full bg-teal-500 hover:bg-teal-400 text-black flex items-center justify-center transition-transform active:scale-95 shadow-md shadow-teal-500/20"
                title={player.isPlaying ? 'Pause' : 'Play'}
              >
                {player.isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
              </button>
              <button
                onClick={() => player.skipForward(30)}
                className="p-1 text-stone-400 hover:text-white transition-colors"
                title="Skip 30s"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>

              {/* Scrubber */}
              <div className="flex-1 flex items-center gap-1.5 font-mono text-[9px] text-stone-400">
                <span>{formatDuration(player.currentTime, true)}</span>
                <input
                  type="range"
                  min={0}
                  max={player.duration || 100}
                  value={player.currentTime}
                  onChange={(e) => player.seek(Number(e.target.value))}
                  className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-teal-400"
                />
                <span>{formatDuration(player.duration, true)}</span>
              </div>
            </div>

            {/* Right: Speed & Close */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  const next = speedOptions[(speedOptions.indexOf(player.playbackRate) + 1) % speedOptions.length];
                  player.setPlaybackRate(next);
                }}
                className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-[10px] font-mono text-teal-300 font-semibold"
                title="Change playback speed (up to 4.0x)"
              >
                {player.playbackRate}x
              </button>
              <button
                onClick={() => setShowAudioCompanion(false)}
                className="p-1 text-stone-400 hover:text-stone-200 transition-colors"
                title="Hide companion bar"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT: Reading Progress Sidebar */}
      {showSidebar && (
        <aside className="w-80 md:w-96 bg-[#13161a] border-l border-[#232830] p-6 md:p-8 flex flex-col justify-start shrink-0 overflow-y-auto z-20">
          {/* Header */}
          <div className="flex items-center justify-between text-xs font-bold tracking-wider uppercase text-teal-400 mb-6">
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

          {/* Book Cover Artwork */}
          <div className="w-full aspect-square rounded-2xl overflow-hidden shadow-2xl bg-neutral-900 border border-neutral-800/80 mb-6 relative group">
            {coverSrc ? (
              <img
                src={coverSrc}
                alt={metadata.title}
                onError={() => {
                  if (coverSrc !== playerCover && playerCover) {
                    setCoverSrc(playerCover);
                  } else {
                    setCoverSrc('');
                  }
                }}
                className="w-full h-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-gradient-to-b from-neutral-800 to-neutral-900 text-stone-300">
                <BookOpen className="w-16 h-16 text-teal-400/70 mb-3" />
                <span className="font-serif font-bold text-base line-clamp-3">{metadata.title || localFile?.name || 'Local Ebook'}</span>
                <span className="text-xs text-stone-400 mt-2">{metadata.authorName || 'Author'}</span>
              </div>
            )}
          </div>

          {/* Title & Volume Header */}
          <div className="mb-4">
            <h3 className="text-base font-medium text-neutral-100 line-clamp-2 leading-snug">
              {metadata.title || localFile?.name || 'Local Ebook'}
            </h3>
            <p className="text-xs text-stone-400 mt-1">{metadata.authorName || 'Ebook Document'}</p>
          </div>

          {/* Progress Percentage & Scrubber */}
          <div className="flex flex-col gap-2 mb-3">
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
