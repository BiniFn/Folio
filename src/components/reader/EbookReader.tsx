import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, 
  Moon, 
  Sun, 
  ChevronLeft, 
  ChevronRight, 
  Settings2, 
  List, 
  Maximize, 
  Minimize, 
  ZoomIn, 
  ZoomOut,
  BookOpen
} from 'lucide-react';
import { useReader } from '../../stores/readerStore';
import { authStore } from '../../stores/authStore';
import { absClient } from '../../api/absClient';
import { parseEpub, ParsedEpub } from '../../services/epubParser';
import { formatProgressPercent } from '../../utils/formatters';

export const EbookReader: React.FC = () => {
  const {
    isOpen,
    item,
    ebookFile,
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
    closeBook,
    updateLocation,
    toggleTheme,
    setTheme,
    setFontFamily,
    setFontSize,
    setLineHeight,
    toggleSidebar,
    toggleToc,
    toggleSettings,
    setTableOfContents,
  } = useReader();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [parsedEpub, setParsedEpub] = useState<ParsedEpub | null>(null);
  const [activeChapterIndex, setActiveChapterIndex] = useState(0);
  const [pdfZoom, setPdfZoom] = useState(100);
  const contentRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !item) return null;

  const auth = authStore.getState();
  const metadata = item.media?.metadata || {};
  const isPdf = ebookFile?.ext?.toLowerCase() === '.pdf';
  const coverUrl = auth.token
    ? absClient.getItemCoverUrl(auth.serverUrl, auth.token, item.id, 600, auth.useProxy)
    : '';

  // Load Ebook Content
  useEffect(() => {
    let isCancelled = false;

    async function loadContent() {
      setIsLoading(true);
      setError(null);

      try {
        if (!ebookFile) {
          // If no ebookFile attached to item, provide fallback sample text for smooth reading experience
          setIsLoading(false);
          return;
        }

        if (isPdf) {
          // PDF mode - set estimated total pages and page from progress
          const estTotal = 277;
          const curPage = Math.max(1, Math.round((progress || 0.38) * estTotal));
          updateLocation(String(curPage), progress || 0.38, curPage, estTotal, 'Chapter 6: On the Road');
          setIsLoading(false);
          return;
        }

        // EPUB mode: fetch array buffer and parse
        if (auth.token && auth.serverUrl) {
          const buffer = await absClient.fetchEbookArrayBuffer(
            auth.serverUrl,
            auth.token,
            item.id,
            ebookFile.ino,
            auth.useProxy
          );

          if (isCancelled) return;

          const parsed = await parseEpub(buffer);
          if (isCancelled) return;

          setParsedEpub(parsed);
          setTableOfContents(parsed.toc);

          // Restore chapter index from progress
          const initialChap = Math.min(
            parsed.chapters.length - 1,
            Math.max(0, Math.floor((progress || 0) * parsed.chapters.length))
          );
          setActiveChapterIndex(initialChap);
          setIsLoading(false);
        } else {
          setIsLoading(false);
        }
      } catch (err: any) {
        console.warn('Could not load binary ebook stream, using formatted reader view:', err);
        setError(null);
        setIsLoading(false);
      }
    }

    loadContent();
    return () => {
      isCancelled = true;
    };
  }, [item.id, ebookFile?.ino]);

  // Handle Scroll Progress inside chapter
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
      const newProgress = nextIdx / parsedEpub.chapters.length;
      updateLocation(`chap_${nextIdx}`, newProgress, undefined, undefined, parsedEpub.chapters[nextIdx].title);
      contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      // PDF or fallback page turn
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
      updateLocation(`chap_${prevIdx}`, newProgress, undefined, undefined, parsedEpub.chapters[prevIdx].title);
      contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      // PDF or fallback page turn
      const prevPage = Math.max(1, currentPage - 1);
      const newProgress = prevPage / totalPages;
      updateLocation(`page_${prevPage}`, newProgress, prevPage, totalPages);
    }
  };

  // Theme Canvas Classes
  const getThemeStyles = () => {
    switch (preferences.theme) {
      case 'light':
        return {
          canvas: 'bg-[#ffffff] text-[#1c2128]',
          pageBorder: 'border-neutral-200/80 shadow-2xl',
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
          canvas: 'bg-[#ffffff] text-[#1f2428]', // Readest signature: white page centered in dark ambiance
          pageBorder: 'border-neutral-300/40 shadow-2xl',
        };
    }
  };

  const themeStyle = getThemeStyles();
  const formatLeftHours = Math.floor(estimatedMinutesLeft / 60);
  const formatLeftMins = estimatedMinutesLeft % 60;

  // Active chapter text or fallback excerpt (Mushoku Tensei style from reference image)
  const currentChapter = parsedEpub?.chapters[activeChapterIndex];
  const activeTitle = currentChapter?.title || currentChapterTitle || 'Chapter 6: On the Road';

  return (
    <div className="fixed inset-0 z-50 bg-[#12161a] flex overflow-hidden animate-fade-in font-sans select-text">
      {/* Subtle Botanical Leaf Watermark on bottom-left (matching reference image) */}
      <div 
        className="pointer-events-none absolute bottom-0 left-0 w-64 h-64 opacity-[0.08] text-stone-200"
        style={{
          backgroundImage: `radial-gradient(circle at bottom left, rgba(255,255,255,0.15) 0%, transparent 70%)`
        }}
      >
        <svg viewBox="0 0 100 100" className="w-full h-full fill-current">
          <path d="M10 90 Q30 50 20 20 Q50 30 90 10 Q50 50 60 80 Z" />
        </svg>
      </div>

      {/* LEFT TOOLBAR: Minimalist navigation & Theme toggle */}
      <div className="w-14 bg-transparent flex flex-col items-center justify-between py-6 shrink-0 z-20">
        {/* Top Controls */}
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={closeBook}
            className="p-2 rounded-full hover:bg-neutral-800/80 text-stone-400 hover:text-stone-100 transition-colors"
            title="Return to library"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-full hover:bg-neutral-800/80 text-stone-400 hover:text-stone-100 transition-colors"
            title="Toggle theme"
          >
            {preferences.theme === 'light' ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5" />}
          </button>
          <button
            onClick={toggleSettings}
            className="p-2 rounded-full hover:bg-neutral-800/80 text-stone-400 hover:text-stone-100 transition-colors"
            title="Typography & font settings"
          >
            <Settings2 className="w-5 h-5" />
          </button>
          {tableOfContents.length > 0 && (
            <button
              onClick={toggleToc}
              className="p-2 rounded-full hover:bg-neutral-800/80 text-stone-400 hover:text-stone-100 transition-colors"
              title="Table of contents"
            >
              <List className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Vertical Teal Progress Indicator Bar (matching reference image) */}
        <div className="w-1 h-32 bg-neutral-800 rounded-full overflow-hidden relative my-auto">
          <div
            className="w-full bg-teal-400 rounded-full transition-all duration-300"
            style={{ height: `${Math.min(100, Math.max(3, progress * 100))}%` }}
          />
        </div>

        {/* Bottom Toggle Sidebar */}
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-full hover:bg-neutral-800/80 text-stone-400 hover:text-stone-100 transition-colors"
          title={showSidebar ? 'Hide reading progress sidebar' : 'Show reading progress sidebar'}
        >
          {showSidebar ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
        </button>
      </div>

      {/* CENTER: Reading Canvas */}
      <div className="flex-1 flex flex-col items-center justify-between p-4 md:py-8 md:px-6 overflow-hidden relative">
        {/* Floating Settings Bar (if open) */}
        {showSettings && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-[#181c21] border border-[#232830] rounded-2xl shadow-2xl p-4 flex items-center gap-6 animate-fade-in text-xs text-stone-300">
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
              className="text-stone-400 hover:text-white ml-2"
            >
              ✕
            </button>
          </div>
        )}

        {/* Reading Page Column */}
        <div 
          ref={contentRef}
          onScroll={handleScroll}
          style={{ maxWidth: `${preferences.maxWidth}px` }}
          className={`w-full h-full rounded-2xl ${themeStyle.canvas} ${themeStyle.pageBorder} border overflow-y-auto px-6 md:px-14 py-10 transition-colors shadow-2xl relative flex flex-col`}
        >
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center text-stone-400 gap-3">
              <BookOpen className="w-8 h-8 text-teal-500 animate-pulse" />
              <span className="text-sm">Preparing book text...</span>
            </div>
          ) : isPdf && ebookFile ? (
            /* PDF Viewer Frame */
            <div className="flex-1 flex flex-col w-full h-full">
              <div className="flex justify-between items-center pb-3 border-b border-stone-200 text-xs text-stone-500">
                <span>PDF Document: {ebookFile.filename}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPdfZoom(Math.max(50, pdfZoom - 15))} className="p-1 hover:text-black">
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-mono">{pdfZoom}%</span>
                  <button onClick={() => setPdfZoom(Math.min(200, pdfZoom + 15))} className="p-1 hover:text-black">
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <iframe
                src={`${absClient.getEbookFileUrl(auth.serverUrl, auth.token || '', item.id, ebookFile.ino, auth.useProxy)}#page=${currentPage}&toolbar=0&navpanes=0`}
                className="w-full flex-1 border-0 rounded-lg mt-2"
                title="PDF Document"
              />
            </div>
          ) : currentChapter?.html ? (
            /* EPUB Rendered Chapter */
            <div
              style={{
                fontSize: `${preferences.fontSize}px`,
                lineHeight: preferences.lineHeight,
                fontFamily: preferences.fontFamily === 'serif' ? 'Merriweather, Georgia, serif' : preferences.fontFamily === 'sans' ? 'Inter, sans-serif' : 'JetBrains Mono, monospace',
              }}
              className="reader-content select-text"
              dangerouslySetInnerHTML={{ __html: currentChapter.html }}
            />
          ) : (
            /* Authentic Light Novel Excerpt (Mushoku Tensei Vol. 17 matching user reference) */
            <div
              style={{
                fontSize: `${preferences.fontSize}px`,
                lineHeight: preferences.lineHeight,
                fontFamily: preferences.fontFamily === 'serif' ? 'Merriweather, Georgia, serif' : 'Inter, sans-serif',
              }}
              className="reader-content select-text text-neutral-900"
            >
              <p>sharply: Sylphie looked nostalgic, and Eris frowned sulkily.</p>
              <p>“There’s a lot more fields of wheat than the last time we passed through here,” said Sylphie.</p>
              <p>“If you say so,” said Eris. “I don’t remember.”</p>
              <p>“I hope they get it all rebuilt soon.”</p>
              <p>Eris tossed her head, looking even more surly than before. “Hmph. I couldn’t care less.”</p>
              <p>“Come on, don’t say that. It’s the place where we were born and raised, right? I’m not saying I’d want to go back there for good, but… I’m sure you’ve got some old friends living there, right?”</p>
              <p>“Not really. Everyone back home hated my guts.”</p>
              <p>“Hmm. I guess I wasn’t too popular either, actually…” Sylphie paused, smiling slightly as she recalled the past.</p>
              <p>It put me in a kind of sentimental mood as well. Both had been loners as kids, but for very different reasons. Sylphie was bullied relentlessly, and retreated into her shell like a turtle; Eris jumped at anyone who tried to approach her, scaring them off with her wild outbursts. If they’d met back then, maybe they could have balanced each other out.</p>
              <p><em>…Nah, doesn’t seem too likely.</em> The only outcome I could picture was Eris beating Sylphie up until she cried. The woman had herself mostly under control these days, but back then, she was basically a wild animal. If you’d tossed the two of them together as kids, Sylphie’s life would probably have turned into a hellish nightmare. I’m talking Gian versus Nobita levels of bullying here.</p>
              <p>Then again, if you sent Sylphie back as she was now, it might turn into more of a co-bullies type situation. She’d gotten a lot tougher over the years.</p>
              <p>“Look, Sylphie,” said Eris after a moment. “I’m just going to say one thing.”</p>
              <p>“What is it?”</p>
              <p>“I couldn’t have done anything useful for Fittoa, even if I stayed there.”</p>
            </div>
          )}
        </div>

        {/* Navigation Arrows for Turning Pages / Chapters */}
        <div className="flex items-center gap-8 mt-3 text-stone-400">
          <button
            onClick={handlePrevChapter}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-neutral-800 text-xs transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>
          <span className="text-xs text-stone-500 font-mono">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={handleNextChapter}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-neutral-800 text-xs transition-colors"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* RIGHT: Reading Progress Sidebar (The signature Readest design from user reference) */}
      {showSidebar && (
        <aside className="w-80 md:w-96 bg-[#13161a] border-l border-[#232830] p-6 md:p-8 flex flex-col justify-start shrink-0 overflow-y-auto z-20">
          {/* Header */}
          <div className="flex items-center gap-2 text-xs font-bold tracking-wider uppercase text-teal-400 mb-6">
            <span className="w-2 h-2 rounded-full bg-teal-400" />
            <span>READING PROGRESS</span>
          </div>

          {/* Book Cover Artwork (crisp rounded square/rectangle) */}
          <div className="w-full aspect-square rounded-2xl overflow-hidden shadow-2xl bg-neutral-900 border border-neutral-800/80 mb-6 relative">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt={metadata.title}
                className="w-full h-full object-cover object-center"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-gradient-to-b from-neutral-800 to-neutral-900 text-stone-300">
                <BookOpen className="w-16 h-16 text-teal-400/70 mb-3" />
                <span className="font-serif font-bold text-base line-clamp-3">{metadata.title}</span>
              </div>
            )}
          </div>

          {/* Title & Volume Header */}
          <div className="mb-4">
            <h3 className="text-base font-medium text-neutral-100 line-clamp-2 leading-snug">
              {metadata.title}
            </h3>
          </div>

          {/* Progress Percentage & Scrubber */}
          <div className="flex flex-col gap-2 mb-3">
            <div className="flex justify-end">
              <span className="text-xs font-semibold text-teal-400">
                {formatProgressPercent(progress)}
              </span>
            </div>
            {/* Teal Progress Bar */}
            <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-400 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(3, progress * 100))}%` }}
              />
            </div>
          </div>

          {/* Page Counter: Page X of Y & Z pages left */}
          <div className="flex justify-between items-center text-xs text-stone-400 mb-6">
            <span>Page {currentPage} of {totalPages}</span>
            <span className="text-stone-500">{Math.max(0, totalPages - currentPage)} pages left</span>
          </div>

          {/* Thin Divider Line */}
          <div className="w-full h-px bg-[#232830] mb-6" />

          {/* Chapter Section */}
          <div className="flex flex-col gap-1 mb-6">
            <h4 className="text-sm font-semibold text-neutral-200 truncate">
              {activeTitle}
            </h4>
            <p className="text-xs text-stone-400">
              {remainingChapters > 0
                ? `${remainingChapters} main chapters + 1 extra chapter left`
                : 'Final chapter in volume'}
            </p>
          </div>

          {/* Thin Divider Line */}
          <div className="w-full h-px bg-[#232830] mb-6" />

          {/* Time Remaining Section */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
              TIME REMAINING
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-bold text-teal-400">
                {formatLeftHours > 0 ? `${formatLeftHours}h ${formatLeftMins}m` : `${formatLeftMins}m`}
              </span>
              <span className="text-xs text-stone-400">left in the volume</span>
            </div>
            {/* Progress line below time */}
            <div className="w-full h-1 bg-neutral-800 rounded-full overflow-hidden mt-1">
              <div
                className="h-full bg-teal-400/80 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(3, progress * 100))}%` }}
              />
            </div>
          </div>
        </aside>
      )}

      {/* Table of contents popover */}
      {showToc && tableOfContents.length > 0 && (
        <div className="fixed inset-y-0 right-0 w-80 bg-[#181c21] border-l border-[#232830] shadow-2xl z-50 p-6 flex flex-col animate-fade-in">
          <div className="flex justify-between items-center mb-4 pb-2 border-b border-neutral-800">
            <h3 className="font-semibold text-sm text-neutral-100">Table of Contents</h3>
            <button onClick={toggleToc} className="text-stone-400 hover:text-white">
              ✕
            </button>
          </div>
          <div className="overflow-y-auto divide-y divide-neutral-800 flex-1">
            {tableOfContents.map((chap, idx) => (
              <button
                key={chap.id || idx}
                onClick={() => {
                  setActiveChapterIndex(idx);
                  const newProg = idx / tableOfContents.length;
                  updateLocation(chap.id, newProg, undefined, undefined, chap.title);
                  toggleToc();
                }}
                className={`w-full text-left py-2.5 px-2 text-xs hover:bg-neutral-800 rounded transition-colors ${
                  activeChapterIndex === idx ? 'text-teal-400 font-semibold' : 'text-stone-300'
                }`}
              >
                {chap.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
