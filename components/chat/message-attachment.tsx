"use client";

import * as React from "react";
import { Loader2, ImageOff, Eye } from "lucide-react";
import { ImageViewer } from "./image-viewer";
import type { AttachmentWithUrl } from "@/types/chat";

interface MessageAttachmentProps {
  attachments: AttachmentWithUrl[];
  isCurrentUser: boolean;
}

export function MessageAttachment({
  attachments,
  isCurrentUser,
}: MessageAttachmentProps) {
  const [selectedImageIndex, setSelectedImageIndex] = React.useState<number | null>(null);
  const [loadedMap, setLoadedMap] = React.useState<Record<string, boolean>>({});
  const [errorMap, setErrorMap] = React.useState<Record<string, boolean>>({});

  if (!attachments || attachments.length === 0) return null;

  const count = attachments.length;
  const isSingle = count === 1;

  const handleImageLoad = (id: string) => {
    setLoadedMap((prev) => ({ ...prev, [id]: true }));
  };

  const handleImageError = (id: string) => {
    setErrorMap((prev) => ({ ...prev, [id]: true }));
  };

  return (
    <>
      <div
        className={`mt-1.5 overflow-hidden rounded-xl ${
          isSingle
            ? "max-w-[280px] sm:max-w-[340px]"
            : "grid grid-cols-2 gap-1.5 max-w-[280px] sm:max-w-[340px]"
        }`}
      >
        {attachments.map((att, index) => {
          const isLoaded = loadedMap[att.id];
          const isError = errorMap[att.id];

          return (
            <div
              key={att.id}
              onClick={() => !isError && setSelectedImageIndex(index)}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !isError) {
                  e.preventDefault();
                  setSelectedImageIndex(index);
                }
              }}
              tabIndex={isError ? -1 : 0}
              role="button"
              aria-label={`View full image: ${att.fileName}`}
              className={`group relative overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 ${
                isSingle ? "aspect-auto max-h-[360px]" : "aspect-square"
              }`}
            >
              {/* Skeleton Loader */}
              {!isLoaded && !isError && (
                <div className="absolute inset-0 flex items-center justify-center bg-zinc-200/60 dark:bg-zinc-800/80 animate-pulse">
                  <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
                </div>
              )}

              {/* Error State */}
              {isError && (
                <div className="flex h-32 flex-col items-center justify-center p-4 text-center bg-zinc-100 dark:bg-zinc-800/60 text-zinc-400">
                  <ImageOff className="h-6 w-6 mb-1 text-zinc-400" />
                  <span className="text-[11px]">Image unavailable</span>
                </div>
              )}

              {/* Image */}
              {!isError && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={att.signedUrl}
                  alt={att.fileName || "Chat attachment"}
                  onLoad={() => handleImageLoad(att.id)}
                  onError={() => handleImageError(att.id)}
                  className={`w-full object-cover transition-transform duration-300 group-hover:scale-105 ${
                    isSingle ? "max-h-[360px] object-contain bg-black/5 dark:bg-black/20" : "h-full"
                  } ${!isLoaded ? "opacity-0" : "opacity-100"}`}
                  loading="lazy"
                />
              )}

              {/* Hover overlay with eye icon */}
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

      {/* Image Viewer Lightbox */}
      <ImageViewer
        isOpen={selectedImageIndex !== null}
        attachments={attachments}
        initialIndex={selectedImageIndex || 0}
        onClose={() => setSelectedImageIndex(null)}
      />
    </>
  );
}
