"use client";

import * as React from "react";
import { Eye, EyeOff, Shield, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface DiscoverToggleProps {
  isDiscoverable: boolean;
  isLoading: boolean;
  onToggle: () => void;
  className?: string;
}

export function DiscoverToggle({
  isDiscoverable,
  isLoading,
  onToggle,
  className,
}: DiscoverToggleProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm transition-all dark:border-zinc-800/90 dark:bg-zinc-900/60 sm:p-5",
        className
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors",
              isDiscoverable
                ? "bg-heat-100 text-heat-600 dark:bg-heat-950/80 dark:text-heat-400"
                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            )}
          >
            {isDiscoverable ? (
              <Eye className="h-4 w-4" />
            ) : (
              <EyeOff className="h-4 w-4" />
            )}
          </div>
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">
                Allow people to discover me
              </h2>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                  isDiscoverable
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-400"
                    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                )}
              >
                {isDiscoverable ? "Discoverable" : "Hidden"}
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-xl">
              When enabled, other Heat Chat users who have discovery enabled can find you and send you a friend request. Discovery is private and opt-in.
            </p>
          </div>
        </div>

        {/* Accessible Switch Toggle */}
        <div className="flex items-center justify-end pt-1 sm:pt-0 shrink-0">
          <button
            type="button"
            role="switch"
            aria-checked={isDiscoverable}
            aria-label="Allow people to discover me"
            disabled={isLoading}
            onClick={onToggle}
            className={cn(
              "relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900 disabled:opacity-50 min-h-[44px] min-w-[48px] items-center",
              isDiscoverable ? "bg-heat-500" : "bg-zinc-300 dark:bg-zinc-700"
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out",
                isDiscoverable ? "translate-x-6" : "translate-x-1"
              )}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
