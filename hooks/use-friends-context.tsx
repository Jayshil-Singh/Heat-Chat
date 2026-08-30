"use client";

/**
 * FriendsContext — single owner of the friends-realtime Supabase channel.
 *
 * WHY THIS EXISTS
 * ───────────────
 * useFriends() was previously a plain hook called independently by five
 * different components.  Each call created a channel named
 * `friends-realtime-${user.id}`.  Supabase's Realtime client reuses channel
 * objects by name internally.  The second caller received an already-subscribed
 * channel and then tried to register additional postgres_changes callbacks on
 * it, producing:
 *
 *   "cannot add `postgres_changes` callbacks for … after `subscribe()`"
 *
 * This provider is the single authoritative owner of that channel.
 * Consumers call useFriendsContext() instead of useFriends().
 */

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { FriendItem, FriendshipRequest } from "@/types/chat";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FriendsContextValue {
  friends: FriendItem[];
  incomingRequests: FriendshipRequest[];
  outgoingRequests: FriendshipRequest[];
  isLoading: boolean;
  error: string | null;
  refreshFriends: () => Promise<void>;
  sendFriendRequest: (targetUserId: string) => Promise<{ success: boolean; error?: string }>;
  acceptFriendRequest: (friendshipId: string) => Promise<{ success: boolean; error?: string }>;
  declineFriendRequest: (friendshipId: string) => Promise<{ success: boolean; error?: string }>;
  cancelFriendRequest: (friendshipId: string) => Promise<{ success: boolean; error?: string }>;
  removeFriend: (friendIdOrShipId: string) => Promise<{ success: boolean; error?: string }>;
  getRelationshipStatus: (
    targetUserId: string
  ) => "none" | "pending_incoming" | "pending_outgoing" | "accepted" | "self";
}

// ─── Context ──────────────────────────────────────────────────────────────────

const FriendsContext = React.createContext<FriendsContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function FriendsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [friends, setFriends] = React.useState<FriendItem[]>([]);
  const [incomingRequests, setIncomingRequests] = React.useState<FriendshipRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = React.useState<FriendshipRequest[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const supabase = React.useMemo(() => createClient(), []);

  // ─── Fetch ──────────────────────────────────────────────────────────────────

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

      const formattedFriends: FriendItem[] = (friendsData.friends || []).map((f: any) => ({
        friendshipId: f.friendshipId,
        userId: user.id,
        friendId: f.profile.id,
        status: "accepted" as const,
        createdAt: f.friendSince,
        profile: f.profile,
      }));

      const formattedIncoming: FriendshipRequest[] = (incomingData.requests || []).map(
        (r: any) => ({
          friendshipId: r.requestId,
          senderId: r.sender.id,
          receiverId: user.id,
          createdAt: r.createdAt,
          profile: r.sender,
          mutualCount: r.mutualCount,
          mutualProfiles: r.mutualProfiles,
        })
      );

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

  // ─── Initial load ───────────────────────────────────────────────────────────

  React.useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  // ─── Realtime — single authoritative channel ─────────────────────────────────
  //
  // RULES:
  //   1. Create channel with supabase.channel(name)
  //   2. Chain ALL .on() calls BEFORE .subscribe()
  //   3. Cleanup always calls supabase.removeChannel()
  //
  // A random suffix is appended so React Strict Mode's double-mount does NOT
  // receive a stale already-subscribed channel from Supabase's name registry.
  //
  React.useEffect(() => {
    if (!user?.id) return;

    const suffix = Math.random().toString(36).slice(2, 7);
    const channelName = `friends-rt-${user.id}-${suffix}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        () => { fetchFriends(); }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friend_requests" },
        () => { fetchFriends(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, supabase, fetchFriends]);

  // ─── CRUD actions ────────────────────────────────────────────────────────────

  const sendFriendRequest = async (
    targetUserId: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user?.id) return { success: false, error: "Not authenticated" };
    if (user.id === targetUserId)
      return { success: false, error: "Cannot add yourself as a friend" };
    try {
      const res = await fetch("/api/friends/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: targetUserId }),
      });
      const data = await res.json();
      if (!res.ok)
        return { success: false, error: data.message || data.error || "Failed to send request." };
      await fetchFriends();
      return { success: true };
    } catch {
      return { success: false, error: "Network error sending friend request." };
    }
  };

  const acceptFriendRequest = async (
    friendshipId: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user?.id) return { success: false, error: "Not authenticated" };
    try {
      const res = await fetch(`/api/friends/requests/${friendshipId}/accept`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok)
        return { success: false, error: data.message || data.error || "Failed to accept request." };
      await fetchFriends();
      return { success: true };
    } catch {
      return { success: false, error: "Network error accepting friend request." };
    }
  };

  const declineFriendRequest = async (
    friendshipId: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user?.id) return { success: false, error: "Not authenticated" };
    try {
      const res = await fetch(`/api/friends/requests/${friendshipId}/decline`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok)
        return {
          success: false,
          error: data.message || data.error || "Failed to decline request.",
        };
      await fetchFriends();
      return { success: true };
    } catch {
      return { success: false, error: "Network error declining friend request." };
    }
  };

  const cancelFriendRequest = async (
    friendshipId: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user?.id) return { success: false, error: "Not authenticated" };
    try {
      const res = await fetch(`/api/friends/requests/${friendshipId}/cancel`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok)
        return { success: false, error: data.message || data.error || "Failed to cancel request." };
      await fetchFriends();
      return { success: true };
    } catch {
      return { success: false, error: "Network error cancelling friend request." };
    }
  };

  const removeFriend = async (
    friendIdOrShipId: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user?.id) return { success: false, error: "Not authenticated" };
    try {
      const res = await fetch(`/api/friends/${friendIdOrShipId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok)
        return { success: false, error: data.message || data.error || "Failed to remove friend." };
      await fetchFriends();
      return { success: true };
    } catch {
      return { success: false, error: "Network error removing friend." };
    }
  };

  const getRelationshipStatus = React.useCallback(
    (
      targetUserId: string
    ): "none" | "pending_incoming" | "pending_outgoing" | "accepted" | "self" => {
      if (!user?.id || user.id === targetUserId) return "self";
      if (friends.some((f) => f.friendId === targetUserId)) return "accepted";
      if (outgoingRequests.some((r) => r.receiverId === targetUserId)) return "pending_outgoing";
      if (incomingRequests.some((r) => r.senderId === targetUserId)) return "pending_incoming";
      return "none";
    },
    [user?.id, friends, outgoingRequests, incomingRequests]
  );

  // ─── Context value ───────────────────────────────────────────────────────────

  const value = React.useMemo<FriendsContextValue>(
    () => ({
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
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      friends,
      incomingRequests,
      outgoingRequests,
      isLoading,
      error,
      fetchFriends,
      getRelationshipStatus,
    ]
  );

  return <FriendsContext.Provider value={value}>{children}</FriendsContext.Provider>;
}

// ─── Consumer hook ────────────────────────────────────────────────────────────

/**
 * useFriendsContext — use this everywhere instead of useFriends().
 *
 * Must be rendered inside <FriendsProvider>.
 */
export function useFriendsContext(): FriendsContextValue {
  const ctx = React.useContext(FriendsContext);
  if (!ctx) {
    throw new Error("useFriendsContext must be used within a <FriendsProvider>");
  }
  return ctx;
}
