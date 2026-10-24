import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Maximize2, 
  Minimize2, 
  ZoomIn, 
  ZoomOut,
  ArrowLeftRight,
  Search,
  ChevronUp,
  ChevronDown,
  X,
  List
} from 'lucide-react';

/**
 * Normalizes text for smart fuzzy search across light novels, documents, and web texts:
 * - Decomposes and strips diacritics / accents (café -> cafe, naïve -> naive)
 * - Converts typographic smart single quotes / apostrophes (‘, ’, ‚, ‛, ′) to ASCII '
 * - Converts typographic smart double quotes (“, ”, „, ‟, «, ») to ASCII "
 * - Converts em-dashes (—), en-dashes (–), minuses (−) to ASCII -
 * - Strips soft hyphens, zero-width spaces, and control joiners
 * - Collapses repeated whitespace & non-breaking spaces (\u00A0)
 */
export function normalizeSearchText(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035`]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036«»]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
    .replace(/[\u00AD\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/[\s\u00A0]+/g, ' ')
    .trim()
    .toLowerCase();
}

interface PdfPageReaderProps {
  buffer?: ArrayBuffer | null;
  url?: string | null;
  initialPage?: number;
  title?: string;
  onPageChange?: (page: number, total: number) => void;
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
  isFindOpen?: boolean;
  onToggleFind?: () => void;
}

export const PdfPageReader: React.FC<PdfPageReaderProps> = ({
  buffer,
  url,
  initialPage = 1,
  title,
  onPageChange,
  onToggleFullscreen,
  isFullscreen = false,
  isFindOpen,
  onToggleFind,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageWrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);
  const panStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number }>({
    x: 0,
    y: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });

  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState<number>(initialPage);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [fitMode, setFitMode] = useState<'height' | 'width' | 'auto'>('height');
  const [zoom, setZoom] = useState<number>(1.0);
  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [readingDirection, setReadingDirection] = useState<'ltr' | 'rtl'>('ltr');
  const [showControls, setShowControls] = useState<boolean>(true);
  const [showFindBar, setShowFindBar] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [matches, setMatches] = useState<Array<{ page: number; snippet?: string }>>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(-1);
  const [showMatchesDropdown, setShowMatchesDropdown] = useState<boolean>(false);

  const textCacheRef = useRef<Map<number, string>>(new Map());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchAbortRef = useRef<number>(0);

  // Sync with prop if parent controls find bar
  useEffect(() => {
    if (isFindOpen !== undefined) {
      setShowFindBar(isFindOpen);
      if (isFindOpen) {
        setTimeout(() => searchInputRef.current?.focus(), 60);
      }
    }
  }, [isFindOpen]);

  // Synchronize when parent updates page (e.g. typing chapter or page jump)
  useEffect(() => {
    if (initialPage && initialPage !== currentPage && totalPages > 1) {
      const clamped = Math.min(totalPages, Math.max(1, initialPage));
      setCurrentPage(clamped);
    }
  }, [initialPage, totalPages]);

  // Initialize PDF.js and Load Document
  useEffect(() => {
    let isCancelled = false;

    async function loadPdf() {
      setIsLoading(true);
      setError(null);

      try {
        let pdfjs = (window as any).pdfjsLib;

        // If PDF.js is not yet available, dynamically load it
        if (!pdfjs) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load PDF engine'));
            document.head.appendChild(script);
          });
          pdfjs = (window as any).pdfjsLib;
        }

        if (!pdfjs) {
          throw new Error('PDF viewer library could not be loaded');
        }

        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }

        let sourceParam: any = null;

        // Prefer URL / Blob URL first because browser blob URLs never detach!
        if (url) {
          sourceParam = { url };
        } else if (buffer && buffer.byteLength > 0 && !(buffer as any).detached) {
          try {
            sourceParam = { data: new Uint8Array(buffer.slice(0)) };
          } catch {
            if (url) sourceParam = { url };
          }
        }

        if (!sourceParam) {
          throw new Error('No PDF source provided or buffer was detached');
        }

        const loadingTask = pdfjs.getDocument({
          ...sourceParam,
          cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
          cMapPacked: true,
        });

        const doc = await loadingTask.promise;
        if (isCancelled) return;

        setPdfDoc(doc);
        const count = doc.numPages;
        setTotalPages(count);

        const validInitial = Math.min(count, Math.max(1, initialPage));
        setCurrentPage(validInitial);
        onPageChange?.(validInitial, count);
        setIsLoading(false);
      } catch (err: any) {
        if (!isCancelled) {
          console.error('Error loading PDF document:', err);
          setError(err.message || 'Failed to open PDF document');
          setIsLoading(false);
        }
      }
    }

    loadPdf();

    return () => {
      isCancelled = true;
    };
  }, [buffer, url]);

  // Render the current page onto the canvas and textLayer for text selection
  const renderCurrentPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current || !containerRef.current) return;

    try {
      setIsRendering(true);

      // Cancel any ongoing rendering task to prevent canvas collision
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
        renderTaskRef.current = null;
      }

      const page = await pdfDoc.getPage(currentPage);
      const container = containerRef.current;
      const canvas = canvasRef.current;

      const availWidth = Math.max(300, container.clientWidth - (showControls ? 20 : 0));
      const availHeight = Math.max(300, container.clientHeight - (showControls ? 70 : 0));

      const unscaledViewport = page.getViewport({ scale: 1 });
      const scaleX = availWidth / unscaledViewport.width;
      const scaleY = availHeight / unscaledViewport.height;

      let baseScale = 1;
      if (fitMode === 'height') {
        baseScale = scaleY;
      } else if (fitMode === 'width') {
        baseScale = scaleX;
      } else {
        baseScale = Math.min(scaleX, scaleY);
      }

      const targetScale = baseScale * zoom;
      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: targetScale });

      const w = viewport.width;
      const h = viewport.height;

      setCanvasDimensions({ width: w, height: h });
      if (pageWrapperRef.current) {
        pageWrapperRef.current.style.width = `${w}px`;
        pageWrapperRef.current.style.height = `${h}px`;
      }

      canvas.width = Math.round(viewport.width * dpr);
      canvas.height = Math.round(viewport.height * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.scale(dpr, dpr);

      const renderContext = {
        canvasContext: ctx,
        viewport,
      };

      const task = page.render(renderContext);
      renderTaskRef.current = task;
      await task.promise;
      ctx.restore();

      // Wait for embedded PDF fonts to be ready so text layer font measurements align with canvas
      if ((document as any).fonts?.ready) {
        try {
          await (document as any).fonts.ready;
        } catch {}
      }

      // Render Text Layer for Selectable Text with Cursor
      if (textLayerRef.current) {
        const textLayerDiv = textLayerRef.current;
        textLayerDiv.innerHTML = '';
        textLayerDiv.style.left = '0px';
        textLayerDiv.style.top = '0px';
        textLayerDiv.style.width = `${w}px`;
        textLayerDiv.style.height = `${h}px`;
        textLayerDiv.style.setProperty('--scale-factor', `${viewport.scale}`);

        try {
          const textContent = await page.getTextContent();
          const pdfjs = (window as any).pdfjsLib;

          if (pdfjs?.renderTextLayer) {
            const textTask = pdfjs.renderTextLayer({
              textContentSource: textContent,
              textContent: textContent,
              container: textLayerDiv,
              viewport: viewport,
              textDivs: [],
            });
            await (textTask.promise || textTask);
          } else if (pdfjs?.TextLayer) {
            const tl = new pdfjs.TextLayer({
              textContentSource: textContent,
              container: textLayerDiv,
              viewport: viewport,
            });
            await tl.render();
          }

          // Highlight searched words on current page if find is active using smart normalization
          if (showFindBar && searchQuery && searchQuery.trim().length >= 2) {
            const normQ = normalizeSearchText(searchQuery);
            const queryWords = normQ.split(' ').filter(w => w.length > 0);
            const spans = textLayerDiv.querySelectorAll('span');
            spans.forEach(span => {
              const spanText = normalizeSearchText(span.textContent || '');
              const isMatch = spanText.includes(normQ) || (queryWords.length > 1 && queryWords.every(w => spanText.includes(w)));
              if (isMatch) {
                span.style.backgroundColor = 'rgba(251, 191, 36, 0.45)';
                span.style.boxShadow = '0 0 0 2px rgba(245, 158, 11, 0.85)';
                span.style.borderRadius = '3px';
              }
            });
          }
        } catch (textErr) {
          console.warn('Text layer rendering note:', textErr);
        }
      }

      setIsRendering(false);
      renderTaskRef.current = null;

      // Preload next and prev pages for instant flipping
      if (currentPage + 1 <= totalPages) {
        pdfDoc.getPage(currentPage + 1).catch(() => {});
      }
      if (currentPage - 1 >= 1) {
        pdfDoc.getPage(currentPage - 1).catch(() => {});
      }
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.warn('PDF page render notice:', err);
      }
      setIsRendering(false);
    }
  }, [pdfDoc, currentPage, fitMode, zoom, showControls, totalPages, showFindBar, searchQuery]);

  // Re-render when page, fitMode, zoom, or controls change
  useEffect(() => {
    renderCurrentPage();
  }, [renderCurrentPage]);

  // Handle Resize: re-render canvas to fit new dimensions
  useEffect(() => {
    const handleResize = () => {
      renderCurrentPage();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderCurrentPage]);

  // Page Navigation (Only triggered by buttons/slider/keys, never by canvas clicks)
  const goToPage = (pageNum: number) => {
    const clamped = Math.min(totalPages, Math.max(1, pageNum));
    if (clamped !== currentPage) {
      setCurrentPage(clamped);
      onPageChange?.(clamped, totalPages);
    }
  };

  const handleNextPage = () => {
    if (readingDirection === 'ltr') {
      goToPage(currentPage + 1);
    } else {
      goToPage(currentPage - 1);
    }
  };

  const handlePrevPage = () => {
    if (readingDirection === 'ltr') {
      goToPage(currentPage - 1);
    } else {
      goToPage(currentPage + 1);
    }
  };

  // Very Smart Search in PDF across all pages (Jump to words feature)
  const searchInPdf = useCallback(async (query: string) => {
    if (!pdfDoc || !query || query.trim().length < 2) {
      setMatches([]);
      setCurrentMatchIndex(-1);
      setIsSearching(false);
      return;
    }

    const currentSearchId = ++searchAbortRef.current;
    setIsSearching(true);
    const normQ = normalizeSearchText(query);
    const queryWords = normQ.split(' ').filter(w => w.length > 1);
    const foundMatches: { page: number; snippet: string }[] = [];

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      if (searchAbortRef.current !== currentSearchId) return;

      let rawPageText = textCacheRef.current.get(pageNum);
      if (rawPageText === undefined) {
        try {
          const page = await pdfDoc.getPage(pageNum);
          const tc = await page.getTextContent();
          rawPageText = tc.items.map((it: any) => it.str).join(' ');
          textCacheRef.current.set(pageNum, rawPageText);
        } catch {
          rawPageText = '';
        }
      }

      if (!rawPageText) continue;

      const normPage = normalizeSearchText(rawPageText);

      // 1. Direct normalized phrase match
      const phraseIdx = normPage.indexOf(normQ);
      if (phraseIdx !== -1) {
        const start = Math.max(0, phraseIdx - 20);
        const end = Math.min(rawPageText.length, phraseIdx + normQ.length + 35);
        const snippet = (start > 0 ? '...' : '') + rawPageText.slice(start, end).trim() + (end < rawPageText.length ? '...' : '');
        foundMatches.push({ page: pageNum, snippet });
        setMatches([...foundMatches]);
        continue;
      }

      // 2. Proximity search: if multiple words in query, check if all words occur on this page within close proximity
      if (queryWords.length > 1) {
        const allPresent = queryWords.every(w => normPage.includes(w));
        if (allPresent) {
          const firstWordIdx = normPage.indexOf(queryWords[0]);
          const lastWordIdx = normPage.indexOf(queryWords[queryWords.length - 1]);
          if (firstWordIdx !== -1 && Math.abs(lastWordIdx - firstWordIdx) < 280) {
            const minIdx = Math.min(firstWordIdx, lastWordIdx);
            const start = Math.max(0, minIdx - 20);
            const end = Math.min(rawPageText.length, minIdx + 85);
            const snippet = (start > 0 ? '...' : '') + rawPageText.slice(start, end).trim() + (end < rawPageText.length ? '...' : '');
            foundMatches.push({ page: pageNum, snippet });
            setMatches([...foundMatches]);
          }
        }
      }
    }

    if (searchAbortRef.current === currentSearchId) {
      setMatches(foundMatches);
      setIsSearching(false);
      if (foundMatches.length > 0) {
        // Pick first match on or after current page, or fallback to first match
        const closestIdx = foundMatches.findIndex(m => m.page >= currentPage);
        const targetIdx = closestIdx !== -1 ? closestIdx : 0;
        setCurrentMatchIndex(targetIdx);
        goToPage(foundMatches[targetIdx].page);
      } else {
        setCurrentMatchIndex(-1);
      }
    }
  }, [pdfDoc, totalPages, currentPage]);

  useEffect(() => {
    if (!showFindBar) {
      setMatches([]);
      setCurrentMatchIndex(-1);
      return;
    }

    if (!searchQuery || searchQuery.trim().length < 2) {
      setMatches([]);
      setCurrentMatchIndex(-1);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(() => {
      searchInPdf(searchQuery);
    }, 280);

    return () => clearTimeout(timer);
  }, [searchQuery, showFindBar, searchInPdf]);

  const goToNextMatch = () => {
    if (matches.length === 0) return;
    const nextIdx = (currentMatchIndex + 1) % matches.length;
    setCurrentMatchIndex(nextIdx);
    goToPage(matches[nextIdx].page);
  };

  const goToPrevMatch = () => {
    if (matches.length === 0) return;
    const prevIdx = (currentMatchIndex - 1 + matches.length) % matches.length;
    setCurrentMatchIndex(prevIdx);
    goToPage(matches[prevIdx].page);
  };

  // Keyboard Shortcuts (Arrow keys & space for page navigation, + / - for zoom, Ctrl+F for find)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Find shortcut Ctrl+F / Cmd+F works even when typing or in reading view
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setShowFindBar(true);
        setTimeout(() => searchInputRef.current?.focus(), 60);
        return;
      }

      if (e.key === 'Escape' && showFindBar) {
        e.preventDefault();
        setShowFindBar(false);
        return;
      }

      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        handleNextPage();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        handlePrevPage();
      } else if (e.key === 'Home') {
        e.preventDefault();
        goToPage(1);
      } else if (e.key === 'End') {
        e.preventDefault();
        goToPage(totalPages);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setZoom(prev => Math.min(3.0, Number((prev + 0.15).toFixed(2))));
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        setZoom(prev => Math.max(0.5, Number((prev - 0.15).toFixed(2))));
      } else if (e.key === '0') {
        e.preventDefault();
        setZoom(1.0);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, totalPages, readingDirection]);

  // Wheel listener: Pinch-to-zoom / Ctrl+wheel to zoom; does NOT switch pages!
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.12 : 0.12;
        setZoom(prev => Math.min(3.0, Math.max(0.5, Number((prev + delta).toFixed(2)))));
      }
      // Note: Normal vertical/horizontal wheel scrolls when zoomed in, and does NOT switch pages!
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Panning when zoomed in (only when dragging background or when zoomed)
  const handleMouseDown = (e: React.MouseEvent) => {
    // If user clicked inside textLayer, let them select text!
    if ((e.target as HTMLElement)?.closest('.textLayer')) {
      return;
    }

    if (zoom > 1.01 && containerRef.current) {
      setIsPanning(true);
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        scrollLeft: containerRef.current.scrollLeft,
        scrollTop: containerRef.current.scrollTop,
      };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning && containerRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      containerRef.current.scrollLeft = panStartRef.current.scrollLeft - dx;
      containerRef.current.scrollTop = panStartRef.current.scrollTop - dy;
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Canvas click toggles controls, NEVER turns pages, ignores text selection
  const handleCanvasContainerClick = (e: React.MouseEvent) => {
    // If user clicked inside textLayer or selected text, do not toggle controls
    if ((e.target as HTMLElement)?.closest('.textLayer')) return;
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) return;
    if (isPanning) return;
    setShowControls(prev => !prev);
  };

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-neutral-300 gap-4">
        <p className="text-sm text-red-400 font-medium">{error}</p>
        <p className="text-xs text-stone-500">Could not parse PDF pages in MangaDex viewer.</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex-1 flex flex-col bg-[#0b0e11] select-text overflow-hidden">
      {/* Top MangaDex Header Overlay - 100% Solid Dark Bar (No clear / translucent bleed) */}
      {showControls && (
        <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between px-6 py-3 bg-[#0c0f12] border-b border-neutral-800 animate-fade-in text-xs text-stone-300 select-none shadow-xl">
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-medium text-neutral-100 truncate max-w-sm md:max-w-md">
              {title || 'Document'}
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] bg-teal-500/10 text-teal-400 border border-teal-500/20 font-mono uppercase">
              Page {currentPage} of {totalPages}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Zoom Controls */}
            <div className="flex items-center gap-1 bg-[#161a20] rounded-lg p-0.5 border border-neutral-800 text-[11px]">
              <button
                onClick={() => setZoom(prev => Math.max(0.5, Number((prev - 0.15).toFixed(2))))}
                className="p-1 hover:text-white text-stone-400 hover:bg-neutral-800 rounded transition-colors"
                title="Zoom out (-)"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setZoom(1.0)}
                className="px-2 py-0.5 font-mono text-[11px] text-teal-400 hover:text-teal-300 transition-colors"
                title="Reset zoom to 100% (0)"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                onClick={() => setZoom(prev => Math.min(3.0, Number((prev + 0.15).toFixed(2))))}
                className="p-1 hover:text-white text-stone-400 hover:bg-neutral-800 rounded transition-colors"
                title="Zoom in (+)"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Fit mode selector */}
            <div className="flex bg-[#161a20] rounded-lg p-0.5 border border-neutral-800 text-[11px]">
              <button
                onClick={() => {
                  setFitMode('height');
                  setZoom(1.0);
                }}
                className={`px-2.5 py-1 rounded transition-colors ${
                  fitMode === 'height' && zoom === 1.0 ? 'bg-teal-500 text-black font-semibold' : 'text-stone-400 hover:text-white'
                }`}
                title="Fit to page height"
              >
                Fit Height
              </button>
              <button
                onClick={() => {
                  setFitMode('width');
                  setZoom(1.0);
                }}
                className={`px-2.5 py-1 rounded transition-colors ${
                  fitMode === 'width' && zoom === 1.0 ? 'bg-teal-500 text-black font-semibold' : 'text-stone-400 hover:text-white'
                }`}
                title="Fit to page width"
              >
                Fit Width
              </button>
            </div>

            {/* Reading Direction (LTR / RTL) */}
            <button
              onClick={() => setReadingDirection(readingDirection === 'ltr' ? 'rtl' : 'ltr')}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#1c2128] hover:bg-[#252b34] text-stone-300 border border-neutral-700 text-[11px] transition-colors"
              title="Toggle reading direction (LTR for Western books / RTL for Manga)"
            >
              <ArrowLeftRight className="w-3 h-3 text-teal-400" />
              <span>{readingDirection.toUpperCase()}</span>
            </button>

            {/* Find in Document (Search Words) */}
            <button
              onClick={() => {
                setShowFindBar(prev => {
                  const next = !prev;
                  if (next) {
                    setTimeout(() => searchInputRef.current?.focus(), 60);
                  }
                  return next;
                });
                onToggleFind?.();
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] transition-colors ${
                showFindBar
                  ? 'bg-amber-400 text-black font-semibold border-amber-400 shadow-md shadow-amber-400/25'
                  : 'bg-[#1c2128] hover:bg-[#252b34] text-stone-300 border-neutral-700'
              }`}
              title="Find words in document (Ctrl+F)"
            >
              <Search className="w-3 h-3 text-amber-400" />
              <span>Find</span>
            </button>

            {/* Fullscreen Toggle */}
            {onToggleFullscreen && (
              <button
                onClick={onToggleFullscreen}
                className="p-1.5 rounded-lg bg-[#1c2128] hover:bg-[#252b34] text-stone-300 hover:text-white transition-colors border border-neutral-700"
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Floating Find in Document Bar - 100% Solid Opaque (No clear UI) */}
      {showFindBar && (
        <div className="absolute top-14 right-6 z-40 flex flex-col gap-2 bg-[#14181e] border border-amber-500/60 rounded-xl shadow-2xl p-2.5 animate-fade-in text-xs text-neutral-100">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-amber-400 shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (e.shiftKey) {
                    goToPrevMatch();
                  } else {
                    goToNextMatch();
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
                if (matches.length > 0) {
                  goToNextMatch();
                } else if (searchQuery.trim().length >= 2) {
                  searchInPdf(searchQuery);
                }
              }}
              className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-black text-xs font-semibold transition-colors shrink-0 shadow-sm"
              title="Jump to next occurrence"
            >
              Jump
            </button>
            <div className="text-[11px] font-mono text-stone-300 px-1 min-w-[70px] text-center">
              {isSearching ? (
                <span className="text-amber-400 animate-pulse">Searching...</span>
              ) : matches.length > 0 ? (
                <span>
                  <strong className="text-amber-300">{currentMatchIndex + 1}</strong> of {matches.length}
                  <span className="text-[10px] text-stone-400 ml-1">(p.{matches[currentMatchIndex]?.page})</span>
                </span>
              ) : searchQuery.trim().length >= 2 ? (
                <span className="text-rose-400">No matches</span>
              ) : null}
            </div>
            <div className="flex items-center gap-1 border-l border-neutral-800 pl-1.5">
              <button
                onClick={goToPrevMatch}
                disabled={matches.length === 0}
                className="flex items-center gap-1 px-2 py-1 rounded bg-[#1c2128] hover:bg-[#252b34] disabled:opacity-30 text-stone-300 hover:text-white transition-colors text-[11px] font-medium border border-neutral-700"
                title="Previous occurrence"
              >
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Prev</span>
              </button>
              <button
                onClick={goToNextMatch}
                disabled={matches.length === 0}
                className="flex items-center gap-1 px-2 py-1 rounded bg-[#1c2128] hover:bg-[#252b34] disabled:opacity-30 text-stone-300 hover:text-white transition-colors text-[11px] font-medium border border-neutral-700"
                title="Next occurrence"
              >
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Next</span>
              </button>
              {matches.length > 0 && (
                <button
                  onClick={() => setShowMatchesDropdown(prev => !prev)}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                    showMatchesDropdown 
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
                  setShowMatchesDropdown(false);
                  setSearchQuery('');
                  setMatches([]);
                }}
                className="p-1.5 rounded hover:bg-neutral-800 text-stone-400 hover:text-white transition-colors ml-0.5"
                title="Close find (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* All Matches Dropdown Drawer - 100% Solid Opaque */}
          {showMatchesDropdown && matches.length > 0 && (
            <div className="w-full max-h-64 bg-[#101317] border border-neutral-700 rounded-xl p-2 overflow-y-auto space-y-1 z-50 shadow-2xl">
              <div className="flex items-center justify-between pb-1.5 px-2 border-b border-neutral-800 text-[10px] text-stone-400 font-semibold uppercase tracking-wider">
                <span>All {matches.length} matches found</span>
                <span>Click to jump</span>
              </div>
              {matches.map((m, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setCurrentMatchIndex(idx);
                    goToPage(m.page);
                  }}
                  className={`w-full text-left p-2 rounded-lg text-xs transition-colors flex flex-col gap-0.5 ${
                    currentMatchIndex === idx
                      ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                      : 'hover:bg-[#1a1f26] text-stone-300 hover:text-white'
                  }`}
                >
                  <span className="font-mono text-[10px] text-amber-400 font-semibold">Page {m.page}</span>
                  <span className="line-clamp-2 text-[11px] text-stone-300">{m.snippet}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Viewport: Canvas + High-Fidelity Text Layer for Cursor Selection */}
      <div
        ref={containerRef}
        onClick={handleCanvasContainerClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className={`relative flex-1 w-full h-full flex items-center justify-center overflow-auto ${
          zoom > 1.01 ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
        }`}
      >
        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 text-stone-400 animate-pulse select-none">
            <div className="w-8 h-8 rounded-full border-2 border-teal-500 border-t-transparent animate-spin" />
            <span className="text-xs font-mono">Loading pages...</span>
          </div>
        ) : (
          <div
            ref={pageWrapperRef}
            className="relative shadow-2xl rounded my-auto mx-auto shrink-0 select-text"
            style={{
              width: canvasDimensions.width ? `${canvasDimensions.width}px` : 'auto',
              height: canvasDimensions.height ? `${canvasDimensions.height}px` : 'auto',
            }}
          >
            <canvas
              ref={canvasRef}
              className="block rounded transition-opacity duration-150 pointer-events-none"
              style={{ opacity: isRendering ? 0.85 : 1 }}
            />
            {/* Transparent Selectable Text Overlay */}
            <div
              ref={textLayerRef}
              className="textLayer absolute inset-0 select-text pointer-events-auto"
            />
          </div>
        )}

        {/* Left Explicit Arrow Button - 100% Solid Dark (Page text will not bleed through) */}
        <div className="absolute inset-y-0 left-0 w-20 flex items-center justify-start pl-3 pointer-events-none z-20 select-none">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handlePrevPage();
            }}
            disabled={currentPage <= 1}
            className="pointer-events-auto p-3 rounded-full bg-[#161a20] hover:bg-[#222832] border border-neutral-700 text-stone-200 hover:text-teal-400 shadow-2xl hover:scale-110 transition-all opacity-80 hover:opacity-100 disabled:opacity-0 disabled:pointer-events-none"
            title="Previous page"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        </div>

        {/* Right Explicit Arrow Button - 100% Solid Dark (Page text will not bleed through) */}
        <div className="absolute inset-y-0 right-0 w-20 flex items-center justify-end pr-3 pointer-events-none z-20 select-none">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleNextPage();
            }}
            disabled={currentPage >= totalPages}
            className="pointer-events-auto p-3 rounded-full bg-[#161a20] hover:bg-[#222832] border border-neutral-700 text-stone-200 hover:text-teal-400 shadow-2xl hover:scale-110 transition-all opacity-80 hover:opacity-100 disabled:opacity-0 disabled:pointer-events-none"
            title="Next page"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* MangaDex Bottom Scrubber Overlay - 100% Solid Dark Bar (No clear / translucent bleed) */}
      {showControls && (
        <div className="absolute bottom-0 inset-x-0 z-30 flex flex-col gap-2 px-6 py-3 bg-[#0c0f12] border-t border-neutral-800 animate-slide-up text-xs text-stone-300 select-none shadow-2xl">
          <div className="flex items-center justify-between gap-4">
            {/* Prev Button */}
            <button
              onClick={handlePrevPage}
              disabled={currentPage <= 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#161a20] hover:bg-[#222832] disabled:opacity-40 text-stone-300 hover:text-white transition-colors border border-neutral-800"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Prev</span>
            </button>

            {/* Interactive MangaDex Scrubber Slider */}
            <div className="flex-1 flex items-center gap-3">
              <span className="font-mono text-[11px] text-teal-400 shrink-0 w-12 text-right">
                {currentPage}
              </span>
              <input
                type="range"
                min={1}
                max={totalPages}
                value={currentPage}
                onChange={(e) => goToPage(Number(e.target.value))}
                className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-teal-400 focus:outline-none"
              />
              <span className="font-mono text-[11px] text-stone-500 shrink-0 w-12">
                / {totalPages}
              </span>
            </div>

            {/* Next Button */}
            <button
              onClick={handleNextPage}
              disabled={currentPage >= totalPages}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#161a20] hover:bg-[#222832] disabled:opacity-40 text-stone-300 hover:text-white transition-colors border border-neutral-800"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Segment Indicator Ticks */}
          <div className="w-full flex items-center justify-between text-[10px] text-stone-500 font-mono px-1">
            <span>Page 1</span>
            <span>{Math.round((currentPage / totalPages) * 100)}%</span>
            <span>Page {totalPages}</span>
          </div>
        </div>
      )}
    </div>
  );
};
