import React from 'react';
import { Headphones, BookOpen, Clock, Heart, Play } from 'lucide-react';
import { LibraryItem } from '../../types/audiobookshelf';
import { absClient } from '../../api/absClient';
import { authStore } from '../../stores/authStore';
import { playerStore } from '../../stores/playerStore';
import { readerStore } from '../../stores/readerStore';
import { formatDuration, formatProgressPercent } from '../../utils/formatters';

interface BookCardProps {
  item: LibraryItem;
  onOpenDetails?: (item: LibraryItem) => void;
  isFavorite?: boolean;
  onToggleFavorite?: (itemId: string) => void;
}

export const BookCard: React.FC<BookCardProps> = ({
  item,
  onOpenDetails,
  isFavorite = false,
  onToggleFavorite,
}) => {
  const auth = authStore.getState();
  const metadata = item.media?.metadata || {};
  const hasAudio = !!(item.media?.duration || item.media?.numTracks || item.media?.audioFiles?.length || item.media?.tracks?.length || (item as any).numAudioFiles);
  const hasEbook = !!(
    item.media?.ebookFile ||
    item.media?.ebookFormat ||
    item.mediaType === 'book' ||
    (item.media as any)?.libraryFiles?.some((f: any) => {
      const ext = (f.metadata?.ext || f.ext || '').toLowerCase();
      return ext === '.epub' || ext === '.pdf' || ext === 'epub' || ext === 'pdf';
    })
  );

  const audioProgress = item.userMediaProgress?.progress || 0;
  const ebookProgress = item.userMediaProgress?.ebookProgress || 0;
  const hasProgress = audioProgress > 0 || ebookProgress > 0;

  const coverUrl = auth.token
    ? absClient.getItemCoverUrl(auth.serverUrl, auth.token, item.id, 400, auth.useProxy)
    : '';

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasAudio) {
      playerStore.loadAndPlay(item);
    } else if (hasEbook) {
      readerStore.openBook(item);
    }
  };

  const handleRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasEbook) {
      readerStore.openBook(item);
    }
  };

  const seriesText = metadata.series && metadata.series.length > 0
    ? `${metadata.series[0].name}${metadata.series[0].sequence ? ` #${metadata.series[0].sequence}` : ''}`
    : null;

  return (
    <div
      onClick={() => onOpenDetails?.(item)}
      className="group relative flex flex-col bg-[#181c21] rounded-xl border border-[#232830] overflow-hidden hover:border-teal-500/50 hover:shadow-xl hover:shadow-teal-950/20 transition-all duration-200 cursor-pointer text-left"
    >
      {/* Cover Artwork Container */}
      <div className="relative aspect-[2/3] w-full bg-[#121518] overflow-hidden">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={metadata.title}
            loading="lazy"
            className="w-full h-full object-cover object-center group-hover:scale-[1.02] transition-transform duration-300"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
        ) : null}

        {/* Fallback book placeholder if no cover */}
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-gradient-to-b from-stone-800 to-stone-900 text-stone-300 -z-0">
          <BookOpen className="w-10 h-10 text-teal-400/60 mb-2" />
          <span className="font-serif font-bold text-sm line-clamp-3">{metadata.title || 'Untitled'}</span>
          <span className="text-xs text-stone-400 mt-1">{metadata.authorName}</span>
        </div>

        {/* Top Badges */}
        <div className="absolute top-2 left-2 flex gap-1.5 z-10">
          {hasAudio && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-black/60 backdrop-blur-md text-teal-300 border border-teal-500/30">
              <Headphones className="w-3 h-3" />
              Audio
            </span>
          )}
          {hasEbook && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-black/60 backdrop-blur-md text-amber-300 border border-amber-500/30">
              <BookOpen className="w-3 h-3" />
              {item.media?.ebookFile?.ext?.replace('.', '').toUpperCase() || 'Ebook'}
            </span>
          )}
        </div>

        {/* Favorite Button */}
        {onToggleFavorite && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(item.id);
            }}
            className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 backdrop-blur-md text-stone-300 hover:text-red-400 transition-colors z-10"
            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Heart className={`w-3.5 h-3.5 ${isFavorite ? 'fill-red-500 text-red-500' : ''}`} />
          </button>
        )}

        {/* Hover Quick Action Play/Read Overlay */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-[2px] z-20">
          {hasAudio && (
            <button
              onClick={handlePlay}
              className="p-3 rounded-full bg-teal-500 text-black hover:bg-teal-400 hover:scale-105 active:scale-95 transition-all shadow-lg"
              title="Listen now"
            >
              <Play className="w-5 h-5 fill-current ml-0.5" />
            </button>
          )}
          {hasEbook && (
            <button
              onClick={handleRead}
              className="p-3 rounded-full bg-amber-500 text-black hover:bg-amber-400 hover:scale-105 active:scale-95 transition-all shadow-lg"
              title="Read now"
            >
              <BookOpen className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Progress bar at bottom of cover */}
        {hasProgress && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/60 z-10">
            <div
              className="h-full bg-teal-400"
              style={{ width: `${Math.min(100, Math.max(5, (audioProgress || ebookProgress) * 100))}%` }}
            />
          </div>
        )}
      </div>

      {/* Book Metadata Details */}
      <div className="p-3 flex flex-col flex-1 justify-between gap-1">
        <div>
          {seriesText && (
            <span className="text-[11px] font-medium text-teal-400/90 truncate block mb-0.5">
              {seriesText}
            </span>
          )}
          <h3 className="font-medium text-sm text-neutral-100 group-hover:text-teal-300 transition-colors line-clamp-1">
            {metadata.title || 'Untitled'}
          </h3>
          <p className="text-xs text-stone-400 truncate mt-0.5">
            {metadata.authorName || metadata.authors?.map(a => a.name).join(', ') || 'Unknown Author'}
          </p>
        </div>

        {/* Footer info: duration or progress percentage */}
        <div className="flex items-center justify-between text-[11px] text-stone-400 pt-2 border-t border-neutral-800/60 mt-1">
          {hasProgress ? (
            <span className="text-teal-400 font-medium">
              {formatProgressPercent(audioProgress || ebookProgress)}
            </span>
          ) : hasAudio && item.media?.duration ? (
            <span className="flex items-center gap-1 text-stone-400">
              <Clock className="w-3 h-3 text-stone-500" />
              {formatDuration(item.media.duration)}
            </span>
          ) : (
            <span className="text-stone-500">Unread</span>
          )}

          {metadata.publishedYear ? (
            <span className="text-stone-500">{metadata.publishedYear}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
};
