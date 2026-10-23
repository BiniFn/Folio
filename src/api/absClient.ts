import { 
  User, 
  Library, 
  LibraryItem, 
  PersonalizedShelf, 
  PlaySession, 
  MediaProgress 
} from '../types/audiobookshelf';
import { normalizeUrl } from '../utils/formatters';

export interface AbsRequestOptions {
  serverUrl: string;
  token?: string;
  useProxy?: boolean;
}

class AbsClient {
  private formatUrl(serverUrl: string, endpoint: string, useProxy: boolean = false): string {
    const cleanBase = normalizeUrl(serverUrl);
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

    if (useProxy) {
      const proxyUrl = new URL('/api/proxy', window.location.origin);
      proxyUrl.searchParams.set('target', cleanBase);
      proxyUrl.searchParams.set('path', cleanEndpoint);
      return proxyUrl.toString();
    }

    return `${cleanBase}${cleanEndpoint}`;
  }

  private async request<T>(
    endpoint: string,
    options: AbsRequestOptions,
    init: RequestInit = {}
  ): Promise<T> {
    const { serverUrl, token, useProxy = false } = options;
    if (!serverUrl) {
      throw new Error('Server URL is required');
    }

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      ...(init.headers as Record<string, string> || {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (useProxy) {
      headers['x-abs-target'] = normalizeUrl(serverUrl);
    }

    const primaryUrl = this.formatUrl(serverUrl, endpoint, useProxy);

    try {
      const response = await fetch(primaryUrl, {
        ...init,
        headers,
      });

      if (!response.ok) {
        let errorMsg = `Server error ${response.status}`;
        try {
          const errData = await response.json();
          if (errData.details) {
            errorMsg = `${errData.error || 'Error'}: ${errData.details}`;
          } else {
            errorMsg = errData.error || errData.message || errorMsg;
          }
        } catch {
          // fallback text
        }
        throw new Error(errorMsg);
      }

      // Check if response has content
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return (await response.json()) as T;
      }
      return (null as unknown) as T;
    } catch (err: any) {
      // If direct request failed with a fetch failure (likely CORS), retry through proxy
      // but do not try cloud proxy for a localhost server if running on a remote cloud deployment
      const isLocalServer = serverUrl.includes('localhost') || serverUrl.includes('127.0.0.1');

      if (!useProxy && !isLocalServer && err?.name === 'TypeError') {
        console.warn('Direct connection failed. Retrying through proxy...');
        return this.request<T>(endpoint, { ...options, useProxy: true }, init);
      }
      throw err;
    }
  }

  /**
   * Ping / check server accessibility
   */
  async pingServer(serverUrl: string, useProxy: boolean = false): Promise<boolean> {
    try {
      const url = this.formatUrl(serverUrl, '/ping', useProxy);
      const res = await fetch(url, {
        headers: useProxy ? { 'x-abs-target': normalizeUrl(serverUrl) } : {},
      });
      return res.status < 500;
    } catch {
      return false;
    }
  }

  /**
   * Log into Audiobookshelf server
   */
  async login(serverUrl: string, username: string, password: string, useProxy: boolean = false): Promise<User> {
    const data = await this.request<{ user: User }>('/api/login', { serverUrl, useProxy }, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!data?.user || !data?.user?.token) {
      throw new Error('Invalid login response from Audiobookshelf server');
    }

    return data.user;
  }

  /**
   * Verify session token
   */
  async verifySession(serverUrl: string, token: string, useProxy: boolean = false): Promise<User> {
    const data = await this.request<{ user: User }>('/api/authorize', { serverUrl, token, useProxy });
    return data.user;
  }

  /**
   * Get all available libraries
   */
  async getLibraries(serverUrl: string, token: string, useProxy: boolean = false): Promise<Library[]> {
    const data = await this.request<{ libraries: Library[] }>('/api/libraries', { serverUrl, token, useProxy });
    return data.libraries || [];
  }

  /**
   * Get personalized shelves (Continue Listening, Continue Reading, Recent, etc.)
   */
  async getPersonalizedShelves(
    serverUrl: string, 
    token: string, 
    libraryId: string, 
    useProxy: boolean = false
  ): Promise<PersonalizedShelf[]> {
    const data = await this.request<PersonalizedShelf[]>(`/api/libraries/${libraryId}/personalized`, { serverUrl, token, useProxy });
    return Array.isArray(data) ? data : [];
  }

  /**
   * Get items in a library with pagination, filters, sorting
   */
  async getLibraryItems(
    serverUrl: string,
    token: string,
    libraryId: string,
    params: {
      limit?: number;
      page?: number;
      sort?: string;
      desc?: number;
      filter?: string;
      search?: string;
    } = {},
    useProxy: boolean = false
  ): Promise<{ results: LibraryItem[]; total: number; page: number }> {
    const query = new URLSearchParams();
    if (params.limit) query.set('limit', String(params.limit));
    if (typeof params.page === 'number') query.set('page', String(params.page));
    if (params.sort) query.set('sort', params.sort);
    if (typeof params.desc === 'number') query.set('desc', String(params.desc));
    if (params.filter) query.set('filter', params.filter);
    if (params.search) query.set('search', params.search);

    const endpoint = `/api/libraries/${libraryId}/items?${query.toString()}`;
    const data = await this.request<{ results: LibraryItem[]; total: number; page: number }>(endpoint, { serverUrl, token, useProxy });
    return {
      results: data.results || [],
      total: data.total || 0,
      page: data.page || 0,
    };
  }

  /**
   * Get full expanded item details (tracks, chapters, ebook files)
   */
  async getItem(serverUrl: string, token: string, itemId: string, useProxy: boolean = false): Promise<LibraryItem> {
    return this.request<LibraryItem>(`/api/items/${itemId}?expanded=1`, { serverUrl, token, useProxy });
  }

  /**
   * Get item cover URL with token
   */
  getItemCoverUrl(serverUrl: string, token: string, itemId: string, width?: number, useProxy: boolean = false): string {
    const endpoint = `/api/items/${itemId}/cover?token=${encodeURIComponent(token)}${width ? `&width=${width}` : ''}`;
    return this.formatUrl(serverUrl, endpoint, useProxy);
  }

  /**
   * Start audiobook playback session
   */
  async startPlaySession(
    serverUrl: string, 
    token: string, 
    itemId: string, 
    useProxy: boolean = false
  ): Promise<PlaySession> {
    const payload = {
      deviceInfo: {
        clientName: 'Folio Web',
        clientVersion: '1.0.0',
        deviceId: 'folio-web-browser',
        model: 'Web Browser',
      },
      mediaPlayer: 'html5',
      supportedMimeTypes: ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/flac', 'audio/ogg', 'audio/webm'],
    };

    return this.request<PlaySession>(`/api/items/${itemId}/play`, { serverUrl, token, useProxy }, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  /**
   * Sync active playback session progress
   */
  async syncPlaySession(
    serverUrl: string,
    token: string,
    sessionId: string,
    currentTime: number,
    timeListened: number,
    duration: number,
    useProxy: boolean = false
  ): Promise<void> {
    await this.request<void>(`/api/session/${sessionId}/sync`, { serverUrl, token, useProxy }, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentTime,
        timeListened,
        duration,
      }),
    });
  }

