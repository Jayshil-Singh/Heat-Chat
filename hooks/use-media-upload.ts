"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import {
  processImageFile,
  validateImageFile,
  MAX_ATTACHMENTS_PER_MESSAGE,
  type ProcessedImage,
} from "@/lib/media/image-processor";
import type { Attachment } from "@/types/database";

export interface PendingAttachment {
  id: string;
  originalFile: File;
  processed?: ProcessedImage;
  status: "processing" | "ready" | "uploading" | "uploaded" | "failed";
  progress: number;
  error?: string;
}

export function useMediaUpload() {
  const [stagedAttachments, setStagedAttachments] = React.useState<PendingAttachment[]>([]);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);

  const supabase = React.useMemo(() => createClient(), []);

  // Cleanup object URLs when component unmounts
  React.useEffect(() => {
    return () => {
      stagedAttachments.forEach((att) => {
        if (att.processed?.previewUrl) {
          URL.revokeObjectURL(att.processed.previewUrl);
        }
      });
    };
  }, [stagedAttachments]);

  const addFiles = React.useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setUploadError(null);

    const currentCount = stagedAttachments.length;
    const availableSlots = MAX_ATTACHMENTS_PER_MESSAGE - currentCount;

    if (availableSlots <= 0) {
      setUploadError(`Maximum of ${MAX_ATTACHMENTS_PER_MESSAGE} images allowed per message.`);
      return;
    }

    const filesToProcess = fileArray.slice(0, availableSlots);
    if (fileArray.length > availableSlots) {
      setUploadError(`Only ${availableSlots} more image(s) could be added (max ${MAX_ATTACHMENTS_PER_MESSAGE}).`);
    }

    setIsProcessing(true);

    const newPendingItems: PendingAttachment[] = filesToProcess.map((f) => ({
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      originalFile: f,
      status: "processing",
      progress: 0,
    }));

    setStagedAttachments((prev) => [...prev, ...newPendingItems]);

    // Process images sequentially / in parallel
    for (const item of newPendingItems) {
      try {
        const processed = await processImageFile(item.originalFile);
        setStagedAttachments((prev) =>
          prev.map((att) =>
            att.id === item.id
              ? { ...att, processed, status: "ready" as const, progress: 0 }
              : att
          )
        );
      } catch (err: any) {
        setStagedAttachments((prev) =>
          prev.map((att) =>
            att.id === item.id
              ? { ...att, status: "failed" as const, error: err.message || "Failed to process image." }
              : att
          )
        );
      }
    }

    setIsProcessing(false);
  }, [stagedAttachments.length]);

  const removeAttachment = React.useCallback((id: string) => {
    setStagedAttachments((prev) => {
      const item = prev.find((a) => a.id === id);
      if (item?.processed?.previewUrl) {
        URL.revokeObjectURL(item.processed.previewUrl);
      }
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const clearAll = React.useCallback(() => {
    stagedAttachments.forEach((att) => {
      if (att.processed?.previewUrl) {
        URL.revokeObjectURL(att.processed.previewUrl);
      }
    });
    setStagedAttachments([]);
    setUploadError(null);
  }, [stagedAttachments]);

  /**
   * Upload all staged ready/failed attachments to Supabase Storage and
   * insert attachment records into PostgreSQL.
   */
  const uploadAll = React.useCallback(
    async (
      conversationId: string,
      messageId: string
    ): Promise<{
      success: boolean;
      attachments: Array<{
        storage_path: string;
        file_name: string;
        file_type: string;
        file_size: number;
        width?: number | null;
        height?: number | null;
      }>;
      error?: string;
    }> => {
      const readyItems = stagedAttachments.filter(
        (att) => (att.status === "ready" || att.status === "failed") && att.processed
      );

      if (readyItems.length === 0) {
        return { success: true, attachments: [] };
      }

      setIsUploading(true);
      setUploadError(null);

      const uploadedResults: Array<{
        storage_path: string;
        file_name: string;
        file_type: string;
        file_size: number;
        width?: number | null;
        height?: number | null;
      }> = [];

      const createdStoragePaths: string[] = [];

      try {
        for (const item of readyItems) {
          const processed = item.processed!;
          const storagePath = `${conversationId}/${messageId}/${processed.fileName}`;

          setStagedAttachments((prev) =>
            prev.map((a) => (a.id === item.id ? { ...a, status: "uploading", progress: 30 } : a))
          );

          // Upload to private chat-attachments bucket
          const { error: uploadErr } = await supabase.storage
            .from("chat-attachments")
            .upload(storagePath, processed.file, {
              contentType: processed.mimeType,
              upsert: false,
            });

          if (uploadErr) {
            setStagedAttachments((prev) =>
              prev.map((a) =>
                a.id === item.id
                  ? { ...a, status: "failed", error: uploadErr.message }
                  : a
              )
            );
            throw new Error(`Upload failed for ${processed.originalFileName}: ${uploadErr.message}`);
          }

          createdStoragePaths.push(storagePath);

          setStagedAttachments((prev) =>
            prev.map((a) => (a.id === item.id ? { ...a, status: "uploaded", progress: 100 } : a))
          );

          uploadedResults.push({
            storage_path: storagePath,
            file_name: processed.originalFileName,
            file_type: processed.mimeType,
            file_size: processed.fileSize,
            width: processed.width,
            height: processed.height,
          });
        }

        return { success: true, attachments: uploadedResults };
      } catch (err: any) {
        // Compensating action: attempt to remove any uploaded storage files if error occurred
        if (createdStoragePaths.length > 0) {
          try {
            await supabase.storage.from("chat-attachments").remove(createdStoragePaths);
          } catch {
            // Ignore cleanup failure
          }
        }

        const errorMsg = err.message || "Failed to upload attachments.";
        setUploadError(errorMsg);
        return { success: false, attachments: [], error: errorMsg };
      } finally {
        setIsUploading(false);
      }
    },
    [stagedAttachments, supabase]
  );

  return {
    stagedAttachments,
    isProcessing,
    isUploading,
    uploadError,
    addFiles,
    removeAttachment,
    clearAll,
    uploadAll,
  };
}
