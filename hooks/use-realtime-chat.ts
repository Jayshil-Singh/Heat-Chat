"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message, MessageRead } from "@/types/database";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

interface UseRealtimeChatOptions {
  conversationId: string | null;
  onNewMessage: (message: Message) => void;
  onMessageUpdate?: (message: Message) => void;
  onMessageDelete?: (messageId: string) => void;
  onReadReceipt?: (receipt: MessageRead) => void;
  onReconnectSync?: () => void;
}

export function useRealtimeChat({
  conversationId,
  onNewMessage,
  onMessageUpdate,
  onMessageDelete,
  onReadReceipt,
  onReconnectSync,
}: UseRealtimeChatOptions) {
  const [connectionStatus, setConnectionStatus] = React.useState<ConnectionStatus>("disconnected");
  const supabase = React.useMemo(() => createClient(), []);

  React.useEffect(() => {
    if (!conversationId) {
      setConnectionStatus("disconnected");
      return;
    }

    setConnectionStatus("connecting");

    const channelName = `realtime:chat:${conversationId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (payload.new) {
            onNewMessage(payload.new as Message);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (payload.new && onMessageUpdate) {
            onMessageUpdate(payload.new as Message);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (payload.old?.id && onMessageDelete) {
            onMessageDelete(payload.old.id);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message_reads",
        },
        (payload) => {
          if (payload.new && onReadReceipt) {
            onReadReceipt(payload.new as MessageRead);
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnectionStatus("connected");
        } else if (status === "TIMED_OUT" || status === "CHANNEL_ERROR") {
          setConnectionStatus("reconnecting");
          if (onReconnectSync) {
            onReconnectSync();
          }
        } else if (status === "CLOSED") {
          setConnectionStatus("disconnected");
        }
      });

    return () => {
      supabase.removeChannel(channel);
      setConnectionStatus("disconnected");
    };
  }, [
    conversationId,
    supabase,
    onNewMessage,
    onMessageUpdate,
    onMessageDelete,
    onReadReceipt,
    onReconnectSync,
  ]);

  return {
    connectionStatus,
  };
}
