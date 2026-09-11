"use client";

import * as React from "react";
import { Check, X, Clock, Loader2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { parseMessageDate } from "@/lib/utils/date";
import type { FriendRequestWithProfile } from "@/types/chat";

interface FriendRequestCardProps {
  request: FriendRequestWithProfile;
  type: "received" | "sent";
  onAccept?: (requestId: string) => Promise<{ success: boolean; error?: string }>;
  onDecline?: (requestId: string) => Promise<{ success: boolean; error?: string }>;
  onCancel?: (requestId: string) => Promise<{ success: boolean; error?: string }>;
  className?: string;
}

export function FriendRequestCard({
  request,
  type,
  onAccept,
  onDecline,
  onCancel,
  className,
}: FriendRequestCardProps) {
  const [isPending, setIsPending] = React.useState(false);
  const profile = type === "received" ? request.sender : request.recipient;

  const handleAccept = async () => {
    if (!onAccept) return;
    setIsPending(true);
    await onAccept(request.requestId);
    setIsPending(false);
  };

  const handleDecline = async () => {
    if (!onDecline) return;
    setIsPending(true);
    await onDecline(request.requestId);
    setIsPending(false);
  };

  const handleCancel = async () => {
    if (!onCancel) return;
    setIsPending(true);
    await onCancel(request.requestId);
    setIsPending(false);
  };

  if (!profile) return null;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-xs transition-all dark:border-zinc-800/90 dark:bg-zinc-900/60 sm:flex-row sm:items-center sm:justify-between w-full min-w-0 max-w-full box-border",
        className
      )}
    >
      <div className="flex items-start gap-3.5 min-w-0 flex-1">
        <Avatar
          src={profile.avatarUrl}
          alt={profile.displayName}
          name={profile.displayName}
          size="default"
          className="h-11 w-11 shrink-0 rounded-full"
        />

        <div className="space-y-0.5 min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h4 className="text-sm font-bold text-zinc-900 dark:text-white truncate">
              {profile.displayName}
            </h4>
            {profile.username && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                @{profile.username}
              </span>
            )}
          </div>

          {profile.bio && (
            <p className="text-xs text-zinc-600 dark:text-zinc-300 line-clamp-1 break-words">
              {profile.bio}
            </p>
          )}

          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 pt-0.5 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>
              {type === "received" ? "Received" : "Sent"} {parseMessageDate(request.createdAt)?.toLocaleDateString() || ""}
            </span>
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 self-end sm:self-center shrink-0 pt-2 sm:pt-0 w-full sm:w-auto justify-end">
        {type === "received" ? (
          <>
            <Button
              size="sm"
              onClick={handleAccept}
              disabled={isPending}
              className="h-9 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold gap-1.5 shadow-xs min-h-[44px] sm:min-h-[36px]"
              aria-label={`Accept friend request from ${profile.displayName}`}
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              <span>Accept</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDecline}
              disabled={isPending}
              className="h-9 px-3 rounded-xl text-xs text-zinc-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 min-h-[44px] sm:min-h-[36px]"
              aria-label={`Decline friend request from ${profile.displayName}`}
            >
              <X className="h-3.5 w-3.5" />
              <span className="ml-1">Decline</span>
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            disabled={isPending}
            className="h-9 px-3 rounded-xl text-xs text-zinc-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 min-h-[44px] sm:min-h-[36px]"
            aria-label={`Cancel request sent to ${profile.displayName}`}
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <X className="h-3.5 w-3.5" />
            )}
            <span className="ml-1">Cancel Request</span>
          </Button>
        )}
      </div>
    </div>
  );
}
