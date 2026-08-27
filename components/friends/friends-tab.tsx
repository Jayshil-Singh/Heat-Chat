"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, User, UserMinus, Users, Loader2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { RemoveFriendDialog } from "./remove-friend-dialog";
import { UserProfileDialog } from "@/components/profile/user-profile-dialog";
import type { FriendItem } from "@/types/chat";

interface FriendsTabProps {
  friends: FriendItem[];
  isLoading: boolean;
  onRemoveFriend: (friendshipId: string) => Promise<{ success: boolean; error?: string }>;
  onStartChat: (friendId: string) => Promise<void>;
  onFindFriendsClick: () => void;
}

export function FriendsTab({
  friends,
  isLoading,
  onRemoveFriend,
  onStartChat,
  onFindFriendsClick,
}: FriendsTabProps) {
  const router = useRouter();
  const [selectedFriendForRemoval, setSelectedFriendForRemoval] = React.useState<FriendItem | null>(null);
  const [selectedFriendForProfile, setSelectedFriendForProfile] = React.useState<FriendItem | null>(null);
  const [chatLoadingId, setChatLoadingId] = React.useState<string | null>(null);

  const handleMessageClick = async (friend: FriendItem) => {
    setChatLoadingId(friend.friendId);
    try {
      await onStartChat(friend.friendId);
    } finally {
      setChatLoadingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50"
          >
            <div className="flex items-center gap-3.5 flex-1">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="space-y-2 flex-1 max-w-xs">
                <Skeleton className="h-4 w-3/4 rounded" />
                <Skeleton className="h-3 w-1/2 rounded" />
              </div>
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-20 rounded-lg" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (friends.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
        <EmptyState
          icon={<Users className="h-7 w-7 text-heat-500" />}
          title="No friends yet"
          description="Find someone you know and send them a friend request."
          action={
            <Button
              variant="heat"
              size="default"
              onClick={onFindFriendsClick}
              className="gap-2"
            >
              <Users className="h-4 w-4" />
              <span>Find Friends</span>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          All Friends ({friends.length})
        </span>
      </div>

      {friends.map((friend) => (
        <div
          key={friend.friendshipId}
          className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-zinc-700 transition-all"
        >
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <Avatar
              src={friend.profile.avatar_url}
              name={friend.profile.display_name || friend.profile.username}
              size="lg"
              status={friend.profile.status}
            />
            <div className="min-w-0 flex-1">
              <h4 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {friend.profile.display_name}
              </h4>
              <p className="truncate text-xs text-heat-600 dark:text-heat-400 font-medium">
                @{friend.profile.username}
              </p>
              {friend.profile.bio && (
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {friend.profile.bio}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="heat"
              size="sm"
              onClick={() => handleMessageClick(friend)}
              disabled={chatLoadingId === friend.friendId}
              className="gap-1.5 text-xs"
            >
              {chatLoadingId === friend.friendId ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <MessageSquare className="h-3.5 w-3.5" />
              )}
              <span>Message</span>
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSelectedFriendForProfile(friend)}
              className="gap-1 text-xs hidden sm:inline-flex"
            >
              <User className="h-3.5 w-3.5" />
              <span>Profile</span>
            </Button>

            <button
              onClick={() => setSelectedFriendForRemoval(friend)}
              className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-800 dark:hover:text-red-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500"
              title="Remove friend"
              aria-label={`Remove ${friend.profile.display_name}`}
            >
              <UserMinus className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}

      {/* Remove Friend Confirmation Dialog */}
      <RemoveFriendDialog
        friend={selectedFriendForRemoval}
        isOpen={Boolean(selectedFriendForRemoval)}
        onClose={() => setSelectedFriendForRemoval(null)}
        onConfirm={async (f) => {
          await onRemoveFriend(f.friendshipId);
        }}
      />

      {/* User Profile View Dialog */}
      <UserProfileDialog
        user={selectedFriendForProfile?.profile || null}
        isOpen={Boolean(selectedFriendForProfile)}
        onClose={() => setSelectedFriendForProfile(null)}
        onStartChat={(p) => {
          setSelectedFriendForProfile(null);
          onStartChat(p.id);
        }}
      />
    </div>
  );
}
