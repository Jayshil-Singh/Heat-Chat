"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Users, UserPlus, UserCheck, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useFriends } from "@/hooks/use-friends";
import { useConversations } from "@/hooks/use-conversations";
import { FriendsTab } from "@/components/friends/friends-tab";
import { RequestsTab } from "@/components/friends/requests-tab";
import { FindFriendsTab } from "@/components/friends/find-friends-tab";

type TabType = "friends" | "requests" | "find";

export default function FriendsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = React.useState<TabType>("friends");

  const {
    friends,
    incomingRequests,
    outgoingRequests,
    isLoading: isFriendsLoading,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    cancelFriendRequest,
    removeFriend,
    getRelationshipStatus,
  } = useFriends();

  const { getOrCreateDirectChat } = useConversations();

  const handleStartChat = async (targetUserId: string) => {
    const res = await getOrCreateDirectChat(targetUserId);
    if (res.conversationId) {
      router.push(`/chat/${res.conversationId}`);
    }
  };

  const incomingCount = incomingRequests.length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      {/* Header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div className="flex items-center gap-2 text-heat-500 font-semibold text-xs mb-1">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Friends & Connections</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Friends
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Connect with trusted friends and manage your close contacts
        </p>
      </div>

      {/* Tabs Switcher */}
      <div className="flex items-center gap-1 rounded-2xl bg-zinc-100 p-1.5 dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800">
        <button
          onClick={() => setActiveTab("friends")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 ${
            activeTab === "friends"
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
        >
          <Users className="h-4 w-4" />
          <span>Friends</span>
          {friends.length > 0 && (
            <span className="ml-1 rounded-full bg-zinc-200 px-1.5 py-0.2 text-[10px] font-bold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
              {friends.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("requests")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 relative ${
            activeTab === "requests"
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
        >
          <UserCheck className="h-4 w-4" />
          <span>Requests</span>
          {incomingCount > 0 && (
            <span className="ml-1 rounded-full bg-heat-500 px-1.5 py-0.2 text-[10px] font-bold text-white shadow-sm">
              {incomingCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("find")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 ${
            activeTab === "find"
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
        >
          <UserPlus className="h-4 w-4" />
          <span>Find Friends</span>
        </button>
      </div>

      {/* Tab Panels */}
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 md:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/40 min-h-[360px]">
        {activeTab === "friends" && (
          <FriendsTab
            friends={friends}
            isLoading={isFriendsLoading}
            onRemoveFriend={removeFriend}
            onStartChat={handleStartChat}
            onFindFriendsClick={() => setActiveTab("find")}
          />
        )}

        {activeTab === "requests" && (
          <RequestsTab
            incomingRequests={incomingRequests}
            outgoingRequests={outgoingRequests}
            isLoading={isFriendsLoading}
            onAccept={acceptFriendRequest}
            onDecline={declineFriendRequest}
            onCancel={cancelFriendRequest}
          />
        )}

        {activeTab === "find" && (
          <FindFriendsTab
            currentUserId={user?.id}
            onStartChat={handleStartChat}
          />
        )}
      </div>
    </div>
  );
}
