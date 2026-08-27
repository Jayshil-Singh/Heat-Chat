"use client";

import * as React from "react";
import { ArrowDown, MessageSquare, Loader2 } from "lucide-react";
import { MessageItem } from "./message-item";
import { TypingIndicator } from "./typing-indicator";
import type { ChatMessage, TypingUser } from "@/types/chat";

interface MessageFeedProps {
  messages: ChatMessage[];
  currentUserId: string;
  recipientName?: string;
  isLoading: boolean;
  isLoadingOlder: boolean;
  hasMore: boolean;
  typingUsers: TypingUser[];
  onLoadOlder: () => Promise<void>;
  onRetryMessage?: (message: ChatMessage) => void;
}

function formatDateSeparator(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return "Today";
    }
    if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    }

    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
    });
  } catch {
    return "";
  }
}

export function MessageFeed({
  messages,
  currentUserId,
  recipientName = "your friend",
  isLoading,
  isLoadingOlder,
  hasMore,
  typingUsers,
  onLoadOlder,
  onRetryMessage,
}: MessageFeedProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const bottomAnchorRef = React.useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = React.useState(false);
  const [unreadNewCount, setUnreadNewCount] = React.useState(0);
  const previousScrollHeightRef = React.useRef<number>(0);
  const isInitialLoadRef = React.useRef<boolean>(true);

  // Group messages by date
  const groupedMessages = React.useMemo(() => {
    const groups: { date: string; items: ChatMessage[] }[] = [];
    let currentDate = "";
    let currentGroup: ChatMessage[] = [];

    messages.forEach((msg) => {
      const msgDate = new Date(msg.created_at).toDateString();
      if (msgDate !== currentDate) {
        if (currentGroup.length > 0) {
          groups.push({ date: currentDate, items: currentGroup });
        }
        currentDate = msgDate;
        currentGroup = [msg];
      } else {
        currentGroup.push(msg);
      }
    });

    if (currentGroup.length > 0) {
      groups.push({ date: currentDate, items: currentGroup });
    }

    return groups;
  }, [messages]);

  // Initial scroll to bottom
  React.useEffect(() => {
    if (!isLoading && messages.length > 0 && isInitialLoadRef.current) {
      bottomAnchorRef.current?.scrollIntoView({ behavior: "instant" });
      isInitialLoadRef.current = false;
    }
  }, [isLoading, messages.length]);

  // Handle scroll events: Reverse pagination trigger & show/hide scroll-to-bottom
  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    // Show floating button if user is scrolled up > 150px
    if (distanceFromBottom > 150) {
      setShowScrollBottom(true);
    } else {
      setShowScrollBottom(false);
      setUnreadNewCount(0);
    }

    // Trigger load older messages when near top (< 60px)
    if (scrollTop < 60 && hasMore && !isLoadingOlder) {
      previousScrollHeightRef.current = scrollHeight;
      onLoadOlder();
    }
  };

  // Preserve scroll position when older messages are loaded
  React.useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !previousScrollHeightRef.current) return;

    const newScrollHeight = container.scrollHeight;
    const heightDifference = newScrollHeight - previousScrollHeightRef.current;

    if (heightDifference > 0) {
      container.scrollTop += heightDifference;
      previousScrollHeightRef.current = 0;
    }
  }, [messages.length]);

  // Auto-scroll on new message if user is near bottom
  React.useEffect(() => {
    if (isInitialLoadRef.current) return;

    const container = containerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    if (distanceFromBottom < 160) {
      bottomAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
    } else {
      // User is reading older messages, increment badge count
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.sender_id !== currentUserId) {
        setUnreadNewCount((prev) => prev + 1);
      }
    }
  }, [messages, currentUserId]);

  const scrollToBottom = () => {
    bottomAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
    setShowScrollBottom(false);
    setUnreadNewCount(0);
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Loader2 className="h-6 w-6 animate-spin text-heat-500" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-heat-50 text-heat-600 dark:bg-heat-950/50 dark:text-heat-400 mb-3">
          <MessageSquare className="h-7 w-7" />
        </div>
        <h3 className="text-base font-bold text-zinc-900 dark:text-white">
          Start the conversation
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-xs leading-relaxed">
          Say hello to <span className="font-semibold text-zinc-800 dark:text-zinc-200">{recipientName}</span>. Your private messages are secured with end-to-end database authorization.
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto pt-4 pb-2"
      >
        {/* Loading older messages spinner */}
        {isLoadingOlder && (
          <div className="flex justify-center py-2">
            <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
          </div>
        )}

        {/* Message Groups */}
        {groupedMessages.map((group) => (
          <div key={group.date}>
            {/* Date Separator */}
            <div className="my-4 flex items-center justify-center">
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-[11px] font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 shadow-2xs">
                {formatDateSeparator(group.items[0].created_at)}
              </span>
            </div>

            {/* Messages in Group */}
            {group.items.map((msg) => (
              <MessageItem
                key={msg.id || msg.tempId}
                message={msg}
                isCurrentUser={msg.sender_id === currentUserId}
                onRetry={onRetryMessage}
              />
            ))}
          </div>
        ))}

        {/* Realtime Typing Indicator */}
        <TypingIndicator typingUsers={typingUsers} />

        {/* Bottom anchor for scrolling */}
        <div ref={bottomAnchorRef} className="h-2" />
      </div>

      {/* Floating Scroll-to-Bottom Pill Button */}
      {showScrollBottom && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 flex items-center gap-1.5 rounded-full bg-heat-500 px-3.5 py-2 text-xs font-semibold text-white shadow-lg hover:bg-heat-600 transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 animate-in fade-in slide-in-from-bottom-2"
          aria-label="Scroll to newest message"
        >
          <ArrowDown className="h-3.5 w-3.5" />
          <span>New message{unreadNewCount > 1 ? `s (${unreadNewCount})` : ""}</span>
        </button>
      )}
    </div>
  );
}
