"use client";

import * as React from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "./theme-provider";
import { cn } from "@/lib/utils/cn";
import type { Theme } from "@/types";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className={cn("h-9 w-9", className)} />;
  }

  const options: { value: Theme; label: string; icon: React.ReactNode }[] = [
    {
      value: "light",
      label: "Light",
      icon: <Sun className="h-4 w-4" />,
    },
    {
      value: "dark",
      label: "Dark",
      icon: <Moon className="h-4 w-4" />,
    },
    {
      value: "system",
      label: "System",
      icon: <Monitor className="h-4 w-4" />,
    },
  ];

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800/80 border border-zinc-200/50 dark:border-zinc-700/50",
        className
      )}
      role="group"
      aria-label="Theme selector"
    >
      {options.map((option) => {
        const isActive = theme === option.value;
        return (
          <button
            key={option.value}
            onClick={() => setTheme(option.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500",
              isActive
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            )}
            title={`Switch to ${option.label} theme`}
            aria-pressed={isActive}
          >
            {option.icon}
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
