import { absClient } from '../api/absClient';
import { MediaProgress } from '../types/audiobookshelf';

interface QueuedSync {
  itemId: string;
  progress: Partial<MediaProgress>;
  serverUrl: string;
  token: string;
  useProxy: boolean;
  timestamp: number;
}

const OFFLINE_QUEUE_KEY = 'abs_offline_sync_queue_v1';

class ProgressSyncManager {
  private queue: QueuedSync[] = [];
  private isProcessing = false;
  private ebookDebounceTimers = new Map<string, any>();

  constructor() {
    this.loadQueue();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.flushQueue());
    }
  }

  private loadQueue() {
    try {
      const data = localStorage.getItem(OFFLINE_QUEUE_KEY);
      if (data) {
        this.queue = JSON.parse(data);
      }
    } catch {
      this.queue = [];
    }
  }

  private saveQueue() {
    try {
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(this.queue));
    } catch (err) {
      console.error('Failed to save sync queue', err);
    }
  }

  /**
   * Sync audiobook listening session
   */
  async syncAudioSession(
    serverUrl: string,
    token: string,
    sessionId: string,
    itemId: string,
    currentTime: number,
    timeListened: number,
    duration: number,
    isFinished: boolean,
    useProxy: boolean = false
  ): Promise<void> {
    try {
      // Primary: sync with session
      if (sessionId) {
        await absClient.syncPlaySession(serverUrl, token, sessionId, currentTime, timeListened, duration, useProxy);
      }

      // Secondary: sync media progress for the item
      const progressFraction = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
      await absClient.updateMediaProgress(
        serverUrl,
        token,
        itemId,
        {
          currentTime,
          duration,
          progress: progressFraction,
          isFinished,
          lastUpdate: Date.now(),
        },
        useProxy
      );
    } catch (err) {
      console.warn('Playback progress sync failed, queueing for offline retry', err);
      this.enqueue({
        itemId,
        progress: {
          currentTime,
          duration,
          progress: duration > 0 ? currentTime / duration : 0,
          isFinished,
          lastUpdate: Date.now(),
        },
        serverUrl,
        token,
        useProxy,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Sync ebook reading progress (debounced)
   */
  syncEbookProgressDebounced(
    serverUrl: string,
    token: string,
    itemId: string,
    ebookLocation: string,
    ebookProgress: number,
    isFinished: boolean,
    useProxy: boolean = false
  ) {
    if (this.ebookDebounceTimers.has(itemId)) {
      clearTimeout(this.ebookDebounceTimers.get(itemId));
    }

    const timer = setTimeout(() => {
      this.ebookDebounceTimers.delete(itemId);
      this.syncEbookProgressNow(serverUrl, token, itemId, ebookLocation, ebookProgress, isFinished, useProxy);
    }, 1200);

    this.ebookDebounceTimers.set(itemId, timer);
  }

  /**
   * Sync ebook reading progress immediately
   */
  async syncEbookProgressNow(
    serverUrl: string,
    token: string,
    itemId: string,
    ebookLocation: string,
    ebookProgress: number,
    isFinished: boolean,
    useProxy: boolean = false
  ): Promise<void> {
    const payload: Partial<MediaProgress> = {
      ebookLocation,
      ebookProgress,
      isFinished,
      lastUpdate: Date.now(),
    };

    try {
      await absClient.updateMediaProgress(serverUrl, token, itemId, payload, useProxy);
    } catch (err) {
      console.warn('Ebook progress sync failed, queueing for retry', err);
      this.enqueue({
        itemId,
        progress: payload,
        serverUrl,
        token,
        useProxy,
        timestamp: Date.now(),
      });
    }
  }

  private enqueue(item: QueuedSync) {
    // Replace any existing queued update for the same item if this one is newer
    this.queue = this.queue.filter(q => q.itemId !== item.itemId);
    this.queue.push(item);
    this.saveQueue();
  }

  /**
   * Drain any queued syncs when network is available
   */
  async flushQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    const remaining: QueuedSync[] = [];
    for (const item of this.queue) {
      try {
        await absClient.updateMediaProgress(
          item.serverUrl,
          item.token,
          item.itemId,
          item.progress,
          item.useProxy
        );
      } catch (err) {
        remaining.push(item);
      }
    }

    this.queue = remaining;
    this.saveQueue();
    this.isProcessing = false;
  }

  getPendingCount(): number {
    return this.queue.length;
  }
}

export const progressSyncManager = new ProgressSyncManager();
