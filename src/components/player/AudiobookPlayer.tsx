import React, { useState } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  RotateCw, 
  Volume2, 
  VolumeX, 
  Maximize2, 
  Minimize2, 
  List, 
  Moon, 
  X, 
  SkipBack, 
  SkipForward,
  Headphones
} from 'lucide-react';
import { usePlayer } from '../../stores/playerStore';
import { authStore } from '../../stores/authStore';
import { absClient } from '../../api/absClient';
import { formatDuration, formatTimeRemaining } from '../../utils/formatters';

export const AudiobookPlayer: React.FC = () => {
  const {
    item,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    volume,
    isMuted,
    activeChapter,
    chapters,
    isExpanded,
    sleepTimerMinutes,
    togglePlay,
    seek,
    skipBackward,
    skipForward,
    setPlaybackRate,
    setVolume,
    toggleMute,
    jumpToChapter,
    nextChapter,
    previousChapter,
    setSleepTimer,
    setExpanded,
    stopAndClose,
  } = usePlayer();

  const [showChapters, setShowChapters] = useState(false);
  const [showSleepMenu, setShowSleepMenu] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [coverError, setCoverError] = useState(false);

  if (!item) return null;

  const auth = authStore.getState();
  const metadata = item.media?.metadata || {};
  const localCover = (item as any)?.media?.coverPath || (item as any)?.coverDataUrl;
  const serverCover = auth.token && auth.serverUrl && !item.id.startsWith('local_')
    ? absClient.getItemCoverUrl(auth.serverUrl, auth.token, item.id, 600, auth.useProxy)
    : '';
  const coverUrl = localCover || serverCover || '';

  const speedOptions = [0.75, 1.0, 1.2, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 3.5, 4.0];
  const sleepOptions = [
    { label: 'Off', value: null },
    { label: '5 minutes', value: 5 },
    { label: '15 minutes', value: 15 },
    { label: '30 minutes', value: 30 },
    { label: '45 minutes', value: 45 },
    { label: '60 minutes', value: 60 },
  ];

  const progressFraction = duration > 0 ? (currentTime / duration) * 100 : 0;

  // 1. FULL EXPANDED PLAYER MODAL
  if (isExpanded) {
    return (
      <div className="fixed inset-0 z-50 bg-[#0e1216] flex flex-col justify-between p-6 md:p-12 animate-fade-in text-neutral-100 overflow-hidden select-none">
        {/* Ambient Artwork Aura Backdrop */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {coverUrl && !coverError && (
            <div
              className="absolute -inset-24 bg-cover bg-center filter blur-3xl opacity-30 scale-125 transition-opacity duration-1000"
              style={{ backgroundImage: `url(${coverUrl})` }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-[#0e1216]/75 via-[#0e1216]/95 to-[#0e1216]" />
        </div>

        {/* Top bar */}
        <div className="relative z-10 flex items-center justify-between max-w-5xl mx-auto w-full">
          <button
            onClick={() => setExpanded(false)}
            className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 text-stone-300 hover:text-white transition-all"
            title="Minimize player"
          >
            <Minimize2 className="w-5 h-5" />
          </button>
          
          <div className="text-center">
            <span className="text-[11px] uppercase tracking-widest text-teal-400 font-semibold flex items-center justify-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isPlaying ? 'bg-teal-400 animate-ping' : 'bg-stone-500'}`} />
              Audiobook Playing
            </span>
            <span className="text-xs text-stone-400 truncate max-w-xs md:max-w-md block mt-0.5">
              {metadata.series?.[0]?.name ? `${metadata.series[0].name} · ` : ''}{metadata.title}
            </span>
          </div>

          <button
            onClick={stopAndClose}
            className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 text-stone-300 hover:text-red-400 transition-all"
            title="Close player"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Center Artwork & Info */}
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16 my-auto max-w-4xl mx-auto w-full">
          {/* Artwork Card */}
          <div className="w-52 md:w-80 aspect-[2/3] rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.8)] bg-neutral-900 border border-white/10 shrink-0 relative group">
            {coverUrl && !coverError ? (
              <img
                src={coverUrl}
                alt={metadata.title}
                onError={() => setCoverError(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-gradient-to-b from-stone-800 to-neutral-900 text-stone-300">
                <Headphones className="w-16 h-16 text-teal-400/70 mb-3" />
                <span className="font-serif font-bold text-lg text-white line-clamp-3">{metadata.title}</span>
                <span className="text-xs text-stone-400 mt-2">{metadata.authorName}</span>
              </div>
            )}
          </div>

          {/* Details & Controls */}
          <div className="flex flex-col max-w-lg w-full text-center md:text-left">
            {metadata.series && metadata.series.length > 0 && (
              <span className="text-xs font-semibold uppercase tracking-wider text-teal-400 mb-1 block">
                {metadata.series[0].name} {metadata.series[0].sequence ? `· Book ${metadata.series[0].sequence}` : ''}
              </span>
            )}
            <h2 className="text-2xl md:text-3xl font-serif font-bold text-white mb-2 line-clamp-2">
              {metadata.title}
            </h2>
            <p className="text-stone-300 text-base font-medium mb-1">
              {metadata.authorName || 'Unknown Author'}
            </p>
            {metadata.narratorName && (
              <p className="text-xs text-stone-400 mb-4">
                Narrated by <span className="text-stone-200">{metadata.narratorName}</span>
              </p>
            )}

            {/* Current Chapter Badge */}
            {activeChapter && (
              <div className="inline-block self-center md:self-start py-1.5 px-3 rounded-full bg-teal-500/10 border border-teal-500/25 text-xs text-teal-300 font-medium mb-6">
                {activeChapter.title}
              </div>
            )}

            {/* Scrubber Slider */}
            <div className="w-full flex flex-col gap-2 mb-6">
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={(e) => seek(Number(e.target.value))}
                className="w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-teal-400"
              />
              <div className="flex justify-between text-xs text-stone-400 font-mono">
                <span>{formatDuration(currentTime, true)}</span>
                <span className="text-stone-500">-{formatTimeRemaining(currentTime, duration)}</span>
                <span>{formatDuration(duration, true)}</span>
              </div>
            </div>

            {/* Main Playback Controls */}
            <div className="flex items-center justify-center md:justify-start gap-5 md:gap-7 mb-6">
              <button
                onClick={previousChapter}
                className="p-2 text-stone-400 hover:text-white transition-colors"
                title="Previous chapter"
              >
                <SkipBack className="w-5 h-5" />
              </button>
              <button
                onClick={() => skipBackward(15)}
                className="p-2 text-stone-300 hover:text-teal-400 transition-colors"
                title="Skip backward 15s"
              >
                <RotateCcw className="w-6 h-6" />
              </button>
              <button
                onClick={togglePlay}
                className="w-16 h-16 rounded-full bg-gradient-to-tr from-teal-500 to-emerald-400 text-black flex items-center justify-center transition-transform hover:scale-105 active:scale-95 shadow-xl shadow-teal-500/30"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-7 h-7 fill-current" /> : <Play className="w-7 h-7 fill-current ml-1" />}
              </button>
              <button
                onClick={() => skipForward(30)}
                className="p-2 text-stone-300 hover:text-teal-400 transition-colors"
                title="Skip forward 30s"
              >
                <RotateCw className="w-6 h-6" />
              </button>
              <button
                onClick={nextChapter}
                className="p-2 text-stone-400 hover:text-white transition-colors"
                title="Next chapter"
              >
                <SkipForward className="w-5 h-5" />
              </button>
            </div>

            {/* Secondary Controls Bar: Speed, Sleep, Chapters, Volume */}
            <div className="flex items-center justify-center md:justify-start gap-4 text-xs text-stone-400 pt-2 border-t border-white/5">
              {/* Playback speed selector */}
              <div className="relative">
                <button
                  onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-teal-300 font-mono font-medium border border-white/5"
                >
                  {playbackRate}x
                </button>
                {showSpeedMenu && (
                  <div className="absolute bottom-full left-0 mb-2 w-28 bg-[#181c21] border border-neutral-700 rounded-xl shadow-2xl py-1 z-50">
                    {speedOptions.map(rate => (
                      <button
                        key={rate}
                        onClick={() => {
                          setPlaybackRate(rate);
                          setShowSpeedMenu(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-neutral-800 ${
                          playbackRate === rate ? 'text-teal-400 font-bold bg-teal-500/10' : 'text-stone-300'
                        }`}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Sleep timer */}
              <div className="relative">
                <button
                  onClick={() => setShowSleepMenu(!showSleepMenu)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 transition-colors ${
                    sleepTimerMinutes ? 'text-teal-400 font-medium' : 'text-stone-300'
                  }`}
                >
                  <Moon className="w-3.5 h-3.5" />
                  <span>{sleepTimerMinutes ? `${sleepTimerMinutes}m` : 'Sleep'}</span>
                </button>
                {showSleepMenu && (
                  <div className="absolute bottom-full left-0 mb-2 w-36 bg-[#181c21] border border-neutral-700 rounded-xl shadow-2xl py-1 z-50">
                    {sleepOptions.map(opt => (
                      <button
                        key={String(opt.value)}
                        onClick={() => {
                          setSleepTimer(opt.value);
                          setShowSleepMenu(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-neutral-800 ${
                          sleepTimerMinutes === opt.value ? 'text-teal-400 font-bold' : 'text-stone-300'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Chapters Drawer Trigger */}
              {chapters.length > 0 && (
                <button
                  onClick={() => setShowChapters(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-stone-300"
                >
                  <List className="w-3.5 h-3.5" />
                  <span>Chapters ({chapters.length})</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Chapters Drawer Modal */}
        {showChapters && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <div className="w-full max-w-md bg-[#161a20] border border-neutral-700 rounded-2xl p-6 max-h-[80vh] flex flex-col shadow-2xl">
              <div className="flex justify-between items-center mb-4 pb-2 border-b border-neutral-800">
                <h3 className="font-semibold text-sm text-neutral-100 flex items-center gap-2">
                  <List className="w-4 h-4 text-teal-400" />
                  Audiobook Chapters
                </h3>
                <button onClick={() => setShowChapters(false)} className="text-stone-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="overflow-y-auto divide-y divide-neutral-800 flex-1">
                {chapters.map((chap, idx) => (
                  <button
                    key={chap.id || idx}
                    onClick={() => {
                      jumpToChapter(chap);
                      setShowChapters(false);
                    }}
                    className={`w-full text-left py-3 px-3 text-xs flex justify-between items-center hover:bg-neutral-800/60 rounded-lg transition-colors ${
                      activeChapter?.id === chap.id ? 'text-teal-400 font-semibold bg-teal-500/10' : 'text-stone-300'
                    }`}
                  >
                    <span className="truncate pr-4">{chap.title || `Chapter ${idx + 1}`}</span>
                    <span className="text-stone-400 font-mono text-[11px] shrink-0">
                      {formatDuration(chap.start, true)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 2. FLOATING FROSTED-GLASS MINI DOCK
  return (
    <div className="fixed bottom-3 left-3 right-3 md:left-6 md:right-6 lg:max-w-4xl lg:mx-auto z-40 bg-[#14181e]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.65)] px-4 py-2.5 flex items-center justify-between gap-4 transition-all duration-200">
      {/* Top thin progress line */}
      <div className="absolute top-0 left-4 right-4 h-[2px] bg-neutral-800/80 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-teal-500 to-emerald-400" style={{ width: `${progressFraction}%` }} />
      </div>

      {/* Left Column: Cover & Details (strictly no horizontal overflow) */}
      <div className="flex items-center gap-3 min-w-0 w-48 md:w-64 shrink-0">
        <div
          onClick={() => setExpanded(true)}
          className="w-10 h-10 md:w-11 md:h-11 rounded-lg overflow-hidden bg-neutral-900 border border-white/10 shrink-0 cursor-pointer hover:scale-105 transition-transform shadow-md"
        >
          {coverUrl && !coverError ? (
            <img src={coverUrl} alt={metadata.title} onError={() => setCoverError(true)} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-stone-800 text-teal-400">
              <Headphones className="w-5 h-5" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h4
            onClick={() => setExpanded(true)}
            className="text-xs font-semibold text-neutral-100 truncate hover:text-teal-300 cursor-pointer"
          >
            {metadata.title}
          </h4>
          <p className="text-[11px] text-teal-400/90 truncate mt-0.5">
            {activeChapter ? activeChapter.title : metadata.authorName || 'Audiobook'}
          </p>
        </div>
      </div>

      {/* Center Column: Playback Controls & Scrubber */}
      <div className="flex-1 max-w-sm hidden sm:flex flex-col items-center gap-1">
        <div className="flex items-center gap-3">
          <button
            onClick={() => skipBackward(15)}
            className="p-1.5 text-stone-400 hover:text-white transition-colors"
            title="Skip backward 15s"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={togglePlay}
            className="w-8 h-8 rounded-full bg-gradient-to-tr from-teal-500 to-emerald-400 text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-md shadow-teal-500/20"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
          </button>
          <button
            onClick={() => skipForward(30)}
            className="p-1.5 text-stone-400 hover:text-white transition-colors"
            title="Skip forward 30s"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        {/* Timeline Scrubber */}
        <div className="w-full flex items-center gap-2 text-[10px] text-stone-400 font-mono">
          <span className="w-10 text-right">{formatDuration(currentTime, true)}</span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={(e) => seek(Number(e.target.value))}
            className="flex-1 h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-teal-400"
          />
          <span className="w-10">{formatDuration(duration, true)}</span>
        </div>
      </div>

      {/* Mobile Play Button */}
      <div className="sm:hidden flex items-center gap-2">
        <button
          onClick={togglePlay}
          className="w-8 h-8 rounded-full bg-teal-500 text-black flex items-center justify-center"
        >
          {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
        </button>
      </div>

      {/* Right Column: Speed, Volume, Expand, Close */}
      <div className="flex items-center gap-2 md:gap-3 text-stone-400 shrink-0">
        {/* Speed button */}
        <button
          onClick={() => {
            const nextIndex = (speedOptions.indexOf(playbackRate) + 1) % speedOptions.length;
            setPlaybackRate(speedOptions[nextIndex]);
          }}
          className="px-2 py-0.5 text-[11px] font-mono font-medium rounded-lg bg-neutral-800/80 hover:bg-neutral-700 text-teal-300 border border-white/5"
          title="Change playback speed"
        >
          {playbackRate}x
        </button>

        {/* Volume slider */}
        <div className="hidden md:flex items-center gap-1.5">
          <button onClick={toggleMute} className="hover:text-stone-200">
            {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={isMuted ? 0 : volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="w-14 h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-teal-400"
          />
        </div>

        {/* Fullscreen Expand */}
        <button
          onClick={() => setExpanded(true)}
          className="p-1.5 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          title="Expand player"
        >
          <Maximize2 className="w-4 h-4" />
        </button>

        {/* Close */}
        <button
          onClick={stopAndClose}
          className="p-1.5 hover:text-red-400 hover:bg-white/5 rounded-lg transition-colors"
          title="Stop and close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
