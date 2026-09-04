"use client";

import * as React from "react";
import { Send, Loader2, X, Check, Pencil, ImagePlus, Mic, BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MAX_MESSAGE_LENGTH,
  validateMessageContent,
} from "@/lib/validation/message";
import { ReplyBanner } from "./reply-banner";
import { AttachmentPreview } from "./attachment-preview";
import { VoiceRecorderBar } from "./voice-recorder-bar";
import { MentionAutocomplete } from "@/components/mentions/mention-autocomplete";
import { useMediaUpload, type PendingAttachment } from "@/hooks/use-media-upload";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { useMentions } from "@/hooks/use-mentions";
import type { ChatMessage, ReplyPreviewData } from "@/types/chat";

interface MessageComposerProps {
  conversationId?: string;
  isGroup?: boolean;
  onOpenCreatePoll?: () => void;
  /** Called for normal sends (and replies — active-chat adds reply context) */
  onSendMessage: (
    content: string,
    stagedAttachments?: PendingAttachment[]
  ) => Promise<{ success: boolean; error?: string }>;
  onTyping?: () => void;
  disabled?: boolean;
  /** When set, a reply banner is shown and the send clears reply state */
  replyTo?: ReplyPreviewData | null;
  onCancelReply?: () => void;
  /** When set, the composer enters inline edit mode */
  editingMessage?: ChatMessage | null;
  onSaveEdit?: (
    messageId: string,
    content: string
  ) => Promise<{ success: boolean; error?: string }>;
  onCancelEdit?: () => void;
  /** Draft autosave & restore */
  initialDraft?: { content: string; reply_to_message_id?: string | null } | null;
  onSaveDraft?: (content: string, replyToMessageId?: string | null) => void;
  onDeleteDraft?: () => void;
}

