"use client";

import * as React from "react";
import { Send, Loader2, X, Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MAX_MESSAGE_LENGTH,
  validateMessageContent,
} from "@/lib/validation/message";
import { ReplyBanner } from "./reply-banner";
import type { ChatMessage, ReplyPreviewData } from "@/types/chat";

interface MessageComposerProps {
  /** Called for normal sends (and replies — active-chat adds reply context) */
  onSendMessage: (content: string) => Promise<{ success: boolean; error?: string }>;
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
}

export function MessageComposer({
  onSendMessage,
  onTyping,
  disabled = false,
  replyTo,
  onCancelReply,
  editingMessage,
  onSaveEdit,
  onCancelEdit,
}: MessageComposerProps) {
  const [content, setContent] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [validationError, setValidationError] = React.useState<string | null>(
    null
  );
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Draft storage — preserves the in-progress text when edit mode is entered/left
  const draftRef = React.useRef<string>("");
  const contentRef = React.useRef<string>("");
  React.useEffect(() => {
    contentRef.current = content;
  }, [content]);

  // Enter / leave edit mode
  React.useEffect(() => {
    if (editingMessage) {
      // Save current draft, pre-fill with message content
      draftRef.current = contentRef.current;
      setContent(editingMessage.content);
      setValidationError(null);
      setTimeout(() => {
        textareaRef.current?.focus();
        const len = editingMessage.content.length;
        textareaRef.current?.setSelectionRange(len, len);
      }, 50);
    } else {
      // Restore draft after exiting edit mode
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

  // Focus textarea when a new reply target is set.
  // Using replyTo?.messageId (not the full object) so focus only fires
  // when the reply target changes, not on every re-render.
  React.useEffect(() => {
    if (replyTo?.messageId) {
      textareaRef.current?.focus();
    }
  }, [replyTo?.messageId]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    setValidationError(null);
    if (onTyping && !editingMessage) {
      onTyping();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const trimmed = content.trim();
    if (!trimmed || isSubmitting || disabled) return;

    const error = validateMessageContent(trimmed);
    if (error) {
      setValidationError(error);
      return;
    }

    setIsSubmitting(true);
    setValidationError(null);

    try {
      if (editingMessage && onSaveEdit) {
        // Edit mode — save edit
        if (trimmed === editingMessage.content.trim()) {
          // No change — just cancel
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
        // Normal send (or reply — active-chat handles the reply context)
        const res = await onSendMessage(trimmed);
        if (res.success) {
          setContent("");
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

  const isOverLength = content.length > MAX_MESSAGE_LENGTH;
  const isNearLength = content.length > MAX_MESSAGE_LENGTH * 0.85;
  const isEditing = !!editingMessage;

  return (
    <div
      className={`shrink-0 border-t border-zinc-200 bg-white/95 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 safe-bottom ${
        isEditing
          ? "border-t-2 border-heat-400 dark:border-heat-600"
          : ""
      }`}
    >
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

      {/* Validation error */}
      {validationError && (
        <div className="px-4 pb-1 pt-1.5 text-xs font-medium text-red-500" role="alert">
          {validationError}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="flex items-end gap-2 p-3"
        aria-label={
          isEditing ? "Edit message form" : "Send message form"
        }
      >
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            rows={1}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={
              isEditing ? "Edit your message…" : "Type a message…"
            }
            disabled={disabled}
            aria-label={isEditing ? "Edit message text" : "Message text"}
            aria-multiline="true"
            className="flex w-full resize-none rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:border-heat-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-heat-500 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100 dark:placeholder:text-zinc-500 max-h-36 overflow-y-auto"
          />
          {isNearLength && (
            <span
              className={`absolute bottom-2 right-3 text-[10px] ${
                isOverLength
                  ? "font-bold text-red-500"
                  : "text-zinc-400"
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
              disabled={
                !content.trim() || isSubmitting || disabled || isOverLength
              }
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
          <Button
            type="submit"
            variant="heat"
            size="icon"
            disabled={
              !content.trim() || isSubmitting || disabled || isOverLength
            }
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
      </form>
    </div>
  );
}
