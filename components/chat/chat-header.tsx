"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, User, Users, Info, WifiOff, Bell, BellOff, Search, Star, Pin } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { UserProfileDialog } from "@/components/profile/user-profile-dialog";
import { GroupDetailsDialog } from "./group-details-dialog";
import { usePresence } from "@/hooks/use-presence";
import { useNotificationContext } from "@/components/notifications/notification-provider";
import type { ConversationWithDetails } from "@/types/chat";
import type { ConnectionStatus } from "@/hooks/use-realtime-chat";

interface ChatHeaderProps {
  conversation: ConversationWithDetails | null;
  connectionStatus?: ConnectionStatus;
  isOnline?: boolean;
  pinnedCount?: number;
  onBack?: () => void;
  onRefreshConversation?: () => void;
  onToggleSearch?: () => void;
  onOpenStarred?: () => void;
  onTogglePinned?: () => void;
}

export function ChatHeader({
  conversation,
  connectionStatus = "connected",
  isOnline = false,
  pinnedCount = 0,
  onBack,
  onRefreshConversation,
  onToggleSearch,
  onOpenStarred,
  onTogglePinned,
}: ChatHeaderProps) {
  const router = useRouter();
  const { isUserOnline } = usePresence();
  const { isConversationMuted, toggleMute } = useNotificationContext();
  const [showProfileModal, setShowProfileModal] = React.useState(false);
  const [showGroupModal, setShowGroupModal] = React.useState(false);

  if (!conversation) return null;

  const isMuted = isConversationMuted(conversation.id);

  const handleToggleMute = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await toggleMute(conversation.id, !isMuted);
  };

  const isGroup = conversation.type === "group";
  const displayName = isGroup
    ? conversation.name || "Group Chat"
    : conversation.otherMember?.display_name || conversation.name || "Conversation";
  const avatarUrl = isGroup
    ? conversation.avatar_url
    : conversation.otherMember?.avatar_url || conversation.avatar_url;
  const username = conversation.otherMember?.username;
  const computedStatus = isOnline ? "online" : conversation.otherMember?.status || "offline";

  // Calculate online count for groups
  const memberList = conversation.memberDetails || [];
  const onlineMemberCount = memberList.filter((m) => isUserOnline(m.userId)).length;
  const totalMemberCount = conversation.memberCount || memberList.length || 2;

  const handleBackClick = () => {
    if (onBack) {
      onBack();
    } else {
      router.push("/chat");
    }
  };

  const handleHeaderClick = () => {
    if (isGroup) {
      setShowGroupModal(true);
    } else if (conversation.otherMember) {
      setShowProfileModal(true);
    }
  };

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b border-zinc-200 bg-white/95 px-4 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 shrink-0 select-none">
        <div className="flex items-center gap-3 min-w-0">
          {/* Mobile Back Button */}
          <button
            onClick={handleBackClick}
            className="md:hidden rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500"
            aria-label="Back to conversations list"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          {/* User / Chat Info */}
          <div
            onClick={handleHeaderClick}
            className="flex items-center gap-3 min-w-0 cursor-pointer group"
          >
            <Avatar
              src={avatarUrl}
              name={displayName}
              size="default"
              status={isGroup ? undefined : isOnline ? "online" : computedStatus}
            />

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-sm font-bold text-zinc-900 group-hover:text-heat-600 dark:text-white dark:group-hover:text-heat-400 transition-colors">
                  {displayName}
                </h3>
                {isGroup && (
                  <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.2 text-[9px] font-bold text-zinc-600 dark:text-zinc-300">
                    Group
                  </span>
                )}
                {connectionStatus === "reconnecting" && (
                  <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.2 text-[10px] font-medium text-amber-600 dark:bg-amber-950/50">
                    <WifiOff className="h-2.5 w-2.5" />
                    <span>Reconnecting</span>
                  </span>
                )}
              </div>
              <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                {isGroup ? (
                  <>
                    <span>{totalMemberCount} members</span>
                    <span>•</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      {onlineMemberCount} online
                    </span>
                  </>
                ) : username ? (
                  <>
                    <span>@{username}</span>
                    <span>•</span>
                    <span className={`capitalize ${isOnline ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}`}>
                      {isOnline ? "Online" : computedStatus}
                    </span>
                  </>
                ) : (
                  <span>Direct Conversation</span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {onToggleSearch && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onToggleSearch}
              title="Search in conversation (Ctrl+F)"
              aria-label="Search messages in conversation"
            >
              <Search className="h-4 w-4 text-zinc-500 hover:text-heat-500" />
            </Button>
          )}

          {onTogglePinned && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onTogglePinned}
              title={pinnedCount > 0 ? `Pinned messages (${pinnedCount})` : "Pinned messages"}
              aria-label="View pinned messages"
              className="relative"
            >
              <Pin className={`h-4 w-4 ${pinnedCount > 0 ? "text-amber-500 fill-amber-500" : "text-zinc-500 hover:text-amber-500"}`} />
              {pinnedCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white shadow-2xs">
                  {pinnedCount}
                </span>
              )}
            </Button>
          )}

          {onOpenStarred && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onOpenStarred}
              title="Starred messages"
              aria-label="View starred messages"
            >
              <Star className="h-4 w-4 text-zinc-500 hover:text-amber-500" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleToggleMute}
            title={isMuted ? "Unmute notifications" : "Mute notifications"}
            aria-label={isMuted ? "Unmute conversation notifications" : "Mute conversation notifications"}
          >
            {isMuted ? (
              <BellOff className="h-4 w-4 text-amber-500 hover:text-amber-600" />
            ) : (
              <Bell className="h-4 w-4 text-zinc-500 hover:text-heat-500" />
            )}
          </Button>

          {isGroup ? (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowGroupModal(true)}
              title="Group info & members"
              aria-label="View group details and members"
            >
              <Users className="h-4 w-4 text-zinc-500 hover:text-heat-500" />
            </Button>
          ) : (
            conversation.otherMember && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setShowProfileModal(true)}
                title="View profile"
                aria-label="View user profile"
              >
                <User className="h-4 w-4 text-zinc-500" />
              </Button>
            )
          )}
        </div>
      </header>

      {/* User Profile Modal (Direct chats) */}
      {!isGroup && (
        <UserProfileDialog
          user={conversation.otherMember || null}
          isOpen={showProfileModal}
          onClose={() => setShowProfileModal(false)}
        />
      )}

      {/* Group Details Modal (Group chats) */}
      {isGroup && (
        <GroupDetailsDialog
          conversation={conversation}
          isOpen={showGroupModal}
          onClose={() => setShowGroupModal(false)}
          onRefreshConversation={onRefreshConversation}
        />
      )}
    </>
  );
}
