"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Bell, CheckCheck, Flame } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import type { NotificationWithDetails } from "@/types/chat";

interface NotificationCenterProps {
  notifications: NotificationWithDetails[];
  unreadCount: number;
  isLoading: boolean;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
}

interface PopoverCoords {
  top: number;
  left?: number;
  right?: number;
  width: number;
  maxHeight: number;
}

export function NotificationCenter({
  notifications,
  unreadCount,
  isLoading,
  onMarkAsRead,
  onMarkAllAsRead,
}: NotificationCenterProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [coords, setCoords] = React.useState<PopoverCoords | null>(null);
  const [mounted, setMounted] = React.useState(false);

  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Close when pathname changes (route navigation)
  React.useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Compute deterministic positioning relative to trigger and viewport
  const updatePosition = React.useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Responsive width with safe margin
    const popoverWidth = Math.min(384, viewportWidth - 24);
    const top = rect.bottom + 8;
    const maxHeight = Math.max(200, Math.min(420, viewportHeight - top - 16));

    let left: number | undefined;
    let right: number | undefined;

    // Prefer right-aligning to the trigger button
    const idealRight = viewportWidth - rect.right;
    const calculatedLeft = rect.right - popoverWidth;

    if (calculatedLeft < 12) {
      // If right-alignment causes left edge to go offscreen, align to left with safe margin
      left = Math.max(12, Math.min(rect.left, viewportWidth - popoverWidth - 12));
      right = undefined;
    } else {
      right = Math.max(12, idealRight);
      left = undefined;
    }

    setCoords({
      top,
      left,
      right,
      width: popoverWidth,
      maxHeight,
    });
  }, []);

  // Recalculate on open, scroll, or resize
  React.useEffect(() => {
    if (!isOpen) return;

    updatePosition();

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener("resize", handleScrollOrResize);
    window.addEventListener("scroll", handleScrollOrResize, true);

    return () => {
      window.removeEventListener("resize", handleScrollOrResize);
      window.removeEventListener("scroll", handleScrollOrResize, true);
    };
  }, [isOpen, updatePosition]);

  // Close on outside click
  React.useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Keyboard navigation: Escape key closes popover & restores focus
  React.useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleNotificationClick = (notif: NotificationWithDetails) => {
    if (!notif.readAt) {
      onMarkAsRead(notif.id);
    }
    setIsOpen(false);
    router.push(`/chat/${notif.conversationId}`);
  };

  const popoverContent = isOpen && coords && (
    <div
      ref={popoverRef}
      id="notification-popover-dialog"
      role="dialog"
      aria-label="Notification center"
      style={{
        position: "fixed",
        top: `${coords.top}px`,
        left: coords.left !== undefined ? `${coords.left}px` : undefined,
        right: coords.right !== undefined ? `${coords.right}px` : undefined,
        width: `${coords.width}px`,
        maxHeight: `${coords.maxHeight}px`,
      }}
      className="z-50 flex flex-col rounded-2xl border border-zinc-200 bg-white/95 shadow-2xl shadow-zinc-900/15 backdrop-blur-2xl dark:border-zinc-800 dark:bg-zinc-950/95 dark:shadow-black/60 animate-in fade-in zoom-in-95 duration-150 overflow-hidden"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800/80">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
            Notifications
          </h2>
          {unreadCount > 0 && (
            <span className="rounded-full bg-heat-100 px-2 py-0.5 text-[11px] font-semibold text-heat-700 dark:bg-heat-950/80 dark:text-heat-400 border border-heat-200 dark:border-heat-900/60">
              {unreadCount} new
            </span>
          )}
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={onMarkAllAsRead}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500"
          >
            <CheckCheck className="h-3.5 w-3.5 text-heat-500" />
            <span>Mark all read</span>
          </button>
        )}
      </div>

      {/* List / Empty State Content */}
      <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-900">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="h-10 w-10 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-28 rounded bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-2.5 w-40 rounded bg-zinc-100 dark:bg-zinc-850" />
                </div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500 mb-3">
              <Flame className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">
              No notifications yet
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-[220px] leading-relaxed">
              When friends message you or add you to groups, you&apos;ll see updates here.
            </p>
          </div>
        ) : (
          notifications.map((notif) => {
            const isUnread = !notif.readAt;
            const senderName = notif.sender?.display_name || "Friend";
            const title =
              notif.conversationType === "group"
                ? `${senderName} in ${notif.conversationName}`
                : senderName;

            return (
              <div
                key={notif.id}
                role="button"
                tabIndex={0}
                onClick={() => handleNotificationClick(notif)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleNotificationClick(notif);
                  }
                }}
                className={`flex items-start gap-3 p-3.5 transition-colors cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/60 focus-visible:outline-none focus-visible:bg-zinc-100 dark:focus-visible:bg-zinc-800 ${
                  isUnread
                    ? "bg-heat-50/40 dark:bg-heat-950/20"
                    : "bg-transparent"
                }`}
              >
                <Avatar
                  src={notif.sender?.avatar_url}
                  name={senderName}
                  size="default"
                  status={notif.sender?.status}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <p className="truncate text-xs font-semibold text-zinc-900 dark:text-white">
                      {title}
                    </p>
                    <span className="text-[10px] text-zinc-400 shrink-0">
                      {formatRelativeTime(notif.createdAt)}
                    </span>
                  </div>

                  <p
                    className={`truncate text-xs mt-0.5 ${
                      notif.isDeleted
                        ? "italic text-zinc-400 dark:text-zinc-500"
                        : "text-zinc-600 dark:text-zinc-300"
                    }`}
                  >
                    {notif.preview}
                  </p>
                </div>

                {isUnread && (
                  <div className="mt-1.5 h-2 w-2 rounded-full bg-heat-500 shrink-0 shadow-sm shadow-heat-500/50" />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div className="relative inline-block text-left">
      {/* Notification Bell Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 shadow-sm transition-all hover:bg-zinc-50 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
        aria-label={
          unreadCount > 0
            ? `Notifications (${unreadCount} unread)`
            : "Notifications"
        }
        aria-expanded={isOpen}
        aria-controls="notification-popover-dialog"
        aria-haspopup="dialog"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-heat-500 px-1 text-[10px] font-bold text-white shadow-sm shadow-heat-500/40 animate-in zoom-in duration-200">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Portal-rendered popover dialog */}
      {mounted && popoverContent && createPortal(popoverContent, document.body)}
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}
