"use client";

import * as React from "react";

interface UnreadDividerProps {
  count?: number;
}

export function UnreadDivider({ count }: UnreadDividerProps) {
  return (
    <div className="relative my-4 flex items-center justify-center">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-heat-500/40 dark:border-heat-500/30" />
      </div>
      <div className="relative flex items-center gap-1.5 rounded-full border border-heat-200 bg-heat-50 px-3 py-0.5 text-[11px] font-semibold text-heat-600 shadow-2xs dark:border-heat-900/60 dark:bg-heat-950/80 dark:text-heat-400 backdrop-blur-sm">
        <span className="h-1.5 w-1.5 rounded-full bg-heat-500 animate-pulse" />
        <span>{count ? `${count} unread messages` : "New messages"}</span>
      </div>
    </div>
  );
}
