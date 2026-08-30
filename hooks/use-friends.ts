"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./use-auth";
import type { Profile } from "@/types/database";
import type { FriendItem, FriendshipRequest } from "@/types/chat";

export function useFriends() {
  const { user } = useAuth();
  const [friends, setFriends] = React.useState<FriendItem[]>([]);
  const [incomingRequests, setIncomingRequests] = React.useState<FriendshipRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = React.useState<FriendshipRequest[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const supabase = React.useMemo(() => createClient(), []);

  const fetchFriends = React.useCallback(async () => {
    if (!user?.id) {
      setFriends([]);
      setIncomingRequests([]);
      setOutgoingRequests([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [friendsRes, incomingRes, sentRes] = await Promise.all([
        fetch("/api/friends"),
        fetch("/api/friends/requests/incoming"),
        fetch("/api/friends/requests/sent"),
      ]);

      const [friendsData, incomingData, sentData] = await Promise.all([
        friendsRes.ok ? friendsRes.json() : { friends: [] },
        incomingRes.ok ? incomingRes.json() : { requests: [] },
        sentRes.ok ? sentRes.json() : { requests: [] },
      ]);

      // Formatted friends
      const formattedFriends: FriendItem[] = (friendsData.friends || []).map((f: any) => ({
        friendshipId: f.friendshipId,
        userId: user.id,
        friendId: f.profile.id,
        status: "accepted",
        createdAt: f.friendSince,
        profile: f.profile,
      }));

      // Incoming requests
      const formattedIncoming: FriendshipRequest[] = (incomingData.requests || []).map((r: any) => ({
        friendshipId: r.requestId,
        senderId: r.sender.id,
        receiverId: user.id,
        createdAt: r.createdAt,
        profile: r.sender,
        mutualCount: r.mutualCount,
        mutualProfiles: r.mutualProfiles,
      }));

      // Outgoing requests
      const formattedOutgoing: FriendshipRequest[] = (sentData.requests || []).map((r: any) => ({
        friendshipId: r.requestId,
        senderId: user.id,
        receiverId: r.recipient.id,
        createdAt: r.createdAt,
        profile: r.recipient,
        mutualCount: r.mutualCount,
      }));

      setFriends(formattedFriends);
      setIncomingRequests(formattedIncoming);
      setOutgoingRequests(formattedOutgoing);
    } catch (err: any) {
      console.error("[Heat Chat] Failed to load friends:", err);
      setError("Failed to load friends.");
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  React.useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  // Realtime subscription for friendships
  React.useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`friends-realtime-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friendships",
        },
        () => {
          fetchFriends();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, supabase, fetchFriends]);

  const sendFriendRequest = async (targetUserId: string): Promise<{ success: boolean; error?: string }> => {
    if (!user?.id) return { success: false, error: "Not authenticated" };
    if (user.id === targetUserId) return { success: false, error: "Cannot add yourself as a friend" };

    try {
      const res = await fetch("/api/friends/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: targetUserId }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.message || data.error || "Failed to send request." };
      }

      await fetchFriends();
      return { success: true };
    } catch {
      return { success: false, error: "Network error sending friend request." };
    }
  };

  const acceptFriendRequest = async (friendshipId: string): Promise<{ success: boolean; error?: string }> => {
    if (!user?.id) return { success: false, error: "Not authenticated" };

    try {
      const res = await fetch(`/api/friends/requests/${friendshipId}/accept`, {
        method: "POST",
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.message || data.error || "Failed to accept request." };
      }

      await fetchFriends();
      return { success: true };
    } catch {
      return { success: false, error: "Network error accepting friend request." };
    }
  };

  const declineFriendRequest = async (friendshipId: string): Promise<{ success: boolean; error?: string }> => {
    if (!user?.id) return { success: false, error: "Not authenticated" };

    try {
      const res = await fetch(`/api/friends/requests/${friendshipId}/decline`, {
        method: "POST",
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.message || data.error || "Failed to decline request." };
      }

      await fetchFriends();
      return { success: true };
    } catch {
      return { success: false, error: "Network error declining friend request." };
    }
  };

  const cancelFriendRequest = async (friendshipId: string): Promise<{ success: boolean; error?: string }> => {
    if (!user?.id) return { success: false, error: "Not authenticated" };

    try {
      const res = await fetch(`/api/friends/requests/${friendshipId}/cancel`, {
        method: "POST",
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.message || data.error || "Failed to cancel request." };
      }

      await fetchFriends();
      return { success: true };
    } catch {
      return { success: false, error: "Network error cancelling friend request." };
    }
  };

  const removeFriend = async (friendIdOrShipId: string): Promise<{ success: boolean; error?: string }> => {
    if (!user?.id) return { success: false, error: "Not authenticated" };

    try {
      const res = await fetch(`/api/friends/${friendIdOrShipId}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.message || data.error || "Failed to remove friend." };
      }

      await fetchFriends();
      return { success: true };
    } catch {
      return { success: false, error: "Network error removing friend." };
    }
  };

  const getRelationshipStatus = React.useCallback(
    (targetUserId: string): "none" | "pending_incoming" | "pending_outgoing" | "accepted" | "self" => {
      if (!user?.id || user.id === targetUserId) return "self";

      const isFriend = friends.some((f) => f.friendId === targetUserId);
      if (isFriend) return "accepted";

      const isOutgoing = outgoingRequests.some((r) => r.receiverId === targetUserId);
      if (isOutgoing) return "pending_outgoing";

      const isIncoming = incomingRequests.some((r) => r.senderId === targetUserId);
      if (isIncoming) return "pending_incoming";

      return "none";
    },
    [user?.id, friends, outgoingRequests, incomingRequests]
  );

  return {
    friends,
    incomingRequests,
    outgoingRequests,
    isLoading,
    error,
    refreshFriends: fetchFriends,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    cancelFriendRequest,
    removeFriend,
    getRelationshipStatus,
  };
}
