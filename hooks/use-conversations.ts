"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./use-auth";
import { getCachedProfiles, setCachedProfiles } from "@/lib/cache/profile-cache";
import type { Profile, Message, MemberRole } from "@/types/database";
import type { ConversationWithDetails, ConversationMemberWithProfile } from "@/types/chat";

export interface ConversationsContextValue {
  conversations: ConversationWithDetails[];
  isLoading: boolean;
  error: string | null;
  refreshConversations: () => Promise<void>;
  markConversationUnread: (conversationId: string) => Promise<void>;
  markConversationRead: (conversationId: string) => Promise<void>;
  getOrCreateDirectChat: (targetUserId: string) => Promise<{ conversationId?: string; error?: string }>;
  createGroup: (groupName: string, friendIds: string[], avatarUrl?: string) => Promise<{ conversationId?: string; error?: string }>;
  leaveGroup: (conversationId: string) => Promise<{ success: boolean; error?: string }>;
}

export const ConversationsContext = React.createContext<ConversationsContextValue | null>(null);

export function ConversationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [conversations, setConversations] = React.useState<ConversationWithDetails[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const supabase = React.useMemo(() => createClient(), []);

  // Coalescing and concurrency guards
  const refreshTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const isRefreshingRef = React.useRef(false);
  const pendingRefreshRef = React.useRef(false);

  const fetchConversations = React.useCallback(async () => {
    if (!user?.id) {
      setConversations([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Fetch conversations where user is a member
      const { data: memberData, error: memberError } = await supabase
        .from("conversation_members")
        .select("conversation_id")
        .eq("user_id", user.id);

      if (memberError) {
        console.warn("Error fetching conversation members:", memberError.message);
        setError(memberError.message);
        setIsLoading(false);
        return;
      }

      if (!memberData || memberData.length === 0) {
        setConversations([]);
        setIsLoading(false);
        return;
      }

      const convIds = memberData.map((m) => m.conversation_id);

      // 2. Stage 1: Concurrently fetch conversations, members, and user states
      const [convRes, membersRes, userStatesRes] = await Promise.all([
        supabase
          .from("conversations")
          .select("*")
          .in("id", convIds)
          .order("updated_at", { ascending: false }),
        supabase
          .from("conversation_members")
          .select("conversation_id, user_id, role, joined_at")
          .in("conversation_id", convIds),
        supabase
          .from("conversation_user_states")
          .select("conversation_id, unread_count, is_marked_unread")
          .eq("user_id", user.id)
          .in("conversation_id", convIds),
      ]);

      if (convRes.error) {
        console.warn("Error fetching conversations:", convRes.error.message);
        setError(convRes.error.message);
        setIsLoading(false);
        return;
      }

      const convData = convRes.data;
      const allMembers = membersRes.data;
      const userStates = userStatesRes.data;

      // 3. Stage 2: Concurrently resolve missing profiles and latest messages
      const allUserIds = Array.from(new Set((allMembers || []).map((m: any) => m.user_id)));
      const { cached: cachedProfiles, missingIds } = getCachedProfiles(allUserIds);
      const profilesMap = new Map<string, Profile>(cachedProfiles);

      const lastMessagesMap = new Map<string, Message>();
      await Promise.all([
        missingIds.length > 0
          ? supabase
              .from("profiles")
              .select("*")
              .in("id", missingIds)
              .then(({ data }) => {
                (data || []).forEach((p) => {
                  profilesMap.set(p.id, p as Profile);
                });
                setCachedProfiles((data || []) as Profile[]);
              })
          : Promise.resolve(),
        Promise.all(
          convIds.map(async (convId) => {
            const { data: latestMsg } = await supabase
              .from("messages")
              .select("id, conversation_id, sender_id, content, created_at, message_type, deleted_at")
              .eq("conversation_id", convId)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (latestMsg) {
              lastMessagesMap.set(convId, latestMsg as Message);
            }
          })
        ),
      ]);

      const userStatesMap = new Map<string, { unreadCount: number; isMarkedUnread: boolean }>();
      (userStates || []).forEach((s: any) => {
        userStatesMap.set(s.conversation_id, {
          unreadCount: s.unread_count || 0,
          isMarkedUnread: Boolean(s.is_marked_unread),
        });
      });

      // Construct conversation list
      const detailedConversations: ConversationWithDetails[] = (convData || []).map((conv) => {
        const convMembers = (allMembers || []).filter((m: any) => m.conversation_id === conv.id);
        const otherMemberItem = convMembers.find((m: any) => m.user_id !== user.id);
        const otherMemberProfile = otherMemberItem ? profilesMap.get(otherMemberItem.user_id) : null;
        const currentMemberItem = convMembers.find((m: any) => m.user_id === user.id);

        const memberDetails: ConversationMemberWithProfile[] = convMembers
          .map((m: any) => {
            const prof = profilesMap.get(m.user_id);
            if (!prof) return null;
            return {
              userId: m.user_id,
              role: m.role as MemberRole,
              joinedAt: m.joined_at,
              profile: prof,
            };
          })
          .filter(Boolean) as ConversationMemberWithProfile[];

        const memberProfiles = memberDetails.map((md) => md.profile);
        const latestMsg = lastMessagesMap.get(conv.id);
        const uState = userStatesMap.get(conv.id);
        const unreadCount = uState?.unreadCount ?? 0;
        const isMarkedUnread = uState?.isMarkedUnread ?? false;

        return {
          ...conv,
          otherMember: otherMemberProfile,
          members: memberProfiles,
          memberDetails,
          memberCount: convMembers.length,
          currentMemberRole: (currentMemberItem?.role as MemberRole) || "member",
          lastMessage: latestMsg
            ? {
                content: latestMsg.content,
                sender_id: latestMsg.sender_id,
                created_at: latestMsg.created_at,
                message_type: latestMsg.message_type,
              }
            : null,
          unreadCount: isMarkedUnread ? Math.max(unreadCount, 1) : unreadCount,
          isMarkedUnread,
        };
      });

      setConversations(detailedConversations);
    } catch (err) {
      console.error("Failed to load conversations:", err);
      setError("Failed to load conversations.");
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, supabase]);

  // Coalescing debounce for realtime events: 150ms window
  const coalescedRefresh = React.useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }

    refreshTimerRef.current = setTimeout(async () => {
      refreshTimerRef.current = null;
      if (isRefreshingRef.current) {
        pendingRefreshRef.current = true;
        return;
      }

      isRefreshingRef.current = true;
      try {
        await fetchConversations();
      } finally {
        isRefreshingRef.current = false;
        if (pendingRefreshRef.current) {
          pendingRefreshRef.current = false;
          coalescedRefresh();
        }
      }
    }, 150);
  }, [fetchConversations]);

  React.useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Single-owner Realtime subscription with coalesced refresh
  React.useEffect(() => {
    if (!user?.id) return;

    // Stable channel name: exactly one channel per authenticated user across entire app
    const channelName = `user-conversations-${user.id}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
        },
        () => {
          coalescedRefresh();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_members",
        },
        () => {
          coalescedRefresh();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_user_states",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          coalescedRefresh();
        }
      )
      .subscribe();

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [user?.id, supabase, coalescedRefresh]);

  const markConversationUnread = React.useCallback(
    async (conversationId: string) => {
      if (!user?.id) return;

      // Optimistic update
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? { ...c, isMarkedUnread: true, unreadCount: Math.max(c.unreadCount || 0, 1) }
            : c
        )
      );

      try {
        await fetch(`/api/conversations/${conversationId}/unread`, {
          method: "POST",
        });
      } catch (err) {
        console.error("Error marking conversation unread:", err);
      }
    },
    [user?.id]
  );

  const markConversationRead = React.useCallback(
    async (conversationId: string) => {
      if (!user?.id) return;

      // Optimistic update
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? { ...c, isMarkedUnread: false, unreadCount: 0 }
            : c
        )
      );

      try {
        await fetch(`/api/conversations/${conversationId}/read`, {
          method: "POST",
        });
      } catch (err) {
        console.error("Error marking conversation read:", err);
      }
    },
    [user?.id]
  );

  const getOrCreateDirectChat = async (targetUserId: string): Promise<{ conversationId?: string; error?: string }> => {
    if (!user?.id) return { error: "Not authenticated" };
    if (user.id === targetUserId) return { error: "Cannot start a chat with yourself" };

    try {
      const { data: rpcConvId, error: rpcError } = await (supabase.rpc as any)(
        "get_or_create_direct_conversation",
        {
          target_user_id: targetUserId,
        }
      );

      if (!rpcError && rpcConvId) {
        await fetchConversations();
        return { conversationId: rpcConvId };
      }

      return { error: rpcError?.message || "Failed to establish direct chat." };
    } catch {
      return { error: "Network error starting conversation." };
    }
  };

  const createGroup = async (
    groupName: string,
    friendIds: string[],
    avatarUrl?: string
  ): Promise<{ conversationId?: string; error?: string }> => {
    if (!user?.id) return { error: "Not authenticated" };
    const trimmed = groupName.trim();
    if (!trimmed) return { error: "Group name cannot be empty" };
    if (trimmed.length > 100) return { error: "Group name must be 100 characters or fewer" };
    if (!friendIds || friendIds.length === 0) return { error: "Please select at least one friend" };

    try {
      const { data: convId, error: rpcError } = await (supabase.rpc as any)(
        "create_group_conversation",
        {
          group_name: trimmed,
          member_user_ids: friendIds,
          group_avatar_url: avatarUrl || null,
        }
      );

      if (rpcError) {
        return { error: rpcError.message || "Failed to create group." };
      }

      await fetchConversations();
      return { conversationId: convId };
    } catch {
      return { error: "Network error creating group." };
    }
  };

  const leaveGroup = async (conversationId: string): Promise<{ success: boolean; error?: string }> => {
    if (!user?.id) return { success: false, error: "Not authenticated" };

    try {
      const { error: rpcError } = await (supabase.rpc as any)("leave_group", {
        conv_id: conversationId,
      });

      if (rpcError) {
        return { success: false, error: rpcError.message || "Failed to leave group." };
      }

      await fetchConversations();
      return { success: true };
    } catch {
      return { success: false, error: "Network error leaving group." };
    }
  };

  const value: ConversationsContextValue = React.useMemo(
    () => ({
      conversations,
      isLoading,
      error,
      refreshConversations: fetchConversations,
      markConversationUnread,
      markConversationRead,
      getOrCreateDirectChat,
      createGroup,
      leaveGroup,
    }),
    [
      conversations,
      isLoading,
      error,
      fetchConversations,
      markConversationUnread,
      markConversationRead,
      getOrCreateDirectChat,
      createGroup,
      leaveGroup,
    ]
  );

  return React.createElement(ConversationsContext.Provider, { value }, children);
}

export function useConversations(): ConversationsContextValue {
  const context = React.useContext(ConversationsContext);
  if (!context) {
    console.warn(
      "[ConversationsContext] useConversations called outside ConversationsProvider. Ensure component is wrapped in ConversationsProvider."
    );
    return {
      conversations: [],
      isLoading: false,
      error: null,
      refreshConversations: async () => {},
      markConversationUnread: async () => {},
      markConversationRead: async () => {},
      getOrCreateDirectChat: async () => ({ error: "Not inside ConversationsProvider" }),
      createGroup: async () => ({ error: "Not inside ConversationsProvider" }),
      leaveGroup: async () => ({ success: false, error: "Not inside ConversationsProvider" }),
    };
  }
  return context;
}
