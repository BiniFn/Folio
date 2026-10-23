export interface ServerConnectionConfig {
  serverUrl: string;
  useProxy: boolean;
  token?: string;
  username?: string;
  userId?: string;
}

export interface User {
  id: string;
  username: string;
  type: string;
  token: string;
  mediaProgress?: MediaProgress[];
  permissions?: Record<string, boolean>;
}

export interface Library {
  id: string;
  name: string;
  mediaType: 'book' | 'podcast';
  folders?: { id: string; fullPath: string }[];
  icon?: string;
  displayOrder?: number;
}

export interface Author {
  id?: string;
  name: string;
}

export interface SeriesSequence {
  id?: string;
  name: string;
  sequence?: string;
}

export interface Chapter {
  id: number | string;
  start: number; // in seconds
  end: number;   // in seconds
  title: string;
}

export interface AudioTrack {
  index: number;
  startOffset: number;
  duration: number;
  title: string;
  contentUrl: string;
  mimeType: string;
  metadata?: {
    filename?: string;
    ext?: string;
    size?: number;
  };
}

export interface EbookFile {
  ino: string;
  filename: string;
  ext: string;
  size: number;
  path?: string;
  relPath?: string;
}

export interface MediaMetadata {
  title: string;
  subtitle?: string;
  authorName?: string;
  authors?: Author[];
  narratorName?: string;
  narrators?: string[];
  series?: SeriesSequence[];
  genres?: string[];
  publishedYear?: string | number;
  publishedDate?: string;
  publisher?: string;
  description?: string;
  isbn?: string;
  language?: string;
  duration?: number; // seconds
  size?: number;
  explicit?: boolean;
}

export interface MediaProgress {
  id?: string;
  userId: string;
  libraryItemId: string;
  mediaItemId?: string;
  mediaItemType?: 'book' | 'podcast';
  duration?: number;
  currentTime?: number;
  progress: number; // 0.0 - 1.0
  isFinished: boolean;
  hideFromContinueListening?: boolean;
  ebookLocation?: string; // EPUB CFI or page identifier
  ebookProgress?: number; // 0.0 - 1.0
  lastUpdate: number; // timestamp ms
  startedAt?: number;
  finishedAt?: number | null;
}

export interface LibraryItemMedia {
  id?: string;
  metadata: MediaMetadata;
  coverPath?: string;
  audioFiles?: any[];
  tracks?: AudioTrack[];
  chapters?: Chapter[];
  duration?: number;
  size?: number;
  numTracks?: number;
  numAudioFiles?: number;
  numChapters?: number;
  ebookFile?: EbookFile;
}

export interface LibraryItem {
  id: string;
  ino?: string;
  libraryId: string;
  mediaType: 'book' | 'podcast';
  media: LibraryItemMedia;
  addedAt?: number;
  updatedAt?: number;
  userMediaProgress?: MediaProgress;
  collapsedSeries?: any;
}

export interface PersonalizedShelf {
  id: string;
  label: string;
  labelStringKey?: string;
  type: string;
  entities: LibraryItem[];
}

export interface PlaySession {
  id: string;
  userId: string;
  libraryItemId: string;
  episodeId?: string;
  mediaType: string;
  mediaItemType: string;
  duration: number;
  currentTime: number;
  startTime?: number;
  audioTracks: AudioTrack[];
  chapters?: Chapter[];
  playMethod?: number;
}

export type ReaderTheme = 'light' | 'sepia' | 'paper' | 'dark' | 'midnight';
export type ReaderFont = 'serif' | 'sans' | 'mono' | 'dyslexic';

export interface ReaderPreferences {
  theme: ReaderTheme;
  fontFamily: ReaderFont;
  fontSize: number; // in pixels (default: 18)
  lineHeight: number; // default: 1.8
  maxWidth: number; // max width in pixels (default: 720)
  margin: number; // horizontal padding (default: 32)
}

export interface PlayerPreferences {
  defaultSpeed: number; // default: 1.0
  skipBackwardSeconds: number; // default: 15
  skipForwardSeconds: number; // default: 30
  autoSyncInterval: number; // default: 15 seconds
  volume: number; // 0.0 - 1.0 (default: 1.0)
  muted: boolean;
}
