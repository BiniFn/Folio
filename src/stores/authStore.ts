import { useState, useEffect } from 'react';
import { User, Library } from '../types/audiobookshelf';
import { absClient } from '../api/absClient';
import { normalizeUrl } from '../utils/formatters';

interface AuthState {
  serverUrl: string;
  token: string | null;
  user: User | null;
  libraries: Library[];
  activeLibraryId: string | null;
  useProxy: boolean;
  isLoading: boolean;
  error: string | null;
}

const STORAGE_KEY = 'abs_auth_session_v1';

let globalState: AuthState = {
  serverUrl: '',
  token: null,
  user: null,
  libraries: [],
  activeLibraryId: null,
  useProxy: false,
  isLoading: true,
  error: null,
};

const listeners = new Set<(state: AuthState) => void>();

function notify() {
  listeners.forEach(listener => listener(globalState));
}

function saveToStorage() {
  try {
    if (globalState.token && globalState.serverUrl) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        serverUrl: globalState.serverUrl,
        token: globalState.token,
        username: globalState.user?.username,
        userId: globalState.user?.id,
        activeLibraryId: globalState.activeLibraryId,
        useProxy: globalState.useProxy,
      }));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (err) {
    console.error('Failed to save session to storage', err);
  }
}

// Initial restore
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const parsed = JSON.parse(saved);
    if (parsed.serverUrl && parsed.token) {
      globalState.serverUrl = parsed.serverUrl;
      globalState.token = parsed.token;
      globalState.activeLibraryId = parsed.activeLibraryId || null;
      globalState.useProxy = !!parsed.useProxy;
    }
  }
} catch {
  // Ignore corrupt storage
}

export const authStore = {
  getState(): AuthState {
    return globalState;
  },

  subscribe(listener: (state: AuthState) => void) {
    listeners.add(listener);
    listener(globalState);
    return () => {
      listeners.delete(listener);
    };
  },

  async initSession() {
    if (!globalState.serverUrl || !globalState.token) {
      globalState = { ...globalState, isLoading: false };
      notify();
      return;
    }

    try {
      globalState = { ...globalState, isLoading: true, error: null };
      notify();

      const user = await absClient.verifySession(
        globalState.serverUrl,
        globalState.token,
        globalState.useProxy
      );

      const libraries = await absClient.getLibraries(
        globalState.serverUrl,
        globalState.token,
        globalState.useProxy
      );

      let activeLib = globalState.activeLibraryId;
      if (!activeLib || !libraries.some(l => l.id === activeLib)) {
        activeLib = libraries[0]?.id || null;
      }

      globalState = {
        ...globalState,
        user,
        libraries,
        activeLibraryId: activeLib,
        isLoading: false,
        error: null,
      };
      saveToStorage();
      notify();
    } catch (err: any) {
      console.warn('Session verification failed:', err);
      globalState = {
        ...globalState,
        isLoading: false,
        error: 'Session expired or server unavailable. Please reconnect.',
      };
      notify();
    }
  },

  async login(serverUrlInput: string, username: string, password: string, useProxy: boolean = false) {
    const cleanUrl = normalizeUrl(serverUrlInput);
    if (!cleanUrl) throw new Error('Please enter a valid server URL');

    globalState = { ...globalState, isLoading: true, error: null };
    notify();

    try {
      const user = await absClient.login(cleanUrl, username, password, useProxy);
      const libraries = await absClient.getLibraries(cleanUrl, user.token, useProxy);

      const activeLib = libraries[0]?.id || null;

      globalState = {
        serverUrl: cleanUrl,
        token: user.token,
        user,
        libraries,
        activeLibraryId: activeLib,
        useProxy,
        isLoading: false,
        error: null,
      };

      saveToStorage();
      notify();
      return user;
    } catch (err: any) {
      globalState = {
        ...globalState,
        isLoading: false,
        error: err.message || 'Login failed',
      };
      notify();
      throw err;
    }
  },

  async loginWithToken(serverUrlInput: string, tokenInput: string, useProxy: boolean = false) {
    const cleanUrl = normalizeUrl(serverUrlInput);
    if (!cleanUrl) throw new Error('Please enter a valid server URL');
    const cleanToken = tokenInput.trim();
    if (!cleanToken) throw new Error('Please enter your API Token');

    globalState = { ...globalState, isLoading: true, error: null };
    notify();

    try {
      const user = await absClient.verifySession(cleanUrl, cleanToken, useProxy);
      const libraries = await absClient.getLibraries(cleanUrl, cleanToken, useProxy);
      const activeLib = libraries[0]?.id || null;

      globalState = {
        serverUrl: cleanUrl,
        token: cleanToken,
        user,
        libraries,
        activeLibraryId: activeLib,
        useProxy,
        isLoading: false,
        error: null,
      };

      saveToStorage();
      notify();
      return user;
    } catch (err: any) {
      globalState = {
        ...globalState,
        isLoading: false,
        error: err.message || 'Token verification failed. Please check your API Token.',
      };
      notify();
      throw err;
    }
  },

  setActiveLibrary(libraryId: string) {
    globalState = { ...globalState, activeLibraryId: libraryId };
    saveToStorage();
    notify();
  },

  logout() {
    globalState = {
      serverUrl: '',
      token: null,
      user: null,
      libraries: [],
      activeLibraryId: null,
      useProxy: false,
      isLoading: false,
      error: null,
    };
    saveToStorage();
    notify();
  },
};

export function useAuth() {
  const [state, setState] = useState<AuthState>(globalState);

  useEffect(() => {
    return authStore.subscribe(setState);
  }, []);

  return {
    ...state,
    login: authStore.login,
    loginWithToken: authStore.loginWithToken,
    logout: authStore.logout,
    setActiveLibrary: authStore.setActiveLibrary,
    initSession: authStore.initSession,
    isAuthenticated: !!(state.token && state.user),
  };
}
