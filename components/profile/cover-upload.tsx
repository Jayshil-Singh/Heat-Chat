"use client";

import * as React from "react";
import { Image as ImageIcon, Camera, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CoverUploadProps {
  currentCoverUrl?: string | null;
  onCoverUpdated: (newUrl: string) => void;
  disabled?: boolean;
}

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export function CoverUpload({
  currentCoverUrl,
  onCoverUpdated,
  disabled = false,
}: CoverUploadProps) {
  const [coverUrl, setCoverUrl] = React.useState<string | null>(currentCoverUrl || null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setCoverUrl(currentCoverUrl || null);
  }, [currentCoverUrl]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setError("Please select a JPEG, PNG, or WebP image.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError("Cover image must be 10 MB or smaller.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/profile/cover", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || "Failed to upload cover.");
      }

      setCoverUrl(data.coverUrl);
      onCoverUpdated(data.coverUrl);
    } catch (err: any) {
      console.error("[Heat Chat] Cover upload error:", err);
      setError(err.message || "Failed to upload cover image.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative h-44 w-full rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-gradient-to-r from-heat-500/20 via-amber-500/20 to-heat-600/20 group">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt="Profile Cover Banner"
            className="h-full w-full object-cover object-center"
          />
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-600">
            <ImageIcon className="h-8 w-8 mb-1 opacity-50" />
            <span className="text-xs font-medium">No cover image set</span>
          </div>
        )}

        {/* Overlay Upload Button */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled || isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="gap-2 text-xs shadow-lg backdrop-blur-md bg-white/90 dark:bg-zinc-900/90"
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin text-heat-500" />
            ) : (
              <Camera className="h-4 w-4 text-heat-500" />
            )}
            <span>{isUploading ? "Uploading..." : "Change Cover"}</span>
          </Button>
        </div>

        {isUploading && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center">
            <div className="flex items-center gap-2 rounded-full bg-zinc-900/90 px-4 py-2 text-xs text-white shadow-xl">
              <Loader2 className="h-4 w-4 animate-spin text-heat-500" />
              <span>Uploading cover...</span>
            </div>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileSelect}
        disabled={disabled || isUploading}
        aria-label="Upload profile cover photo"
      />

      {error && (
        <div className="flex items-center gap-1.5 text-xs text-red-500 dark:text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
