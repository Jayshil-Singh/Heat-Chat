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
  /**
   * Called when a reaction is removed (DELETE on message_reactions).
   * Note: message_reactions has no conversation_id column; RLS restricts
   * events to rows the subscriber can SELECT. We filter by loaded messages
   * in the handler to scope to the current conversation.
   */
  onReactionDelete?: (
    reaction: Pick<
      MessageReaction,
      "id" | "message_id" | "user_id" | "reaction"
    >
  ) => void;
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
      // message_reactions has no conversation_id column so we cannot filter
      // by conversation here. RLS ensures the user only receives events for
      // reactions on messages they can access. The handler in use-messages.ts
      // further filters to only apply updates for currently-loaded messages.
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
    onReconnectSync,
  ]);

  return { connectionStatus };
}
