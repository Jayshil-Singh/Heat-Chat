"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  MessageSquare,
  Users,
  Flame,
  X,
  ArrowRight,
  Loader2,
  Calendar,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useSearch } from "@/hooks/use-search";
import { useConversations } from "@/hooks/use-conversations";
import { useFriends } from "@/hooks/use-friends";
import type { GlobalSearchResult, ConversationWithDetails, FriendItem } from "@/types/chat";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const { globalQuery, globalResults, isGlobalSearching, searchGlobal, clearGlobalSearch } =
    useSearch();
  const { conversations } = useConversations();
  const { friends } = useFriends();

  const [selectedIndex, setSelectedIndex] = React.useState(0);

  // Debounce search input
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    searchGlobal(val);
    setSelectedIndex(0);
  };

  // Filter conversations locally
  const matchingConversations = React.useMemo(() => {
    if (!globalQuery.trim()) return [];
    const q = globalQuery.toLowerCase();
    return conversations.filter((c) => {
      const name = c.type === "group" ? c.name : c.otherMember?.display_name;
      const username = c.otherMember?.username;
      return (
        name?.toLowerCase().includes(q) ||
        username?.toLowerCase().includes(q)
      );
    });
  }, [conversations, globalQuery]);

  // Filter friends locally
  const matchingFriends = React.useMemo(() => {
    if (!globalQuery.trim()) return [];
    const q = globalQuery.toLowerCase();
    return friends.filter((f) => {
      return (
        f.profile.display_name.toLowerCase().includes(q) ||
        f.profile.username.toLowerCase().includes(q)
      );
    });
  }, [friends, globalQuery]);

  // Combined flat list for keyboard navigation
  const flatItems = React.useMemo(() => {
    const items: Array<
      | { type: "conversation"; data: ConversationWithDetails }
      | { type: "friend"; data: FriendItem }
      | { type: "message"; data: GlobalSearchResult }
    > = [];

    matchingConversations.forEach((c) => items.push({ type: "conversation", data: c }));
    matchingFriends.forEach((f) => items.push({ type: "friend", data: f }));
    globalResults.forEach((m) => items.push({ type: "message", data: m }));

    return items;
  }, [matchingConversations, matchingFriends, globalResults]);

  // Autofocus when opened
  React.useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSelectedIndex(0);
    } else {
      clearGlobalSearch();
    }
  }, [isOpen, clearGlobalSearch]);

  const handleSelectItem = React.useCallback(
    (
      item:
        | { type: "conversation"; data: ConversationWithDetails }
        | { type: "friend"; data: FriendItem }
        | { type: "message"; data: GlobalSearchResult }
    ) => {
      onClose();
      if (item.type === "conversation") {
        router.push(`/chat/${item.data.id}`);
      } else if (item.type === "friend") {
        router.push(`/chat`);
      } else if (item.type === "message") {
        router.push(`/chat/${item.data.conversationId}?msgId=${item.data.id}`);
      }
    },
    [onClose, router]
  );

  // Keyboard navigation
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isOpen) return;

      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          flatItems.length > 0 ? (prev + 1) % flatItems.length : 0
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          flatItems.length > 0 ? (prev - 1 < 0 ? flatItems.length - 1 : prev - 1) : 0
        );
      } else if (e.key === "Enter" && flatItems.length > 0) {
        e.preventDefault();
        const selected = flatItems[selectedIndex];
        if (selected) {
          handleSelectItem(selected);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, flatItems, selectedIndex, onClose, handleSelectItem]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[10vh] backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="command-palette-title"
    >
      <div className="flex max-h-[75vh] w-full max-w-xl flex-col rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 overflow-hidden">
        {/* Search Header */}
        <div className="relative flex items-center border-b border-zinc-100 px-4 py-3.5 dark:border-zinc-800/80 shrink-0">
          <Search className="h-4 w-4 text-zinc-400 shrink-0 mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={globalQuery}
            onChange={handleInputChange}
            placeholder="Search conversations, friends, and messages..."
            aria-label="Global search command palette"
            className="flex-1 bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-white"
          />
          {isGlobalSearching && (
            <Loader2 className="h-4 w-4 animate-spin text-heat-500 mr-2" />
          )}
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            aria-label="Close command palette"
          >
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-mono text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              ESC
            </span>
          </button>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto p-2 space-y-4 max-h-[55vh]"
        >
          {!globalQuery.trim() ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-zinc-400 dark:text-zinc-500">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-900 mb-2">
                <Search className="h-5 w-5" />
              </div>
              <p className="text-xs font-medium">Type a search term to find messages, friends, or groups</p>
              <div className="flex items-center gap-2 mt-4 text-[11px] text-zinc-400">
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono dark:bg-zinc-800">↑↓</span>
                <span>to navigate</span>
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono dark:bg-zinc-800">↵</span>
                <span>to select</span>
              </div>
            </div>
          ) : flatItems.length === 0 && !isGlobalSearching ? (
            <div className="p-8 text-center text-xs text-zinc-500 dark:text-zinc-400">
              No results found for &quot;{globalQuery}&quot;
            </div>
          ) : (
            <div className="space-y-4">
              {/* Conversations section */}
              {matchingConversations.length > 0 && (
                <div>
                  <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Conversations
                  </p>
                  <div className="space-y-0.5 mt-1">
                    {matchingConversations.map((conv) => {
                      const itemIdx = flatItems.findIndex(
                        (f) => f.type === "conversation" && f.data.id === conv.id
                      );
                      const isSelected = selectedIndex === itemIdx;
                      const name =
                        conv.type === "group"
                          ? conv.name || "Group"
                          : conv.otherMember?.display_name || "Conversation";

                      return (
                        <div
                          key={conv.id}
                          onClick={() => handleSelectItem({ type: "conversation", data: conv })}
                          className={`flex items-center gap-3 rounded-xl px-3 py-2 text-xs transition-colors cursor-pointer ${
                            isSelected
                              ? "bg-heat-500 text-white"
                              : "hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-900 dark:text-white"
                          }`}
                        >
                          <Avatar
                            src={conv.type === "group" ? conv.avatar_url : conv.otherMember?.avatar_url}
                            name={name}
                            size="sm"
                          />
                          <div className="flex-1 truncate font-medium">{name}</div>
                          <span
                            className={`text-[10px] font-semibold uppercase ${
                              isSelected ? "text-white/80" : "text-zinc-400"
                            }`}
                          >
                            {conv.type}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Messages section */}
              {globalResults.length > 0 && (
                <div>
                  <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Messages ({globalResults.length})
                  </p>
                  <div className="space-y-0.5 mt-1">
                    {globalResults.map((msg) => {
                      const itemIdx = flatItems.findIndex(
                        (f) => f.type === "message" && f.data.id === msg.id
                      );
                      const isSelected = selectedIndex === itemIdx;

                      return (
                        <div
                          key={msg.id}
                          onClick={() => handleSelectItem({ type: "message", data: msg })}
                          className={`flex items-start gap-3 rounded-xl px-3 py-2.5 text-xs transition-colors cursor-pointer ${
                            isSelected
                              ? "bg-heat-500 text-white"
                              : "hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-900 dark:text-white"
                          }`}
                        >
                          <Avatar
                            src={msg.senderAvatar}
                            name={msg.senderName}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-semibold truncate">
                                {msg.senderName}
                              </span>
                              <span
                                className={`text-[10px] shrink-0 ${
                                  isSelected ? "text-white/80" : "text-zinc-400"
                                }`}
                              >
                                in {msg.conversationName}
                              </span>
                            </div>
                            <p
                              className={`mt-0.5 truncate text-[11px] ${
                                isSelected ? "text-white/90" : "text-zinc-600 dark:text-zinc-300"
                              }`}
                            >
                              {msg.content}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
