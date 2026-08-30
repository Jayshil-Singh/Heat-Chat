"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, UserCheck, Sparkles, Clock, Check, X, Loader2 } from "lucide-react";
import { useFriendsContext } from "@/hooks/use-friends-context";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export default function FriendRequestsPage() {
  const [activeTab, setActiveTab] = React.useState<"incoming" | "sent">("incoming");
  const {
    incomingRequests,
    outgoingRequests,
    isLoading,
    acceptFriendRequest,
    declineFriendRequest,
    cancelFriendRequest,
  } = useFriendsContext();

  const [actionLoadingId, setActionLoadingId] = React.useState<string | null>(null);

  const handleAction = async (
    id: string,
    action: (id: string) => Promise<{ success: boolean; error?: string }>
  ) => {
    setActionLoadingId(id);
    try {
      await action(id);
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/friends"
            className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2 text-heat-500 font-semibold text-xs mb-0.5">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Social Requests</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
              Friend Requests
            </h1>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-2xl bg-zinc-100 p-1.5 dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800 max-w-md">
        <button
          onClick={() => setActiveTab("incoming")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 ${
            activeTab === "incoming"
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
        >
          <UserCheck className="h-4 w-4" />
          <span>Incoming</span>
          {incomingRequests.length > 0 && (
            <span className="ml-1 rounded-full bg-heat-500 px-1.5 py-0.2 text-[10px] font-bold text-white shadow-sm">
              {incomingRequests.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("sent")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 ${
            activeTab === "sent"
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
        >
          <Clock className="h-4 w-4" />
          <span>Sent Requests</span>
          {outgoingRequests.length > 0 && (
            <span className="ml-1 rounded-full bg-zinc-200 px-1.5 py-0.2 text-[10px] font-bold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
              {outgoingRequests.length}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
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
              </div>
            </div>
          ))}
        </div>
      ) : activeTab === "incoming" ? (
        incomingRequests.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 p-8">
            <EmptyState
              icon={<UserCheck className="h-8 w-8 text-zinc-400" />}
              title="No incoming requests"
              description="When other members send you friend requests, you can accept or decline them here."
            />
          </div>
        ) : (
          <div className="space-y-3">
            {incomingRequests.map((req) => (
              <div
                key={req.friendshipId}
                className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50"
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <Avatar
                    src={req.profile.avatar_url}
                    name={req.profile.display_name || req.profile.username}
                    size="lg"
                    status={req.profile.status}
                  />
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {req.profile.display_name}
                    </h4>
                    <p className="truncate text-xs text-heat-600 dark:text-heat-400 font-medium">
                      @{req.profile.username}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[11px] text-zinc-400">
                        {new Date(req.createdAt).toLocaleDateString()}
                      </p>
                      {req.mutualCount !== undefined && req.mutualCount > 0 && (
                        <span className="rounded-full bg-heat-50 dark:bg-heat-950/40 px-2 py-0.5 text-[10px] font-semibold text-heat-600 dark:text-heat-400">
                          {req.mutualCount} mutual {req.mutualCount === 1 ? "friend" : "friends"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="heat"
                    size="sm"
                    onClick={() => handleAction(req.friendshipId, acceptFriendRequest)}
                    disabled={actionLoadingId === req.friendshipId}
                    className="gap-1 text-xs font-semibold shadow-sm"
                  >
                    {actionLoadingId === req.friendshipId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    <span>Accept</span>
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleAction(req.friendshipId, declineFriendRequest)}
                    disabled={actionLoadingId === req.friendshipId}
                    className="gap-1 text-xs text-zinc-600 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Decline</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : outgoingRequests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 p-8">
          <EmptyState
            icon={<Clock className="h-8 w-8 text-zinc-400" />}
            title="No sent requests"
            description="Outgoing friend requests that are pending acceptance will be listed here."
          />
        </div>
      ) : (
        <div className="space-y-3">
          {outgoingRequests.map((req) => (
            <div
              key={req.friendshipId}
              className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50"
            >
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <Avatar
                  src={req.profile.avatar_url}
                  name={req.profile.display_name || req.profile.username}
                  size="lg"
                  status={req.profile.status}
                />
                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {req.profile.display_name}
                  </h4>
                  <p className="truncate text-xs text-heat-600 dark:text-heat-400 font-medium">
                    @{req.profile.username}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400">
                      <Clock className="h-3 w-3" />
                      Pending acceptance
                    </span>
                    {req.mutualCount !== undefined && req.mutualCount > 0 && (
                      <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold text-zinc-600 dark:text-zinc-400">
                        {req.mutualCount} mutual {req.mutualCount === 1 ? "friend" : "friends"}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleAction(req.friendshipId, cancelFriendRequest)}
                disabled={actionLoadingId === req.friendshipId}
                className="gap-1 text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
              >
                {actionLoadingId === req.friendshipId ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}
                <span>Cancel</span>
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
