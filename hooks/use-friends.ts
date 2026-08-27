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
      // 1. Fetch all friendships where current user is user_id OR friend_id
      const { data: friendshipsData, error: friendshipsError } = await supabase
        .from("friendships")
        .select("*")
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);

      if (friendshipsError) {
        console.warn("Error fetching friendships:", friendshipsError.message);
        setError(friendshipsError.message);
        setIsLoading(false);
        return;
      }

      if (!friendshipsData || friendshipsData.length === 0) {
        setFriends([]);
        setIncomingRequests([]);
        setOutgoingRequests([]);
        setIsLoading(false);
        return;
      }

      // Collect all other user IDs to fetch their profiles
      const otherUserIds = Array.from(
        new Set(
          friendshipsData.map((f) =>
            f.user_id === user.id ? f.friend_id : f.user_id
          )
        )
      );

      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .in("id", otherUserIds);

      if (profilesError) {
        console.warn("Error fetching friend profiles:", profilesError.message);
        setError(profilesError.message);
        setIsLoading(false);
        return;
      }

      const profilesMap = new Map<string, Profile>();
      (profilesData || []).forEach((p) => profilesMap.set(p.id, p as Profile));

      const acceptedList: FriendItem[] = [];
      const incomingList: FriendshipRequest[] = [];
      const outgoingList: FriendshipRequest[] = [];

      friendshipsData.forEach((f) => {
        const isSender = f.user_id === user.id;
        const otherUserId = isSender ? f.friend_id : f.user_id;
        const profile = profilesMap.get(otherUserId);

        if (!profile) return;

        if (f.status === "accepted") {
          acceptedList.push({
            friendshipId: f.id,
            userId: user.id,
            friendId: otherUserId,
            status: "accepted",
            createdAt: f.created_at,
            profile,
          });
        } else if (f.status === "pending") {
          if (isSender) {
            outgoingList.push({
              friendshipId: f.id,
              senderId: user.id,
              receiverId: otherUserId,
              createdAt: f.created_at,
              profile,
            });
          } else {
            incomingList.push({
              friendshipId: f.id,
              senderId: otherUserId,
              receiverId: user.id,
              createdAt: f.created_at,
              profile,
            });
          }
        }
      });

      setFriends(acceptedList);
      setIncomingRequests(incomingList);
      setOutgoingRequests(outgoingList);
    } catch (err) {
      console.error("Failed to load friends:", err);
      setError("Failed to load friends.");
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, supabase]);

  React.useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  const sendFriendRequest = async (targetUserId: string): Promise<{ success: boolean; error?: string }> => {
    if (!user?.id) return { success: false, error: "Not authenticated" };
    if (user.id === targetUserId) return { success: false, error: "Cannot add yourself as a friend" };

    try {
      const { error: insertError } = await supabase
        .from("friendships")
        .insert({
          user_id: user.id,
          friend_id: targetUserId,
          status: "pending",
        });

      if (insertError) {
        if (insertError.code === "23505" || insertError.message.includes("unique")) {
          return { success: false, error: "A friendship request already exists between you." };
        }
        return { success: false, error: insertError.message || "Failed to send friend request." };
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
      const { error: updateError } = await supabase
        .from("friendships")
        .update({ status: "accepted" })
        .eq("id", friendshipId);

      if (updateError) {
        return { success: false, error: updateError.message || "Failed to accept request." };
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
      const { error: deleteError } = await supabase
        .from("friendships")
        .delete()
        .eq("id", friendshipId);

      if (deleteError) {
        return { success: false, error: deleteError.message || "Failed to decline request." };
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
      const { error: deleteError } = await supabase
        .from("friendships")
        .delete()
        .eq("id", friendshipId);

      if (deleteError) {
        return { success: false, error: deleteError.message || "Failed to cancel request." };
      }

      await fetchFriends();
      return { success: true };
    } catch {
      return { success: false, error: "Network error cancelling friend request." };
    }
  };

  const removeFriend = async (friendshipId: string): Promise<{ success: boolean; error?: string }> => {
    if (!user?.id) return { success: false, error: "Not authenticated" };

    try {
      const { error: deleteError } = await supabase
        .from("friendships")
        .delete()
        .eq("id", friendshipId);

      if (deleteError) {
        return { success: false, error: deleteError.message || "Failed to remove friend." };
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
