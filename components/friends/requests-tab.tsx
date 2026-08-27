"use client";

import * as React from "react";
import { Check, X, UserCheck, Clock, Loader2, ArrowRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import type { FriendshipRequest } from "@/types/chat";

interface RequestsTabProps {
  incomingRequests: FriendshipRequest[];
  outgoingRequests: FriendshipRequest[];
  isLoading: boolean;
  onAccept: (friendshipId: string) => Promise<{ success: boolean; error?: string }>;
  onDecline: (friendshipId: string) => Promise<{ success: boolean; error?: string }>;
  onCancel: (friendshipId: string) => Promise<{ success: boolean; error?: string }>;
}

export function RequestsTab({
  incomingRequests,
  outgoingRequests,
  isLoading,
  onAccept,
  onDecline,
  onCancel,
}: RequestsTabProps) {
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

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-3">
          <Skeleton className="h-4 w-36 rounded" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  const hasRequests = incomingRequests.length > 0 || outgoingRequests.length > 0;

  if (!hasRequests) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
        <EmptyState
          icon={<UserCheck className="h-7 w-7 text-zinc-400" />}
          title="No pending requests"
          description="When friends send you requests or when you send requests, they will appear here."
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Incoming Requests Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Incoming Requests ({incomingRequests.length})
          </span>
        </div>

        {incomingRequests.length === 0 ? (
          <div className="rounded-xl border border-zinc-100 p-4 text-center text-xs text-zinc-400 dark:border-zinc-800/80">
            No incoming friend requests.
          </div>
        ) : (
          <div className="space-y-2.5">
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
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Requested {new Date(req.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="heat"
                    size="sm"
                    onClick={() => handleAction(req.friendshipId, onAccept)}
                    disabled={actionLoadingId === req.friendshipId}
                    className="gap-1 text-xs"
                  >
                    {actionLoadingId === req.friendshipId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    <span>Accept</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleAction(req.friendshipId, onDecline)}
                    disabled={actionLoadingId === req.friendshipId}
                    className="gap-1 text-xs"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Decline</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Outgoing Requests Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Outgoing Requests ({outgoingRequests.length})
          </span>
        </div>

        {outgoingRequests.length === 0 ? (
          <div className="rounded-xl border border-zinc-100 p-4 text-center text-xs text-zinc-400 dark:border-zinc-800/80">
            No pending outgoing requests.
          </div>
        ) : (
          <div className="space-y-2.5">
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
                    <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400 mt-0.5">
                      <Clock className="h-3 w-3" />
                      Pending acceptance
                    </span>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleAction(req.friendshipId, onCancel)}
                  disabled={actionLoadingId === req.friendshipId}
                  className="gap-1 text-xs text-zinc-600 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400"
                >
                  {actionLoadingId === req.friendshipId ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <X className="h-3.5 w-3.5" />
                  )}
                  <span>Cancel Request</span>
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
