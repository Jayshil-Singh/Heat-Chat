"use client";

import * as React from "react";
import type { ReactionType } from "@/types/database";
import type { ReactionSummary } from "@/types/chat";

interface MessageReactionsProps {
  reactions: ReactionSummary[];
  currentUserId: string;
  isCurrentUser: boolean;
  onToggleReaction: (reaction: ReactionType) => void;
}

export function MessageReactions({
  reactions,
  currentUserId,
  isCurrentUser,
  onToggleReaction,
}: MessageReactionsProps) {
  if (!reactions || reactions.length === 0) return null;

  return (
    <div
      className={`flex flex-wrap gap-1 mt-1 ${
        isCurrentUser ? "justify-end pr-4" : "justify-start pl-4"
      }`}
    >
      {reactions.map((r) => {
        const userReacted = r.userIds.includes(currentUserId);
        const tooltipLabel =
          r.count === 1
            ? `1 person reacted with ${r.reaction}`
            : `${r.count} people reacted with ${r.reaction}`;

        return (
          <button
            key={r.reaction}
            type="button"
            onClick={() => onToggleReaction(r.reaction)}
            title={tooltipLabel}
            aria-label={`${tooltipLabel}. ${
              userReacted ? "Click to remove your reaction" : "Click to add this reaction"
            }`}
            aria-pressed={userReacted}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-all duration-150 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 focus-visible:ring-offset-1 ${
              userReacted
                ? "border-heat-300 bg-heat-50 text-heat-700 dark:border-heat-700 dark:bg-heat-900/30 dark:text-heat-300"
                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-600"
            }`}
          >
            <span aria-hidden="true">{r.reaction}</span>
            <span>{r.count}</span>
          </button>
        );
      })}
    </div>
  );
}
