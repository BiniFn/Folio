export function normalizeUrl(url: string): string {
  let cleaned = (url || '').trim();
  if (!cleaned) return '';
  // If protocol omitted, default to https:// (or http:// if localhost / 127.0.0.1)
  if (!/^https?:\/\//i.test(cleaned)) {
    if (cleaned.startsWith('localhost') || cleaned.startsWith('127.0.0.1')) {
      cleaned = 'http://' + cleaned;
    } else {
      cleaned = 'https://' + cleaned;
    }
  }
  // Strip trailing slashes
  return cleaned.replace(/\/+$/, '');
}

export function formatDuration(seconds: number, concise: boolean = false): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return concise ? '0:00' : '0m';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (concise) {
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  if (mins > 0) {
    return `${mins}m`;
  }
  return `${secs}s`;
}

export function formatTimeRemaining(currentTime: number, duration: number): string {
  if (!duration || duration <= 0) return 'Unknown';
  const remaining = Math.max(0, duration - currentTime);
  const hrs = Math.floor(remaining / 3600);
  const mins = Math.floor((remaining % 3600) / 60);

  if (hrs > 0) {
    return `${hrs}h ${mins}m left`;
  }
  return `${mins}m left`;
}

export function formatProgressPercent(progress: number): string {
  if (typeof progress !== 'number' || isNaN(progress)) return '0%';
  const clamped = Math.min(1, Math.max(0, progress));
  return `${Math.round(clamped * 100)}% complete`;
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
