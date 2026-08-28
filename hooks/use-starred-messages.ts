"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./use-auth";
import type { StarredMessageWithDetails } from "@/types/chat";
import type { Profile, Conversation } from "@/types/database";

export function useStarredMessages(conversationId?: string | null) {
  const { user } = useAuth();
  const [starredMessages, setStarredMessages] = React.useState<StarredMessageWithDetails[]>([]);
  const [starredMessageIds, setStarredMessageIds] = React.useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = React.useState(true);

  const supabase = React.useMemo(() => createClient(), []);

  // Fetch all starred messages for the current user
  const fetchStarredMessages = React.useCallback(async () => {
    if (!user?.id) {
      setStarredMessages([]);
      setStarredMessageIds(new Set());
      setIsLoading(false);
      return;
    }

    try {
      // 1. Query user's starred messages records
      const { data: rawStarred, error: starredErr } = await supabase
        .from("starred_messages")
        .select("id, user_id, message_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (starredErr) throw starredErr;
      if (!rawStarred || rawStarred.length === 0) {
        setStarredMessages([]);
        setStarredMessageIds(new Set());
        setIsLoading(false);
        return;
      }

      const msgIds = rawStarred.map((s) => s.message_id);

      // 2. Fetch corresponding messages (strictly filtering deleted_at is null)
      const { data: messages, error: msgErr } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_id, content, message_type, created_at, deleted_at")
        .in("id", msgIds)
        .is("deleted_at", null);

      if (msgErr) throw msgErr;
      if (!messages || messages.length === 0) {
        setStarredMessages([]);
        setStarredMessageIds(new Set());
        setIsLoading(false);
        return;
      }

      // Valid message IDs map
      const messageMap = new Map<string, typeof messages[0]>();
      messages.forEach((m) => messageMap.set(m.id, m));

      // 3. Batch-fetch senders
      const senderIds = Array.from(new Set(messages.map((m) => m.sender_id)));
      const { data: profiles } = await supabase
        .from("profiles")
        .select("*")
        .in("id", senderIds);

      const profileMap = new Map<string, Profile>();
      (profiles || []).forEach((p) => profileMap.set(p.id, p as Profile));

      // 4. Batch-fetch conversations
      const convIds = Array.from(new Set(messages.map((m) => m.conversation_id)));
      const { data: convs } = await supabase
        .from("conversations")
        .select("*")
        .in("id", convIds);

      const convMap = new Map<string, Conversation>();
      (convs || []).forEach((c) => convMap.set(c.id, c as Conversation));

      // 5. Construct detailed items
      const detailed: StarredMessageWithDetails[] = [];
      const idSet = new Set<string>();

      for (const s of rawStarred) {
        const msg = messageMap.get(s.message_id);
        if (!msg) continue; // exclude if message was deleted or unauthorized

        idSet.add(s.message_id);
        const sender = profileMap.get(msg.sender_id) || null;
        const conv = convMap.get(msg.conversation_id);
        const convName = conv?.name || sender?.display_name || "Conversation";

        detailed.push({
          id: s.id,
          userId: s.user_id,
          messageId: s.message_id,
          createdAt: s.created_at,
          message: {
            id: msg.id,
            conversationId: msg.conversation_id,
            senderId: msg.sender_id,
            content: msg.content,
            messageType: msg.message_type,
            createdAt: msg.created_at,
            sender,
            conversationName: convName,
            conversationType: conv?.type || "direct",
          },
        });
      }

      setStarredMessages(detailed);
      setStarredMessageIds(idSet);
    } catch (err) {
      console.warn("Failed to fetch starred messages:", err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, supabase]);

  React.useEffect(() => {
    fetchStarredMessages();
  }, [fetchStarredMessages]);

  // Toggle star status with optimistic UI update
  const toggleStar = React.useCallback(
    async (messageId: string): Promise<boolean> => {
      if (!user?.id) return false;

      const isCurrentlyStarred = starredMessageIds.has(messageId);
      const prevIds = new Set(starredMessageIds);
      const prevList = [...starredMessages];

      // Optimistic update
      const nextIds = new Set(starredMessageIds);
      if (isCurrentlyStarred) {
        nextIds.delete(messageId);
        setStarredMessages((prev) => prev.filter((s) => s.messageId !== messageId));
      } else {
        nextIds.add(messageId);
      }
      setStarredMessageIds(nextIds);

      try {
        const { data, error } = await (supabase.rpc as any)("toggle_starred_message", {
          p_message_id: messageId,
        });

        if (error) throw error;

        // If newly starred, refresh list to ensure full details are loaded
        if (data === true) {
          fetchStarredMessages();
        }
        return data as boolean;
      } catch (err) {
        console.error("Failed to toggle star:", err);
        // Rollback
        setStarredMessageIds(prevIds);
        setStarredMessages(prevList);
        return isCurrentlyStarred;
      }
    },
    [user?.id, starredMessageIds, starredMessages, supabase, fetchStarredMessages]
  );

  const isMessageStarred = React.useCallback(
    (messageId: string) => starredMessageIds.has(messageId),
    [starredMessageIds]
  );

  // Filtered list for active conversation if specified
  const conversationStarredMessages = React.useMemo(() => {
    if (!conversationId) return starredMessages;
    return starredMessages.filter((s) => s.message.conversationId === conversationId);
  }, [starredMessages, conversationId]);

  return {
    starredMessages,
    conversationStarredMessages,
    starredMessageIds,
    isLoading,
    toggleStar,
    isMessageStarred,
    refreshStarred: fetchStarredMessages,
  };
}
