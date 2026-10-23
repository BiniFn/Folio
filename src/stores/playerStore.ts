import { useState, useEffect } from 'react';
import { LibraryItem, Chapter, PlaySession } from '../types/audiobookshelf';
import { absClient } from '../api/absClient';
import { progressSyncManager } from '../services/progressSync';
import { authStore } from './authStore';

export interface PlayerState {
  item: LibraryItem | null;
  session: PlaySession | null;
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  volume: number;
  isMuted: boolean;
  activeChapter: Chapter | null;
  chapters: Chapter[];
  sleepTimerEnd: number | null; // epoch ms
  sleepTimerMinutes: number | null;
  isExpanded: boolean; // Fullscreen / modal player view
  error: string | null;
}

let globalState: PlayerState = {
  item: null,
  session: null,
  isPlaying: false,
  isLoading: false,
  currentTime: 0,
  duration: 0,
  playbackRate: 1.0,
  volume: 1.0,
  isMuted: false,
  activeChapter: null,
  chapters: [],
  sleepTimerEnd: null,
  sleepTimerMinutes: null,
  isExpanded: false,
  error: null,
};

const listeners = new Set<(state: PlayerState) => void>();

function notify() {
  listeners.forEach(listener => listener(globalState));
}

// Single HTML5 Audio instance
let audio: HTMLAudioElement | null = null;
let lastSyncTime = 0;
let lastSyncPosition = 0;
let syncIntervalTimer: any = null;
let sleepCheckTimer: any = null;

function getAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.preload = 'auto';

    audio.addEventListener('timeupdate', () => {
      if (!audio) return;
      const current = audio.currentTime;
      const dur = audio.duration || globalState.duration || 0;

      // Find active chapter
      let currentChap: Chapter | null = null;
      for (const chap of globalState.chapters) {
        if (current >= chap.start && current < chap.end) {
          currentChap = chap;
          break;
        }
      }

      globalState = {
        ...globalState,
        currentTime: current,
        duration: dur,
        activeChapter: currentChap,
      };
      notify();
    });

    audio.addEventListener('play', () => {
      globalState = { ...globalState, isPlaying: true, isLoading: false };
      notify();
      startPeriodicSync();
    });

    audio.addEventListener('pause', () => {
      globalState = { ...globalState, isPlaying: false };
      notify();
      stopPeriodicSync();
      performSync();
    });

    audio.addEventListener('waiting', () => {
      globalState = { ...globalState, isLoading: true };
      notify();
    });

    audio.addEventListener('playing', () => {
      globalState = { ...globalState, isLoading: false, isPlaying: true };
      notify();
    });

    audio.addEventListener('ended', () => {
      globalState = { ...globalState, isPlaying: false };
      notify();
      performSync(true);
    });

    audio.addEventListener('error', (e) => {
      console.error('Audio playback error', e);
      globalState = {
        ...globalState,
        isPlaying: false,
        isLoading: false,
        error: 'Audio playback failed. Please check network connection.',
      };
      notify();
    });
  }
  return audio;
}

function updateMediaSession(item: LibraryItem) {
  if ('mediaSession' in navigator) {
    const auth = authStore.getState();
    const coverUrl = auth.token ? absClient.getItemCoverUrl(auth.serverUrl, auth.token, item.id, 512, auth.useProxy) : '';

    navigator.mediaSession.metadata = new MediaMetadata({
      title: item.media?.metadata?.title || 'Unknown Title',
      artist: item.media?.metadata?.authorName || 'Unknown Author',
      album: item.media?.metadata?.series?.[0]?.name || 'Audiobookshelf',
      artwork: coverUrl ? [{ src: coverUrl, sizes: '512x512', type: 'image/jpeg' }] : [],
    });

    navigator.mediaSession.setActionHandler('play', () => playerStore.play());
    navigator.mediaSession.setActionHandler('pause', () => playerStore.pause());
    navigator.mediaSession.setActionHandler('seekbackward', () => playerStore.skipBackward(15));
    navigator.mediaSession.setActionHandler('seekforward', () => playerStore.skipForward(30));
    navigator.mediaSession.setActionHandler('previoustrack', () => playerStore.previousChapter());
    navigator.mediaSession.setActionHandler('nexttrack', () => playerStore.nextChapter());
  }
}

function startPeriodicSync() {
  stopPeriodicSync();
  lastSyncTime = Date.now();
  if (audio) lastSyncPosition = audio.currentTime;

  syncIntervalTimer = setInterval(() => {
    performSync();
  }, 15000); // 15 seconds sync heartbeat
}

