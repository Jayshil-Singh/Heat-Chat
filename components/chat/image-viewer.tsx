"use client";

import * as React from "react";
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  ChevronLeft,
  ChevronRight,
  Maximize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AttachmentWithUrl } from "@/types/chat";

interface ImageViewerProps {
  isOpen: boolean;
  attachments: AttachmentWithUrl[];
  initialIndex?: number;
  onClose: () => void;
}

export function ImageViewer({
  isOpen,
  attachments,
  initialIndex = 0,
  onClose,
}: ImageViewerProps) {
  const [currentIndex, setCurrentIndex] = React.useState(initialIndex);
  const [scale, setScale] = React.useState(1);
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const modalRef = React.useRef<HTMLDivElement>(null);

  // Store active element when opening to restore focus on close
  React.useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement;
      setCurrentIndex(Math.max(0, Math.min(initialIndex, attachments.length - 1)));
      setScale(1);
    } else {
      setScale(1);
      if (triggerRef.current) {
        triggerRef.current.focus();
      }
    }
  }, [isOpen, initialIndex, attachments.length]);

  const currentAttachment = attachments[currentIndex];

  // Navigation
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < attachments.length - 1;

  const handlePrev = React.useCallback(() => {
    if (hasPrev) {
      setCurrentIndex((i) => i - 1);
      setScale(1);
    }
  }, [hasPrev]);

  const handleNext = React.useCallback(() => {
    if (hasNext) {
      setCurrentIndex((i) => i + 1);
      setScale(1);
    }
  }, [hasNext]);

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.25, 3));
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.25, 0.5));
  const handleResetZoom = () => setScale(1);

  // Keyboard navigation & Shortcuts
  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === "-") {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        handleResetZoom();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handlePrev, handleNext, onClose]);

  // Secure Download Handler using authorized signed URL
  const handleDownload = async () => {
    if (!currentAttachment?.signedUrl) return;
    try {
      const response = await fetch(currentAttachment.signedUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = currentAttachment.fileName || "image";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      // Fallback
      window.open(currentAttachment.signedUrl, "_blank");
    }
  };

  if (!isOpen || !currentAttachment) return null;

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Image viewer - ${currentAttachment.fileName}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-200 select-none"
      onClick={onClose}
    >
      {/* Top Controls Bar */}
      <div
        className="absolute top-0 inset-x-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 min-w-0">
          <p className="truncate text-xs font-semibold text-zinc-200 max-w-[200px] sm:max-w-xs md:max-w-md">
            {currentAttachment.fileName}
          </p>
          {attachments.length > 1 && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-zinc-300">
              {currentIndex + 1} / {attachments.length}
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={handleZoomIn}
            className="text-zinc-300 hover:text-white hover:bg-white/10 h-8 w-8"
            title="Zoom in (+)"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>

          <Button
            size="icon-sm"
            variant="ghost"
            onClick={handleZoomOut}
            className="text-zinc-300 hover:text-white hover:bg-white/10 h-8 w-8"
            title="Zoom out (-)"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>

          {scale !== 1 && (
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={handleResetZoom}
              className="text-zinc-300 hover:text-white hover:bg-white/10 h-8 w-8 text-xs font-bold"
              title="Reset zoom (0)"
              aria-label="Reset zoom"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}

          <Button
            size="icon-sm"
            variant="ghost"
            onClick={handleDownload}
            className="text-zinc-300 hover:text-white hover:bg-white/10 h-8 w-8"
            title="Download image"
            aria-label="Download image"
          >
            <Download className="h-4 w-4" />
          </Button>

          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onClose}
            className="text-zinc-300 hover:text-white hover:bg-white/10 h-8 w-8 ml-1"
            title="Close viewer (Esc)"
            aria-label="Close image viewer"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Main Image Display */}
      <div
        className="relative flex h-full w-full items-center justify-center p-4 overflow-hidden"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={currentAttachment.signedUrl}
          alt={currentAttachment.fileName}
          style={{
            transform: `scale(${scale})`,
            transition: scale === 1 ? "transform 0.2s ease-out" : "none",
          }}
          className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg shadow-2xl transition-transform"
          onClick={(e) => e.stopPropagation()}
          draggable={false}
        />
      </div>

      {/* Previous / Next Arrow Controls */}
      {attachments.length > 1 && (
        <>
          {hasPrev && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2.5 text-white/80 hover:bg-black/80 hover:text-white backdrop-blur-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500"
              title="Previous image (Left Arrow)"
              aria-label="Previous image"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          {hasNext && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2.5 text-white/80 hover:bg-black/80 hover:text-white backdrop-blur-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500"
              title="Next image (Right Arrow)"
              aria-label="Next image"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}
        </>
      )}
    </div>
  );
}