export function MessageComposer({
  conversationId,
  isGroup,
  onOpenCreatePoll,
  onSendMessage,
  onTyping,
  disabled = false,
  replyTo,
  onCancelReply,
  editingMessage,
  onSaveEdit,
  onCancelEdit,
  initialDraft,
  onSaveDraft,
  onDeleteDraft,
}: MessageComposerProps) {
  const [content, setContent] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = React.useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = React.useState(false);
  const [voiceUploadState, setVoiceUploadState] = React.useState<"idle" | "uploading" | "failed">("idle");
  const [voiceUploadError, setVoiceUploadError] = React.useState<string | null>(null);
  // Stored so we can retry after upload failure without losing the recording
  const voiceSendDataRef = React.useRef<{ blob: Blob; mimeType: string; durationSeconds: number } | null>(null);

  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const mentions = useMentions({ conversationId: conversationId || "" });

  const {
    stagedAttachments,
    isProcessing: isMediaProcessing,
    isUploading: isMediaUploading,
    uploadError: mediaUploadError,
    addFiles,
    removeAttachment,
    clearAll: clearAttachments,
  } = useMediaUpload();

  const voiceRecorder = useVoiceRecorder();

  // Discard voice recorder when leaving a conversation or unmounting
  const conversationIdRef = React.useRef(conversationId);
  const voiceDiscardRef = React.useRef(voiceRecorder.discard);
  voiceDiscardRef.current = voiceRecorder.discard;

  React.useEffect(() => {
    if (conversationIdRef.current !== conversationId) {
      conversationIdRef.current = conversationId;
      voiceDiscardRef.current();
      setShowVoiceRecorder(false);
    }
  }, [conversationId]);

  React.useEffect(() => {
    return () => {
      voiceDiscardRef.current();
    };
  }, []);

  // Draft storage — preserves the in-progress text when edit mode is entered/left
  const draftRef = React.useRef<string>("");
  const contentRef = React.useRef<string>("");
  const draftTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftSavedTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRestoredRef = React.useRef(false);
  const [draftStatus, setDraftStatus] = React.useState<"idle" | "saving" | "saved">("idle");

  React.useEffect(() => {
    contentRef.current = content;
  }, [content]);

  // Restore initial draft when conversation loads
  React.useEffect(() => {
    if (initialDraft?.content && !content && !editingMessage && !draftRestoredRef.current) {
      setContent(initialDraft.content);
      draftRestoredRef.current = true;
    }
  }, [initialDraft?.content, content, editingMessage]);

  // Debounced server draft autosave (~750ms of inactivity)
  React.useEffect(() => {
    if (editingMessage) return; // Never overwrite drafts with message edit content

    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current);
    }

    if (content.trim()) {
      setDraftStatus("saving");
    } else {
      setDraftStatus("idle");
    }

    draftTimerRef.current = setTimeout(async () => {
      const trimmed = content.trim();
      if (trimmed) {
        try {
          await onSaveDraft?.(trimmed, replyTo?.messageId || null);
          setDraftStatus("saved");
          if (draftSavedTimeoutRef.current) clearTimeout(draftSavedTimeoutRef.current);
          draftSavedTimeoutRef.current = setTimeout(() => {
            setDraftStatus("idle");
          }, 2000);
        } catch {
          setDraftStatus("idle");
        }
      } else if (onDeleteDraft) {
        onDeleteDraft();
        setDraftStatus("idle");
      }
    }, 750);

    return () => {
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current);
      }
    };
  }, [content, replyTo?.messageId, editingMessage, onSaveDraft, onDeleteDraft]);

  // Enter / leave edit mode
  React.useEffect(() => {
    if (editingMessage) {
      draftRef.current = contentRef.current;
      setContent(editingMessage.content);
      setValidationError(null);
      setTimeout(() => {
        textareaRef.current?.focus();
        const len = editingMessage.content.length;
        textareaRef.current?.setSelectionRange(len, len);
      }, 50);
    } else {
      setContent(draftRef.current);
      draftRef.current = "";
      setValidationError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingMessage?.id]);

  // Auto-resize textarea
  React.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 140)}px`;
    }
  }, [content]);

  // Focus textarea on reply
  React.useEffect(() => {
    if (replyTo?.messageId) {
      textareaRef.current?.focus();
    }
  }, [replyTo?.messageId]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    setValidationError(null);
    mentions.handleTextChange(val, e.target.selectionStart || 0);
    if (onTyping && !editingMessage) {
      onTyping();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentions.isOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        mentions.setSelectedIndex((prev) =>
          mentions.candidates.length > 0 ? (prev + 1) % mentions.candidates.length : 0
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        mentions.setSelectedIndex((prev) =>
          mentions.candidates.length > 0
            ? prev - 1 < 0
              ? mentions.candidates.length - 1
              : prev - 1
            : 0
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const selected = mentions.candidates[mentions.selectedIndex];
        if (selected) {
          const { newText, newCursor } = mentions.selectCandidate(selected, content);
          setContent(newText);
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.selectionStart = newCursor;
              textareaRef.current.selectionEnd = newCursor;
              textareaRef.current.focus();
            }
          }, 10);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        mentions.closeAutocomplete();
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      if (editingMessage && onCancelEdit) {
        onCancelEdit();
      } else if (replyTo && onCancelReply) {
        onCancelReply();
      }
    }
  };

  // Clipboard paste support for images
  const handlePaste = (e: React.ClipboardEvent) => {
    if (editingMessage) return; // Don't paste attachments in edit mode
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (imageFiles.length > 0) {
      addFiles(imageFiles);
    }
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    if (editingMessage) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (editingMessage) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
      e.target.value = ""; // Reset input so same file can be re-selected if removed
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const trimmed = content.trim();
    const readyAttachments = stagedAttachments.filter(
      (a) => a.status === "ready" && a.processed
    );

    // Cannot submit if both text and attachments are empty
    if ((!trimmed && readyAttachments.length === 0) || isSubmitting || disabled) {
      return;
    }

    // If text exists, validate length
    if (trimmed) {
      const error = validateMessageContent(trimmed);
      if (error) {
        setValidationError(error);
        return;
      }
    }

    setIsSubmitting(true);
    setValidationError(null);

    try {
      if (editingMessage && onSaveEdit) {
        // Edit mode
        if (trimmed === editingMessage.content.trim()) {
          onCancelEdit?.();
          return;
        }
        const res = await onSaveEdit(editingMessage.id, trimmed);
        if (res.success) {
          setContent("");
          onCancelEdit?.();
        } else if (res.error) {
          setValidationError(res.error);
        }
      } else {
        // Normal send or reply (with optional attachments)
        const res = await onSendMessage(trimmed, readyAttachments);
        if (res.success) {
          if (draftTimerRef.current) {
            clearTimeout(draftTimerRef.current);
          }
          if (draftSavedTimeoutRef.current) {
            clearTimeout(draftSavedTimeoutRef.current);
          }
          onDeleteDraft?.();
          setDraftStatus("idle");
          setContent("");
          clearAttachments();
          if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.focus();
          }
        } else if (res.error) {
          setValidationError(res.error);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Voice recording handlers ────────────────────────────────────────────────

  const handleVoiceSend = React.useCallback(
    async (blob: Blob, mimeType: string, durationSeconds: number) => {
      voiceSendDataRef.current = { blob, mimeType, durationSeconds };
      setVoiceUploadState("uploading");
      setVoiceUploadError(null);

      const ext = mimeType.includes("ogg")
        ? ".ogg"
        : mimeType.includes("mp4") || mimeType.includes("m4a")
        ? ".mp4"
        : ".webm";
      const voiceFile = new File([blob], `voice_message${ext}`, {
        type: mimeType,
        lastModified: Date.now(),
      });
      const voiceAttachment: PendingAttachment = {
        id: `voice_${Date.now()}`,
        originalFile: voiceFile,
        processed: {
          file: voiceFile,
          fileName: `${crypto.randomUUID()}${ext}`,
          originalFileName: voiceFile.name,
          mimeType,
          fileSize: blob.size,
          width: 0,
          height: 0,
          previewUrl: "",
          // durationSeconds is carried as a runtime-only extra field for the
          // upload handler; it is not part of the ProcessedMedia type but is
          // harmlessly ignored by TypeScript via the cast below.
          ...(({ durationSeconds } as unknown) as Record<string, unknown>),
        } as PendingAttachment["processed"],
        status: "ready" as const,
        progress: 0,
      };

      try {
        const res = await onSendMessage("", [voiceAttachment]);
        if (res.success) {
          // Success — release mic and return to normal composer
          voiceRecorder.discard();
          voiceSendDataRef.current = null;
          setVoiceUploadState("idle");
          setVoiceUploadError(null);
          setShowVoiceRecorder(false);
        } else {
          // Upload-level failure — keep blob so user can retry
          setVoiceUploadState("failed");
          setVoiceUploadError(res.error || "Upload failed. Please retry.");
        }
      } catch (err: unknown) {
        setVoiceUploadState("failed");
        setVoiceUploadError(
          err instanceof Error ? err.message : "Upload failed. Please retry."
        );
      }
    },
    [onSendMessage, voiceRecorder]
  );

  const handleVoiceDiscard = React.useCallback(() => {
    voiceRecorder.discard();
    voiceSendDataRef.current = null;
    setVoiceUploadState("idle");
    setVoiceUploadError(null);
    setShowVoiceRecorder(false);
  }, [voiceRecorder]);

  const handleVoiceRetry = React.useCallback(async () => {
    const data = voiceSendDataRef.current;
    if (!data) return;
    await handleVoiceSend(data.blob, data.mimeType, data.durationSeconds);
  }, [handleVoiceSend]);

  // ── Derived state ────────────────────────────────────────────────────────────

  const isOverLength = content.length > MAX_MESSAGE_LENGTH;
  const isNearLength = content.length > MAX_MESSAGE_LENGTH * 0.85;
  const isEditing = !!editingMessage;
  const hasValidInput = content.trim().length > 0 || stagedAttachments.some((a) => a.status === "ready");

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative shrink-0 border-t border-zinc-200 bg-white/95 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 safe-bottom transition-colors ${
        isEditing ? "border-t-2 border-heat-400 dark:border-heat-600" : ""
      } ${isDraggingOver ? "bg-heat-50/60 dark:bg-heat-950/40 ring-2 ring-inset ring-heat-500" : ""}`}
    >
      {/* Draft status indicator */}
      {!isEditing && draftStatus !== "idle" && (
        <div className="flex items-center justify-end px-4 pt-1">
          {draftStatus === "saving" && (
            <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 animate-pulse">
              Saving draft…
            </span>
          )}
          {draftStatus === "saved" && (
            <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              Draft saved
            </span>
          )}
        </div>
      )}

      {/* Hidden File Input — accepts images, video, audio, and common docs */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        multiple
        accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/ogg,audio/mpeg,audio/ogg,audio/wav,audio/webm,application/pdf,text/plain,application/zip"
        className="hidden"
        aria-hidden="true"
      />

      {/* Drag & Drop Visual Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-heat-500/10 backdrop-blur-2xs text-heat-600 dark:text-heat-400 font-semibold text-xs pointer-events-none">
          Drop image files here to attach
        </div>
      )}

      {/* Edit mode header */}
      {isEditing && (
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-1.5 dark:border-zinc-800">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-heat-600 dark:text-heat-400">
            <Pencil className="h-3 w-3" aria-hidden="true" />
            <span>Editing message</span>
          </div>
          <button
            type="button"
            onClick={onCancelEdit}
            aria-label="Cancel editing"
            className="rounded-full p-0.5 text-zinc-400 hover:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 dark:hover:text-zinc-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Reply banner */}
      {!isEditing && replyTo && (
        <ReplyBanner replyTo={replyTo} onCancel={onCancelReply || (() => {})} />
      )}

      {/* Staged Attachments Preview */}
      {!isEditing && (
        <AttachmentPreview
          attachments={stagedAttachments}
          onRemove={removeAttachment}
          disabled={isSubmitting || disabled}
        />
      )}

      {/* Errors (validation or media upload) — shown above both voice and text states */}
      {(validationError || mediaUploadError) && (
        <div className="px-4 pb-1 pt-1.5 text-xs font-medium text-red-500" role="alert">
          {validationError || mediaUploadError}
        </div>
      )}

      {/*
       * ── EXCLUSIVE RENDER ──────────────────────────────────────────────────
       * Voice recorder OR normal form — never both at the same time.
       * showVoiceRecorder is only true while the user is actively recording,
       * previewing, uploading, or retrying a voice message.
       * ──────────────────────────────────────────────────────────────────── */}
      {showVoiceRecorder && !isEditing ? (
        <VoiceRecorderBar
          recorder={voiceRecorder}
          disabled={disabled || isSubmitting}
          uploadState={voiceUploadState}
          uploadError={voiceUploadError ?? undefined}
          onSend={handleVoiceSend}
          onDiscard={handleVoiceDiscard}
          onRetry={handleVoiceRetry}
        />
      ) : (
        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-2 p-3"
          aria-label={isEditing ? "Edit message form" : "Send message form"}
        >
          {/* Attachment picker trigger button */}
          {!isEditing && (
            <div className="flex items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || isSubmitting || isMediaProcessing}
                title="Attach files"
                aria-label="Attach files"
                className="h-10 w-10 shrink-0 rounded-2xl text-zinc-500 hover:text-heat-600 hover:bg-heat-50 dark:hover:bg-zinc-800 transition-colors"
              >
                {isMediaProcessing ? (
                  <Loader2 className="h-5 w-5 animate-spin text-heat-500" />
                ) : (
                  <ImagePlus className="h-5 w-5" />
                )}
              </Button>

              {isGroup && onOpenCreatePoll && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onOpenCreatePoll}
                  disabled={disabled || isSubmitting}
                  title="Create a poll"
                  aria-label="Create a poll"
                  className="h-10 w-10 shrink-0 rounded-2xl text-zinc-500 hover:text-heat-600 hover:bg-heat-50 dark:hover:bg-zinc-800 transition-colors hidden sm:flex"
                >
                  <BarChart2 className="h-5 w-5" />
                </Button>
              )}
            </div>
          )}

          <div className="relative flex-1">
            {/* Mention Autocomplete popover */}
            <MentionAutocomplete
              isOpen={mentions.isOpen}
              candidates={mentions.candidates}
              selectedIndex={mentions.selectedIndex}
              onSelect={(candidate) => {
                const { newText, newCursor } = mentions.selectCandidate(candidate, content);
                setContent(newText);
                setTimeout(() => {
                  if (textareaRef.current) {
                    textareaRef.current.selectionStart = newCursor;
                    textareaRef.current.selectionEnd = newCursor;
                    textareaRef.current.focus();
                  }
                }, 10);
              }}
              onClose={mentions.closeAutocomplete}
            />

            <textarea
              ref={textareaRef}
              rows={1}
              value={content}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                isEditing
                  ? "Edit your message…"
                  : stagedAttachments.length > 0
                  ? "Add a caption… (optional)"
                  : "Type a message…"
              }
              disabled={disabled}
              aria-label={isEditing ? "Edit message text" : "Message text"}
              aria-multiline="true"
              className="flex w-full resize-none rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:border-heat-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-heat-500 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100 dark:placeholder:text-zinc-500 max-h-36 overflow-y-auto"
            />
            {isNearLength && (
              <span
                className={`absolute bottom-2 right-3 text-[10px] ${
                  isOverLength ? "font-bold text-red-500" : "text-zinc-400"
                }`}
                aria-live="polite"
              >
                {content.length}/{MAX_MESSAGE_LENGTH}
              </span>
            )}
          </div>

          {/* Edit mode: Cancel + Save buttons */}
          {isEditing ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={onCancelEdit}
                aria-label="Cancel editing"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                Cancel
              </button>
              <Button
                type="submit"
                variant="heat"
                size="icon"
                disabled={!content.trim() || isSubmitting || disabled || isOverLength}
                aria-label="Save edit"
                className="h-10 w-10 shrink-0 rounded-2xl shadow-sm"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
              </Button>
            </div>
          ) : (
            <>
              {/* Mic button — shown when no text typed and no attachments staged */}
              {!content.trim() && stagedAttachments.length === 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowVoiceRecorder(true);
                    voiceRecorder.start();
                  }}
                  disabled={disabled || isSubmitting}
                  aria-label="Record voice message"
                  className="h-10 w-10 shrink-0 rounded-2xl text-zinc-500 hover:text-heat-600 hover:bg-heat-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  <Mic className="h-5 w-5" />
                </Button>
              )}
              {/* Send button — shown when there is text or attachments */}
              {(content.trim() || stagedAttachments.length > 0) && (
                <Button
                  type="submit"
                  variant="heat"
                  size="icon"
                  disabled={!hasValidInput || isSubmitting || disabled || isOverLength || isMediaProcessing}
                  aria-label="Send message"
                  className="h-10 w-10 shrink-0 rounded-2xl shadow-sm"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              )}
            </>
          )}
        </form>
      )}
    </div>
  );
}
