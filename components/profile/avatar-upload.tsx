"use client";

import * as React from "react";
import { Camera, Loader2, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/avatar";

interface AvatarUploadProps {
  userId: string;
  currentAvatarUrl?: string | null;
  name: string;
  onAvatarUpdated: (newUrl: string) => void;
  disabled?: boolean;
}

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

// Resize and compress image client-side before upload
async function resizeImage(file: File, maxDimension: number = 512): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        // Calculate aspect ratio crop/fit to square
        const minEdge = Math.min(width, height);
        const startX = (width - minEdge) / 2;
        const startY = (height - minEdge) / 2;

        const targetSize = Math.min(minEdge, maxDimension);
        canvas.width = targetSize;
        canvas.height = targetSize;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas context error"));
          return;
        }

        ctx.drawImage(
          img,
          startX,
          startY,
          minEdge,
          minEdge,
          0,
          0,
          targetSize,
          targetSize
        );

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Image compression failed"));
            }
          },
          "image/webp",
          0.85
        );
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function AvatarUpload({
  userId,
  currentAvatarUrl,
  name,
  onAvatarUpdated,
  disabled = false,
}: AvatarUploadProps) {
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(currentAvatarUrl || null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const supabase = React.useMemo(() => createClient(), []);

  React.useEffect(() => {
    setAvatarUrl(currentAvatarUrl || null);
  }, [currentAvatarUrl]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setError("Please select a JPG, PNG, or WEBP image.");
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError("Image file size must be less than 5 MB.");
      return;
    }

    setIsUploading(true);

    try {
      // Compress and format to WebP
      const processedBlob = await resizeImage(file, 512);

      const filePath = `${userId}/avatar.webp`;

      // Upload to Supabase Storage 'avatars' bucket
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, processedBlob, {
          contentType: "image/webp",
          upsert: true,
        });

      if (uploadError) {
        setError(uploadError.message || "Failed to upload avatar image.");
        return;
      }

      // Get public URL with cache-busting timestamp
      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(filePath);

      const cacheBustedUrl = `${publicUrl}?t=${Date.now()}`;
      setAvatarUrl(cacheBustedUrl);
      onAvatarUpdated(cacheBustedUrl);
    } catch {
      setError("An error occurred while processing the image. Please try another.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="flex flex-col items-center space-y-2">
      <div className="relative group cursor-pointer">
        <Avatar
          src={avatarUrl}
          name={name}
          size="xl"
          className="ring-4 ring-zinc-100 dark:ring-zinc-800 transition-transform group-hover:scale-105"
        />

        {/* Overlay button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isUploading}
          className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500"
          aria-label="Upload profile picture"
          title="Upload new profile picture"
        >
          {isUploading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <Camera className="h-6 w-6" />
          )}
        </button>

        {/* Small floating badge */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isUploading}
          className="absolute bottom-0 right-0 rounded-full bg-heat-500 p-1.5 text-white shadow-md hover:bg-heat-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500"
          aria-label="Change photo"
        >
          {isUploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Camera className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/jpg"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || isUploading}
      />

      <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
        JPG, PNG, or WEBP (Max 5MB)
      </span>

      {error && (
        <div className="flex items-center gap-1.5 text-xs text-red-500 font-medium" role="alert">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
