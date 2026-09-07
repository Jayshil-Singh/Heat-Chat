"use client";

import * as React from "react";
import { Search, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface DiscoverSearchProps {
  value: string;
  onChange: (val: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
}

export function DiscoverSearch({
  value,
  onChange,
  isLoading = false,
  placeholder = "Search people by name, username, or bio...",
  className,
}: DiscoverSearchProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleClear = () => {
    onChange("");
    inputRef.current?.focus();
  };

  return (
    <div className={cn("relative w-full min-w-0", className)}>
      <label htmlFor="discover-search-input" className="sr-only">
        Search people
      </label>
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-400 dark:text-zinc-500">
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-heat-500" />
        ) : (
          <Search className="h-4 w-4" />
        )}
      </div>
      <input
        ref={inputRef}
        id="discover-search-input"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="h-11 w-full min-w-0 rounded-2xl border border-zinc-200/90 bg-white pl-10 pr-10 text-xs text-zinc-900 placeholder-zinc-400 shadow-xs transition-all focus:border-heat-500 focus:outline-none focus:ring-2 focus:ring-heat-500/20 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-white dark:placeholder-zinc-500 dark:focus:border-heat-500 box-border"
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search"
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 min-h-[44px] min-w-[44px] justify-center"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