  /**
   * Close active playback session
   */
  async closePlaySession(serverUrl: string, token: string, sessionId: string, useProxy: boolean = false): Promise<void> {
    try {
      await this.request<void>(`/api/session/${sessionId}/close`, { serverUrl, token, useProxy }, {
        method: 'POST',
      });
    } catch {
      // Graceful fallback for older ABS versions
      try {
        await this.request<void>(`/api/session/${sessionId}`, { serverUrl, token, useProxy }, {
          method: 'DELETE',
        });
      } catch {
        // Ignored on teardown
      }
    }
  }

  /**
   * Update reading or listening progress directly
   */
  async updateMediaProgress(
    serverUrl: string,
    token: string,
    libraryItemId: string,
    progress: Partial<MediaProgress>,
    useProxy: boolean = false
  ): Promise<MediaProgress> {
    return this.request<MediaProgress>(`/api/me/progress/${libraryItemId}`, { serverUrl, token, useProxy }, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(progress),
    });
  }

  /**
   * Get user progress for a specific library item
   */
  async getMediaProgress(
    serverUrl: string,
    token: string,
    libraryItemId: string,
    useProxy: boolean = false
  ): Promise<MediaProgress | null> {
    try {
      return await this.request<MediaProgress>(`/api/me/progress/${libraryItemId}`, { serverUrl, token, useProxy });
    } catch {
      return null;
    }
  }

  /**
   * Build stream URL for audio files
   */
  getAudioFileStreamUrl(serverUrl: string, token: string, itemId: string, ino: string, useProxy: boolean = false): string {
    const endpoint = `/api/items/${itemId}/file/${ino}?token=${encodeURIComponent(token)}`;
    return this.formatUrl(serverUrl, endpoint, useProxy);
  }

  /**
   * Build download/stream URL for ebook files
   */
  getEbookFileUrl(serverUrl: string, token: string, itemId: string, ino: string, useProxy: boolean = false): string {
    const endpoint = `/api/items/${itemId}/file/${ino}?token=${encodeURIComponent(token)}`;
    return this.formatUrl(serverUrl, endpoint, useProxy);
  }

  /**
   * Fetch ebook file buffer with authentication
   */
  async fetchEbookArrayBuffer(
    serverUrl: string,
    token: string,
    itemId: string,
    ino: string,
    useProxy: boolean = false
  ): Promise<ArrayBuffer> {
    const url = this.getEbookFileUrl(serverUrl, token, itemId, ino, useProxy);
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
    };
    if (useProxy) {
      headers['x-abs-target'] = normalizeUrl(serverUrl);
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`Failed to download ebook file: ${response.statusText}`);
    }
    return response.arrayBuffer();
  }
}

export const absClient = new AbsClient();
