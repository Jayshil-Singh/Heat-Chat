"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { X, Flame } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import type { NotificationWithDetails } from "@/types/chat";

interface NotificationToastProps {
  toasts: NotificationWithDetails[];
  onDismiss: (id: string) => void;
  onNavigate?: (conversationId?: string | null) => void;
}

const TOAST_DEDUPE_MAX = 500;
const TOAST_DEDUPE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const toastDedupeCache = new Map<string, number>();

/**
 * Checks whether a toast has already been presented within the 5m TTL window.
 */
export function isToastDeduplicated(id: string): boolean {
  if (!id) return false;
  const now = Date.now();
  const timestamp = toastDedupeCache.get(id);
  if (timestamp && now - timestamp < TOAST_DEDUPE_TTL_MS) {
    return true;
  }
  return false;
}

/**
 * Records that a toast was presented in the bounded memory cache.
 */
export function recordToastPresented(id: string): void {
  if (!id) return;
  const now = Date.now();

  if (toastDedupeCache.size >= TOAST_DEDUPE_MAX) {
    for (const [cachedId, timestamp] of toastDedupeCache.entries()) {
      if (now - timestamp >= TOAST_DEDUPE_TTL_MS) {
        toastDedupeCache.delete(cachedId);
      }
    }
    if (toastDedupeCache.size >= TOAST_DEDUPE_MAX) {
      const keys = Array.from(toastDedupeCache.keys()).slice(0, 50);
      keys.forEach((k) => toastDedupeCache.delete(k));
    }
  }

  toastDedupeCache.set(id, now);
}

/**
 * Clears all toast deduplication cache on logout.
 */
export function clearToastDedupeCache(): void {
  toastDedupeCache.clear();
}

function sanitizeDestinationUrl(conversationId?: string | null, messageId?: string | null): string {
  if (!conversationId) return "/chat";
  // Safe validation: strictly allow valid UUID or alphanumeric-hyphen identifiers
  if (!/^[a-zA-Z0-9_-]+$/.test(conversationId)) {
    return "/chat";
  }
  if (messageId && /^[a-zA-Z0-9_-]+$/.test(messageId)) {
    return `/chat/${encodeURIComponent(conversationId)}?msgId=${encodeURIComponent(messageId)}`;
  }
  return `/chat/${encodeURIComponent(conversationId)}`;
}

export function NotificationToast({
  toasts,
  onDismiss,
  onNavigate,
}: NotificationToastProps) {
  const router = useRouter();

  if (toasts.length === 0) return null;

  return (
    <aside
      aria-label="Incoming notifications"
      aria-live="polite"
      className="fixed top-4 right-4 z-50 flex flex-col gap-2.5 max-w-[calc(100vw-32px)] sm:max-w-sm w-full pointer-events-none px-2 sm:px-0"
    >
      {toasts.slice(-3).map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={() => onDismiss(toast.id)}
          onClick={() => {
            onDismiss(toast.id);
            if (toast.type?.startsWith("friend")) {
              router.push("/discover");
            } else if (onNavigate && toast.conversationId) {
              onNavigate(toast.conversationId);
            } else if (toast.conversationId) {
              router.push(sanitizeDestinationUrl(toast.conversationId, toast.messageId));
            } else {
              router.push("/chat");
            }
          }}
        />
      ))}
    </aside>
  );
}

function ToastItem({
  toast,
  onDismiss,
  onClick,
}: {
  toast: NotificationWithDetails;
  onDismiss: () => void;
  onClick: () => void;
}) {
  React.useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss();
    }, 4500);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const senderName = toast.sender?.display_name || "Friend";
  let title = senderName;
  if ((toast as any).type === "mention") {
    title =
      toast.conversationType === "group"
        ? `${senderName} mentioned you in ${toast.conversationName}`
        : `${senderName} mentioned you`;
  } else if ((toast as any).type === "reaction") {
    title = `${senderName} reacted to your message`;
  } else if (toast.conversationType === "group") {
    title = `${senderName} in ${toast.conversationName}`;
  }

  return (
    <div
      role="status"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-zinc-200/80 bg-white/95 p-3.5 shadow-xl shadow-zinc-900/10 backdrop-blur-xl transition-all duration-200 hover:scale-[1.02] hover:border-heat-500/50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 dark:border-zinc-800/80 dark:bg-zinc-900/95 dark:shadow-black/40 box-border max-w-full overflow-hidden"
    >
      <div className="relative shrink-0">
        <Avatar
          src={toast.sender?.avatar_url}
          name={senderName}
          size="default"
          status={toast.sender?.status}
        />
        <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-heat-500 text-white shadow-sm">
          <Flame className="h-2.5 w-2.5 fill-current" />
        </div>
      </div>

      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="flex items-center justify-between gap-1">
          <p className="truncate text-xs font-bold text-zinc-900 dark:text-white">
            {title}
          </p>
          <span className="text-[10px] text-zinc-400 shrink-0">Just now</span>
        </div>

        <p
          className={`truncate text-xs mt-0.5 ${
            toast.isDeleted
              ? "italic text-zinc-400 dark:text-zinc-500"
              : "text-zinc-600 dark:text-zinc-300"
          }`}
        >
          {toast.preview}
        </p>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        className="min-h-[44px] min-w-[44px] /* min-h-[36px] min-w-[36px] */ flex items-center justify-center rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 shrink-0"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
