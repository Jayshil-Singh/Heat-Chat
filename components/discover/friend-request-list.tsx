"use client";

import * as React from "react";
import { UserCheck, Send, Clock, Inbox } from "lucide-react";
import { FriendRequestCard } from "./friend-request-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PersonCardSkeleton } from "./person-card-skeleton";
import type { FriendRequestWithProfile } from "@/types/chat";

interface FriendRequestListProps {
  incoming: FriendRequestWithProfile[];
  outgoing: FriendRequestWithProfile[];
  isLoading: boolean;
  onAccept: (requestId: string) => Promise<{ success: boolean; error?: string }>;
  onDecline: (requestId: string) => Promise<{ success: boolean; error?: string }>;
  onCancel: (requestId: string) => Promise<{ success: boolean; error?: string }>;
}

export function FriendRequestList({
  incoming,
  outgoing,
  isLoading,
  onAccept,
  onDecline,
  onCancel,
}: FriendRequestListProps) {
  const [subTab, setSubTab] = React.useState<"received" | "sent">("received");

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <PersonCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sub-tabs: Received vs Sent */}
      <div className="flex items-center gap-1.5 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 max-w-sm">
        <button
          type="button"
          onClick={() => setSubTab("received")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all min-h-[44px] sm:min-h-[34px] ${
            subTab === "received"
              ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-white"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
        >
          <Inbox className="h-3.5 w-3.5" />
          <span>Received</span>
          {incoming.length > 0 && (
            <span className="ml-1 rounded-full bg-heat-500 px-1.5 py-0.2 text-[10px] font-bold text-white">
              {incoming.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setSubTab("sent")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all min-h-[44px] sm:min-h-[34px] ${
            subTab === "sent"
              ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-white"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
        >
          <Send className="h-3.5 w-3.5" />
          <span>Sent</span>
          {outgoing.length > 0 && (
            <span className="ml-1 rounded-full bg-zinc-200 px-1.5 py-0.2 text-[10px] font-bold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
              {outgoing.length}
            </span>
          )}
        </button>
      </div>

      {/* Requests list */}
      {subTab === "received" ? (
        incoming.length > 0 ? (
          <div className="space-y-3">
            {incoming.map((req) => (
              <FriendRequestCard
                key={req.requestId}
                request={req}
                type="received"
                onAccept={onAccept}
                onDecline={onDecline}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Inbox className="h-6 w-6 text-zinc-400" />}
            title="No received requests"
            description="When someone sends you a friend request, it will appear here."
            className="py-12"
          />
        )
      ) : outgoing.length > 0 ? (
        <div className="space-y-3">
          {outgoing.map((req) => (
            <FriendRequestCard
              key={req.requestId}
              request={req}
              type="sent"
              onCancel={onCancel}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Send className="h-6 w-6 text-zinc-400" />}
          title="No sent requests"
          description="Requests you send to other users will show up here until they respond."
          className="py-12"
        />
      )}
    </div>
  );
}
