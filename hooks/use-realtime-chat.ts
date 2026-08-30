"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message, MessageRead, MessageReaction } from "@/types/database";

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

interface UseRealtimeChatOptions {
  conversationId: string | null;
  onNewMessage: (message: Message) => void;
  onMessageUpdate?: (message: Message) => void;
  onMessageDelete?: (messageId: string) => void;
  onReadReceipt?: (receipt: MessageRead) => void;
  /** Called when a reaction is added (INSERT on message_reactions) */
  onReactionInsert?: (reaction: MessageReaction) => void;
  /** Called when a reaction is removed (DELETE on message_reactions) */
  onReactionDelete?: (
    reaction: Pick<
      MessageReaction,
      "id" | "message_id" | "user_id" | "reaction"
    >
  ) => void;
  /** Called when a pin is added (INSERT on message_pins) */
  onPinInsert?: (pin: {
    id: string;
    message_id: string;
    conversation_id: string;
    pinned_by: string;
  }) => void;
  /** Called when a pin is removed (DELETE on message_pins) */
  onPinDelete?: (pin: { message_id: string; conversation_id?: string }) => void;
  /** Called when a delivery receipt is recorded (INSERT on message_delivery_states) */
  onDeliveryInsert?: (delivery: {
    message_id: string;
    user_id: string;
    delivered_at: string;
  }) => void;
  onReconnectSync?: () => void;
}

export function useRealtimeChat({
  conversationId,
  onNewMessage,
  onMessageUpdate,
  onMessageDelete,
  onReadReceipt,
  onReactionInsert,
  onReactionDelete,
  onPinInsert,
  onPinDelete,
  onDeliveryInsert,
  onReconnectSync,
}: UseRealtimeChatOptions) {
  const [connectionStatus, setConnectionStatus] =
    React.useState<ConnectionStatus>("disconnected");
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
      // ── Messages ────────────────────────────────────────────────────────
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
            onMessageDelete(payload.old.id as string);
          }
        }
      )
      // ── Read Receipts ────────────────────────────────────────────────────
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
      // ── Reactions ────────────────────────────────────────────────────────
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message_reactions",
        },
        (payload) => {
          if (payload.new && onReactionInsert) {
            onReactionInsert(payload.new as MessageReaction);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "message_reactions",
        },
        (payload) => {
          if (payload.old && onReactionDelete) {
            onReactionDelete(
              payload.old as Pick<
                MessageReaction,
                "id" | "message_id" | "user_id" | "reaction"
              >
            );
          }
        }
      )
      // ── Message Pins ─────────────────────────────────────────────────────
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message_pins",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (payload.new && onPinInsert) {
            onPinInsert(payload.new as any);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "message_pins",
        },
        (payload) => {
          if (payload.old && onPinDelete) {
            onPinDelete(payload.old as any);
          }
        }
      )
      // ── Delivery States ──────────────────────────────────────────────────
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message_delivery_states",
        },
        (payload) => {
          if (payload.new && onDeliveryInsert) {
            onDeliveryInsert(payload.new as any);
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
    onReactionInsert,
    onReactionDelete,
    onPinInsert,
    onPinDelete,
    onDeliveryInsert,
    onReconnectSync,
  ]);

  return { connectionStatus };
}
