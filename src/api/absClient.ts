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
  public formatUrl(
    serverUrl: string, 
    endpoint: string, 
    tokenOrOptions?: string | boolean | { token?: string; useProxy?: boolean }, 
    useProxyParam: boolean = false
  ): string {
    const cleanBase = normalizeUrl(serverUrl);
    let token: string | undefined;
    let useProxy: boolean = false;

    if (typeof tokenOrOptions === 'object' && tokenOrOptions !== null) {
      token = tokenOrOptions.token;
      useProxy = !!tokenOrOptions.useProxy;
    } else if (typeof tokenOrOptions === 'string') {
      token = tokenOrOptions;
      useProxy = useProxyParam;
    } else if (typeof tokenOrOptions === 'boolean') {
      useProxy = tokenOrOptions;
    }

    // Split endpoint into path and existing query params
    const [pathPart, queryPart] = endpoint.split('?');
    const cleanPath = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
    const params = new URLSearchParams(queryPart || '');

    if (token && !params.has('token')) {
      params.set('token', token.trim());
    }

    if (useProxy) {
      const proxyUrl = new URL('/api/proxy', window.location.origin);
      proxyUrl.searchParams.set('target', cleanBase);
      proxyUrl.searchParams.set('path', cleanPath);
      params.forEach((val, key) => {
        proxyUrl.searchParams.set(key, val);
      });
      return proxyUrl.toString();
    }

    const queryString = params.toString();
    return `${cleanBase}${cleanPath}${queryString ? `?${queryString}` : ''}`;
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
      headers['Authorization'] = `Bearer ${token.trim()}`;
    }

    if (useProxy) {
      headers['x-abs-target'] = normalizeUrl(serverUrl);
    }

    const primaryUrl = this.formatUrl(serverUrl, endpoint, token, useProxy);

    try {
      const response = await fetch(primaryUrl, {
        ...init,
        headers,
      });

      if (!response.ok) {
        let errorMsg = response.status === 401
          ? 'Invalid username or password. Please verify your credentials (Audiobookshelf usernames are case-sensitive).'
          : `Server error ${response.status}`;
        try {
          const text = await response.text();
          if (text) {
            try {
              const errData = JSON.parse(text);
              if (errData.details) {
                errorMsg = `${errData.error || 'Error'}: ${errData.details}`;
              } else if (errData.error || errData.message) {
                errorMsg = errData.error || errData.message;
              }
            } catch {
              // Plain text response from server (e.g. "Unauthorized" or custom message)
              if (text.length > 0 && text.length < 200 && !text.includes('<!DOCTYPE')) {
                errorMsg = text === 'Unauthorized'
                  ? 'Invalid username or password. Please verify your credentials (Audiobookshelf usernames are case-sensitive).'
                  : text;
              }
            }
          }
        } catch {
          // ignore
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
      const url = this.formatUrl(serverUrl, '/ping', { useProxy });
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
      body: JSON.stringify({ username: username.trim(), password }),
    });

    if (!data?.user || !data?.user?.token) {
      throw new Error('Invalid login response from Audiobookshelf server');
    }

    return data.user;
  }

  /**
   * Verify session token or API key
   */
  async verifySession(serverUrl: string, token: string, useProxy: boolean = false): Promise<User> {
    const cleanToken = token.trim();

    // 1. Try /api/me (Standard endpoint for Bearer token & API key)
    try {
      const data = await this.request<any>('/api/me', { serverUrl, token: cleanToken, useProxy });
      const userObj = data?.user || data;
      if (userObj && (userObj.id || userObj.username)) {
        return {
          id: userObj.id || 'user',
          username: userObj.username || 'User',
          type: userObj.type || 'user',
          token: userObj.token || cleanToken,
          mediaProgress: userObj.mediaProgress || [],
        };
      }
    } catch (err: any) {
      console.warn('/api/me verification failed, trying fallback...', err);
    }

    // 2. Try /api/authorize (Session token fallback)
    try {
      const authData = await this.request<any>('/api/authorize', { serverUrl, token: cleanToken, useProxy });
      const userObj = authData?.user || authData;
      if (userObj && (userObj.id || userObj.username)) {
        return {
          id: userObj.id || 'user',
          username: userObj.username || 'User',
          type: userObj.type || 'user',
          token: userObj.token || cleanToken,
          mediaProgress: userObj.mediaProgress || [],
        };
      }
    } catch (err: any) {
      console.warn('/api/authorize verification failed, trying library fallback...', err);
    }

    // 3. Ultimate Fallback: Test library access directly with the token
    const libs = await this.getLibraries(serverUrl, cleanToken, useProxy);
    if (Array.isArray(libs) && libs.length >= 0) {
      return {
        id: 'api-user',
        username: 'API User',
        type: 'api',
        token: cleanToken,
      };
    }

    throw new Error('Invalid API token or unauthorized session. Please verify your token.');
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
    const endpoint = `/api/items/${itemId}/cover${width ? `?width=${width}` : ''}`;
    return this.formatUrl(serverUrl, endpoint, { token, useProxy });
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
    const endpoint = `/api/items/${itemId}/file/${ino}`;
    return this.formatUrl(serverUrl, endpoint, { token, useProxy });
  }

  /**
   * Build download/stream URL for ebook files
   */
  getEbookFileUrl(serverUrl: string, token: string, itemId: string, ino?: string, useProxy: boolean = false): string {
    const endpoint = ino ? `/api/items/${itemId}/file/${ino}` : `/api/items/${itemId}/ebook`;
    return this.formatUrl(serverUrl, endpoint, { token, useProxy });
  }

  /**
   * Fetch ebook file buffer with authentication
   */
  async fetchEbookArrayBuffer(
    serverUrl: string,
    token: string,
    itemId: string,
    ino?: string,
    useProxy: boolean = false
  ): Promise<ArrayBuffer> {
    const url = this.getEbookFileUrl(serverUrl, token, itemId, ino, useProxy);
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
    };
    if (useProxy) {
      headers['x-abs-target'] = normalizeUrl(serverUrl);
    }

    let response = await fetch(url, { headers });
    // If specific file ino failed, fallback to generic /api/items/${itemId}/ebook endpoint
    if (!response.ok && ino) {
      const fallbackUrl = this.getEbookFileUrl(serverUrl, token, itemId, undefined, useProxy);
      response = await fetch(fallbackUrl, { headers });
    }

    if (!response.ok) {
      throw new Error(`Failed to download ebook file (${response.status}): ${response.statusText}`);
    }
    return response.arrayBuffer();
  }
}

export const absClient = new AbsClient();
