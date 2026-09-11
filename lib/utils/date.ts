/**
 * Heat Chat — Shared Safe Date & Timestamp Formatting Utilities
 *
 * Guaranteed invariants:
 * - Never returns "Invalid Date"
 * - Never throws RangeError on invalid inputs
 * - Safely handles ISO strings, Date objects, Unix seconds, Unix milliseconds, null, undefined, and malformed strings
 * - Supports both canonical frontend `createdAt` and database `created_at`
 */

/**
 * Safely parses any date representation into a valid Date object or null.
 */
export function parseMessageDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    // Distinguish Unix seconds (< 1e12, e.g. 1789086755) from milliseconds (>= 1e12)
    const ms = value < 1_000_000_000_000 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    // Check if string is purely numeric (e.g. "1789086755249" or "1789086755")
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      if (Number.isFinite(num)) {
        const ms = num < 1_000_000_000_000 ? num * 1000 : num;
        const date = new Date(ms);
        if (!Number.isNaN(date.getTime())) return date;
      }
    }

    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

/**
 * Formats a message timestamp into a time string (e.g. "10:45 AM").
 * Falls back to "Just now" if missing or invalid.
 * Guaranteed never to return "Invalid Date".
 */
export function formatMessageTime(value: unknown): string {
  const date = parseMessageDate(value);
  if (!date) return "Just now";

  try {
    const formatted = date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    return formatted && formatted !== "Invalid Date" ? formatted : "Just now";
  } catch {
    return "Just now";
  }
}

/**
 * Formats a message timestamp for chat date separators:
 * "Today", "Yesterday", or "MMM D" / "MMM D, YYYY".
 * Falls back to "Today" if missing or invalid.
 * Guaranteed never to return "Invalid Date".
 */
export function formatDateSeparator(value: unknown): string {
  const date = parseMessageDate(value);
  if (!date) return "Today";

  try {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";

    const formatted = date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
    });
    return formatted && formatted !== "Invalid Date" ? formatted : "Today";
  } catch {
    return "Today";
  }
}

/**
 * Formats a timestamp into relative time (e.g. "Just now", "5m", "3:45 PM", "Yesterday", "Mon", "Jan 15").
 * Guaranteed never to return "Invalid Date".
 */
export function formatRelativeTime(value: unknown): string {
  const date = parseMessageDate(value);
  if (!date) return "";

  try {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) {
      const formatted = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      return formatted && formatted !== "Invalid Date" ? formatted : "Just now";
    }
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) {
      const formatted = date.toLocaleDateString([], { weekday: "short" });
      return formatted && formatted !== "Invalid Date" ? formatted : "";
    }
    const formatted = date.toLocaleDateString([], { month: "short", day: "numeric" });
    return formatted && formatted !== "Invalid Date" ? formatted : "";
  } catch {
    return "";
  }
}

/**
 * Resolves the canonical timestamp from any message-like object.
 */
export function extractMessageTimestamp(message: any): string | null {
  if (!message || typeof message !== "object") return null;
  const raw =
    message.createdAt ??
    message.created_at ??
    message.sentAt ??
    message.sent_at ??
    message.timestamp ??
    null;

  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw.toISOString();
  }
  if (typeof raw === "number") {
    const parsed = parseMessageDate(raw);
    return parsed ? parsed.toISOString() : null;
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }
  return null;
}

/**
 * Normalizes message objects so both `createdAt` and `created_at` are guaranteed to exist.
 */
export function normalizeMessageTimestamps<T extends Record<string, any>>(
  message: T
): T & { createdAt: string; created_at: string } {
  const timestamp = extractMessageTimestamp(message) || new Date().toISOString();
  return {
    ...message,
    createdAt: timestamp,
    created_at: timestamp,
  };
}
