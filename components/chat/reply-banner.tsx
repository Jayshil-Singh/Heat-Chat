"use client";

import * as React from "react";
import { X, CornerUpLeft } from "lucide-react";
import type { ReplyPreviewData } from "@/types/chat";

interface ReplyBannerProps {
  replyTo: ReplyPreviewData;
  onCancel: () => void;
}

export function ReplyBanner({ replyTo, onCancel }: ReplyBannerProps) {
  return (
    <div
      className="flex items-start gap-2 border-l-[3px] border-heat-500 bg-heat-50/60 px-3 py-2 dark:bg-heat-950/25 mx-3 mb-1.5 rounded-r-lg"
      role="status"
      aria-label={`Replying to ${replyTo.senderName}`}
    >
      <CornerUpLeft
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-heat-500"
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <span className="text-[11px] font-semibold text-heat-600 dark:text-heat-400 block leading-tight">
          Replying to {replyTo.senderName}
        </span>
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400 block truncate leading-relaxed">
          {replyTo.isDeleted
            ? "Original message was deleted"
            : replyTo.content || "📷 Photo"}
        </span>
      </div>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel reply"
        className="shrink-0 rounded-full p-0.5 text-zinc-400 hover:text-zinc-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 dark:hover:text-zinc-200"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
