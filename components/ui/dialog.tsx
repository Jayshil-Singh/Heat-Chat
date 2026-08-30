"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { X } from "lucide-react";

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function Dialog({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  bodyClassName,
}: DialogProps) {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const previousActiveElement = React.useRef<HTMLElement | null>(null);

  // Focus management & body scroll locking
  React.useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement | null;

      // Lock body scroll safely
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      // Focus the dialog container or first interactive element
      const timer = setTimeout(() => {
        if (dialogRef.current) {
          const focusable = dialogRef.current.querySelector<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          if (focusable) {
            focusable.focus();
          } else {
            dialogRef.current.focus();
          }
        }
      }, 50);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      };

      window.addEventListener("keydown", handleKeyDown);

      return () => {
        clearTimeout(timer);
        document.body.style.overflow = originalOverflow;
        window.removeEventListener("keydown", handleKeyDown);
        if (previousActiveElement.current && typeof previousActiveElement.current.focus === "function") {
          previousActiveElement.current.focus();
        }
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "dialog-title" : undefined}
      aria-describedby={description ? "dialog-desc" : undefined}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col rounded-3xl border border-zinc-200/80 bg-white text-zinc-900 shadow-2xl transition-all dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 overflow-hidden outline-none",
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Header */}
        {(title || description) && (
          <header className="shrink-0 border-b border-zinc-100 dark:border-zinc-800/80 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xs px-5 sm:px-6 py-4 flex items-start justify-between gap-4 sticky top-0 z-10">
            <div className="space-y-1 pr-6 min-w-0">
              {title && (
                <h2 id="dialog-title" className="text-base sm:text-lg font-bold tracking-tight text-zinc-900 dark:text-white leading-snug">
                  {title}
                </h2>
              )}
              {description && (
                <p
                  id="dialog-desc"
                  className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed"
                >
                  {description}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors shrink-0"
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </button>
          </header>
        )}

        {/* Scrollable Body */}
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6 py-4 sm:py-5 [scrollbar-width:thin] [scrollbar-color:theme(colors.zinc.300)_transparent] dark:[scrollbar-color:theme(colors.zinc.700)_transparent]",
            bodyClassName
          )}
        >
          {children}
        </div>

        {/* Sticky / Pinned Footer */}
        {footer && (
          <footer className="shrink-0 border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/90 dark:bg-zinc-900/90 backdrop-blur-xs px-5 sm:px-6 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom,0.875rem))] sticky bottom-0 z-10">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
