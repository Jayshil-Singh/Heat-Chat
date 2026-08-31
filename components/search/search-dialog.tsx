"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  MessageSquare,
  Users,
  Image as ImageIcon,
  FileText,
  Bookmark,
  Calendar,
  Loader2,
  ChevronRight,
  Filter,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/avatar";
import { SearchHighlight } from "./search-highlight";
import { useSearch } from "@/hooks/use-search";
import { UserProfileDialog } from "@/components/profile/user-profile-dialog";
import type { SearchCategory } from "@/types/chat";
import type { UserSearchResult } from "@/types/user";

interface SearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialCategory?: SearchCategory;
  initialConversationId?: string | null;
}

const CATEGORIES: { id: SearchCategory; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "all", label: "All", icon: Search },
  { id: "messages", label: "Messages", icon: MessageSquare },
  { id: "people", label: "People", icon: Users },
  { id: "media", label: "Media", icon: ImageIcon },
  { id: "files", label: "Files", icon: FileText },
  { id: "saved", label: "Saved", icon: Bookmark },
];

export function SearchDialog({
  isOpen,
  onClose,
  initialCategory = "all",
  initialConversationId = null,
}: SearchDialogProps) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const {
    globalQuery,
    activeCategory,
    setActiveCategory,
    filters,
    setFilters,
    messageResults,
    peopleResults,
    mediaResults,
    savedResults,
    isGlobalSearching,
    hasMore,
    searchGlobal,
    loadMore,
    clearGlobalSearch,
  } = useSearch();

  const [selectedUser, setSelectedUser] = React.useState<UserSearchResult | null>(null);
  const [showFilters, setShowFilters] = React.useState(false);

  // Set initial category and conversation on open
  React.useEffect(() => {
    if (isOpen) {
      setActiveCategory(initialCategory);
      if (initialConversationId) {
        setFilters({ conversationId: initialConversationId });
      }
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      clearGlobalSearch();
      setShowFilters(false);
    }
  }, [isOpen, initialCategory, initialConversationId]);

  // Jump to message in chat
  const handleJumpToMessage = (conversationId: string, messageId: string) => {
    onClose();
    router.push(`/chat/${conversationId}?msgId=${messageId}`);
  };

  const handleStartChatWithUser = (user: UserSearchResult) => {
    onClose();
    router.push(`/chat?userId=${user.id}`);
  };

  const totalResults =
    (activeCategory === "all" || activeCategory === "messages" ? messageResults.length : 0) +
    (activeCategory === "all" || activeCategory === "people" ? peopleResults.length : 0) +
    (activeCategory === "all" || activeCategory === "media" || activeCategory === "files" ? mediaResults.length : 0) +
    (activeCategory === "saved" ? savedResults.length : 0);

  return (
    <>
      <Dialog isOpen={isOpen} onClose={onClose} className="max-w-2xl p-0 overflow-hidden rounded-2xl">
        <div className="flex flex-col h-[640px] max-h-[85vh] bg-white dark:bg-zinc-950">
          {/* Top Search Bar */}
          <div className="flex items-center gap-3 border-b border-zinc-100 px-4 py-3.5 dark:border-zinc-800/80 shrink-0">
            <Search className="h-5 w-5 text-zinc-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={globalQuery}
              onChange={(e) => searchGlobal(e.target.value)}
              placeholder={`Search ${activeCategory === "all" ? "everything" : activeCategory}…`}
              className="flex-1 bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-white dark:placeholder:text-zinc-500"
            />
            {isGlobalSearching ? (
              <Loader2 className="h-4 w-4 animate-spin text-heat-500 shrink-0" />
            ) : globalQuery ? (
              <button
                type="button"
                onClick={() => searchGlobal("")}
                className="rounded-full p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setShowFilters((prev) => !prev)}
              className={`rounded-xl p-1.5 transition-colors ${
                showFilters || filters.dateRange !== "all"
                  ? "bg-heat-50 text-heat-600 dark:bg-heat-950/50 dark:text-heat-400"
                  : "text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
              title="Toggle filters"
            >
              <Filter className="h-4 w-4" />
            </button>
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1 border-b border-zinc-100 px-4 py-2 bg-zinc-50/50 dark:border-zinc-800/60 dark:bg-zinc-900/30 shrink-0 overflow-x-auto no-scrollbar">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all shrink-0 ${
                    isActive
                      ? "bg-white text-heat-600 shadow-xs dark:bg-zinc-800 dark:text-heat-400"
                      : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>

          {/* Optional Filter Controls Bar */}
          {showFilters && (
            <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-2 bg-zinc-50 dark:border-zinc-800/60 dark:bg-zinc-900/50 text-xs shrink-0 flex-wrap">
              <span className="flex items-center gap-1 text-zinc-400 font-medium">
                <Calendar className="h-3.5 w-3.5" /> Date:
              </span>
              {(["all", "today", "yesterday", "week", "month"] as const).map((dr) => (
                <button
                  key={dr}
                  type="button"
                  onClick={() => setFilters({ dateRange: dr })}
                  className={`rounded-lg px-2 py-0.5 font-medium transition-colors ${
                    filters.dateRange === dr
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                      : "text-zinc-500 hover:bg-zinc-200/60 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  }`}
                >
                  {dr === "all"
                    ? "Any time"
                    : dr === "today"
                    ? "Today"
                    : dr === "yesterday"
                    ? "Yesterday"
                    : dr === "week"
                    ? "Past 7 days"
                    : "Past 30 days"}
                </button>
              ))}
            </div>
          )}

          {/* Results Container */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {!globalQuery.trim() && (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500 mb-3">
                  <Search className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                  Search Heat Chat
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-[280px]">
                  Find messages, people, photos, audio notes, files, and your saved bookmarks.
                </p>
              </div>
            )}

            {globalQuery.trim() && totalResults === 0 && !isGlobalSearching && (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                  No results found for &ldquo;{globalQuery}&rdquo;
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Try checking for typos or searching across a different category.
                </p>
              </div>
            )}

            {/* People Results Section */}
            {(activeCategory === "all" || activeCategory === "people") && peopleResults.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  People ({peopleResults.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {peopleResults.map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() => setSelectedUser(person as any)}
                      className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-white p-2.5 text-left transition-all hover:border-zinc-200 hover:shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900/60 dark:hover:border-zinc-700"
                    >
                      <Avatar
                        src={person.avatarUrl}
                        name={person.displayName}
                        size="default"
                        className="shrink-0"
                      />
                      <div className="min-w-0 flex-1 truncate">
                        <p className="truncate text-xs font-semibold text-zinc-900 dark:text-white">
                          <SearchHighlight text={person.displayName} query={globalQuery} />
                        </p>
                        <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                          @<SearchHighlight text={person.username} query={globalQuery} />
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-zinc-400 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Media / Files Results Section */}
            {(activeCategory === "all" || activeCategory === "media" || activeCategory === "files") &&
              mediaResults.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    Media & Files ({mediaResults.length})
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {mediaResults.map((item) => (
                      <button
                        key={item.attachmentId}
                        type="button"
                        onClick={() => handleJumpToMessage(item.conversationId, item.messageId)}
                        className="group relative flex flex-col overflow-hidden rounded-xl border border-zinc-100 bg-zinc-50 p-2 text-left transition-all hover:border-zinc-200 hover:shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900/60"
                      >
                        <div className="flex h-24 w-full items-center justify-center overflow-hidden rounded-lg bg-zinc-200 dark:bg-zinc-800">
                          {item.fileType?.startsWith("image/") && item.signedUrl ? (
                            // eslint-disable-next-line
                            <img
                              src={item.signedUrl}
                              alt={item.fileName || "Media"}
                              className="h-full w-full object-cover transition-transform group-hover:scale-105"
                            />
                          ) : (
                            <FileText className="h-8 w-8 text-zinc-400" />
                          )}
                        </div>
                        <div className="mt-1.5 min-w-0 truncate">
                          <p className="truncate text-xs font-semibold text-zinc-900 dark:text-white">
                            <SearchHighlight text={item.fileName || "File"} query={globalQuery} />
                          </p>
                          <p className="truncate text-[10px] text-zinc-400">
                            {item.conversationName}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

            {/* Messages Results Section */}
            {(activeCategory === "all" || activeCategory === "messages") && messageResults.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Messages ({messageResults.length})
                </h3>
                <div className="space-y-2">
                  {messageResults.map((msg) => (
                    <button
                      key={msg.id}
                      type="button"
                      onClick={() => handleJumpToMessage(msg.conversationId, msg.id)}
                      className="flex w-full items-start gap-3 rounded-xl border border-zinc-100 bg-white p-3 text-left transition-all hover:border-zinc-200 hover:shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900/60 dark:hover:border-zinc-700"
                    >
                      <Avatar
                        src={msg.senderAvatar}
                        name={msg.senderName}
                        size="default"
                        className="shrink-0 mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-semibold text-zinc-900 dark:text-white">
                            {msg.senderName}{" "}
                            <span className="text-[11px] font-normal text-zinc-400">
                              in {msg.conversationName}
                            </span>
                          </p>
                          <span className="text-[10px] text-zinc-400 shrink-0">
                            {new Date(msg.createdAt).toLocaleDateString([], {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                          <SearchHighlight text={msg.content} query={globalQuery} />
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Saved Messages Results Section */}
            {activeCategory === "saved" && savedResults.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Saved Messages ({savedResults.length})
                </h3>
                <div className="space-y-2">
                  {savedResults.map((msg) => (
                    <button
                      key={msg.savedId}
                      type="button"
                      onClick={() => handleJumpToMessage(msg.conversationId, msg.messageId)}
                      className="flex w-full items-start gap-3 rounded-xl border border-zinc-100 bg-white p-3 text-left transition-all hover:border-zinc-200 hover:shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900/60 dark:hover:border-zinc-700"
                    >
                      <Avatar
                        src={msg.senderAvatar}
                        name={msg.senderName}
                        size="default"
                        className="shrink-0 mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-semibold text-zinc-900 dark:text-white">
                            {msg.senderName}{" "}
                            <span className="text-[11px] font-normal text-zinc-400">
                              in {msg.conversationName}
                            </span>
                          </p>
                          <span className="text-[10px] text-zinc-400 shrink-0">
                            {new Date(msg.createdAt).toLocaleDateString([], {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                          <SearchHighlight text={msg.content} query={globalQuery} />
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Load More Pagination */}
            {hasMore && (
              <div className="pt-2 pb-4 text-center">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={isGlobalSearching}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
                >
                  {isGlobalSearching ? "Loading more…" : "Load more results"}
                </button>
              </div>
            )}
          </div>
        </div>
      </Dialog>

      {/* User Profile Modal when a person is clicked */}
      {selectedUser && (
        <UserProfileDialog
          isOpen={Boolean(selectedUser)}
          onClose={() => setSelectedUser(null)}
          user={selectedUser}
          onStartChat={handleStartChatWithUser}
        />
      )}
    </>
  );
}
