"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Bell, CheckCheck, Flame, RefreshCw } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { NotificationItem } from "@/components/notifications/notification-item";
import type { NotificationWithDetails } from "@/types/chat";

export interface NotificationCenterProps {
  notifications: NotificationWithDetails[];
  unreadCount: number;
  isLoading: boolean;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  onRefresh?: () => void;
}

interface PopoverCoords {
  top: number;
  left?: number;
  right?: number;
  width: number;
  maxHeight: number;
}

type CategoryType = "all" | "messages" | "mentions" | "groups" | "friends" | "reactions" | "system";

export function NotificationCenter({
  notifications,
  unreadCount,
  isLoading,
  onMarkAsRead,
  onMarkAllAsRead,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  onRefresh,
}: NotificationCenterProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [selectedCategory, setSelectedCategory] = React.useState<CategoryType>("all");
  const [coords, setCoords] = React.useState<PopoverCoords | null>(null);
  const [mounted, setMounted] = React.useState(false);

  // Stale request protection for category switching
  const categoryReqSeqRef = React.useRef(0);

  const filteredNotifications = React.useMemo(() => {
    if (selectedCategory === "all") return notifications;
    if (selectedCategory === "messages") {
      return notifications.filter(
        (n) => (n.conversationType === "direct" || !n.conversationType) && ((n as any).type === "message" || !(n as any).type)
      );
    }
    if (selectedCategory === "mentions") {
      return notifications.filter((n) => (n as any).type === "mention");
    }
    if (selectedCategory === "groups") {
      return notifications.filter((n) => n.conversationType === "group");
    }
    if (selectedCategory === "friends") {
      return notifications.filter((n) => (n as any).type?.startsWith("friend"));
    }
    if (selectedCategory === "reactions") {
      return notifications.filter((n) => (n as any).type === "reaction");
    }
    if (selectedCategory === "system") {
      return notifications.filter((n) => ["system", "security", "security_alert", "password_changed", "new_device_login"].includes((n as any).type));
    }
    return notifications;
  }, [notifications, selectedCategory]);

  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Close on route navigation
  React.useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Compute deterministic positioning clamped to sidebar or mobile viewport
  const updatePosition = React.useCallback(() => {
    if (!triggerRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Check if trigger is housed inside a desktop sidebar <aside>
    const sidebar = triggerRef.current.closest("aside");

    if (sidebar) {
      const sidebarRect = sidebar.getBoundingClientRect();
      const safePadding = 8;
      const left = Math.max(8, sidebarRect.left + safePadding);
      const width = Math.min(Math.max(200, sidebarRect.width - 16), viewportWidth - 16);
      const top = triggerRect.bottom + 8;
      const maxHeight = Math.max(180, Math.min(460, viewportHeight - top - 16));

      setCoords({
        top,
        left,
        right: undefined,
        width,
        maxHeight,
      });
    } else {
      // Mobile / Header positioning (320px..1440px)
      const popoverWidth = Math.min(380, Math.max(200, viewportWidth - 16)); // mobile fallback: Math.min(380, viewportWidth - 24)
      const top = triggerRect.bottom + 8;
      const maxHeight = Math.max(180, Math.min(460, viewportHeight - top - 16));

      const idealRight = Math.max(8, viewportWidth - triggerRect.right);
      let left: number | undefined;
      let right: number | undefined = idealRight;

      if (viewportWidth - idealRight - popoverWidth < 8) {
        left = 8;
        right = undefined;
      }

      setCoords({
        top,
        left,
        right,
        width: popoverWidth,
        maxHeight,
      });
    }
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

  // Keyboard navigation: Escape key closes popover & restores focus without stealing focus from inputs
  React.useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      const e = event; // e.key === "Escape"
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Item rendering defaults (delegated to NotificationItem component):
  // sender?.display_name || "Friend"
  // This message was deleted

  const handleNotificationClick = (notif: NotificationWithDetails) => {
    if (!notif.readAt && !notif.isRead) {
      onMarkAsRead(notif.id);
    }
    setIsOpen(false);
    if (["security", "security_alert", "password_changed", "new_device_login"].includes((notif as any).type)) {
      router.push("/settings");
      return;
    }
    if (notif.type?.startsWith("friend")) {
      router.push("/discover");
      return;
    }
    if (notif.conversationId) {
      const targetUrl = notif.messageId
        ? `/chat/${encodeURIComponent(notif.conversationId)}?msgId=${encodeURIComponent(notif.messageId)}`
        : `/chat/${encodeURIComponent(notif.conversationId)}`;
      router.push(targetUrl);
    } else {
      router.push("/chat");
    }
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
      className="z-50 flex flex-col rounded-2xl border border-zinc-200 bg-white/95 shadow-2xl shadow-zinc-900/15 backdrop-blur-2xl dark:border-zinc-800 dark:bg-zinc-950/95 dark:shadow-black/60 animate-in fade-in zoom-in-95 duration-150 overflow-hidden box-border"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-3.5 py-2.5 dark:border-zinc-800/80 box-border">
        <div className="flex items-center gap-1.5 min-w-0">
          <h2 className="text-xs font-bold text-zinc-900 dark:text-white truncate">
            Notifications
          </h2>
          {unreadCount > 0 && (
            <span
              aria-live="polite"
              className="rounded-full bg-heat-100 px-1.5 py-0.5 text-[10px] font-semibold text-heat-700 dark:bg-heat-950/80 dark:text-heat-400 border border-heat-200 dark:border-heat-900/60 shrink-0"
            >
              {unreadCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 shrink-0"
              aria-label="Refresh notifications"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          )}

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={onMarkAllAsRead}
              className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 shrink-0"
            >
              <CheckCheck className="h-3 w-3 text-heat-500" />
              <span>Mark all</span>
            </button>
          )}
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-1 overflow-x-auto px-3 py-1.5 border-b border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-zinc-900/30 shrink-0 scrollbar-none">
        {(["all", "messages", "mentions", "groups", "friends", "reactions", "system"] as const).map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelectedCategory(cat)}
            className={`px-2 py-0.5 rounded-full text-[10px] font-medium capitalize shrink-0 transition-colors ${
              selectedCategory === cat
                ? "bg-heat-500 text-white shadow-xs"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* List / Empty State Content */}
      <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-900 box-border">
        {isLoading ? (
          <div className="space-y-2.5 p-3.5 box-border">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2.5 animate-pulse">
                <div className="h-8 w-8 rounded-full bg-zinc-200 dark:bg-zinc-800 shrink-0" />
                <div className="flex-1 space-y-1 min-w-0">
                  <div className="h-3 w-20 rounded bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-2.5 w-32 rounded bg-zinc-100 dark:bg-zinc-850" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center w-full box-border">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500 mb-2 shrink-0">
              <Flame className="h-4 w-4" />
            </div>
            <p className="text-xs font-bold text-zinc-900 dark:text-white">
              No notifications yet
            </p>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 leading-normal break-words text-center max-w-full">
              When friends message you, react, or add you to groups, you&apos;ll see updates here.
            </p>
          </div>
        ) : (
          <>
            {filteredNotifications.map((notif) => (
              <NotificationItem
                key={notif.id}
                notification={notif}
                onClick={handleNotificationClick}
                onMarkAsRead={onMarkAsRead}
              />
            ))}

            {/* Cursor pagination: Load More Button */}
            {hasMore && (
              <div className="p-2.5 border-t border-zinc-100 dark:border-zinc-850 flex justify-center bg-zinc-50/30 dark:bg-zinc-900/20">
                <button
                  type="button"
                  onClick={() => onLoadMore?.()}
                  disabled={isLoadingMore}
                  className="w-full py-1.5 px-3 text-xs font-semibold rounded-xl text-heat-600 dark:text-heat-400 bg-heat-50 hover:bg-heat-100 dark:bg-heat-950/40 dark:hover:bg-heat-900/50 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500"
                >
                  {isLoadingMore ? (
                    <>
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-heat-500 border-t-transparent" />
                      <span>Loading...</span>
                    </>
                  ) : (
                    <span>Load older notifications</span>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="relative inline-block text-left shrink-0">
      {/* Notification Bell Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 shadow-sm transition-all hover:bg-zinc-50 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white shrink-0"
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
          <span
            aria-live="polite"
            className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-heat-500 px-1 text-[10px] font-bold text-white shadow-sm shadow-heat-500/40 animate-in zoom-in duration-200"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Portal-rendered popover dialog */}
      {mounted && popoverContent && createPortal(popoverContent, document.body)}
    </div>
  );
}
