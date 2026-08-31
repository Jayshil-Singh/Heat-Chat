"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bookmark,
  Search,
  X,
  MessageSquare,
  Image as ImageIcon,
  Mic,
  FileText,
  Trash2,
  ExternalLink,
  Loader2,
  Calendar,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useSavedMessages } from "@/hooks/use-saved-messages";
import { MentionText } from "@/components/mentions/mention-text";
import { SearchHighlight } from "@/components/search/search-highlight";

const CATEGORY_TABS = [
  { id: "all", label: "All Items", icon: Bookmark },
  { id: "text", label: "Text", icon: MessageSquare },
  { id: "media", label: "Photos & Videos", icon: ImageIcon },
  { id: "audio", label: "Voice Notes", icon: Mic },
  { id: "file", label: "Documents & Files", icon: FileText },
];

export default function SavedMessagesPage() {
  const router = useRouter();
  const {
    savedMessages,
    isLoading,
    hasMore,
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    loadMore,
    unsaveMessage,
  } = useSavedMessages();

  const [removingId, setRemovingId] = React.useState<string | null>(null);

  const handleUnsave = async (messageId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRemovingId(messageId);
    try {
      await unsaveMessage(messageId);
    } finally {
      setRemovingId(null);
    }
  };

  const handleJumpToChat = (conversationId: string, messageId: string) => {
    router.push(`/chat/${conversationId}?msgId=${messageId}`);
  };

  return (
    <div className="flex flex-1 flex-col h-full overflow-hidden bg-zinc-50/50 dark:bg-zinc-950">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white/95 px-6 py-4 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-500 shadow-xs dark:bg-amber-950/40 dark:text-amber-400">
            <Bookmark className="h-5 w-5 fill-current" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-900 dark:text-white">
              Saved Messages
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Your personal library of bookmarked chats, media, and documents
            </p>
          </div>
        </div>
      </header>

      {/* Toolbar: Search + Category Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-zinc-200/80 bg-white/80 px-6 py-3 backdrop-blur-sm dark:border-zinc-800/80 dark:bg-zinc-900/40 shrink-0">
        {/* Search input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search saved messages…"
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50/80 pl-9 pr-8 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-heat-500 focus:outline-none focus:ring-1 focus:ring-heat-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-white dark:placeholder:text-zinc-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {CATEGORY_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = categoryFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCategoryFilter(tab.id)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all shrink-0 ${
                  isActive
                    ? "bg-heat-500 text-white shadow-xs"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="animate-pulse rounded-2xl border border-zinc-100 bg-white p-5 dark:border-zinc-800/80 dark:bg-zinc-900/60"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                  <div className="space-y-2 flex-1">
                    <div className="h-4 w-32 rounded bg-zinc-200 dark:bg-zinc-800" />
                    <div className="h-3 w-20 rounded bg-zinc-100 dark:bg-zinc-850" />
                  </div>
                </div>
                <div className="mt-4 h-12 w-full rounded-xl bg-zinc-100 dark:bg-zinc-850" />
              </div>
            ))}
          </div>
        ) : savedMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-96 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-50 text-amber-500 dark:bg-amber-950/30 dark:text-amber-400 mb-4 shadow-sm">
              <Bookmark className="h-8 w-8 fill-current opacity-80" />
            </div>
            <h2 className="text-base font-bold text-zinc-900 dark:text-white">
              {searchQuery ? "No matching saved messages" : "No saved messages yet"}
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-sm">
              {searchQuery
                ? "Try searching for a different phrase or clearing filters."
                : "When you bookmark a message or media item in any conversation, it will show up here for quick access."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {savedMessages.map((item) => (
              <div
                key={item.savedId}
                onClick={() => handleJumpToChat(item.conversationId, item.messageId)}
                className="group relative flex flex-col justify-between rounded-2xl border border-zinc-100 bg-white p-5 shadow-xs transition-all hover:border-zinc-200 hover:shadow-md dark:border-zinc-800/80 dark:bg-zinc-900/70 dark:hover:border-zinc-700 cursor-pointer"
              >
                <div>
                  {/* Card Header: Sender + Conversation Name + Timestamp */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar
                        src={item.senderAvatar}
                        name={item.senderName}
                        size="default"
                        className="shrink-0"
                      />
                      <div className="min-w-0 truncate">
                        <p className="truncate text-xs font-bold text-zinc-900 dark:text-white">
                          {item.senderName}
                        </p>
                        <p className="truncate text-[11px] text-zinc-400">
                          in <span className="font-medium text-zinc-600 dark:text-zinc-300">{item.conversationName}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] text-zinc-400">
                        {new Date(item.createdAt).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleUnsave(item.messageId, e)}
                        disabled={removingId === item.messageId}
                        title="Remove from saved"
                        className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40 transition-colors"
                      >
                        {removingId === item.messageId ? (
                          <Loader2 className="h-4 w-4 animate-spin text-red-500" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Card Body: Content or Attachments */}
                  <div className="mt-3.5">
                    {item.isDeleted ? (
                      <p className="text-xs italic text-zinc-400">
                        This message was deleted
                      </p>
                    ) : (
                      <>
                        {item.content && (
                          <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed break-words whitespace-pre-wrap">
                            <MentionText content={item.content} />
                          </p>
                        )}

                        {/* Attachments preview */}
                        {item.attachments && item.attachments.length > 0 && (
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            {item.attachments.map((att) => (
                              <div
                                key={att.id}
                                className="relative flex items-center gap-2 overflow-hidden rounded-xl bg-zinc-50 p-2 dark:bg-zinc-800/60"
                              >
                                {att.fileType.startsWith("image/") && att.signedUrl ? (
                                  // eslint-disable-next-line
                                  <img
                                    src={att.signedUrl}
                                    alt={att.fileName || "Media"}
                                    className="h-12 w-12 rounded-lg object-cover"
                                  />
                                ) : (
                                  <FileText className="h-6 w-6 text-zinc-400 shrink-0" />
                                )}
                                <div className="min-w-0 truncate">
                                  <p className="truncate text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                                    {att.fileName || "File"}
                                  </p>
                                  <p className="text-[10px] text-zinc-400">
                                    {(att.fileSize / 1024).toFixed(0)} KB
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Card Footer: Jump to message */}
                <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center justify-between text-[11px] text-zinc-400">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Saved on {new Date(item.savedAt).toLocaleDateString()}
                  </span>
                  <span className="flex items-center gap-1 font-semibold text-heat-600 dark:text-heat-400 group-hover:translate-x-0.5 transition-transform">
                    Jump to chat <ExternalLink className="h-3 w-3" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Load More Pagination */}
        {hasMore && (
          <div className="pt-4 pb-8 text-center">
            <Button
              variant="outline"
              onClick={loadMore}
              disabled={isLoading}
              className="rounded-xl px-6 font-semibold"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
                </>
              ) : (
                "Load more saved messages"
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
