"use client";

import * as React from "react";
import {
  Loader2,
  ImageOff,
  Eye,
  FileText,
  Film,
  Download,
} from "lucide-react";
import { ImageViewer } from "./image-viewer";
import { VoiceMessagePlayer } from "./voice-message-player";
import type { AttachmentWithUrl } from "@/types/chat";

interface MessageAttachmentProps {
  attachments: AttachmentWithUrl[];
  isCurrentUser: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Classify attachment by MIME type */
function getAttachmentKind(
  fileType: string,
  fileName?: string
): "image" | "video" | "audio" | "voice" | "file" {
  if (fileType.startsWith("image/")) return "image";
  if (fileType.startsWith("video/")) return "video";
  if (
    fileName?.startsWith("voice_message") ||
    fileType === "audio/webm" ||
    fileType.startsWith("audio/webm;")
  ) {
    return "voice";
  }
  if (fileType.startsWith("audio/")) return "audio";
  return "file";
}

// ── Image grid renderer ───────────────────────────────────────────────────────

interface ImageGridProps {
  attachments: AttachmentWithUrl[];
  onOpenViewer: (index: number) => void;
}

function ImageGrid({ attachments, onOpenViewer }: ImageGridProps) {
  const [loadedMap, setLoadedMap] = React.useState<Record<string, boolean>>({});
  const [errorMap, setErrorMap] = React.useState<Record<string, boolean>>({});

  const count = attachments.length;
  const isSingle = count === 1;

  return (
    <div
      className={`mt-1.5 overflow-hidden rounded-xl w-full max-w-full min-w-0 ${
        isSingle
          ? ""
          : "grid grid-cols-2 gap-1.5"
      }`}
    >
      {attachments.map((att, index) => {
        const isLoaded = loadedMap[att.id];
        const isError = errorMap[att.id];

        return (
          <div
            key={att.id}
            onClick={() => !isError && onOpenViewer(index)}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && !isError) {
                e.preventDefault();
                onOpenViewer(index);
              }
            }}
            tabIndex={isError ? -1 : 0}
            role="button"
            aria-label={`View full image: ${att.fileName}`}
            className={`group relative overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 w-full max-w-full min-w-0 ${
              isSingle ? "aspect-auto max-h-[340px]" : "aspect-square"
            }`}
          >
            {!isLoaded && !isError && (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-200/60 dark:bg-zinc-800/80 animate-pulse">
                <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
              </div>
            )}
            {isError && (
              <div className="flex h-32 flex-col items-center justify-center p-4 text-center bg-zinc-100 dark:bg-zinc-800/60 text-zinc-400">
                <ImageOff className="h-6 w-6 mb-1 text-zinc-400" />
                <span className="text-[11px]">Image unavailable</span>
              </div>
            )}
            {!isError && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={att.signedUrl}
                alt={att.fileName || "Chat attachment"}
                onLoad={() => setLoadedMap((prev) => ({ ...prev, [att.id]: true }))}
                onError={() => setErrorMap((prev) => ({ ...prev, [att.id]: true }))}
                className={`w-full max-w-full object-cover transition-transform duration-300 group-hover:scale-105 ${
                  isSingle ? "max-h-[340px] object-contain bg-black/5 dark:bg-black/20" : "h-full"
                } ${!isLoaded ? "opacity-0" : "opacity-100"}`}
                loading="lazy"
              />
            )}
            {!isError && isLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-2xs">
                <span className="rounded-full bg-black/60 p-2 text-white shadow-lg">
                  <Eye className="h-4 w-4" />
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Video renderer ────────────────────────────────────────────────────────────

function VideoAttachment({ att }: { att: AttachmentWithUrl }) {
  return (
    <div className="mt-1.5 overflow-hidden rounded-xl w-full max-w-full min-w-0 bg-black">
      <video
        src={att.signedUrl}
        controls
        preload="metadata"
        poster={att.thumbnailSignedUrl || undefined}
        className="w-full max-w-full max-h-[320px] rounded-xl"
        aria-label={att.fileName || "Video attachment"}
      >
        <source src={att.signedUrl} type={att.fileType} />
        Your browser does not support video playback.
      </video>
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-400">
        <Film className="h-3 w-3 shrink-0" />
        <span className="truncate">{att.fileName}</span>
        {att.durationSeconds ? (
          <span className="ml-auto shrink-0">{formatDuration(att.durationSeconds)}</span>
        ) : null}
      </div>
    </div>
  );
}

// ── Generic file renderer ─────────────────────────────────────────────────────

function FileAttachment({ att }: { att: AttachmentWithUrl }) {
  return (
    <a
      href={att.signedUrl}
      download={att.fileName}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1.5 flex items-center gap-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 px-3.5 py-2.5 sm:px-4 sm:py-3 w-full max-w-full min-w-0 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors group"
      aria-label={`Download ${att.fileName}`}
    >
      <FileText className="h-7 w-7 sm:h-8 sm:w-8 text-heat-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs sm:text-sm font-medium text-zinc-800 dark:text-zinc-100 truncate">
          {att.fileName}
        </p>
        <p className="text-[10px] sm:text-xs text-zinc-400">{formatFileSize(att.fileSize)}</p>
      </div>
      <Download className="h-4 w-4 text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-200 transition-colors shrink-0" />
    </a>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MessageAttachment({
  attachments,
  isCurrentUser,
}: MessageAttachmentProps) {
  const [selectedImageIndex, setSelectedImageIndex] = React.useState<number | null>(null);

  if (!attachments || attachments.length === 0) return null;

  // Separate images from other types
  const imageAttachments = attachments.filter(
    (a) => getAttachmentKind(a.fileType, a.fileName) === "image"
  );
  const nonImageAttachments = attachments.filter(
    (a) => getAttachmentKind(a.fileType, a.fileName) !== "image"
  );

  return (
    <>
      {/* Image grid */}
      {imageAttachments.length > 0 && (
        <ImageGrid
          attachments={imageAttachments}
          onOpenViewer={(index) => setSelectedImageIndex(index)}
        />
      )}

      {/* Non-image attachments */}
      {nonImageAttachments.map((att) => {
        const kind = getAttachmentKind(att.fileType, att.fileName);
        if (kind === "video") return <VideoAttachment key={att.id} att={att} />;
        if (kind === "voice" || kind === "audio") {
          return (
            <VoiceMessagePlayer
              key={att.id}
              src={att.signedUrl}
              durationSeconds={att.durationSeconds}
              fileName={att.fileName}
              isVoice={kind === "voice"}
              isCurrentUser={isCurrentUser}
            />
          );
        }
        return <FileAttachment key={att.id} att={att} />;
      })}

      {/* Lightbox for images */}
      <ImageViewer
        isOpen={selectedImageIndex !== null}
        attachments={imageAttachments}
        initialIndex={selectedImageIndex || 0}
        onClose={() => setSelectedImageIndex(null)}
      />
    </>
  );
}
