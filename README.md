# Folio — Premium Audiobookshelf Reading & Listening App

A modern, browser-based reading and audiobook web application engineered to integrate with an [Audiobookshelf](https://www.audiobookshelf.org/) server. It unites ebooks and audiobooks into a calm, editorial experience with full bidirectional progress synchronization.

---

## Key Capabilities

### 1. Unified Library & Audiobookshelf Integration
- **Server Connection**: Connects to any Audiobookshelf instance via Bearer token authentication (`/api/login` and `/api/authorize`). Supports both direct browser requests and an integrated CORS-proxy route (`/abs-proxy`) for self-hosted instances with restricted origin headers.
- **Personalized Shelves**: Pulls native user shelves (`/api/libraries/{id}/personalized`) including **Continue Listening**, **Continue Reading**, and **Recently Added**.
- **Collection Management**: Search by title, author, and series; filter by media type (Audiobooks, Ebooks, In Progress, Completed, Unread, Favorites); and sort by duration, date added, or reading progress.
- **Rich Book Metadata**: Original cover art, authors, narrators, published year, descriptions, series index, chapter breakdown, and file sizes.

### 2. Distraction-Free Ebook Reader (Readest Signature Experience)
- **Visual Design**: Dark charcoal ambient backdrop with subtle botanical watermark and centered, book-like reading canvas with soft borders and paper styling.
- **Readest Reading Progress Sidebar**:
  - Displays original cover art with rounded corners.
  - Live percentage progress (e.g., `38% complete`).
  - Page counter (`Page 106 of 277` and `171 pages left`).
  - Active chapter display (`Chapter 6: On the Road`, remaining chapters counter).
  - Estimated reading time remaining (`5h 43m left in the volume`).
- **Format Support**:
  - **EPUB**: Pure Web-standard EPUB engine powered by browser-native `DecompressionStream('deflate-raw')`. Parses package manifest, spine, CSS, images, and Table of Contents with zero heavy external dependencies.
  - **PDF**: Embedded vector PDF viewer with page navigation, zoom controls, and page-progress tracking.
- **Customizable Typography**: Real-time adjustment of font family (Merriweather Serif, Inter Sans, JetBrains Mono, OpenDyslexic), font size, line spacing, margins, and canvas themes (Dark Ambiance, Clean Light, Warm Paper, Midnight Black).

### 3. Integrated Audiobook Player
- **Session Lifecycle**: Opens server listening sessions (`POST /api/items/{id}/play`), streams audio tracks via HTTP Range requests, sends progress heartbeats (`POST /api/session/{id}/sync`), and cleanly closes sessions on pause or teardown.
- **Persistent Controls**: Bottom player bar stays active while navigating throughout the app without interrupting audio.
- **Expanded Player View**: Modal view with large artwork, timeline scrubber, chapter drawer, sleep timer (5m–60m), and speed adjustment (0.75x–2.5x).
- **System MediaSession**: Integrated with OS media controls, keyboard keys, and mobile lock screen (artwork, title, author, chapter skip).

### 4. Reliable Progress Synchronization
- **Bidirectional Sync**: Restores exact listening timestamp and EPUB CFI reading location from Audiobookshelf (`/api/me/progress/{id}`).
- **Conflict Resolution**: Compares update timestamps (`lastUpdate`) to prevent stale local data from overwriting newer remote updates.
- **Offline Resilience**: Automatically queues unwritten progress in local storage during network interruptions and drains the queue once reconnected.

---

## Quickstart

### Prerequisites
- Node.js (v18+) or Bun (v1.0+)

### Running the App

```bash
# Navigate to the app directory
cd "audiobookshelf-app"

# Start the Vite development server (port 3000)
bun run dev
# or: npm run dev
```

Open `http://localhost:3000` in your browser.

### Running Unit Tests

```bash
bun test
# or: npm test
```

### Building for Production

```bash
bun run build
# or: npm run build
```

---

## Architecture

```
audiobookshelf-app/
├── src/
│   ├── api/
│   │   └── absClient.ts          # Centralized Audiobookshelf REST client
│   ├── components/
│   │   ├── common/
│   │   │   ├── BookCard.tsx      # High-fidelity book cover & meta card
│   │   │   ├── BookDetailModal.tsx # Full book modal with chapters & synopsis
│   │   │   ├── Header.tsx        # Search, library switcher, server status
│   │   │   └── Sidebar.tsx       # Desktop collapsible navigation & mobile bar
│   │   ├── player/
│   │   │   └── AudiobookPlayer.tsx # Persistent bottom player & expanded view
│   │   └── reader/
│   │       └── EbookReader.tsx   # Readest-styled EPUB/PDF reading canvas
│   ├── pages/
│   │   ├── ConnectPage.tsx       # Server connection form & diagnostics
│   │   ├── HomePage.tsx          # Personalized shelves (Continue Reading/Listening)
│   │   ├── LibraryPage.tsx       # Full collection with search, filters, sorting
│   │   └── SettingsPage.tsx      # Server, typography, playback, and cache settings
│   ├── services/
│   │   ├── epubParser.ts         # Native DecompressionStream EPUB parser
│   │   └── progressSync.ts       # Progress sync engine & offline queue
│   ├── stores/
│   │   ├── authStore.ts          # Authentication & library session state
│   │   ├── playerStore.ts        # Audio playback state & HTML5 audio instance
│   │   └── readerStore.ts        # Ebook reading location & preferences state
│   ├── types/
│   │   └── audiobookshelf.ts     # TypeScript interfaces matching ABS schema
│   ├── utils/
│   │   ├── formatters.ts         # Duration, time remaining, progress math
│   │   └── sampleData.ts         # Isolated demo fixtures for offline testing
│   ├── App.tsx                   # Main application router & shell
│   ├── main.tsx                  # React 18 entrypoint
│   └── index.css                 # Tailwind directives & reader typography
├── tests/
│   └── unit.test.js              # Unit tests for formatters, sync, and DecompressionStream
├── vite.config.ts                # Vite config with dynamic /abs-proxy middleware
└── tailwind.config.js            # Editorial design system colors & fonts
```
