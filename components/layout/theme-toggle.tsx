"use client";

import * as React from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "./theme-provider";
import { cn } from "@/lib/utils/cn";
import type { Theme } from "@/types";

interface ThemeToggleProps {
  className?: string;
  compact?: boolean;
}

export function ThemeToggle({ className, compact = false }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className={cn(
          compact
            ? "h-9 w-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 animate-pulse shrink-0"
            : "h-8 w-full rounded-xl bg-zinc-100 dark:bg-zinc-800 animate-pulse box-border",
          className
        )}
      />
    );
  }

  const options: { value: Theme; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    {
      value: "light",
      label: "Light",
      icon: Sun,
    },
    {
      value: "dark",
      label: "Dark",
      icon: Moon,
    },
    {
      value: "system",
      label: "System",
      icon: Monitor,
    },
  ];

  // Compact mode: single button that cycles themes
  if (compact) {
    const currentOption = options.find((opt) => opt.value === theme) || options[2];
    const CurrentIcon = currentOption.icon;

    const handleCycleTheme = () => {
      if (theme === "light") setTheme("dark");
      else if (theme === "dark") setTheme("system");
      else setTheme("light");
    };

    return (
      <button
        type="button"
        onClick={handleCycleTheme}
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 shadow-sm transition-all hover:bg-zinc-50 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white",
          className
        )}
        title={`Theme: ${currentOption.label} (Click to switch)`}
        aria-label={`Theme: ${currentOption.label} (Click to switch)`}
      >
        <CurrentIcon className="h-4 w-4" />
      </button>
    );
  }

  // Full segmented mode: 3 distinct buttons in equal widths, strictly bounded
  return (
    <div
      className={cn(
        "grid grid-cols-3 gap-0.5 rounded-xl bg-zinc-200/70 p-0.5 dark:bg-zinc-900/90 border border-zinc-200/80 dark:border-zinc-800/80 w-full max-w-full box-border overflow-hidden",
        className
      )}
      role="group"
      aria-label="Appearance selector"
    >
      {options.map((option) => {
        const Icon = option.icon;
        const isActive = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            className={cn(
              "flex items-center justify-center gap-1 rounded-lg py-1.5 px-1 text-[11px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 min-w-0 w-full box-border",
              isActive
                ? "bg-white text-zinc-950 font-semibold shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            )}
            title={`Switch to ${option.label} theme`}
            aria-pressed={isActive}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate min-w-0">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
