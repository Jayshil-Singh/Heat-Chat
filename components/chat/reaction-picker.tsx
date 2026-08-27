"use client";

import * as React from "react";
import type { ReactionType } from "@/types/database";

const REACTIONS: { emoji: ReactionType; label: string }[] = [
  { emoji: "❤️", label: "React with heart" },
  { emoji: "😂", label: "React with laughing face" },
  { emoji: "👍", label: "React with thumbs up" },
  { emoji: "😮", label: "React with surprised face" },
  { emoji: "😢", label: "React with sad face" },
  { emoji: "🔥", label: "React with fire" },
];

interface ReactionPickerProps {
  /** Reactions the current user has already applied to this message */
  activeReactions?: ReactionType[];
  onReact: (reaction: ReactionType) => void;
  onClose: () => void;
}

export function ReactionPicker({
  activeReactions = [],
  onReact,
  onClose,
}: ReactionPickerProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Close on outside click
  React.useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [onClose]);

  // Close on Escape
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Auto-focus first button on open
  React.useEffect(() => {
    const firstBtn = containerRef.current?.querySelector("button");
    firstBtn?.focus();
  }, []);

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Reaction picker"
      className="flex items-center gap-0.5 rounded-full border border-zinc-200 bg-white px-2 py-1.5 shadow-xl dark:border-zinc-700 dark:bg-zinc-800 animate-in zoom-in-90 fade-in duration-150 origin-bottom"
    >
      {REACTIONS.map(({ emoji, label }) => {
        const isActive = activeReactions.includes(emoji);
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => {
              onReact(emoji);
              onClose();
            }}
            aria-label={label}
            aria-pressed={isActive}
            className={`flex h-9 w-9 items-center justify-center rounded-full text-xl transition-all hover:scale-125 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 ${
              isActive
                ? "bg-heat-100 dark:bg-heat-900/40 scale-110 ring-2 ring-heat-300 dark:ring-heat-700"
                : "hover:bg-zinc-100 dark:hover:bg-zinc-700"
            }`}
          >
            <span aria-hidden="true">{emoji}</span>
          </button>
        );
      })}
    </div>
  );
}
