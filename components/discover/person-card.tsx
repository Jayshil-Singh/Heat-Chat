"use client";

import * as React from "react";
import { UserPlus, UserCheck, Check, Clock, X, MessageSquare, Users, Loader2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import type { DiscoverablePerson } from "@/types/chat";

interface PersonCardProps {
  person: DiscoverablePerson;
  onSendRequest: (targetUserId: string) => Promise<{ success: boolean; error?: string }>;
  onCancelRequest: (requestId: string, targetUserId: string) => Promise<{ success: boolean; error?: string }>;
  onAcceptRequest: (requestId: string, targetUserId: string) => Promise<{ success: boolean; error?: string }>;
  onStartChat?: (targetUserId: string) => void;
  className?: string;
}

export function PersonCard({
  person,
  onSendRequest,
  onCancelRequest,
  onAcceptRequest,
  onStartChat,
  className,
}: PersonCardProps) {
  const [isPending, setIsPending] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [optimisticStatus, setOptimisticStatus] = React.useState<DiscoverablePerson["relationship_status"] | null>(null);

  const effectiveStatus = optimisticStatus ?? person.relationship_status;

  React.useEffect(() => {
    setOptimisticStatus(null);
  }, [person.relationship_status, person.pending_request_id]);

  const handleSend = async () => {
    setOptimisticStatus("outgoing_pending");
    setIsPending(true);
    setActionError(null);
    const res = await onSendRequest(person.user_id);
    if (!res.success) {
      setOptimisticStatus(null);
      if (res.error) setActionError(res.error);
    }
    setIsPending(false);
  };

  const handleCancel = async () => {
    if (!person.pending_request_id) return;
    setOptimisticStatus("none");
    setIsPending(true);
    setActionError(null);
    const res = await onCancelRequest(person.pending_request_id, person.user_id);
    if (!res.success) {
      setOptimisticStatus(null);
      if (res.error) setActionError(res.error);
    }
    setIsPending(false);
  };

  const handleAccept = async () => {
    if (!person.pending_request_id) return;
    setOptimisticStatus("friends");
    setIsPending(true);
    setActionError(null);
    const res = await onAcceptRequest(person.pending_request_id, person.user_id);
    if (!res.success) {
      setOptimisticStatus(null);
      if (res.error) setActionError(res.error);
    }
    setIsPending(false);
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3.5 rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-xs transition-all hover:border-zinc-300 dark:border-zinc-800/90 dark:bg-zinc-900/60 dark:hover:border-zinc-700 sm:flex-row sm:items-center sm:justify-between w-full min-w-0 max-w-full box-border",
        className
      )}
    >
      {/* Profile info section */}
      <div className="flex items-start gap-3.5 min-w-0 flex-1">
        <Avatar
          src={person.avatar_url}
          alt={person.display_name}
          name={person.display_name}
          size="lg"
          className="h-12 w-12 shrink-0 rounded-full"
        />

        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white truncate">
              {person.display_name}
            </h3>
            {person.username && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                @{person.username}
              </span>
            )}
          </div>

          {person.bio && (
            <p className="text-xs text-zinc-600 dark:text-zinc-300 line-clamp-2 leading-relaxed break-words">
              {person.bio}
            </p>
          )}

          <div className="flex items-center gap-2 pt-0.5 flex-wrap">
            {person.mutual_friend_count > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                <Users className="h-3 w-3 text-heat-500" />
                <span>
                  {person.mutual_friend_count} mutual {person.mutual_friend_count === 1 ? "friend" : "friends"}
                </span>
              </span>
            )}
          </div>

          {actionError && (
            <p className="text-[11px] text-rose-500 pt-1" role="alert">
              {actionError}
            </p>
          )}
        </div>
      </div>

      {/* Action buttons section */}
      <div className="flex items-center gap-2 self-end sm:self-center shrink-0 pt-2 sm:pt-0 w-full sm:w-auto justify-end">
        {effectiveStatus === "none" && (
          <Button
            size="sm"
            onClick={handleSend}
            disabled={isPending}
            className="h-9 px-3.5 rounded-xl bg-heat-500 hover:bg-heat-600 text-white text-xs font-semibold gap-1.5 shadow-xs min-h-[44px] sm:min-h-[36px]"
            aria-label={`Send friend request to ${person.display_name}`}
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <UserPlus className="h-3.5 w-3.5" />
            )}
            <span>Add Friend</span>
          </Button>
        )}

        {effectiveStatus === "outgoing_pending" && (
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <span className="inline-flex items-center gap-1 rounded-xl bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-900/40">
              <Clock className="h-3.5 w-3.5" />
              <span>Request Sent</span>
            </span>
            {person.pending_request_id && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                disabled={isPending}
                className="h-8 px-2 text-xs text-zinc-500 hover:text-rose-500 dark:hover:text-rose-400 min-h-[44px] sm:min-h-[32px]"
                aria-label={`Cancel friend request to ${person.display_name}`}
              >
                {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                <span className="ml-1">Cancel</span>
              </Button>
            )}
          </div>
        )}

        {effectiveStatus === "incoming_pending" && (
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <Button
              size="sm"
              onClick={handleAccept}
              disabled={isPending}
              className="h-9 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold gap-1.5 shadow-xs min-h-[44px] sm:min-h-[36px]"
              aria-label={`Accept friend request from ${person.display_name}`}
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              <span>Accept</span>
            </Button>
          </div>
        )}

        {effectiveStatus === "friends" && (
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/40">
              <UserCheck className="h-3.5 w-3.5" />
              <span>Friends</span>
            </span>
            {onStartChat && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onStartChat(person.user_id)}
                className="h-9 px-3 rounded-xl text-xs font-medium gap-1.5 border-zinc-200 dark:border-zinc-800 hover:border-heat-500 min-h-[44px] sm:min-h-[36px]"
                aria-label={`Send direct message to ${person.display_name}`}
              >
                <MessageSquare className="h-3.5 w-3.5 text-heat-500" />
                <span>Message</span>
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
