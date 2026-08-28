/**
 * Heat Chat — Client-Side Image Processor & Validator
 */

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_IMAGE_DIMENSION = 2048; // Max width or height in px
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

export const SUPPORTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const SUPPORTED_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
] as const;

export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

export interface ProcessedImage {
  file: File;
  fileName: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  width: number;
  height: number;
  previewUrl: string;
}

export interface ImageValidationError {
  code: "INVALID_MIME" | "INVALID_EXT" | "FILE_TOO_LARGE" | "DECODE_FAILED" | "DIMENSION_INVALID";
  message: string;
}

/**
 * Validate file type, extension, and file size before decoding
 */
export function validateImageFile(file: File): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: "No file selected." };
  }

  // 1. File size check
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `Image is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum size is 10 MB.`,
    };
  }

  // 2. MIME type check
  if (!SUPPORTED_MIME_TYPES.includes(file.type as SupportedMimeType)) {
    return {
      valid: false,
      error: `Unsupported image type "${file.type || "unknown"}". Supported formats: JPG, PNG, WebP.`,
    };
  }

  // 3. Extension check
  const ext = getFileExtension(file.name).toLowerCase();
  const validExt = SUPPORTED_EXTENSIONS.some((e) => e === ext || (ext === ".jpeg" && e === ".jpg"));
  if (!validExt && !SUPPORTED_EXTENSIONS.includes(ext as any)) {
    return {
      valid: false,
      error: `Invalid file extension "${ext}". Supported extensions: .jpg, .jpeg, .png, .webp.`,
    };
  }

  return { valid: true };
}

/**
 * Extract clean file extension (including the dot, e.g. ".jpg")
 */
export function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot === -1) return "";
  return fileName.slice(lastDot).toLowerCase();
}

/**
 * Generate a safe, sanitized storage file key: <randomId><ext>
 */
export function generateSafeStorageFileName(originalFileName: string): string {
  const ext = getFileExtension(originalFileName) || ".jpg";
  const cleanExt = SUPPORTED_EXTENSIONS.includes(ext as any) ? ext : ".jpg";
  const randomPart = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  return `${randomPart}${cleanExt}`;
}

/**
 * Decodes, resizes (if needed), and compresses image client-side.
 * Returns ProcessedImage with metadata and object preview URL.
 */
export async function processImageFile(file: File): Promise<ProcessedImage> {
  const validation = validateImageFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      try {
        const origWidth = img.naturalWidth || img.width;
        const origHeight = img.naturalHeight || img.height;

        if (!origWidth || !origHeight || origWidth <= 0 || origHeight <= 0) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error("Unable to determine image dimensions. File may be corrupted."));
          return;
        }

        // Calculate constrained dimensions
        let targetWidth = origWidth;
        let targetHeight = origHeight;

        if (origWidth > MAX_IMAGE_DIMENSION || origHeight > MAX_IMAGE_DIMENSION) {
          if (origWidth >= origHeight) {
            targetWidth = MAX_IMAGE_DIMENSION;
            targetHeight = Math.round((origHeight / origWidth) * MAX_IMAGE_DIMENSION);
          } else {
            targetHeight = MAX_IMAGE_DIMENSION;
            targetWidth = Math.round((origWidth / origHeight) * MAX_IMAGE_DIMENSION);
          }
        }

        // If no resizing needed and file is small (< 2MB), keep original file
        if (targetWidth === origWidth && targetHeight === origHeight && file.size < 2 * 1024 * 1024) {
          resolve({
            file,
            fileName: generateSafeStorageFileName(file.name),
            originalFileName: file.name,
            mimeType: file.type,
            fileSize: file.size,
            width: origWidth,
            height: origHeight,
            previewUrl: objectUrl,
          });
          return;
        }

        // Use canvas to resize / compress
        const canvas = document.createElement("canvas");
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          resolve({
            file,
            fileName: generateSafeStorageFileName(file.name),
            originalFileName: file.name,
            mimeType: file.type,
            fileSize: file.size,
            width: origWidth,
            height: origHeight,
            previewUrl: objectUrl,
          });
          return;
        }

        // Draw image onto canvas
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        // Determine output MIME type: preserve PNG transparency, else compress
        const outputMime = file.type === "image/png" ? "image/png" : "image/jpeg";
        const quality = outputMime === "image/jpeg" ? 0.85 : undefined;

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve({
                file,
                fileName: generateSafeStorageFileName(file.name),
                originalFileName: file.name,
                mimeType: file.type,
                fileSize: file.size,
                width: targetWidth,
                height: targetHeight,
                previewUrl: objectUrl,
              });
              return;
            }

            const processedFile = new File([blob], file.name, {
              type: outputMime,
              lastModified: Date.now(),
            });

            resolve({
              file: processedFile,
              fileName: generateSafeStorageFileName(file.name),
              originalFileName: file.name,
              mimeType: outputMime,
              fileSize: processedFile.size,
              width: targetWidth,
              height: targetHeight,
              previewUrl: objectUrl,
            });
          },
          outputMime,
          quality
        );
      } catch (err: any) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error(err.message || "Failed to process image."));
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to decode image. Please check the file and try again."));
    };

    img.src = objectUrl;
  });
}
