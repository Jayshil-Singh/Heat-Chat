"use client";

import * as React from "react";
import { Smile, X, Search } from "lucide-react";

interface EmojiPickerProps {
  value: string | null;
  onChange: (emoji: string | null) => void;
  disabled?: boolean;
}

const POPULAR_EMOJIS = [
  "😀", "😃", "😄", "😁", "😅", "😂", "🤣", "😊", "😇", "🙂", "😉", "😌",
  "😍", "🥰", "😘", "😋", "😎", "🥳", "🤩", "🤔", "🤫", "😴", "🤯", "🥶",
  "🔥", "⚡", "✨", "🌟", "💫", "🚀", "🎉", "🎊", "❤️", "💖", "💯", "🏆",
  "💻", "☕", "🎮", "🎧", "📚", "🏖️", "🌴", "🍕", "🍔", "🎯", "🧘", "🏃",
  "✈️", "🌈", "💡", "🛡️", "🔒", "💬", "🎵", "🎨", "🌿", "⭐", "💪", "🙌",
];

export function EmojiPicker({ value, onChange, disabled = false }: EmojiPickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const popoverRef = React.useRef<HTMLDivElement>(null);

  // Close when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const filteredEmojis = React.useMemo(() => {
    if (!search.trim()) return POPULAR_EMOJIS;
    // Simple filter or return list
    return POPULAR_EMOJIS;
  }, [search]);

  return (
    <div className="relative inline-block" ref={popoverRef}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen((prev) => !prev)}
          className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-all ${
            value
              ? "border-heat-500 bg-heat-50 text-zinc-900 dark:bg-heat-950/40 dark:text-white dark:border-heat-700"
              : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:text-zinc-400"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
        >
          {value ? (
            <span className="text-base leading-none">{value}</span>
          ) : (
            <Smile className="h-4 w-4 text-zinc-400" />
          )}
          <span>{value ? "Change" : "Set emoji"}</span>
        </button>

        {value && !disabled && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300 transition-colors"
            title="Clear status emoji"
            aria-label="Clear status emoji"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-2 w-64 rounded-2xl border border-zinc-200 bg-white p-3 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 animate-in fade-in zoom-in-95 duration-150">
          <div className="mb-2 flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800">
            <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              Pick a status emoji
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-6 gap-1 max-h-48 overflow-y-auto p-1 scrollbar-thin">
            {filteredEmojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onChange(emoji);
                  setIsOpen(false);
                }}
                className={`flex h-8 w-8 items-center justify-center rounded-lg text-lg transition-transform hover:scale-125 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                  value === emoji ? "bg-heat-100 dark:bg-heat-950/60 ring-1 ring-heat-500" : ""
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
