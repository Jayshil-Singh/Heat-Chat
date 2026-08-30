"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  MessageSquare,
  Plus,
  Users,
  UserPlus,
  MoreVertical,
  Mail,
  MailOpen,
  Link as LinkIcon,
  Check,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { CreateGroupDialog } from "./create-group-dialog";
import type { ConversationWithDetails } from "@/types/chat";

interface ConversationListProps {
  conversations: ConversationWithDetails[];
  isLoading: boolean;
  activeConversationId?: string | null;
  onSelectConversation?: (id: string) => void;
  onMarkUnread?: (id: string) => void;
  onMarkRead?: (id: string) => void;
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
  onMarkUnread,
  onMarkRead,
}: ConversationListProps) {
  const router = useRouter();
  const [searchFilter, setSearchFilter] = React.useState("");
  const [isCreateGroupOpen, setIsCreateGroupOpen] = React.useState(false);
  const [activeMenuConvId, setActiveMenuConvId] = React.useState<string | null>(null);
  const [copiedConvId, setCopiedConvId] = React.useState<string | null>(null);

  // Close context menu on outside click
  React.useEffect(() => {
    if (!activeMenuConvId) return;
    const handleOutside = () => setActiveMenuConvId(null);
    document.addEventListener("click", handleOutside);
    return () => document.removeEventListener("click", handleOutside);
  }, [activeMenuConvId]);

  const filteredConversations = React.useMemo(() => {
    const query = searchFilter.toLowerCase().trim();
    if (!query) return conversations;

    return conversations.filter((c) => {
      if (c.type === "group") {
        return (c.name || "Group").toLowerCase().includes(query);
      }
      const name = (c.otherMember?.display_name || c.name || "").toLowerCase();
      const username = (c.otherMember?.username || "").toLowerCase();
      return name.includes(query) || username.includes(query);
    });
  }, [conversations, searchFilter]);

  const handleCopyLink = (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    const url = `${window.location.origin}/chat/${convId}`;
    navigator.clipboard.writeText(url);
    setCopiedConvId(convId);
    setActiveMenuConvId(null);
    setTimeout(() => setCopiedConvId(null), 2000);
  };

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
    <>
      <div className="flex h-full flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        {/* Search & Actions Header */}
        <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-base font-bold tracking-tight text-zinc-900 dark:text-white">
              Messages
            </h2>
            <div className="flex items-center gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsCreateGroupOpen(true)}
                className="gap-1 text-xs h-7 px-2.5"
                title="Create a new group chat"
              >
                <Users className="h-3.5 w-3.5" />
                <span>New Group</span>
              </Button>
              <Link href="/friends">
                <Button
                  variant="heat"
                  size="sm"
                  className="gap-1 text-xs h-7 px-2.5"
                  title="Start a new direct chat"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Chat</span>
                </Button>
              </Link>
            </div>
          </div>

          <div className="relative">
            <Input
              placeholder="Search chats or groups..."
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
                description="Start a direct chat or create a group."
                action={
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setIsCreateGroupOpen(true)}
                      className="gap-1.5 text-xs"
                    >
                      <Users className="h-3.5 w-3.5" />
                      <span>New Group</span>
                    </Button>
                    <Link href="/friends">
                      <Button variant="heat" size="sm" className="gap-1.5 text-xs">
                        <UserPlus className="h-3.5 w-3.5" />
                        <span>Find Friends</span>
                      </Button>
                    </Link>
                  </div>
                }
              />
            )
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = activeConversationId === conv.id;
              const isGroup = conv.type === "group";
              const displayName = isGroup
                ? conv.name || "Group Chat"
                : conv.otherMember?.display_name || conv.name || "Conversation";
              const avatarUrl = isGroup
                ? conv.avatar_url
                : conv.otherMember?.avatar_url || conv.avatar_url;
              const status = isGroup ? undefined : conv.otherMember?.status || "offline";
              const timeFormatted = formatRelativeTime(conv.updated_at);
              const memberCount = conv.memberCount || (conv.members || []).length || 2;
              const isUnread = (conv.unreadCount || 0) > 0 || Boolean(conv.isMarkedUnread);

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
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setActiveMenuConvId(conv.id);
                  }}
                  className={`group relative flex items-center gap-3 rounded-2xl p-3 cursor-pointer transition-all ${
                    isSelected
                      ? "bg-heat-500 text-white shadow-sm shadow-heat-500/20 dark:bg-heat-500"
                      : isUnread
                      ? "bg-heat-50/60 dark:bg-heat-950/20 hover:bg-heat-100/60 dark:hover:bg-heat-950/30 text-zinc-900 dark:text-zinc-100 font-medium"
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
                    status={status}
                    className="shrink-0"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <h4
                          className={`truncate text-xs font-semibold ${
                            isSelected
                              ? "text-white"
                              : isUnread
                              ? "text-zinc-950 dark:text-white font-bold"
                              : "text-zinc-900 dark:text-zinc-100"
                          }`}
                        >
                          {displayName}
                        </h4>
                        {isGroup && (
                          <span
                            className={`rounded-full px-1.5 py-0.2 text-[9px] font-bold shrink-0 ${
                              isSelected
                                ? "bg-white/20 text-white"
                                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                            }`}
                          >
                            Group
                          </span>
                        )}
                      </div>
                      <span
                        className={`text-[10px] shrink-0 ${
                          isSelected
                            ? "text-white/80"
                            : isUnread
                            ? "text-heat-600 dark:text-heat-400 font-semibold"
                            : "text-zinc-400"
                        }`}
                      >
                        {timeFormatted}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p
                        className={`truncate text-[11px] flex-1 ${
                          isSelected
                            ? "text-white/80"
                            : isUnread
                            ? "text-zinc-800 dark:text-zinc-200 font-medium"
                            : "text-zinc-500 dark:text-zinc-400"
                        }`}
                      >
                        {conv.lastMessage
                          ? conv.lastMessage.content
                          : isGroup
                          ? `${memberCount} members`
                          : conv.otherMember
                          ? `@${conv.otherMember.username}`
                          : "Conversation"}
                      </p>

                      {/* Unread badge indicator */}
                      {isUnread && (
                        <span
                          className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold shrink-0 ${
                            isSelected
                              ? "bg-white text-heat-600"
                              : "bg-heat-500 text-white"
                          }`}
                        >
                          {conv.unreadCount && conv.unreadCount > 0
                            ? conv.unreadCount > 99
                              ? "99+"
                              : conv.unreadCount
                            : "1"}
                        </span>
                      )}

                      {/* 3-dots conversation menu button */}
                      <div className="relative shrink-0">
                        <button
                          type="button"
                          aria-label="Conversation options"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuConvId(
                              activeMenuConvId === conv.id ? null : conv.id
                            );
                          }}
                          className={`h-6 w-6 rounded-full flex items-center justify-center transition-opacity ${
                            activeMenuConvId === conv.id
                              ? "opacity-100 bg-zinc-200 dark:bg-zinc-700"
                              : "opacity-0 group-hover:opacity-100 hover:bg-zinc-200/60 dark:hover:bg-zinc-800"
                          } ${isSelected ? "text-white hover:bg-white/20" : "text-zinc-400"}`}
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>

                        {/* Dropdown Menu */}
                        {activeMenuConvId === conv.id && (
                          <div
                            role="menu"
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 top-7 z-50 w-44 rounded-xl border border-zinc-200 bg-white py-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-850 dark:shadow-black/50"
                          >
                            {isUnread ? (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMenuConvId(null);
                                  if (onMarkRead) onMarkRead(conv.id);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700/60 transition-colors"
                              >
                                <MailOpen className="h-3.5 w-3.5 text-zinc-400" />
                                <span>Mark as read</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMenuConvId(null);
                                  if (onMarkUnread) onMarkUnread(conv.id);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700/60 transition-colors"
                              >
                                <Mail className="h-3.5 w-3.5 text-heat-500" />
                                <span>Mark as unread</span>
                              </button>
                            )}

                            <button
                              type="button"
                              role="menuitem"
                              onClick={(e) => handleCopyLink(e, conv.id)}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700/60 transition-colors"
                            >
                              {copiedConvId === conv.id ? (
                                <>
                                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                                  <span className="text-emerald-600 font-medium">Link copied!</span>
                                </>
                              ) : (
                                <>
                                  <LinkIcon className="h-3.5 w-3.5 text-zinc-400" />
                                  <span>Copy link</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Create Group Dialog */}
      <CreateGroupDialog
        isOpen={isCreateGroupOpen}
        onClose={() => setIsCreateGroupOpen(false)}
        onGroupCreated={(id) => {
          if (onSelectConversation) {
            onSelectConversation(id);
          } else {
            router.push(`/chat/${id}`);
          }
        }}
      />
    </>
  );
}
