"use client";

import * as React from "react";
import {
  X,
  Images,
  Film,
  Music,
  FileText,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageViewer } from "./image-viewer";
import type { AttachmentWithUrl } from "@/types/chat";

type MediaCategory = "media" | "audio" | "files";

interface MediaItem {
  attachmentId: string;
  messageId: string;
  senderId: string;
  messageType: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  storagePath: string;
  createdAt: string;
  signedUrl: string;
  thumbnailSignedUrl: string | null;
}

interface MediaGalleryDialogProps {
  conversationId: string;
  isOpen: boolean;
  onClose: () => void;
  onJumpToMessage?: (messageId: string) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(s: number | null | undefined): string {
  if (!s) return "";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

const CATEGORIES: { id: MediaCategory; label: string; Icon: React.ElementType }[] = [
  { id: "media", label: "Media", Icon: Images },
  { id: "audio", label: "Audio", Icon: Music },
  { id: "files", label: "Files", Icon: FileText },
];

export function MediaGalleryDialog({
  conversationId,
  isOpen,
  onClose,
  onJumpToMessage,
}: MediaGalleryDialogProps) {
  const [category, setCategory] = React.useState<MediaCategory>("media");
  const [items, setItems] = React.useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(false);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [lightboxItem, setLightboxItem] = React.useState<AttachmentWithUrl | null>(null);

  const fetchItems = React.useCallback(
    async (cat: MediaCategory, cursor: string | null, replace: boolean) => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ category: cat, limit: "30" });
        if (cursor) params.set("before", cursor);
        const res = await fetch(`/api/conversations/${conversationId}/media?${params}`);
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || `HTTP ${res.status}`);
        }
        const json = await res.json();
        setItems((prev) => (replace ? json.items : [...prev, ...json.items]));
        setHasMore(json.hasMore);
        setNextCursor(json.nextCursor);
      } catch (err: any) {
        setError(err.message || "Failed to load media.");
      } finally {
        setIsLoading(false);
      }
    },
    [conversationId]
  );

  // Load when dialog opens or category changes
  React.useEffect(() => {
    if (!isOpen) return;
    setItems([]);
    setNextCursor(null);
    fetchItems(category, null, true);
  }, [isOpen, category, fetchItems]);

  const handleLoadMore = () => {
    if (!hasMore || isLoading) return;
    fetchItems(category, nextCursor, false);
  };

  // Keyboard close
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Media Gallery"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 flex flex-col w-full max-w-2xl h-[85vh] sm:h-[80vh] bg-white dark:bg-zinc-900 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white">Shared Media</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close media gallery"
            className="h-8 w-8 rounded-full"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Category tabs */}
        <div className="flex gap-1 px-4 py-2 border-b border-zinc-100 dark:border-zinc-800">
          {CATEGORIES.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setCategory(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-xl transition-colors ${
                category === id
                  ? "bg-heat-500 text-white"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
              aria-pressed={category === id}
              aria-label={label}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Error */}
          {error && (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-zinc-400">
              <AlertCircle className="h-8 w-8 text-red-400" />
              <p className="text-sm">{error}</p>
              <Button variant="outline" size="sm" onClick={() => fetchItems(category, null, true)}>
                Retry
              </Button>
            </div>
          )}

          {/* Empty */}
          {!isLoading && !error && items.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-zinc-400">
              {category === "media" && <Images className="h-10 w-10 opacity-30" />}
              {category === "audio" && <Music className="h-10 w-10 opacity-30" />}
              {category === "files" && <FileText className="h-10 w-10 opacity-30" />}
              <p className="text-sm">No {category} shared yet</p>
            </div>
          )}

          {/* Media grid */}
          {category === "media" && items.length > 0 && (
            <div className="grid grid-cols-3 gap-1.5">
              {items.map((item) => {
                const isVideo = item.messageType === "video";
                return (
                  <button
                    key={item.attachmentId}
                    onClick={() =>
                      setLightboxItem({
                        id: item.attachmentId,
                        messageId: item.messageId,
                        fileName: item.fileName,
                        fileType: item.fileType,
                        fileSize: item.fileSize,
                        width: item.width,
                        height: item.height,
                        durationSeconds: item.durationSeconds,
                        storagePath: item.storagePath,
                        signedUrl: item.signedUrl,
                        thumbnailSignedUrl: item.thumbnailSignedUrl,
                      })
                    }
                    className="group relative aspect-square overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-heat-500 focus-visible:outline-none"
                    aria-label={`View ${item.fileName}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.thumbnailSignedUrl || item.signedUrl}
                      alt={item.fileName}
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                    {isVideo && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <Film className="h-6 w-6 text-white drop-shadow" />
                      </div>
                    )}
                    {item.durationSeconds && (
                      <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 py-0.5 text-[10px] text-white">
                        {formatDuration(item.durationSeconds)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Audio list */}
          {category === "audio" && items.length > 0 && (
            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <div
                  key={item.attachmentId}
                  className="flex flex-col gap-1 rounded-xl bg-zinc-50 dark:bg-zinc-800 p-3"
                >
                  <div className="flex items-center gap-2">
                    <Music className="h-4 w-4 text-heat-500 shrink-0" />
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100 truncate flex-1">
                      {item.messageType === "voice" ? "Voice message" : item.fileName}
                    </span>
                    {item.durationSeconds && (
                      <span className="text-xs text-zinc-400 shrink-0">
                        {formatDuration(item.durationSeconds)}
                      </span>
                    )}
                    {onJumpToMessage && (
                      <button
                        onClick={() => onJumpToMessage(item.messageId)}
                        className="ml-1 text-zinc-400 hover:text-heat-500 transition-colors"
                        aria-label="Jump to message"
                      >
                        <ArrowUpRight className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <audio controls preload="metadata" className="w-full h-8">
                    <source src={item.signedUrl} type={item.fileType} />
                  </audio>
                  <p className="text-[10px] text-zinc-400">{formatDate(item.createdAt)}</p>
                </div>
              ))}
            </div>
          )}

          {/* Files list */}
          {category === "files" && items.length > 0 && (
            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <a
                  key={item.attachmentId}
                  href={item.signedUrl}
                  download={item.fileName}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-xl bg-zinc-50 dark:bg-zinc-800 px-4 py-3 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors group"
                  aria-label={`Download ${item.fileName}`}
                >
                  <FileText className="h-8 w-8 text-heat-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100 truncate">
                      {item.fileName}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {formatFileSize(item.fileSize)} · {formatDate(item.createdAt)}
                    </p>
                  </div>
                  {onJumpToMessage && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        onJumpToMessage(item.messageId);
                      }}
                      className="text-zinc-400 hover:text-heat-500 transition-colors"
                      aria-label="Jump to message"
                    >
                      <ArrowUpRight className="h-4 w-4" />
                    </button>
                  )}
                </a>
              ))}
            </div>
          )}

          {/* Load more */}
          {!isLoading && hasMore && (
            <div className="flex justify-center mt-4">
              <Button variant="outline" size="sm" onClick={handleLoadMore}>
                Load more
              </Button>
            </div>
          )}

          {/* Loading spinner */}
          {isLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-heat-500" />
            </div>
          )}
        </div>
      </div>

      {/* Image lightbox */}
      {lightboxItem && (
        <ImageViewer
          isOpen={!!lightboxItem}
          attachments={[lightboxItem]}
          initialIndex={0}
          onClose={() => setLightboxItem(null)}
        />
      )}
    </div>
  );
}
