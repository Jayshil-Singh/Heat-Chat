"use client";

import * as React from "react";
import { Star, Bookmark, X, MessageSquare, ExternalLink, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { StarredMessageWithDetails } from "@/types/chat";

interface StarredMessagesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  starredMessages: StarredMessageWithDetails[];
  isLoading: boolean;
  activeConversationId?: string;
  onUnstar: (messageId: string) => Promise<boolean>;
  onJumpToMessage: (conversationId: string, messageId: string) => void;
}

export function StarredMessagesDialog({
  isOpen,
  onClose,
  starredMessages,
  isLoading,
  activeConversationId,
  onUnstar,
  onJumpToMessage,
}: StarredMessagesDialogProps) {
  const [filterMode, setFilterMode] = React.useState<"current" | "all">("current");
  const dialogRef = React.useRef<HTMLDivElement>(null);

  // Close on Escape key
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Click outside to close
  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filtered =
    filterMode === "current" && activeConversationId
      ? starredMessages.filter((s) => s.message.conversationId === activeConversationId)
      : starredMessages;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="starred-messages-title"
    >
      <div
        ref={dialogRef}
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4 dark:border-zinc-800/80 shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
              <Bookmark className="h-4 w-4 fill-current" />
            </div>
            <div>
              <h2
                id="starred-messages-title"
                className="text-sm font-bold text-zinc-900 dark:text-white"
              >
                Saved Messages
              </h2>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {filtered.length} saved {filtered.length === 1 ? "message" : "messages"}
              </p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close saved messages"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Filter Toggle */}
        {activeConversationId && (
          <div className="flex border-b border-zinc-100 px-5 py-2.5 bg-zinc-50/50 dark:border-zinc-800/60 dark:bg-zinc-900/30 shrink-0 gap-2">
            <button
              onClick={() => setFilterMode("current")}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                filterMode === "current"
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
              }`}
            >
              This Conversation
            </button>
            <button
              onClick={() => setFilterMode("all")}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                filterMode === "all"
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
              }`}
            >
              All Saved ({starredMessages.length})
            </button>
          </div>
        )}

        {/* Message List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 divide-y divide-zinc-100 dark:divide-zinc-900">
          {isLoading ? (
            <div className="space-y-3 py-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-start gap-3 animate-pulse p-2">
                  <div className="h-9 w-9 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-28 rounded bg-zinc-200 dark:bg-zinc-800" />
                    <div className="h-3 w-48 rounded bg-zinc-100 dark:bg-zinc-850" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-500 dark:bg-amber-950/30 dark:text-amber-400 mb-3">
                <Bookmark className="h-6 w-6 fill-current opacity-80" />
              </div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                No saved messages
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-[220px]">
                Click the bookmark icon on any message to save it for later.
              </p>
            </div>
          ) : (
            filtered.map((item) => {
              const senderName = item.message.sender?.display_name || "Friend";

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    onClose();
                    onJumpToMessage(item.message.conversationId, item.message.id);
                  }}
                  className="group flex items-start justify-between gap-3 rounded-xl p-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/60 cursor-pointer pt-3"
                >
                  <Avatar
                    src={item.message.sender?.avatar_url}
                    name={senderName}
                    size="default"
                    status={item.message.sender?.status}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="truncate text-xs font-semibold text-zinc-900 dark:text-white">
                          {senderName}
                        </span>
                        {item.message.conversationName && (
                          <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.2 text-[9px] font-medium text-zinc-500 dark:text-zinc-400 truncate max-w-[120px]">
                            {item.message.conversationName}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-400 shrink-0">
                        {formatDate(item.message.createdAt)}
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-zinc-700 dark:text-zinc-300 line-clamp-2">
                      {item.message.messageType === "image" && !item.message.content.trim()
                        ? "📷 Photo"
                        : item.message.content}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUnstar(item.message.id);
                      }}
                      className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-200/60 hover:text-amber-500 dark:hover:bg-zinc-800 transition-colors"
                      aria-label="Unstar message"
                      title="Unstar message"
                    >
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}
