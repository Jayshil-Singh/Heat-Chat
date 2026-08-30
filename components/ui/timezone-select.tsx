"use client";

import * as React from "react";
import { Globe, ChevronDown, Check, Search, X } from "lucide-react";

interface TimezoneSelectProps {
  value: string;
  onChange: (timezone: string) => void;
  disabled?: boolean;
}

const COMMON_TIMEZONES = [
  "UTC",
  "Pacific/Fiji",
  "Pacific/Auckland",
  "Pacific/Honolulu",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Brisbane",
  "Australia/Perth",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Rome",
  "Europe/Madrid",
  "Europe/Amsterdam",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Toronto",
  "America/Vancouver",
  "America/Sao_Paulo",
  "America/Buenos_Aires",
  "Africa/Cairo",
  "Africa/Johannesburg",
];

function getTimezoneOffset(timeZone: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
    });
    const parts = formatter.formatToParts(now);
    const offsetPart = parts.find((p) => p.type === "timeZoneName");
    return offsetPart ? offsetPart.value : "";
  } catch {
    return "";
  }
}

export function TimezoneSelect({ value, onChange, disabled = false }: TimezoneSelectProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  // Collect all supported IANA timezones
  const allTimezones = React.useMemo(() => {
    try {
      if (typeof Intl !== "undefined" && typeof (Intl as any).supportedValuesOf === "function") {
        const supported = (Intl as any).supportedValuesOf("timeZone") as string[];
        const combined = Array.from(new Set([...COMMON_TIMEZONES, ...supported]));
        return combined;
      }
    } catch {
      // Fallback to common list
    }
    return COMMON_TIMEZONES;
  }, []);

  // Filter based on search query
  const filtered = React.useMemo(() => {
    const query = search.toLowerCase().trim();
    if (!query) return allTimezones.slice(0, 40);
    return allTimezones
      .filter((tz) => tz.toLowerCase().includes(query))
      .slice(0, 40);
  }, [allTimezones, search]);

  // Click outside to close
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const selectedOffset = React.useMemo(() => getTimezoneOffset(value || "UTC"), [value]);

  return (
    <div className="relative w-full" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-xs text-zinc-900 shadow-xs transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 disabled:opacity-50 disabled:cursor-not-allowed dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-100 dark:hover:bg-zinc-800/60"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Globe className="h-4 w-4 shrink-0 text-zinc-400" />
          <span className="truncate font-medium">{value || "UTC"}</span>
          {selectedOffset && (
            <span className="text-[11px] text-zinc-400 shrink-0">({selectedOffset})</span>
          )}
        </div>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-full rounded-2xl border border-zinc-200 bg-white p-2 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 animate-in fade-in zoom-in-95 duration-150">
          {/* Search Input */}
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search timezones (e.g. Fiji, Sydney, UTC)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 pl-8 pr-7 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-heat-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Timezone List */}
          <div className="max-h-52 overflow-y-auto space-y-0.5 [scrollbar-width:thin]" role="listbox">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-zinc-400">
                No matching timezones found
              </p>
            ) : (
              filtered.map((tz) => {
                const offset = getTimezoneOffset(tz);
                const isSelected = value === tz;
                return (
                  <button
                    key={tz}
                    type="button"
                    onClick={() => {
                      onChange(tz);
                      setIsOpen(false);
                      setSearch("");
                    }}
                    role="option"
                    aria-selected={isSelected}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors text-left ${
                      isSelected
                        ? "bg-heat-50 text-heat-900 font-semibold dark:bg-heat-950/50 dark:text-white"
                        : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <span className="truncate">{tz}</span>
                    <div className="flex items-center gap-1.5 shrink-0 pl-2 text-[11px] text-zinc-400">
                      <span>{offset}</span>
                      {isSelected && <Check className="h-3.5 w-3.5 text-heat-600 dark:text-heat-400" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
