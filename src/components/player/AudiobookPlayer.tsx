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
  SkipForward 
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

  if (!item) return null;

  const auth = authStore.getState();
  const metadata = item.media?.metadata || {};
  const coverUrl = auth.token
    ? absClient.getItemCoverUrl(auth.serverUrl, auth.token, item.id, 400, auth.useProxy)
    : '';

  const speedOptions = [0.75, 1.0, 1.2, 1.25, 1.5, 1.75, 2.0, 2.5];
  const sleepOptions = [
    { label: 'Off', value: null },
    { label: '5 minutes', value: 5 },
    { label: '15 minutes', value: 15 },
    { label: '30 minutes', value: 30 },
    { label: '45 minutes', value: 45 },
    { label: '60 minutes', value: 60 },
  ];

  const progressFraction = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Full Expanded Player Modal
  if (isExpanded) {
    return (
      <div className="fixed inset-0 z-50 bg-[#12161a] flex flex-col justify-between p-6 md:p-12 animate-fade-in text-neutral-100">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setExpanded(false)}
            className="p-2.5 rounded-full hover:bg-neutral-800 text-stone-300 transition-colors"
            title="Minimize player"
          >
            <Minimize2 className="w-5 h-5" />
          </button>
          <div className="text-center">
            <span className="text-xs uppercase tracking-widest text-teal-400 font-semibold block">
              Audiobook Playing
            </span>
            <span className="text-xs text-stone-400 truncate max-w-sm block">
              {metadata.series?.[0]?.name ? `${metadata.series[0].name} · ` : ''}{metadata.title}
            </span>
          </div>
          <button
            onClick={stopAndClose}
            className="p-2.5 rounded-full hover:bg-neutral-800 text-stone-300 transition-colors"
            title="Close player"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Center Artwork & Info */}
        <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16 my-auto max-w-5xl mx-auto w-full">
          <div className="w-56 md:w-80 aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl bg-neutral-900 border border-neutral-800/80 shrink-0">
            {coverUrl ? (
              <img src={coverUrl} alt={metadata.title} className="w-full h-full object-cover" />
            ) : null}
          </div>

          <div className="flex flex-col max-w-lg w-full text-center md:text-left">
            <h2 className="text-2xl md:text-3xl font-serif font-bold text-neutral-100 mb-2">
              {metadata.title}
            </h2>
            <p className="text-stone-300 text-base font-medium mb-1">
              {metadata.authorName || 'Unknown Author'}
            </p>
            {metadata.narratorName && (
              <p className="text-xs text-stone-400 mb-4">
                Narrated by <span className="text-stone-300">{metadata.narratorName}</span>
              </p>
            )}

            {/* Current Chapter Badge */}
            {activeChapter && (
              <div className="inline-block self-center md:self-start py-1.5 px-3 rounded-lg bg-teal-500/10 border border-teal-500/20 text-xs text-teal-300 font-medium mb-6">
                {activeChapter.title}
              </div>
            )}

            {/* Scrubber Slider */}
            <div className="w-full flex flex-col gap-1.5 mb-6">
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
                <span>-{formatTimeRemaining(currentTime, duration)}</span>
                <span>{formatDuration(duration, true)}</span>
              </div>
            </div>

            {/* Main Playback Controls */}
            <div className="flex items-center justify-center md:justify-start gap-4 md:gap-6 mb-6">
              <button
                onClick={previousChapter}
                className="p-3 text-stone-300 hover:text-white transition-colors"
                title="Previous Chapter"
              >
                <SkipBack className="w-6 h-6" />
              </button>
              <button
                onClick={() => skipBackward(15)}
                className="p-3 text-stone-300 hover:text-white transition-colors"
                title="Skip backward 15s"
              >
                <RotateCcw className="w-6 h-6" />
              </button>
              <button
                onClick={togglePlay}
                className="p-5 rounded-full bg-teal-500 hover:bg-teal-400 text-black shadow-xl shadow-teal-500/30 transition-transform active:scale-95"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-0.5" />}
              </button>
              <button
                onClick={() => skipForward(30)}
                className="p-3 text-stone-300 hover:text-white transition-colors"
                title="Skip forward 30s"
              >
                <RotateCw className="w-6 h-6" />
              </button>
              <button
                onClick={nextChapter}
                className="p-3 text-stone-300 hover:text-white transition-colors"
                title="Next Chapter"
              >
                <SkipForward className="w-6 h-6" />
              </button>
            </div>

            {/* Bottom utility controls */}
            <div className="flex items-center justify-center md:justify-start gap-6 text-xs text-stone-400">
              {/* Speed */}
              <div className="relative">
                <button
                  onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                  className="px-2.5 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 text-stone-300 font-mono font-medium"
                >
                  {playbackRate}x
                </button>
                {showSpeedMenu && (
                  <div className="absolute bottom-full left-0 mb-2 w-28 bg-[#181c21] border border-neutral-700 rounded-xl shadow-xl py-1 z-50">
                    {speedOptions.map(s => (
                      <button
                        key={s}
                        onClick={() => {
                          setPlaybackRate(s);
                          setShowSpeedMenu(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-neutral-800 ${
                          s === playbackRate ? 'text-teal-400 font-bold' : 'text-stone-300'
                        }`}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Sleep timer */}
              <div className="relative">
                <button
                  onClick={() => setShowSleepMenu(!showSleepMenu)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 transition-colors ${
                    sleepTimerMinutes ? 'text-teal-400 font-medium' : 'text-stone-300'
                  }`}
                >
                  <Moon className="w-3.5 h-3.5" />
                  <span>{sleepTimerMinutes ? `${sleepTimerMinutes}m` : 'Sleep'}</span>
                </button>
                {showSleepMenu && (
                  <div className="absolute bottom-full left-0 mb-2 w-36 bg-[#181c21] border border-neutral-700 rounded-xl shadow-xl py-1 z-50">
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

              {/* Chapters Drawer Button */}
              {chapters.length > 0 && (
                <button
                  onClick={() => setShowChapters(!showChapters)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 text-stone-300"
                >
                  <List className="w-3.5 h-3.5" />
                  <span>Chapters ({chapters.length})</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Chapters list modal if toggled */}
        {showChapters && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-md bg-[#181c21] border border-neutral-700 rounded-2xl p-6 max-h-[80vh] flex flex-col">
              <div className="flex justify-between items-center mb-4 pb-2 border-b border-neutral-800">
                <h3 className="font-semibold text-sm text-neutral-100">Table of Chapters</h3>
                <button onClick={() => setShowChapters(false)} className="text-stone-400 hover:text-white">
                  <X className="w-4 h-4" />
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
                    className={`w-full text-left py-2.5 px-3 text-xs flex justify-between items-center hover:bg-neutral-800 rounded-lg transition-colors ${
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

  // Persistent Bottom Mini Bar
  return (
    <div className="fixed bottom-0 md:bottom-0 left-0 right-0 z-40 bg-[#161a1e]/98 backdrop-blur-md border-t border-[#232830] px-4 py-2.5 flex items-center justify-between gap-4 shadow-2xl">
      {/* Top micro progress bar */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-neutral-800">
        <div className="h-full bg-teal-400" style={{ width: `${progressFraction}%` }} />
      </div>

      {/* Left: Book Cover & Titles */}
      <div className="flex items-center gap-3 min-w-0 max-w-xs md:max-w-sm">
        <div
          onClick={() => setExpanded(true)}
          className="w-11 h-14 rounded-md overflow-hidden bg-neutral-900 border border-neutral-800 shrink-0 cursor-pointer hover:opacity-90 transition-opacity"
        >
          {coverUrl ? <img src={coverUrl} alt={metadata.title} className="w-full h-full object-cover" /> : null}
        </div>
        <div className="min-w-0">
          <h4
            onClick={() => setExpanded(true)}
            className="text-xs font-semibold text-neutral-100 truncate hover:text-teal-300 cursor-pointer"
          >
            {metadata.title}
          </h4>
          <p className="text-[11px] text-stone-400 truncate">
            {activeChapter ? activeChapter.title : metadata.authorName}
          </p>
        </div>
      </div>

      {/* Center: Controls & Scrubber */}
      <div className="flex-1 max-w-xl hidden sm:flex flex-col items-center gap-1">
        <div className="flex items-center gap-4">
          <button
            onClick={() => skipBackward(15)}
            className="p-1.5 text-stone-400 hover:text-stone-200 transition-colors"
            title="Skip backward 15s"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={togglePlay}
            className="p-2.5 rounded-full bg-teal-500 hover:bg-teal-400 text-black transition-transform active:scale-95"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
          </button>
          <button
            onClick={() => skipForward(30)}
            className="p-1.5 text-stone-400 hover:text-stone-200 transition-colors"
            title="Skip forward 30s"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        {/* Timeline Scrubber */}
        <div className="w-full flex items-center gap-2 text-[10px] text-stone-400 font-mono">
          <span>{formatDuration(currentTime, true)}</span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={(e) => seek(Number(e.target.value))}
            className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-teal-400"
          />
          <span>{formatDuration(duration, true)}</span>
        </div>
      </div>

      {/* Mobile inline play button */}
      <div className="sm:hidden flex items-center gap-2">
        <button
          onClick={togglePlay}
          className="p-2 rounded-full bg-teal-500 text-black"
        >
          {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
        </button>
      </div>

      {/* Right: Volume, Speed, Expand */}
      <div className="hidden lg:flex items-center gap-4 text-stone-400">
        {/* Speed toggle */}
        <button
          onClick={() => {
            const nextIndex = (speedOptions.indexOf(playbackRate) + 1) % speedOptions.length;
            setPlaybackRate(speedOptions[nextIndex]);
          }}
          className="px-2 py-0.5 text-xs font-mono font-medium rounded hover:bg-neutral-800 text-stone-300"
          title="Change playback speed"
        >
          {playbackRate}x
        </button>

        {/* Volume slider */}
        <div className="flex items-center gap-1.5">
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
            className="w-16 h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-teal-400"
          />
        </div>

        {/* Fullscreen Expand */}
        <button
          onClick={() => setExpanded(true)}
          className="p-1.5 hover:text-stone-200 hover:bg-neutral-800 rounded-lg transition-colors"
          title="Expand player"
        >
          <Maximize2 className="w-4 h-4" />
        </button>

        {/* Close */}
        <button
          onClick={stopAndClose}
          className="p-1.5 hover:text-red-400 hover:bg-neutral-800 rounded-lg transition-colors"
          title="Stop and close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
