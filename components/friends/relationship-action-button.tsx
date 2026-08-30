"use client";

import * as React from "react";
import { UserPlus, UserCheck, UserX, Clock, Check, X, Loader2, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RelationshipStateDto } from "@/types/database";

interface RelationshipActionButtonProps {
  userId: string;
  relationship: RelationshipStateDto;
  onStateChanged?: () => void;
  size?: "sm" | "default";
  className?: string;
}

export function RelationshipActionButton({
  userId,
  relationship,
  onStateChanged,
  size = "sm",
  className = "",
}: RelationshipActionButtonProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const [currentRel, setCurrentRel] = React.useState<RelationshipStateDto>(relationship);

  React.useEffect(() => {
    setCurrentRel(relationship);
  }, [relationship]);

  // Send friend request
  const handleSendRequest = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/friends/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: userId }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.status === "FRIENDS") {
          setCurrentRel((prev) => ({ ...prev, friendship: "FRIENDS" }));
        } else {
          setCurrentRel((prev) => ({
            ...prev,
            friendship: "PENDING_OUTGOING",
            requestId: data.friendshipId,
          }));
        }
        onStateChanged?.();
      }
    } catch (err) {
      console.error("Failed to send friend request:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Accept incoming request
  const handleAcceptRequest = async () => {
    if (!currentRel.requestId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/friends/requests/${currentRel.requestId}/accept`, {
        method: "POST",
      });
      if (res.ok) {
        setCurrentRel((prev) => ({ ...prev, friendship: "FRIENDS" }));
        onStateChanged?.();
      }
    } catch (err) {
      console.error("Failed to accept friend request:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Decline incoming request
  const handleDeclineRequest = async () => {
    if (!currentRel.requestId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/friends/requests/${currentRel.requestId}/decline`, {
        method: "POST",
      });
      if (res.ok) {
        setCurrentRel((prev) => ({ ...prev, friendship: "NONE", requestId: null }));
        onStateChanged?.();
      }
    } catch (err) {
      console.error("Failed to decline friend request:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Cancel outgoing request
  const handleCancelRequest = async () => {
    if (!currentRel.requestId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/friends/requests/${currentRel.requestId}/cancel`, {
        method: "POST",
      });
      if (res.ok) {
        setCurrentRel((prev) => ({ ...prev, friendship: "NONE", requestId: null }));
        onStateChanged?.();
      }
    } catch (err) {
      console.error("Failed to cancel friend request:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Remove friend
  const handleRemoveFriend = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/friends/${userId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setCurrentRel((prev) => ({ ...prev, friendship: "NONE", requestId: null }));
        onStateChanged?.();
      }
    } catch (err) {
      console.error("Failed to remove friend:", err);
    } finally {
      setIsLoading(false);
    }
  };

  if (currentRel.isBlocked || currentRel.hasBlockedViewer) {
    return (
      <div className="flex items-center gap-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-500">
        <Ban className="h-3.5 w-3.5" />
        <span>Blocked</span>
      </div>
    );
  }

  if (currentRel.friendship === "SELF") {
    return null;
  }

  if (currentRel.friendship === "FRIENDS") {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        <Button
          type="button"
          variant="secondary"
          size={size}
          disabled={isLoading}
          onClick={handleRemoveFriend}
          className="gap-1.5 text-zinc-700 hover:text-red-600 dark:text-zinc-300 dark:hover:text-red-400"
          title="Remove from friends"
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <UserCheck className="h-3.5 w-3.5 text-emerald-500" />
          )}
          <span>Friends</span>
        </Button>
      </div>
    );
  }

  if (currentRel.friendship === "PENDING_INCOMING") {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        <Button
          type="button"
          variant="heat"
          size={size}
          disabled={isLoading}
          onClick={handleAcceptRequest}
          className="gap-1.5 font-semibold"
        >
          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          <span>Accept</span>
        </Button>
        <Button
          type="button"
          variant="secondary"
          size={size}
          disabled={isLoading}
          onClick={handleDeclineRequest}
          className="gap-1.5 text-zinc-600 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400"
        >
          <X className="h-3.5 w-3.5" />
          <span>Decline</span>
        </Button>
      </div>
    );
  }

  if (currentRel.friendship === "PENDING_OUTGOING") {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        <Button
          type="button"
          variant="secondary"
          size={size}
          disabled={isLoading}
          onClick={handleCancelRequest}
          className="gap-1.5 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
          title="Click to cancel request"
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Clock className="h-3.5 w-3.5 text-amber-500" />
          )}
          <span>Request Sent · Cancel</span>
        </Button>
      </div>
    );
  }

  // NONE state
  if (!currentRel.canFriendRequest) {
    return (
      <Button
        type="button"
        variant="secondary"
        size={size}
        disabled
        className="opacity-50 cursor-not-allowed text-xs"
        title="This user does not accept friend requests"
      >
        <UserX className="h-3.5 w-3.5 mr-1" />
        <span>Unavailable</span>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="heat"
      size={size}
      disabled={isLoading}
      onClick={handleSendRequest}
      className={`gap-1.5 font-semibold ${className}`}
    >
      {isLoading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <UserPlus className="h-3.5 w-3.5" />
      )}
      <span>Add Friend</span>
    </Button>
  );
}
