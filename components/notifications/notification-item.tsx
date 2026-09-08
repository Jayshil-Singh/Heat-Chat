"use client";

import * as React from "react";
import { ShieldAlert, Flame, Check } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import type { NotificationWithDetails } from "@/types/chat";

export interface NotificationItemProps {
  notification: NotificationWithDetails;
  onClick: (notification: NotificationWithDetails) => void;
  onMarkAsRead?: (id: string) => void;
  messagePreviewEnabled?: boolean;
}

export function formatNotificationRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  if (isNaN(date)) return "Recently";
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export function NotificationItem({
  notification,
  onClick,
  onMarkAsRead,
  messagePreviewEnabled = true,
}: NotificationItemProps) {
  const isUnread = !notification.readAt && !notification.isRead;
  const notifType = (notification as any).type || (notification as any).eventType || "message";
  const isSecurity = ["security", "security_alert", "password_changed", "new_device_login"].includes(notifType);
  const isMention = notifType === "mention";
  const isReaction = notifType === "reaction";
  const isFriend = notifType.startsWith("friend");

  const senderName = notification.sender?.display_name || "Friend";

  let title = senderName;
  if (isSecurity) {
    title = (notification as any).title || "Security Alert";
  } else if (isMention) {
    title =
      notification.conversationType === "group" && notification.conversationName
        ? `${senderName} mentioned you in ${notification.conversationName}`
        : `${senderName} mentioned you`;
  } else if (isReaction) {
    title = `${senderName} reacted to your message`;
  } else if (isFriend) {
    title =
      notifType.includes("accept")
        ? `${senderName} accepted your friend request`
        : `${senderName} sent you a friend request`;
  } else if (notification.conversationType === "group" && notification.conversationName) {
    title = `${senderName} in ${notification.conversationName}`;
  }

  // Safe preview calculation
  let displayPreview = "";
  if (isSecurity) {
    displayPreview = (notification as any).body || "Important security notification for your account.";
  } else if (!messagePreviewEnabled) {
    displayPreview = "New message";
  } else if (notification.isDeleted) {
    displayPreview = "This message was deleted";
  } else {
    displayPreview = notification.preview || "New notification";
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick(notification);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(notification)}
      onKeyDown={handleKeyDown}
      className={`min-h-[44px] flex items-start gap-3 p-3 transition-colors cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 rounded-xl box-border max-w-full overflow-hidden ${
        isUnread
          ? isSecurity
            ? "bg-amber-50/50 dark:bg-amber-950/20 border-l-2 border-l-amber-500"
            : "bg-heat-50/40 dark:bg-heat-950/20 border-l-2 border-l-heat-500"
          : "bg-transparent border-l-2 border-l-transparent"
      }`}
      aria-label={`${isUnread ? "Unread notification: " : "Notification: "} ${title}. ${displayPreview}`}
    >
      {/* Visual Avatar or Security Badge */}
      <div className="relative shrink-0 mt-0.5">
        {isSecurity ? (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <ShieldAlert className="h-4 w-4" />
          </div>
        ) : (
          <Avatar
            src={notification.sender?.avatar_url}
            name={senderName}
            size="sm"
            status={notification.sender?.status}
            className="shrink-0"
          />
        )}
        {isUnread && !isSecurity && (
          <div className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-heat-500 text-white shadow-xs">
            <Flame className="h-2 w-2 fill-current" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="flex items-center justify-between gap-1.5">
          <p
            className={`truncate text-xs ${
              isUnread ? "font-bold text-zinc-900 dark:text-white" : "font-medium text-zinc-700 dark:text-zinc-300"
            }`}
          >
            {title}
          </p>
          <span className="text-[10px] text-zinc-400 shrink-0 font-medium">
            {formatNotificationRelativeTime(notification.createdAt)}
          </span>
        </div>

        <p
          className={`truncate text-[11px] mt-0.5 ${
            notification.isDeleted
              ? "italic text-zinc-400 dark:text-zinc-500"
              : isUnread
              ? "text-zinc-800 dark:text-zinc-200"
              : "text-zinc-500 dark:text-zinc-400"
          }`}
        >
          {displayPreview}
        </p>
      </div>

      {/* Action: Mark Read Button if unread */}
      {isUnread && onMarkAsRead && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMarkAsRead(notification.id);
          }}
          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg p-1 text-zinc-400 hover:bg-zinc-200/60 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 shrink-0 mt-0.5"
          aria-label="Mark notification as read"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
