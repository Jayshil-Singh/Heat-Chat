"use client";

import * as React from "react";
import { Avatar } from "@/components/ui/avatar";
import type { MentionCandidate } from "@/types/chat";

interface MentionAutocompleteProps {
  isOpen: boolean;
  candidates: MentionCandidate[];
  selectedIndex: number;
  onSelect: (candidate: MentionCandidate) => void;
  onClose: () => void;
}

export function MentionAutocomplete({
  isOpen,
  candidates,
  selectedIndex,
  onSelect,
  onClose,
}: MentionAutocompleteProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isOpen) return;

      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || candidates.length === 0) return null;

  return (
    <div
      ref={containerRef}
      role="listbox"
      aria-label="Mention members"
      className="absolute bottom-full left-0 mb-2 z-50 w-64 max-h-52 overflow-y-auto rounded-xl border border-zinc-200 bg-white/95 p-1.5 shadow-xl backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-900/95 animate-in fade-in slide-in-from-bottom-2 duration-150"
    >
      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        Mention Member
      </div>
      {candidates.map((candidate, idx) => {
        const isSelected = idx === selectedIndex;
        return (
          <button
            key={candidate.userId}
            type="button"
            role="option"
            aria-selected={isSelected}
            onClick={() => onSelect(candidate)}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
              isSelected
                ? "bg-heat-500 text-white font-medium shadow-sm shadow-heat-500/20"
                : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800/80"
            }`}
          >
            <Avatar
              src={candidate.avatarUrl}
              name={candidate.displayName}
              size="sm"
              className="h-6 w-6 text-[10px] shrink-0"
            />
            <div className="min-w-0 flex-1 truncate">
              <p className="truncate font-semibold leading-tight">
                {candidate.displayName}
              </p>
              <p
                className={`truncate text-[10px] ${
                  isSelected ? "text-white/80" : "text-zinc-400 dark:text-zinc-500"
                }`}
              >
                @{candidate.username}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
