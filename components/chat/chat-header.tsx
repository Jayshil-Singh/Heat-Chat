"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, User, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { UserProfileDialog } from "@/components/profile/user-profile-dialog";
import type { ConversationWithDetails } from "@/types/chat";
import type { ConnectionStatus } from "@/hooks/use-realtime-chat";

interface ChatHeaderProps {
  conversation: ConversationWithDetails | null;
  connectionStatus?: ConnectionStatus;
  isOnline?: boolean;
  onBack?: () => void;
}

export function ChatHeader({
  conversation,
  connectionStatus = "connected",
  isOnline = false,
  onBack,
}: ChatHeaderProps) {
  const router = useRouter();
  const [showProfileModal, setShowProfileModal] = React.useState(false);

  if (!conversation) return null;

  const displayName = conversation.otherMember?.display_name || conversation.name || "Conversation";
  const avatarUrl = conversation.otherMember?.avatar_url || conversation.avatar_url;
  const username = conversation.otherMember?.username;
  const computedStatus = isOnline ? "online" : conversation.otherMember?.status || "offline";

  const handleBackClick = () => {
    if (onBack) {
      onBack();
    } else {
      router.push("/chat");
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
            onClick={() => {
              if (conversation.otherMember) {
                setShowProfileModal(true);
              }
            }}
            className="flex items-center gap-3 min-w-0 cursor-pointer group"
          >
            <Avatar
              src={avatarUrl}
              name={displayName}
              size="default"
              status={conversation.type === "direct" ? (isOnline ? "online" : computedStatus) : undefined}
            />

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-sm font-bold text-zinc-900 group-hover:text-heat-600 dark:text-white dark:group-hover:text-heat-400 transition-colors">
                  {displayName}
                </h3>
                {connectionStatus === "reconnecting" && (
                  <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.2 text-[10px] font-medium text-amber-600 dark:bg-amber-950/50">
                    <WifiOff className="h-2.5 w-2.5" />
                    <span>Reconnecting</span>
                  </span>
                )}
              </div>
              <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                {username ? (
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
          {conversation.otherMember && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowProfileModal(true)}
              title="View profile"
              aria-label="View user profile"
            >
              <User className="h-4 w-4 text-zinc-500" />
            </Button>
          )}
        </div>
      </header>

      {/* User Profile Modal */}
      <UserProfileDialog
        user={conversation.otherMember || null}
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
      />
    </>
  );
}
