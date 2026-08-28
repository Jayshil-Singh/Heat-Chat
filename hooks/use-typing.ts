"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./use-auth";
import type { TypingUser } from "@/types/chat";

const TYPING_TIMEOUT_MS = 3500;
const THROTTLE_BROADCAST_MS = 2500;

export function useTyping(conversationId: string | null) {
  const { user, profile } = useAuth();
  const [typingUsers, setTypingUsers] = React.useState<TypingUser[]>([]);
  const lastBroadcastRef = React.useRef<number>(0);
  const stopTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const supabase = React.useMemo(() => createClient(), []);

  // Subscribe to typing broadcast on conversation channel
  React.useEffect(() => {
    if (!conversationId || !user?.id) {
      setTypingUsers([]);
      return;
    }

    const channelName = `typing:${conversationId}`;
    const channel = supabase.channel(channelName);

    channel
      .on("broadcast", { event: "typing_start" }, ({ payload }) => {
        if (!payload || payload.userId === user.id) return;

        setTypingUsers((prev) => {
          const filtered = prev.filter((u) => u.userId !== payload.userId);
          return [
            ...filtered,
            {
              userId: payload.userId,
              displayName: payload.displayName || "Someone",
              username: payload.username || "user",
              timestamp: Date.now(),
            },
          ];
        });
      })
      .on("broadcast", { event: "typing_stop" }, ({ payload }) => {
        if (!payload || payload.userId === user.id) return;

        setTypingUsers((prev) => prev.filter((u) => u.userId !== payload.userId));
      })
      .subscribe();

    // Periodic sweep for expired typing states
    const sweepInterval = setInterval(() => {
      const now = Date.now();
      setTypingUsers((prev) =>
        prev.filter((u) => now - u.timestamp < TYPING_TIMEOUT_MS)
      );
    }, 1000);

    return () => {
      clearInterval(sweepInterval);
      if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
      supabase.removeChannel(channel);
    };
  }, [conversationId, user?.id, supabase]);

  // Broadcast that current user started typing
  const sendTyping = React.useCallback(() => {
    if (!conversationId || !user?.id) return;

    const now = Date.now();
    if (now - lastBroadcastRef.current > THROTTLE_BROADCAST_MS) {
      lastBroadcastRef.current = now;
      const channel = supabase.channel(`typing:${conversationId}`);
      channel.send({
        type: "broadcast",
        event: "typing_start",
        payload: {
          userId: user.id,
          displayName: profile?.display_name || user.email?.split("@")[0] || "User",
          username: profile?.username || "user",
        },
      });
    }

    // Reset inactivity timer
    if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
    stopTimeoutRef.current = setTimeout(() => {
      const channel = supabase.channel(`typing:${conversationId}`);
      channel.send({
        type: "broadcast",
        event: "typing_stop",
        payload: {
          userId: user.id,
        },
      });
    }, TYPING_TIMEOUT_MS);
  }, [conversationId, user?.id, user?.email, profile, supabase]);

  // Explicitly broadcast that current user stopped typing (e.g. after message sent)
  const stopTyping = React.useCallback(() => {
    if (!conversationId || !user?.id) return;

    if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
    lastBroadcastRef.current = 0;

    const channel = supabase.channel(`typing:${conversationId}`);
    channel.send({
      type: "broadcast",
      event: "typing_stop",
      payload: {
        userId: user.id,
      },
    });
  }, [conversationId, user?.id, supabase]);

  const typingStatusText = React.useMemo(() => {
    if (typingUsers.length === 0) return null;
    if (typingUsers.length === 1) {
      return `${typingUsers[0].displayName} is typing...`;
    }
    if (typingUsers.length === 2) {
      return `${typingUsers[0].displayName} and ${typingUsers[1].displayName} are typing...`;
    }
    const remaining = typingUsers.length - 2;
    return `${typingUsers[0].displayName}, ${typingUsers[1].displayName}, and ${remaining} other${remaining > 1 ? "s" : ""} are typing...`;
  }, [typingUsers]);

  return {
    typingUsers,
    typingStatusText,
    sendTyping,
    stopTyping,
  };
}
