"use client";

import * as React from "react";
import { Search, ChevronUp, ChevronDown, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { InChatSearchResult } from "@/types/chat";

interface InChatSearchProps {
  isOpen: boolean;
  query: string;
  results: InChatSearchResult[];
  currentIndex: number;
  isLoading: boolean;
  onSearch: (query: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

export function InChatSearch({
  isOpen,
  query,
  results,
  currentIndex,
  isLoading,
  onSearch,
  onNext,
  onPrev,
  onClose,
}: InChatSearchProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Autofocus when opened
  React.useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Keyboard shortcut: Escape to close
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const totalResults = results.length;
  const matchDisplay =
    totalResults > 0
      ? `${currentIndex + 1} of ${totalResults}`
      : query.trim()
      ? "No results"
      : "";

  return (
    <div
      role="search"
      aria-label="In-conversation search"
      className="flex items-center gap-2 border-b border-zinc-200 bg-white/95 px-4 py-2 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 shrink-0 animate-in slide-in-from-top-2 duration-150"
    >
      <div className="relative flex-1 max-w-md flex items-center">
        <Search className="absolute left-3 h-4 w-4 text-zinc-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search in this conversation..."
          aria-label="Search conversation messages"
          className="h-9 w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-9 pr-8 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-heat-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-heat-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white dark:focus:border-heat-500"
        />
        {query && (
          <button
            onClick={() => onSearch("")}
            className="absolute right-2.5 rounded-md p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            aria-label="Clear search query"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-1.5 text-xs text-zinc-500 px-2 shrink-0">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-heat-500" />
          <span>Searching...</span>
        </div>
      ) : matchDisplay ? (
        <span
          aria-live="polite"
          className="text-xs font-medium text-zinc-500 dark:text-zinc-400 px-2 shrink-0"
        >
          {matchDisplay}
        </span>
      ) : null}

      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onPrev}
          disabled={totalResults <= 1}
          aria-label="Previous search match"
          title="Previous match (Shift+Enter)"
        >
          <ChevronUp className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onNext}
          disabled={totalResults <= 1}
          aria-label="Next search match"
          title="Next match (Enter)"
        >
          <ChevronDown className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
        </Button>

        <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 mx-1" />

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close search"
          title="Close search (Esc)"
        >
          <X className="h-4 w-4 text-zinc-500 hover:text-zinc-900 dark:hover:text-white" />
        </Button>
      </div>
    </div>
  );
}
