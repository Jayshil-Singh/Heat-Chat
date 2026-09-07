"use client";

import * as React from "react";

export function PersonCardSkeleton() {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900/40 animate-pulse w-full min-w-0">
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        <div className="h-12 w-12 rounded-full bg-zinc-200 dark:bg-zinc-800 shrink-0" />
        <div className="space-y-2 flex-1 min-w-0">
          <div className="h-3.5 w-32 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-2.5 w-24 rounded bg-zinc-100 dark:bg-zinc-800/60" />
          <div className="h-2.5 w-40 rounded bg-zinc-100 dark:bg-zinc-800/60" />
        </div>
      </div>
      <div className="h-9 w-24 rounded-xl bg-zinc-200 dark:bg-zinc-800 shrink-0" />
    </div>
  );
}
