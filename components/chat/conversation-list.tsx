"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Search, MessageSquare, Plus, Users, Clock } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import type { ConversationWithDetails } from "@/types/chat";

interface ConversationListProps {
  conversations: ConversationWithDetails[];
  isLoading: boolean;
  activeConversationId?: string | null;
  onSelectConversation?: (id: string) => void;
}

function formatRelativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) {
      return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: "short" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function ConversationList({
  conversations,
  isLoading,
  activeConversationId,
  onSelectConversation,
}: ConversationListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [searchFilter, setSearchFilter] = React.useState("");

  const filteredConversations = React.useMemo(() => {
    const query = searchFilter.toLowerCase().trim();
    if (!query) return conversations;

    return conversations.filter((c) => {
      const name = (c.otherMember?.display_name || c.name || "").toLowerCase();
      const username = (c.otherMember?.username || "").toLowerCase();
      return name.includes(query) || username.includes(query);
    });
  }, [conversations, searchFilter]);

  if (isLoading) {
    return (
      <div className="flex h-full flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 p-4 space-y-4">
        <Skeleton className="h-10 w-full rounded-xl" />
        <div className="space-y-2 pt-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-4 w-3/4 rounded" />
                <Skeleton className="h-3 w-1/2 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      {/* Search Header */}
      <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-base font-bold tracking-tight text-zinc-900 dark:text-white">
            Messages
          </h2>
          <Link href="/friends">
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5 text-xs h-8"
              title="Start a new chat with a friend"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Chat</span>
            </Button>
          </Link>
        </div>

        <div className="relative">
          <Input
            placeholder="Search conversations..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />}
            className="h-9 bg-zinc-50 dark:bg-zinc-900 text-xs"
          />
        </div>
      </div>

      {/* Conversation Item List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredConversations.length === 0 ? (
          searchFilter ? (
            <div className="p-8 text-center text-xs text-zinc-400">
              No conversations matching &quot;{searchFilter}&quot;
            </div>
          ) : (
            <EmptyState
              icon={<MessageSquare className="h-7 w-7 text-heat-500" />}
              title="No conversations yet"
              description="Choose a friend to start chatting."
              action={
                <Link href="/friends">
                  <Button variant="heat" size="sm" className="gap-2 text-xs">
                    <Users className="h-3.5 w-3.5" />
                    <span>Find Friends</span>
                  </Button>
                </Link>
              }
            />
          )
        ) : (
          filteredConversations.map((conv) => {
            const isSelected = activeConversationId === conv.id;
            const displayName = conv.otherMember?.display_name || conv.name || "Conversation";
            const avatarUrl = conv.otherMember?.avatar_url || conv.avatar_url;
            const status = conv.otherMember?.status || "offline";
            const timeFormatted = formatRelativeTime(conv.updated_at);

            return (
              <div
                key={conv.id}
                onClick={() => {
                  if (onSelectConversation) {
                    onSelectConversation(conv.id);
                  } else {
                    router.push(`/chat/${conv.id}`);
                  }
                }}
                className={`flex items-center gap-3 rounded-2xl p-3 cursor-pointer transition-all ${
                  isSelected
                    ? "bg-heat-500 text-white shadow-sm shadow-heat-500/20 dark:bg-heat-500"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                }`}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    if (onSelectConversation) onSelectConversation(conv.id);
                    else router.push(`/chat/${conv.id}`);
                  }
                }}
              >
                <Avatar
                  src={avatarUrl}
                  name={displayName}
                  size="default"
                  status={conv.type === "direct" ? status : undefined}
                  className="shrink-0"
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <h4
                      className={`truncate text-xs font-semibold ${
                        isSelected ? "text-white" : "text-zinc-900 dark:text-zinc-100"
                      }`}
                    >
                      {displayName}
                    </h4>
                    <span
                      className={`text-[10px] shrink-0 ${
                        isSelected ? "text-white/80" : "text-zinc-400"
                      }`}
                    >
                      {timeFormatted}
                    </span>
                  </div>

                  <p
                    className={`truncate text-[11px] mt-0.5 ${
                      isSelected ? "text-white/80" : "text-zinc-500 dark:text-zinc-400"
                    }`}
                  >
                    {conv.lastMessage
                      ? conv.lastMessage.content
                      : conv.type === "direct" && conv.otherMember
                      ? `@${conv.otherMember.username}`
                      : conv.description || "Direct Conversation"}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
