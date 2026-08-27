"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./use-auth";
import { useRealtimeChat } from "./use-realtime-chat";
import { validateMessageContent } from "@/lib/validation/message";
import type { Message, MessageRead, Profile } from "@/types/database";
import type { ChatMessage } from "@/types/chat";

const PAGE_SIZE = 50;

export function useMessages(conversationId: string | null) {
  const { user } = useAuth();
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isLoadingOlder, setIsLoadingOlder] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const supabase = React.useMemo(() => createClient(), []);
  const pendingTempIdsRef = React.useRef<Map<string, string>>(new Map());

  // Fetch initial messages for active conversation
  const fetchMessages = React.useCallback(async () => {
    if (!conversationId || !user?.id) {
      setMessages([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Fetch latest 50 messages
      const { data: rawMessages, error: msgError } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (msgError) {
        console.warn("Error fetching messages:", msgError.message);
        setError(msgError.message);
        setIsLoading(false);
        return;
      }

      const count = rawMessages?.length || 0;
      setHasMore(count === PAGE_SIZE);

      // Chronological order (oldest to newest)
      const chronMessages = (rawMessages || []).reverse();

      // 2. Fetch sender profiles for these messages
      const senderIds = Array.from(new Set(chronMessages.map((m) => m.sender_id)));
      let profilesMap = new Map<string, Profile>();

      if (senderIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("*")
          .in("id", senderIds);

        (profilesData || []).forEach((p) => profilesMap.set(p.id, p as Profile));
      }

      // 3. Fetch read receipts for these messages
      const messageIds = chronMessages.map((m) => m.id);
      let readsMap = new Map<string, string[]>();

      if (messageIds.length > 0) {
        const { data: readsData } = await supabase
          .from("message_reads")
          .select("message_id, user_id")
          .in("message_id", messageIds);

        (readsData || []).forEach((r) => {
          const list = readsMap.get(r.message_id) || [];
          list.push(r.user_id);
          readsMap.set(r.message_id, list);
        });
      }

      const formatted: ChatMessage[] = chronMessages.map((m) => ({
        ...m,
        sender: profilesMap.get(m.sender_id) || null,
        status: m.sender_id === user.id ? "sent" : undefined,
        readBy: readsMap.get(m.id) || [],
      }));

      setMessages(formatted);

      // Mark incoming unread messages as read
      const unreadIncoming = chronMessages.filter(
        (m) => m.sender_id !== user.id && !(readsMap.get(m.id) || []).includes(user.id)
      );

      if (unreadIncoming.length > 0) {
        const readsToInsert = unreadIncoming.map((m) => ({
          message_id: m.id,
          user_id: user.id,
        }));
        await supabase.from("message_reads").insert(readsToInsert);
      }
    } catch (err) {
      console.error("Failed to load messages:", err);
      setError("Failed to load messages.");
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, user?.id, supabase]);

  React.useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Load older messages for reverse pagination
  const loadOlderMessages = React.useCallback(async () => {
    if (!conversationId || !user?.id || isLoadingOlder || !hasMore || messages.length === 0) {
      return;
    }

    setIsLoadingOlder(true);
    const oldestMessage = messages[0];

    try {
      const { data: olderRaw, error: olderError } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .lt("created_at", oldestMessage.created_at)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (olderError) {
        setIsLoadingOlder(false);
        return;
      }

      const count = olderRaw?.length || 0;
      setHasMore(count === PAGE_SIZE);

      if (count === 0) {
        setIsLoadingOlder(false);
        return;
      }

      const chronOlder = (olderRaw || []).reverse();

      // Fetch sender profiles
      const senderIds = Array.from(new Set(chronOlder.map((m) => m.sender_id)));
      let profilesMap = new Map<string, Profile>();

      if (senderIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("*")
          .in("id", senderIds);
        (profilesData || []).forEach((p) => profilesMap.set(p.id, p as Profile));
      }

      const formattedOlder: ChatMessage[] = chronOlder.map((m) => ({
        ...m,
        sender: profilesMap.get(m.sender_id) || null,
        status: m.sender_id === user.id ? "sent" : undefined,
        readBy: [],
      }));

      setMessages((prev) => [...formattedOlder, ...prev]);
    } catch (err) {
      console.error("Failed to load older messages:", err);
    } finally {
      setIsLoadingOlder(false);
    }
  }, [conversationId, user?.id, isLoadingOlder, hasMore, messages, supabase]);

  // Handle incoming realtime message
  const handleRealtimeNewMessage = React.useCallback(
    async (newMsg: Message) => {
      if (newMsg.conversation_id !== conversationId) return;

      // 1. Check if this is our own optimistic message coming back
      const tempId = pendingTempIdsRef.current.get(newMsg.content);

      setMessages((prev) => {
        // If already in list by database ID, ignore duplicate
        if (prev.some((m) => m.id === newMsg.id)) {
          return prev;
        }

        // If matching optimistic message exists, replace it
        if (tempId && prev.some((m) => m.tempId === tempId)) {
          return prev.map((m) =>
            m.tempId === tempId
              ? {
                  ...newMsg,
                  sender: m.sender,
                  status: "sent",
                  readBy: m.readBy || [],
                }
              : m
          );
        }

        // Otherwise insert new message chronologically
        const newChatMessage: ChatMessage = {
          ...newMsg,
          sender: null,
          status: newMsg.sender_id === user?.id ? "sent" : undefined,
          readBy: [],
        };

        return [...prev, newChatMessage];
      });

      // Mark incoming message as read if active
      if (user?.id && newMsg.sender_id !== user.id) {
        await supabase
          .from("message_reads")
          .insert({ message_id: newMsg.id, user_id: user.id });
      }
    },
    [conversationId, user?.id, supabase]
  );

  // Handle realtime read receipt
  const handleRealtimeReadReceipt = React.useCallback((receipt: MessageRead) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id === receipt.message_id) {
          const currentReads = m.readBy || [];
          if (!currentReads.includes(receipt.user_id)) {
            return { ...m, readBy: [...currentReads, receipt.user_id] };
          }
        }
        return m;
      })
    );
  }, []);

  // Hook into realtime chat subscriptions
  const { connectionStatus } = useRealtimeChat({
    conversationId,
    onNewMessage: handleRealtimeNewMessage,
    onReadReceipt: handleRealtimeReadReceipt,
    onReconnectSync: fetchMessages,
  });

  // Optimistic Send Message
  const sendMessage = async (content: string): Promise<{ success: boolean; error?: string }> => {
    if (!conversationId || !user?.id) {
      return { success: false, error: "Not in an active conversation" };
    }

    const validationErr = validateMessageContent(content);
    if (validationErr) {
      return { success: false, error: validationErr };
    }

    const trimmedContent = content.trim();
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create optimistic message
    const optimisticMessage: ChatMessage = {
      id: tempId,
      tempId,
      conversation_id: conversationId,
      sender_id: user.id,
      content: trimmedContent,
      message_type: "text",
      reply_to_message_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      status: "sending",
      readBy: [],
    };

    pendingTempIdsRef.current.set(trimmedContent, tempId);

    // Append to local state immediately
    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      const { data: insertedMsg, error: insertError } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: trimmedContent,
          message_type: "text",
        })
        .select("*")
        .single();

      if (insertError || !insertedMsg) {
        // Mark optimistic message as failed
        setMessages((prev) =>
          prev.map((m) => (m.tempId === tempId ? { ...m, status: "failed" } : m))
        );
        pendingTempIdsRef.current.delete(trimmedContent);
        return { success: false, error: insertError?.message || "Failed to send message." };
      }

      // Update optimistic message with real ID and sent status
      setMessages((prev) =>
        prev.map((m) =>
          m.tempId === tempId
            ? {
                ...insertedMsg,
                status: "sent",
                readBy: [],
              }
            : m
        )
      );

      pendingTempIdsRef.current.delete(trimmedContent);
      return { success: true };
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.tempId === tempId ? { ...m, status: "failed" } : m))
      );
      pendingTempIdsRef.current.delete(trimmedContent);
      return { success: false, error: "Network error sending message." };
    }
  };

  // Retry sending a failed message
  const retryMessage = async (failedMsg: ChatMessage) => {
    if (!failedMsg.content) return;
    // Remove failed message from list
    setMessages((prev) => prev.filter((m) => m.id !== failedMsg.id && m.tempId !== failedMsg.tempId));
    // Resend
    await sendMessage(failedMsg.content);
  };

  return {
    messages,
    isLoading,
    isLoadingOlder,
    hasMore,
    error,
    connectionStatus,
    sendMessage,
    retryMessage,
    loadOlderMessages,
    refreshMessages: fetchMessages,
  };
}
