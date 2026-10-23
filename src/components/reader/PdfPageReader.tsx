import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Maximize2, 
  Minimize2, 
  RotateCcw, 
  ZoomIn, 
  ZoomOut,
  Maximize,
  ArrowLeftRight,
  Sliders,
  Check
} from 'lucide-react';

interface PdfPageReaderProps {
  buffer?: ArrayBuffer | null;
  url?: string | null;
  initialPage?: number;
  title?: string;
  onPageChange?: (page: number, total: number) => void;
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
}

export const PdfPageReader: React.FC<PdfPageReaderProps> = ({
  buffer,
  url,
  initialPage = 1,
  title,
  onPageChange,
  onToggleFullscreen,
  isFullscreen = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);

  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState<number>(initialPage);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [fitMode, setFitMode] = useState<'height' | 'width' | 'auto'>('height');
  const [readingDirection, setReadingDirection] = useState<'ltr' | 'rtl'>('ltr');
  const [showControls, setShowControls] = useState<boolean>(true);
  const [pageInputValue, setPageInputValue] = useState<string>(String(initialPage));

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
        setPageInputValue(String(validInitial));
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

  // Render the current page onto the canvas
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

      let targetScale = 1;
      if (fitMode === 'height') {
        targetScale = scaleY;
      } else if (fitMode === 'width') {
        targetScale = scaleX;
      } else {
        targetScale = Math.min(scaleX, scaleY);
      }

      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: targetScale });

      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

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
  }, [pdfDoc, currentPage, fitMode, showControls, totalPages]);

  // Re-render when page, fitMode, or controls change
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

  // Page Navigation
  const goToPage = (pageNum: number) => {
    const clamped = Math.min(totalPages, Math.max(1, pageNum));
    if (clamped !== currentPage) {
      setCurrentPage(clamped);
      setPageInputValue(String(clamped));
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

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, totalPages, readingDirection]);

  // Handle Click Zones (Left / Center / Right)
  const handleCanvasContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;

    const leftZone = width * 0.28;
    const rightZone = width * 0.72;

    if (clickX < leftZone) {
      // Left Zone -> Prev (in LTR) or Next (in RTL)
      handlePrevPage();
    } else if (clickX > rightZone) {
      // Right Zone -> Next (in LTR) or Prev (in RTL)
      handleNextPage();
    } else {
      // Center Zone -> Toggle top & bottom overlay controls
      setShowControls(!showControls);
    }
  };

  // Wheel listener: flip page on vertical wheel tick
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let wheelTimeout: any = null;
    let accumulatedDelta = 0;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      accumulatedDelta += e.deltaY;

      if (wheelTimeout) clearTimeout(wheelTimeout);
      wheelTimeout = setTimeout(() => {
        if (accumulatedDelta > 40) {
          handleNextPage();
        } else if (accumulatedDelta < -40) {
          handlePrevPage();
        }
        accumulatedDelta = 0;
      }, 50);
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
      if (wheelTimeout) clearTimeout(wheelTimeout);
    };
  }, [currentPage, totalPages, readingDirection]);

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-neutral-300 gap-4">
        <p className="text-sm text-red-400 font-medium">{error}</p>
        <p className="text-xs text-stone-500">Could not parse PDF pages in MangaDex viewer.</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex-1 flex flex-col bg-[#0b0e11] select-none overflow-hidden">
      {/* Top MangaDex Header Overlay */}
      {showControls && (
        <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between px-6 py-3 bg-[#0e1216]/90 backdrop-blur-md border-b border-white/5 animate-fade-in text-xs text-stone-300">
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-medium text-neutral-100 truncate max-w-sm md:max-w-md">
              {title || 'Document'}
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] bg-teal-500/10 text-teal-400 border border-teal-500/20 font-mono uppercase">
              Page {currentPage} of {totalPages}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Fit mode selector */}
            <div className="flex bg-neutral-900/90 rounded-lg p-0.5 border border-neutral-800 text-[11px]">
              <button
                onClick={() => setFitMode('height')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  fitMode === 'height' ? 'bg-teal-500 text-black font-semibold' : 'text-stone-400 hover:text-white'
                }`}
                title="Fit to page height (Manga style)"
              >
                Fit Height
              </button>
              <button
                onClick={() => setFitMode('width')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  fitMode === 'width' ? 'bg-teal-500 text-black font-semibold' : 'text-stone-400 hover:text-white'
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

      {/* Main Canvas Viewport with Left/Right Click Zones */}
      <div
        ref={containerRef}
        onClick={handleCanvasContainerClick}
        className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden cursor-pointer"
      >
        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 text-stone-400 animate-pulse">
            <div className="w-8 h-8 rounded-full border-2 border-teal-500 border-t-transparent animate-spin" />
            <span className="text-xs font-mono">Loading pages...</span>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="shadow-2xl transition-opacity duration-150 rounded"
            style={{ opacity: isRendering ? 0.8 : 1 }}
          />
        )}

        {/* Left Hover Zone & Arrow */}
        <div className="absolute inset-y-0 left-0 w-24 flex items-center justify-start pl-4 opacity-0 hover:opacity-100 transition-opacity pointer-events-none group">
          <div className="p-3 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-stone-200 shadow-2xl group-hover:scale-110 transition-transform">
            <ChevronLeft className="w-6 h-6" />
          </div>
        </div>

        {/* Right Hover Zone & Arrow */}
        <div className="absolute inset-y-0 right-0 w-24 flex items-center justify-end pr-4 opacity-0 hover:opacity-100 transition-opacity pointer-events-none group">
          <div className="p-3 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-stone-200 shadow-2xl group-hover:scale-110 transition-transform">
            <ChevronRight className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* MangaDex Bottom Scrubber Overlay */}
      {showControls && (
        <div className="absolute bottom-0 inset-x-0 z-30 flex flex-col gap-2 px-6 py-3 bg-[#0e1216]/95 backdrop-blur-md border-t border-white/5 animate-slide-up text-xs text-stone-300">
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
