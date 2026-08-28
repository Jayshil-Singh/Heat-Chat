"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { X, MessageSquare, Flame } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import type { NotificationWithDetails } from "@/types/chat";

interface NotificationToastProps {
  toasts: NotificationWithDetails[];
  onDismiss: (id: string) => void;
  onNavigate?: (conversationId: string) => void;
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
      className="fixed top-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 md:px-0"
    >
      {toasts.slice(-3).map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={() => onDismiss(toast.id)}
          onClick={() => {
            onDismiss(toast.id);
            if (onNavigate) {
              onNavigate(toast.conversationId);
            } else {
              router.push(`/chat/${toast.conversationId}`);
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
  const title =
    toast.conversationType === "group"
      ? `${senderName} in ${toast.conversationName}`
      : senderName;

  return (
    <div
      role="status"
      onClick={onClick}
      className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-zinc-200/80 bg-white/95 p-3.5 shadow-xl shadow-zinc-900/10 backdrop-blur-xl transition-all duration-200 hover:scale-[1.02] hover:border-heat-500/50 cursor-pointer dark:border-zinc-800/80 dark:bg-zinc-900/95 dark:shadow-black/40"
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

      <div className="min-w-0 flex-1">
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
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 shrink-0"
        aria-label="Dismiss notification"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
