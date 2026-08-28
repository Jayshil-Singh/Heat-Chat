"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./use-auth";
import type { Profile, Message, MemberRole } from "@/types/database";
import type { ConversationWithDetails, ConversationMemberWithProfile } from "@/types/chat";

export function useConversations() {
  const { user } = useAuth();
  const [conversations, setConversations] = React.useState<ConversationWithDetails[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const supabase = React.useMemo(() => createClient(), []);

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

      // 2. Fetch conversation records
      const { data: convData, error: convError } = await supabase
        .from("conversations")
        .select("*")
        .in("id", convIds)
        .order("updated_at", { ascending: false });

      if (convError) {
        console.warn("Error fetching conversations:", convError.message);
        setError(convError.message);
        setIsLoading(false);
        return;
      }

      // 3. Batch-fetch all members for these conversations
      const { data: allMembers } = await supabase
        .from("conversation_members")
        .select("conversation_id, user_id, role, joined_at")
        .in("conversation_id", convIds);

      // Fetch profiles of all members
      const allUserIds = Array.from(new Set((allMembers || []).map((m: any) => m.user_id)));
      
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("*")
        .in("id", allUserIds.length > 0 ? allUserIds : [user.id]);

      const profilesMap = new Map<string, Profile>();
      (profilesData || []).forEach((p) => profilesMap.set(p.id, p as Profile));

      // 4. Batch-fetch latest message for each conversation
      const lastMessagesMap = new Map<string, Message>();
      for (const convId of convIds) {
        const { data: latestMsg } = await supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", convId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestMsg) {
          lastMessagesMap.set(convId, latestMsg as Message);
        }
      }

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
          unreadCount: 0,
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

  React.useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Realtime subscriptions for conversations & members updates
  React.useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("user:conversations_membership")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
        },
        () => {
          fetchConversations();
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
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, supabase, fetchConversations]);

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

  return {
    conversations,
    isLoading,
    error,
    refreshConversations: fetchConversations,
    getOrCreateDirectChat,
    createGroup,
    leaveGroup,
  };
}
