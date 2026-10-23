import React, { useState, useEffect } from 'react';
import { X, Play, BookOpen, Clock, Calendar, User, FileText, CheckCircle2, Heart, Headphones, Sparkles } from 'lucide-react';
import { LibraryItem } from '../../types/audiobookshelf';
import { absClient } from '../../api/absClient';
import { authStore } from '../../stores/authStore';
import { playerStore } from '../../stores/playerStore';
import { readerStore } from '../../stores/readerStore';
import { formatDuration, formatProgressPercent, formatFileSize } from '../../utils/formatters';

interface BookDetailModalProps {
  item: LibraryItem | null;
  onClose: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: (itemId: string) => void;
}

export const BookDetailModal: React.FC<BookDetailModalProps> = ({
  item,
  onClose,
  isFavorite = false,
  onToggleFavorite,
}) => {
  const auth = authStore.getState();
  const [activeItem, setActiveItem] = useState<LibraryItem | null>(item);
  const [coverError, setCoverError] = useState(false);

  // Load expanded item metadata in background unconditionally
  useEffect(() => {
    setActiveItem(item);
    setCoverError(false);

    if (item && auth.token && auth.serverUrl && item.id && !item.id.startsWith('local_')) {
      absClient.getItem(auth.serverUrl, auth.token, item.id, auth.useProxy)
        .then(expanded => {
          if (expanded && expanded.id === item.id) {
            setActiveItem(expanded);
          }
        })
        .catch(err => {
          console.warn('Failed to fetch expanded item details:', err);
        });
    }
  }, [item?.id]);

  if (!item) return null;

  const currentItem = activeItem && activeItem.id === item.id ? activeItem : item;
  const metadata = currentItem.media?.metadata || {};
  const hasAudio = !!(
    currentItem.media?.duration || 
    currentItem.media?.numTracks || 
    currentItem.media?.tracks?.length || 
    currentItem.media?.audioFiles?.length ||
    (currentItem as any).numAudioFiles
  );
  
  const hasEbook = !!(
    currentItem.media?.ebookFile ||
    currentItem.media?.ebookFormat ||
    currentItem.mediaType === 'book' ||
    (currentItem.media as any)?.libraryFiles?.some((f: any) => {
      const ext = (f.metadata?.ext || f.ext || '').toLowerCase();
      return ext === '.epub' || ext === '.pdf' || ext === 'epub' || ext === 'pdf';
    })
  );

  const audioProgress = currentItem.userMediaProgress?.progress || 0;
  const ebookProgress = currentItem.userMediaProgress?.ebookProgress || 0;

  const localCover = (currentItem as any)?.media?.coverPath || (currentItem as any)?.coverDataUrl;
  const serverCover = auth.token && !currentItem.id.startsWith('local_')
    ? absClient.getItemCoverUrl(auth.serverUrl, auth.token, currentItem.id, 600, auth.useProxy)
    : '';
  const coverUrl = localCover || serverCover || '';

  const handleStartListening = () => {
    playerStore.loadAndPlay(currentItem);
    onClose();
  };

  const handleStartReading = () => {
    readerStore.openBook(currentItem);
    onClose();
  };

  const handleReadAndListenTogether = () => {
    // Simultaneous reading and listening!
    playerStore.loadAndPlay(currentItem);
    readerStore.openBook(currentItem);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-[#181c21] border border-[#232830] rounded-2xl shadow-2xl text-neutral-100 flex flex-col md:flex-row overflow-hidden">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 p-2 rounded-full bg-black/50 hover:bg-neutral-800 text-stone-300 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Left Column: Cover & Quick Actions */}
        <div className="w-full md:w-72 bg-[#13161a] p-6 flex flex-col items-center border-b md:border-b-0 md:border-r border-[#232830]">
          <div className="w-48 aspect-[2/3] rounded-xl overflow-hidden shadow-2xl bg-neutral-900 border border-neutral-800 relative mb-6">
            {coverUrl && !coverError ? (
              <img
                src={coverUrl}
                alt={metadata.title}
                onError={() => setCoverError(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-gradient-to-b from-stone-800 to-neutral-900 text-stone-300">
                <BookOpen className="w-12 h-12 text-teal-400/80 mb-2" />
                <span className="font-serif font-bold text-sm line-clamp-3 text-white">{metadata.title}</span>
                <span className="text-[11px] text-stone-400 mt-1 line-clamp-1">{metadata.authorName}</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="w-full flex flex-col gap-2.5">
            {/* Read & Listen Together (if both available) */}
            {hasAudio && hasEbook && (
              <button
                onClick={handleReadAndListenTogether}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-medium bg-gradient-to-r from-teal-500 to-emerald-400 hover:from-teal-400 hover:to-emerald-300 text-black transition-all shadow-lg shadow-teal-500/25 active:scale-[0.98]"
                title="Open ebook reader and start audiobook playback together"
              >
                <Headphones className="w-4 h-4 fill-current ml-0.5" />
                <span>Read & Listen Together</span>
              </button>
            )}

            {hasAudio && (
              <button
                onClick={handleStartListening}
                className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-medium transition-colors active:scale-[0.98] ${
                  hasAudio && hasEbook 
                    ? 'bg-[#232830] hover:bg-[#2e3540] text-neutral-100 border border-neutral-700/60'
                    : 'bg-teal-500 hover:bg-teal-400 text-black shadow-lg shadow-teal-500/20'
                }`}
              >
                <Play className="w-4 h-4 fill-current ml-0.5" />
                {audioProgress > 0 ? 'Resume Audiobook' : 'Play Audiobook'}
              </button>
            )}

            {hasEbook && (
              <button
                onClick={handleStartReading}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-medium bg-[#232830] hover:bg-[#2e3540] text-neutral-100 border border-neutral-700/60 transition-colors active:scale-[0.98]"
              >
                <BookOpen className="w-4 h-4 text-amber-400" />
                {ebookProgress > 0 ? 'Continue Reading' : 'Read Ebook'}
              </button>
            )}

            {onToggleFavorite && (
              <button
                onClick={() => onToggleFavorite(activeItem.id)}
                className={`w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-medium border transition-colors ${
                  isFavorite
                    ? 'border-red-500/50 bg-red-500/10 text-red-400'
                    : 'border-neutral-800 hover:bg-neutral-800 text-stone-400 hover:text-stone-200'
                }`}
              >
                <Heart className={`w-3.5 h-3.5 ${isFavorite ? 'fill-red-500 text-red-500' : ''}`} />
                {isFavorite ? 'In Favorites' : 'Add to Favorites'}
              </button>
            )}
          </div>

          {/* Progress stats */}
          {(audioProgress > 0 || ebookProgress > 0) && (
            <div className="w-full mt-6 pt-4 border-t border-neutral-800/80 text-xs">
              <span className="text-stone-400 block mb-1">Your Progress</span>
              {audioProgress > 0 && (
                <div className="flex justify-between items-center py-1">
                  <span className="text-stone-400">Audiobook:</span>
                  <span className="text-teal-400 font-medium">{formatProgressPercent(audioProgress)}</span>
                </div>
              )}
              {ebookProgress > 0 && (
                <div className="flex justify-between items-center py-1">
                  <span className="text-stone-400">Ebook:</span>
                  <span className="text-amber-400 font-medium">{formatProgressPercent(ebookProgress)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Complete Metadata */}
        <div className="flex-1 p-6 md:p-8 flex flex-col gap-6 overflow-y-auto">
          <div>
            {metadata.series && metadata.series.length > 0 && (
              <span className="text-xs font-semibold uppercase tracking-wider text-teal-400 mb-1 block">
                {metadata.series[0].name} {metadata.series[0].sequence ? `· Book ${metadata.series[0].sequence}` : ''}
              </span>
            )}
            <h2 className="text-2xl md:text-3xl font-serif font-bold text-neutral-100">
              {metadata.title}
            </h2>
            {metadata.subtitle && (
              <p className="text-stone-400 mt-1 text-sm">{metadata.subtitle}</p>
            )}
            <p className="text-base text-stone-300 mt-2 font-medium">
              by <span className="text-neutral-100">{metadata.authorName || 'Unknown Author'}</span>
            </p>
          </div>

          {/* Quick Meta Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-[#13161a] border border-[#232830] text-xs">
            {hasAudio && item.media?.duration ? (
              <div className="flex flex-col gap-1">
                <span className="text-stone-400 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-teal-400" /> Duration
                </span>
                <span className="font-medium text-neutral-200">{formatDuration(item.media.duration)}</span>
              </div>
            ) : null}

            {metadata.narratorName ? (
              <div className="flex flex-col gap-1">
                <span className="text-stone-400 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-teal-400" /> Narrator
                </span>
                <span className="font-medium text-neutral-200 truncate">{metadata.narratorName}</span>
              </div>
            ) : null}

            {metadata.publishedYear ? (
              <div className="flex flex-col gap-1">
                <span className="text-stone-400 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-stone-400" /> Published
                </span>
                <span className="font-medium text-neutral-200">{metadata.publishedYear}</span>
              </div>
            ) : null}

            {hasEbook && item.media?.ebookFile ? (
              <div className="flex flex-col gap-1">
                <span className="text-stone-400 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-amber-400" /> Format
                </span>
                <span className="font-medium text-neutral-200 uppercase">
                  {item.media.ebookFile.ext.replace('.', '')} ({formatFileSize(item.media.ebookFile.size)})
                </span>
              </div>
            ) : null}

            {item.userMediaProgress?.isFinished && (
              <div className="flex flex-col gap-1">
                <span className="text-stone-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> Status
                </span>
                <span className="font-medium text-green-400">Completed</span>
              </div>
            )}
          </div>

          {/* Description */}
          {metadata.description && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-2">
                Overview
              </h4>
              <div
                className="text-sm text-stone-300 leading-relaxed max-h-48 overflow-y-auto pr-2"
                dangerouslySetInnerHTML={{ __html: metadata.description }}
              />
            </div>
          )}

          {/* Chapters (if audiobook) */}
          {item.media?.chapters && item.media.chapters.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-2">
                Chapters ({item.media.chapters.length})
              </h4>
              <div className="max-h-40 overflow-y-auto divide-y divide-neutral-800 rounded-lg border border-neutral-800 bg-[#13161a]">
                {item.media.chapters.map((chap, idx) => (
                  <div
                    key={chap.id || idx}
                    className="flex justify-between items-center py-2 px-3 text-xs text-stone-300 hover:bg-neutral-800/50 cursor-pointer"
                    onClick={() => {
                      playerStore.loadAndPlay(item, chap.start);
                      onClose();
                    }}
                  >
                    <span className="truncate pr-2">{chap.title || `Chapter ${idx + 1}`}</span>
                    <span className="text-stone-400 font-mono text-[11px] shrink-0">
                      {formatDuration(chap.start, true)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