function stopPeriodicSync() {
  if (syncIntervalTimer) {
    clearInterval(syncIntervalTimer);
    syncIntervalTimer = null;
  }
}

async function performSync(isFinished: boolean = false) {
  if (!globalState.item || !audio) return;
  const auth = authStore.getState();
  if (!auth.token || !auth.serverUrl) return;

  const now = Date.now();
  const timeListened = Math.max(0, (now - lastSyncTime) / 1000);
  lastSyncTime = now;
  lastSyncPosition = audio.currentTime;

  await progressSyncManager.syncAudioSession(
    auth.serverUrl,
    auth.token,
    globalState.session?.id || '',
    globalState.item.id,
    audio.currentTime,
    timeListened,
    audio.duration || globalState.duration,
    isFinished,
    auth.useProxy
  );
}

export const playerStore = {
  getState(): PlayerState {
    return globalState;
  },

  subscribe(listener: (state: PlayerState) => void) {
    listeners.add(listener);
    listener(globalState);
    return () => {
      listeners.delete(listener);
    };
  },

  setExpanded(expanded: boolean) {
    globalState = { ...globalState, isExpanded: expanded };
    notify();
  },

  async loadAndPlay(item: LibraryItem, startPosition?: number) {
    const auth = authStore.getState();
    if (!auth.serverUrl || !auth.token) {
      throw new Error('Not connected to Audiobookshelf server');
    }

    const audioElement = getAudio();
    audioElement.pause();

    globalState = {
      ...globalState,
      item,
      isLoading: true,
      error: null,
      currentTime: startPosition ?? (item.userMediaProgress?.currentTime || 0),
      duration: item.media?.duration || 0,
      chapters: item.media?.chapters || [],
    };
    notify();

    try {
      // Start real playback session with ABS
      const session = await absClient.startPlaySession(auth.serverUrl, auth.token, item.id, auth.useProxy);

      // Extract stream URL
      let streamUrl = '';
      if (session.audioTracks && session.audioTracks.length > 0) {
        const firstTrack = session.audioTracks[0];
        if (firstTrack.contentUrl) {
          const endpoint = firstTrack.contentUrl.startsWith('/') ? firstTrack.contentUrl : `/${firstTrack.contentUrl}`;
          streamUrl = absClient.formatUrl(auth.serverUrl, endpoint, { token: auth.token, useProxy: auth.useProxy });
        }
      }

      // Fallback: If session tracks don't have direct contentUrl, stream via first audio file / track
      if (!streamUrl && item.media?.tracks && item.media.tracks.length > 0) {
        const track = item.media.tracks[0];
        const endpoint = track.contentUrl.startsWith('/') ? track.contentUrl : `/${track.contentUrl}`;
        streamUrl = absClient.formatUrl(auth.serverUrl, endpoint, { token: auth.token, useProxy: auth.useProxy });
      }

      if (!streamUrl && item.media?.audioFiles && item.media.audioFiles.length > 0) {
        const file = item.media.audioFiles[0];
        streamUrl = absClient.getAudioFileStreamUrl(auth.serverUrl, auth.token, item.id, file.ino, auth.useProxy);
      }

      if (!streamUrl) {
        throw new Error('No audio tracks or streaming endpoints found for this book');
      }

      audioElement.src = streamUrl;
      audioElement.playbackRate = globalState.playbackRate;
      audioElement.volume = globalState.isMuted ? 0 : globalState.volume;

      const resumePos = startPosition ?? (session.currentTime || item.userMediaProgress?.currentTime || 0);
      if (resumePos > 0) {
        audioElement.currentTime = resumePos;
      }

      globalState = {
        ...globalState,
        session,
        chapters: session.chapters || item.media?.chapters || [],
        duration: session.duration || item.media?.duration || 0,
      };
      notify();

      updateMediaSession(item);

      await audioElement.play();
    } catch (err: any) {
      console.error('Failed to start playback session:', err);
      globalState = {
        ...globalState,
        isLoading: false,
        isPlaying: false,
        error: err.message || 'Failed to start playback',
      };
      notify();
    }
  },

  async play() {
    const audioElement = getAudio();
    if (audioElement.src) {
      try {
        await audioElement.play();
      } catch (err: any) {
        console.error('Play failed', err);
      }
    }
  },

  pause() {
    const audioElement = getAudio();
    audioElement.pause();
  },

  togglePlay() {
    if (globalState.isPlaying) {
      playerStore.pause();
    } else {
      playerStore.play();
    }
  },

  seek(seconds: number) {
    const audioElement = getAudio();
    const clamped = Math.max(0, Math.min(seconds, audioElement.duration || globalState.duration));
    audioElement.currentTime = clamped;
    globalState = { ...globalState, currentTime: clamped };
    notify();
    performSync();
  },

  skipBackward(seconds: number = 15) {
    const current = audio?.currentTime || globalState.currentTime;
    playerStore.seek(current - seconds);
  },

  skipForward(seconds: number = 30) {
    const current = audio?.currentTime || globalState.currentTime;
    playerStore.seek(current + seconds);
  },

  setPlaybackRate(rate: number) {
    const clamped = Math.min(3.0, Math.max(0.5, rate));
    const audioElement = getAudio();
    audioElement.playbackRate = clamped;
    globalState = { ...globalState, playbackRate: clamped };
    notify();
  },

  setVolume(vol: number) {
    const clamped = Math.min(1.0, Math.max(0, vol));
    const audioElement = getAudio();
    audioElement.volume = clamped;
    globalState = { ...globalState, volume: clamped, isMuted: clamped === 0 };
    notify();
  },

  toggleMute() {
    const audioElement = getAudio();
    const newMuted = !globalState.isMuted;
    audioElement.volume = newMuted ? 0 : globalState.volume;
    globalState = { ...globalState, isMuted: newMuted };
    notify();
  },

  jumpToChapter(chapter: Chapter) {
    playerStore.seek(chapter.start);
  },

  nextChapter() {
    const current = globalState.currentTime;
    const next = globalState.chapters.find(c => c.start > current + 1);
    if (next) {
      playerStore.seek(next.start);
    }
  },

  previousChapter() {
    const current = globalState.currentTime;
    // Find chapter preceding current
    const prev = [...globalState.chapters].reverse().find(c => c.start < current - 2);
    if (prev) {
      playerStore.seek(prev.start);
    } else if (globalState.activeChapter) {
      playerStore.seek(globalState.activeChapter.start);
    }
  },

  setSleepTimer(minutes: number | null) {
    if (sleepCheckTimer) {
      clearInterval(sleepCheckTimer);
      sleepCheckTimer = null;
    }

    if (minutes === null) {
      globalState = { ...globalState, sleepTimerEnd: null, sleepTimerMinutes: null };
      notify();
      return;
    }

    const end = Date.now() + minutes * 60 * 1000;
    globalState = { ...globalState, sleepTimerEnd: end, sleepTimerMinutes: minutes };
    notify();

    sleepCheckTimer = setInterval(() => {
      if (Date.now() >= end) {
        playerStore.pause();
        playerStore.setSleepTimer(null);
      }
    }, 1000);
  },

  stopAndClose() {
    stopPeriodicSync();
    if (sleepCheckTimer) clearInterval(sleepCheckTimer);

    if (audio) {
      audio.pause();
      audio.src = '';
    }

    const auth = authStore.getState();
    if (globalState.session && auth.serverUrl && auth.token) {
      absClient.closePlaySession(auth.serverUrl, auth.token, globalState.session.id, auth.useProxy);
    }

    globalState = {
      ...globalState,
      item: null,
      session: null,
      isPlaying: false,
      currentTime: 0,
      activeChapter: null,
      chapters: [],
      isExpanded: false,
    };
    notify();
  },
};

export function usePlayer() {
  const [state, setState] = useState<PlayerState>(globalState);

  useEffect(() => {
    return playerStore.subscribe(setState);
  }, []);

  return {
    ...state,
    play: playerStore.play,
    pause: playerStore.pause,
    togglePlay: playerStore.togglePlay,
    seek: playerStore.seek,
    skipBackward: playerStore.skipBackward,
    skipForward: playerStore.skipForward,
    setPlaybackRate: playerStore.setPlaybackRate,
    setVolume: playerStore.setVolume,
    toggleMute: playerStore.toggleMute,
    jumpToChapter: playerStore.jumpToChapter,
    nextChapter: playerStore.nextChapter,
    previousChapter: playerStore.previousChapter,
    setSleepTimer: playerStore.setSleepTimer,
    setExpanded: playerStore.setExpanded,
    loadAndPlay: playerStore.loadAndPlay,
    stopAndClose: playerStore.stopAndClose,
  };
}
