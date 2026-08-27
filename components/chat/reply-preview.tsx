"use client";

import * as React from "react";
import type { ReplyPreviewData } from "@/types/chat";

interface ReplyPreviewProps {
  replyPreview: ReplyPreviewData;
  isCurrentUser: boolean;
  onScrollToOriginal: (messageId: string) => void;
}

export function ReplyPreview({
  replyPreview,
  isCurrentUser,
  onScrollToOriginal,
}: ReplyPreviewProps) {
  return (
    <button
      type="button"
      onClick={() => onScrollToOriginal(replyPreview.messageId)}
      className={`mb-2 w-full cursor-pointer rounded-lg border-l-[3px] px-2.5 py-1.5 text-left text-[11px] transition-opacity hover:opacity-80 active:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
        isCurrentUser
          ? "border-white/60 bg-black/10 focus-visible:ring-white/50"
          : "border-heat-400 bg-zinc-100 dark:bg-zinc-700/60 focus-visible:ring-heat-500"
      }`}
      aria-label={`Reply to message from ${replyPreview.senderName}. Click to scroll to original message.`}
    >
      <span
        className={`block font-semibold leading-tight ${
          isCurrentUser
            ? "text-white/90"
            : "text-heat-600 dark:text-heat-400"
        }`}
      >
        {replyPreview.senderName}
      </span>
      <span
        className={`block truncate leading-relaxed ${
          isCurrentUser
            ? "text-white/70"
            : "text-zinc-500 dark:text-zinc-400"
        } ${replyPreview.isDeleted ? "italic" : ""}`}
      >
        {replyPreview.isDeleted
          ? "Original message was deleted"
          : replyPreview.content}
      </span>
    </button>
  );
}
