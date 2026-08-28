"use client";

import * as React from "react";
import { X, Loader2, AlertCircle } from "lucide-react";
import type { PendingAttachment } from "@/hooks/use-media-upload";

interface AttachmentPreviewProps {
  attachments: PendingAttachment[];
  onRemove: (id: string) => void;
  disabled?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentPreview({
  attachments,
  onRemove,
  disabled = false,
}: AttachmentPreviewProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2.5 px-4 pt-3 pb-1 border-t border-zinc-100 dark:border-zinc-800/60 bg-white/50 dark:bg-zinc-950/50">
      {attachments.map((att) => {
        const isProcessing = att.status === "processing";
        const isUploading = att.status === "uploading";
        const isFailed = att.status === "failed";
        const previewUrl = att.processed?.previewUrl;
        const fileName = att.processed?.originalFileName || att.originalFile.name;
        const fileSize = att.processed?.fileSize || att.originalFile.size;

        return (
          <div
            key={att.id}
            className={`relative flex items-center gap-2.5 rounded-xl border p-1.5 pr-3 max-w-[200px] shadow-2xs transition-all ${
              isFailed
                ? "border-red-300 bg-red-50/80 dark:border-red-900/60 dark:bg-red-950/40"
                : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
            }`}
          >
            {/* Thumbnail */}
            <div className="relative h-12 w-12 shrink-0 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt={fileName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Loader2 className="h-4 w-4 animate-spin text-heat-500" />
              )}

              {/* Status overlay */}
              {(isProcessing || isUploading) && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-2xs text-white">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              )}

              {isFailed && (
                <div className="absolute inset-0 flex items-center justify-center bg-red-600/60 text-white">
                  <AlertCircle className="h-4 w-4" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-zinc-900 dark:text-white" title={fileName}>
                {fileName}
              </p>
              <p className="text-[10px] text-zinc-400">
                {isFailed ? (
                  <span className="text-red-600 dark:text-red-400 font-medium">Failed</span>
                ) : (
                  formatBytes(fileSize)
                )}
              </p>
            </div>

            {/* Remove button */}
            <button
              type="button"
              onClick={() => onRemove(att.id)}
              disabled={disabled}
              className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500"
              aria-label={`Remove ${fileName}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
