"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./use-auth";
import type { Profile, Message } from "@/types/database";
import type { ConversationWithDetails } from "@/types/chat";

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

      // 3. Fetch all members for these conversations to identify other participant for direct chats
      const { data: allMembers } = await supabase
        .from("conversation_members")
        .select("conversation_id, user_id, role")
        .in("id", convIds as any);

      // Fetch profiles of all members
      const allUserIds = Array.from(new Set((allMembers || []).map((m: any) => m.user_id)));
      
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("*")
        .in("id", allUserIds.length > 0 ? allUserIds : [user.id]);

      const profilesMap = new Map<string, Profile>();
      (profilesData || []).forEach((p) => profilesMap.set(p.id, p as Profile));

      // 4. Fetch the latest message for each conversation
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

      // Construct conversation list with other participant and last message preview
      const detailedConversations: ConversationWithDetails[] = (convData || []).map((conv) => {
        const convMembers = (allMembers || []).filter((m: any) => m.conversation_id === conv.id);
        const otherMemberItem = convMembers.find((m: any) => m.user_id !== user.id);
        const otherMemberProfile = otherMemberItem ? profilesMap.get(otherMemberItem.user_id) : null;
        const memberProfiles = convMembers
          .map((m: any) => profilesMap.get(m.user_id))
          .filter(Boolean) as Profile[];
        const latestMsg = lastMessagesMap.get(conv.id);

        return {
          ...conv,
          otherMember: otherMemberProfile,
          members: memberProfiles,
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

  // Realtime subscription for conversation updates
  React.useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("user:conversations")
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, supabase, fetchConversations]);

  const getOrCreateDirectChat = async (targetUserId: string): Promise<{ conversationId?: string; error?: string }> => {
    if (!user?.id) return { error: "Not authenticated" };
    if (user.id === targetUserId) return { error: "Cannot start a chat with yourself" };

    try {
      // 1. First try secure RPC function
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

      // 2. Fallback if RPC is not deployed yet in environment
      const { data: existingConv } = await supabase
        .from("conversations")
        .select("id, type")
        .eq("type", "direct");

      if (existingConv && existingConv.length > 0) {
        for (const c of existingConv) {
          const { data: members } = await supabase
            .from("conversation_members")
            .select("user_id")
            .eq("conversation_id", c.id);

          const memberIds = (members || []).map((m) => m.user_id);
          if (memberIds.includes(user.id) && memberIds.includes(targetUserId)) {
            await fetchConversations();
            return { conversationId: c.id };
          }
        }
      }

      // Create conversation record
      const { data: newConv, error: createError } = await supabase
        .from("conversations")
        .insert({
          type: "direct",
          created_by: user.id,
        })
        .select("id")
        .single();

      if (createError || !newConv) {
        return { error: createError?.message || "Failed to create conversation." };
      }

      // Insert both members
      await supabase.from("conversation_members").insert([
        { conversation_id: newConv.id, user_id: user.id, role: "member" },
        { conversation_id: newConv.id, user_id: targetUserId, role: "member" },
      ]);

      await fetchConversations();
      return { conversationId: newConv.id };
    } catch {
      return { error: "Network error starting conversation." };
    }
  };

  return {
    conversations,
    isLoading,
    error,
    refreshConversations: fetchConversations,
    getOrCreateDirectChat,
  };
}
