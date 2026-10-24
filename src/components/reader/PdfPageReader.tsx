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
  X
} from 'lucide-react';

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

      // Render Text Layer for Selectable Text with Cursor
      if (textLayerRef.current) {
        const textLayerDiv = textLayerRef.current;
        textLayerDiv.innerHTML = '';
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
              enhanceTextSelection: true,
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

          // Highlight searched words on current page if find is active
          if (showFindBar && searchQuery && searchQuery.trim().length >= 2) {
            const q = searchQuery.trim().toLowerCase();
            const spans = textLayerDiv.querySelectorAll('span');
            spans.forEach(span => {
              const text = (span.textContent || '').toLowerCase();
              if (text.includes(q)) {
                span.style.backgroundColor = 'rgba(251, 191, 36, 0.45)';
                span.style.boxShadow = '0 0 0 2px rgba(245, 158, 11, 0.7)';
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

  // Search in PDF across all pages (Jump to words feature)
  const searchInPdf = useCallback(async (query: string) => {
    if (!pdfDoc || !query || query.trim().length < 2) {
      setMatches([]);
      setCurrentMatchIndex(-1);
      setIsSearching(false);
      return;
    }

    const currentSearchId = ++searchAbortRef.current;
    setIsSearching(true);
    const q = query.trim().toLowerCase();
    const foundMatches: { page: number; snippet: string }[] = [];

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      if (searchAbortRef.current !== currentSearchId) return;

      let pageText = textCacheRef.current.get(pageNum);
      if (pageText === undefined) {
        try {
          const page = await pdfDoc.getPage(pageNum);
          const tc = await page.getTextContent();
          pageText = tc.items.map((it: any) => it.str).join(' ');
          textCacheRef.current.set(pageNum, pageText);
        } catch {
          pageText = '';
        }
      }

      const idx = pageText.toLowerCase().indexOf(q);
      if (idx !== -1) {
        const start = Math.max(0, idx - 15);
        const end = Math.min(pageText.length, idx + q.length + 25);
        const snippet = (start > 0 ? '...' : '') + pageText.slice(start, end).trim() + (end < pageText.length ? '...' : '');
        foundMatches.push({ page: pageNum, snippet });
        setMatches([...foundMatches]);
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
      {/* Top MangaDex Header Overlay */}
      {showControls && (
        <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between px-6 py-3 bg-[#0e1216]/95 backdrop-blur-md border-b border-white/5 animate-fade-in text-xs text-stone-300 select-none">
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
            <div className="flex items-center gap-1 bg-neutral-900/90 rounded-lg p-0.5 border border-neutral-800 text-[11px]">
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
            <div className="flex bg-neutral-900/90 rounded-lg p-0.5 border border-neutral-800 text-[11px]">
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
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-800/80 hover:bg-neutral-700 text-stone-300 border border-neutral-700 text-[11px] transition-colors"
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
                  : 'bg-neutral-800/80 hover:bg-neutral-700 text-stone-300 border-neutral-700'
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
                className="p-1.5 rounded-lg bg-neutral-800/80 hover:bg-neutral-700 text-stone-300 hover:text-white transition-colors border border-neutral-700"
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Floating Find in Document Bar */}
      {showFindBar && (
        <div className="absolute top-14 right-6 z-40 flex items-center gap-2 bg-[#14181e]/98 backdrop-blur-2xl border border-amber-500/40 rounded-xl shadow-2xl p-2 px-3 animate-fade-in text-xs text-neutral-100">
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
            placeholder="Find words in document..."
            className="w-40 md:w-56 bg-neutral-900 border border-neutral-700/80 rounded-lg px-2.5 py-1 text-xs text-neutral-100 placeholder:text-stone-500 focus:outline-none focus:ring-1 focus:ring-amber-400 font-medium"
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
            className="px-2.5 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-black text-xs font-semibold transition-colors shrink-0 shadow-sm"
            title="Jump to word"
          >
            Jump
          </button>
          <div className="text-[11px] font-mono text-stone-400 px-1 min-w-[65px] text-center">
            {isSearching ? (
              <span className="text-amber-400 animate-pulse">Searching...</span>
            ) : matches.length > 0 ? (
              <span>
                <strong className="text-amber-300">{currentMatchIndex + 1}</strong> of {matches.length}
                <span className="text-[10px] text-stone-500 ml-1">(p.{matches[currentMatchIndex]?.page})</span>
              </span>
            ) : searchQuery.trim().length >= 2 ? (
              <span className="text-rose-400">No matches</span>
            ) : null}
          </div>
          <div className="flex items-center gap-1 border-l border-neutral-800 pl-1.5">
            <button
              onClick={goToPrevMatch}
              disabled={matches.length === 0}
              className="flex items-center gap-1 px-2 py-1 rounded bg-neutral-850 hover:bg-neutral-800 disabled:opacity-30 text-stone-300 hover:text-white transition-colors text-[11px] font-medium border border-neutral-750"
              title="Previous occurrence"
            >
              <ChevronUp className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>
            <button
              onClick={goToNextMatch}
              disabled={matches.length === 0}
              className="flex items-center gap-1 px-2 py-1 rounded bg-neutral-850 hover:bg-neutral-800 disabled:opacity-30 text-stone-300 hover:text-white transition-colors text-[11px] font-medium border border-neutral-750"
              title="Next occurrence"
            >
              <ChevronDown className="w-3.5 h-3.5" />
              <span>Next</span>
            </button>
            <button
              onClick={() => {
                setShowFindBar(false);
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

        {/* Left Explicit Arrow Button */}
        <div className="absolute inset-y-0 left-0 w-20 flex items-center justify-start pl-3 pointer-events-none z-20 select-none">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handlePrevPage();
            }}
            disabled={currentPage <= 1}
            className="pointer-events-auto p-3 rounded-full bg-black/75 hover:bg-black/95 backdrop-blur-md border border-white/10 text-stone-200 hover:text-teal-400 shadow-2xl hover:scale-110 transition-all opacity-40 hover:opacity-100 disabled:opacity-0 disabled:pointer-events-none"
            title="Previous page"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        </div>

        {/* Right Explicit Arrow Button */}
        <div className="absolute inset-y-0 right-0 w-20 flex items-center justify-end pr-3 pointer-events-none z-20 select-none">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleNextPage();
            }}
            disabled={currentPage >= totalPages}
            className="pointer-events-auto p-3 rounded-full bg-black/75 hover:bg-black/95 backdrop-blur-md border border-white/10 text-stone-200 hover:text-teal-400 shadow-2xl hover:scale-110 transition-all opacity-40 hover:opacity-100 disabled:opacity-0 disabled:pointer-events-none"
            title="Next page"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* MangaDex Bottom Scrubber Overlay */}
      {showControls && (
        <div className="absolute bottom-0 inset-x-0 z-30 flex flex-col gap-2 px-6 py-3 bg-[#0e1216]/95 backdrop-blur-md border-t border-white/5 animate-slide-up text-xs text-stone-300 select-none">
          <div className="flex items-center justify-between gap-4">
            {/* Prev Button */}
            <button
              onClick={handlePrevPage}
              disabled={currentPage <= 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-neutral-900/90 hover:bg-neutral-800 disabled:opacity-40 text-stone-300 hover:text-white transition-colors border border-neutral-800"
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
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-neutral-900/90 hover:bg-neutral-800 disabled:opacity-40 text-stone-300 hover:text-white transition-colors border border-neutral-800"
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
