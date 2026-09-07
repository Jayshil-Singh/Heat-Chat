"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, User, Users, Info, WifiOff, Bell, BellOff, Search, Star, Bookmark, Pin, Images, MoreVertical } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { UserProfileDialog } from "@/components/profile/user-profile-dialog";
import { GroupDetailsDialog } from "./group-details-dialog";
import { MediaGalleryDialog } from "./media-gallery-dialog";
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
  onOpenMedia?: () => void;
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
  onOpenMedia,
}: ChatHeaderProps) {
  const router = useRouter();
  const { isUserOnline } = usePresence();
  const { isConversationMuted, toggleMute } = useNotificationContext();
  const [showProfileModal, setShowProfileModal] = React.useState(false);
  const [showGroupModal, setShowGroupModal] = React.useState(false);
  const [showMediaGallery, setShowMediaGallery] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const mobileMenuTriggerRef = React.useRef<HTMLButtonElement>(null);
  const mobileMenuRef = React.useRef<HTMLDivElement>(null);

  // Close mobile menu on outside click
  React.useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        mobileMenuRef.current &&
        !mobileMenuRef.current.contains(e.target as Node) &&
        mobileMenuTriggerRef.current &&
        !mobileMenuTriggerRef.current.contains(e.target as Node)
      ) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [mobileMenuOpen]);

  // Escape to close
  React.useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileMenuOpen(false);
        mobileMenuTriggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

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
      <header className="flex h-16 items-center justify-between border-b border-zinc-200 bg-white/95 px-2.5 sm:px-4 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 shrink-0 select-none w-full min-w-0 max-w-full gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          {/* Mobile Back Button */}
          <button
            onClick={handleBackClick}
            className="md:hidden rounded-lg p-1.5 sm:p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 shrink-0"
            aria-label="Back to conversations list"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          {/* User / Chat Info */}
          <div
            onClick={handleHeaderClick}
            className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 cursor-pointer group"
          >
            <Avatar
              src={avatarUrl}
              name={displayName}
              size="default"
              status={isGroup ? undefined : isOnline ? "online" : computedStatus}
              className="shrink-0"
            />

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h3 className="truncate text-sm font-bold text-zinc-900 group-hover:text-heat-600 dark:text-white dark:group-hover:text-heat-400 transition-colors">
                  {displayName}
                </h3>
                {isGroup && (
                  <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.2 text-[9px] font-bold text-zinc-600 dark:text-zinc-300 shrink-0">
                    Group
                  </span>
                )}
                {connectionStatus === "reconnecting" && (
                  <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.2 text-[10px] font-medium text-amber-600 dark:bg-amber-950/50 shrink-0">
                    <WifiOff className="h-2.5 w-2.5" />
                    <span className="hidden xs:inline">Reconnecting</span>
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

        {/* Mobile Actions: Media Gallery + More overflow menu */}
        <div className="flex sm:hidden items-center gap-0.5 shrink-0">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setShowMediaGallery(true)}
            title="Shared media, audio & files"
            aria-label="View shared media gallery"
            className="h-8 w-8 text-zinc-500 hover:text-heat-500"
          >
            <Images className="h-4 w-4" />
          </Button>

          <div className="relative">
            <Button
              ref={mobileMenuTriggerRef}
              variant="ghost"
              size="icon-sm"
              onClick={() => setMobileMenuOpen((v) => !v)}
              title="More actions"
              aria-label="More conversation actions"
              aria-expanded={mobileMenuOpen}
              aria-haspopup="menu"
              className="h-8 w-8 text-zinc-500 relative"
            >
              <MoreVertical className="h-4 w-4" />
              {pinnedCount > 0 && (
                <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-amber-500 ring-1 ring-white dark:ring-zinc-950" />
              )}
            </Button>

            {mobileMenuOpen && (
              <div
                ref={mobileMenuRef}
                role="menu"
                aria-orientation="vertical"
                className="absolute right-0 top-10 z-50 w-48 rounded-2xl border border-zinc-200 bg-white py-1.5 shadow-xl dark:border-zinc-700 dark:bg-zinc-850 dark:shadow-black/50 animate-in fade-in zoom-in-95 duration-100"
              >
                {onToggleSearch && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onToggleSearch();
                      setMobileMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700/60 transition-colors"
                  >
                    <Search className="h-3.5 w-3.5 text-zinc-400" />
                    <span>Search in chat</span>
                  </button>
                )}

                {onTogglePinned && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onTogglePinned();
                      setMobileMenuOpen(false);
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700/60 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <Pin className={`h-3.5 w-3.5 ${pinnedCount > 0 ? "text-amber-500 fill-amber-500" : "text-zinc-400"}`} />
                      <span>Pinned messages</span>
                    </div>
                    {pinnedCount > 0 && (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.2 text-[10px] font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                        {pinnedCount}
                      </span>
                    )}
                  </button>
                )}

                {onOpenStarred && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onOpenStarred();
                      setMobileMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700/60 transition-colors"
                  >
                    <Bookmark className="h-3.5 w-3.5 text-zinc-400" />
                    <span>Saved messages</span>
                  </button>
                )}

                <button
                  type="button"
                  role="menuitem"
                  onClick={async (e) => {
                    await handleToggleMute(e);
                    setMobileMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700/60 transition-colors"
                >
                  {isMuted ? (
                    <>
                      <Bell className="h-3.5 w-3.5 text-zinc-400" />
                      <span>Unmute notifications</span>
                    </>
                  ) : (
                    <>
                      <BellOff className="h-3.5 w-3.5 text-amber-500" />
                      <span>Mute notifications</span>
                    </>
                  )}
                </button>

                <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    handleHeaderClick();
                    setMobileMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700/60 transition-colors"
                >
                  {isGroup ? (
                    <>
                      <Users className="h-3.5 w-3.5 text-zinc-400" />
                      <span>Group details</span>
                    </>
                  ) : (
                    <>
                      <User className="h-3.5 w-3.5 text-zinc-400" />
                      <span>View profile</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Desktop Actions */}
        <div className="hidden sm:flex items-center gap-1 shrink-0">
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
              title="Saved messages"
              aria-label="View saved messages"
            >
              <Bookmark className="h-4 w-4 text-zinc-500 hover:text-amber-500" />
            </Button>
          )}

          {/* Media Gallery button */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setShowMediaGallery(true)}
            title="Shared media, audio & files"
            aria-label="View shared media gallery"
          >
            <Images className="h-4 w-4 text-zinc-500 hover:text-heat-500" />
          </Button>

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

      {/* Media Gallery */}
      <MediaGalleryDialog
        conversationId={conversation.id}
        isOpen={showMediaGallery}
        onClose={() => setShowMediaGallery(false)}
      />
    </>
  );
}
