"use client";

import * as React from "react";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_MESSAGE_LENGTH, validateMessageContent } from "@/lib/validation/message";

interface MessageComposerProps {
  onSendMessage: (content: string) => Promise<{ success: boolean; error?: string }>;
  onTyping?: () => void;
  disabled?: boolean;
}

export function MessageComposer({
  onSendMessage,
  onTyping,
  disabled = false,
}: MessageComposerProps) {
  const [content, setContent] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea height based on content
  React.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 140)}px`;
    }
  }, [content]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    setValidationError(null);
    if (onTyping) {
      onTyping();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Send on Enter (without Shift)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
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
    } finally {
      setIsSubmitting(false);
    }
  };

  const isOverLength = content.length > MAX_MESSAGE_LENGTH;
  const isNearLength = content.length > MAX_MESSAGE_LENGTH * 0.85;

  return (
    <div className="border-t border-zinc-200 bg-white/95 p-3 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 shrink-0 safe-bottom">
      {validationError && (
        <div className="mb-2 px-2 text-xs font-medium text-red-500" role="alert">
          {validationError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            rows={1}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={disabled}
            aria-label="Message text"
            className="flex w-full resize-none rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:border-heat-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-heat-500 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100 dark:placeholder:text-zinc-500 max-h-36 overflow-y-auto"
          />

          {isNearLength && (
            <span
              className={`absolute bottom-2 right-3 text-[10px] ${
                isOverLength ? "text-red-500 font-bold" : "text-zinc-400"
              }`}
            >
              {content.length}/{MAX_MESSAGE_LENGTH}
            </span>
          )}
        </div>

        <Button
          type="submit"
          variant="heat"
          size="icon"
          disabled={!content.trim() || isSubmitting || disabled || isOverLength}
          aria-label="Send message"
          className="h-10 w-10 shrink-0 rounded-2xl shadow-sm"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>
    </div>
  );
}
