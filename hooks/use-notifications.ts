"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./use-auth";
import { useNotificationPreferences } from "./use-notification-preferences";
import { useNotificationPermission } from "./use-notification-permission";
import { playNotificationSound } from "@/lib/audio/sound-cue";
import type { Notification, Profile, Conversation, Message } from "@/types/database";
import type { NotificationWithDetails } from "@/types/chat";

export function useNotifications(currentActiveConversationId?: string | null) {
  const { user } = useAuth();
  const { preferences, isConversationMuted } = useNotificationPreferences();
  const { showDesktopNotification } = useNotificationPermission();

  const [notifications, setNotifications] = React.useState<NotificationWithDetails[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [toasts, setToasts] = React.useState<NotificationWithDetails[]>([]);

  // Deduplication tracking sets
  const processedNotifIds = React.useRef<Set<string>>(new Set());
  const activeConvIdRef = React.useRef<string | null>(currentActiveConversationId || null);

  React.useEffect(() => {
    activeConvIdRef.current = currentActiveConversationId || null;
  }, [currentActiveConversationId]);

  const supabase = React.useMemo(() => createClient(), []);

  // Fetch initial notifications
  const fetchNotifications = React.useCallback(async () => {
    if (!user?.id) {
      setNotifications([]);
      setUnreadCount(0);
      setIsLoading(false);
      return;
    }

    try {
      // 1. Fetch raw notification rows
      const { data: rawNotifs, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) throw error;
      if (!rawNotifs || rawNotifs.length === 0) {
        setNotifications([]);
        setUnreadCount(0);
        setIsLoading(false);
        return;
      }

      // Track fetched IDs
      rawNotifs.forEach((n) => processedNotifIds.current.add(n.id));

      // 2. Batch-fetch sender profiles
      const senderIds = Array.from(new Set(rawNotifs.map((n) => n.sender_id)));
      const { data: profiles } = await supabase
        .from("profiles")
        .select("*")
        .in("id", senderIds);

      const profileMap = new Map<string, Profile>();
      (profiles || []).forEach((p) => profileMap.set(p.id, p as Profile));

      // 3. Batch-fetch conversations
      const convIds = Array.from(new Set(rawNotifs.map((n) => n.conversation_id)));
      const { data: convs } = await supabase
        .from("conversations")
        .select("*")
        .in("id", convIds);

      const convMap = new Map<string, Conversation>();
      (convs || []).forEach((c) => convMap.set(c.id, c as Conversation));

      // 4. Batch-fetch messages to resolve safe preview
      const msgIds = Array.from(new Set(rawNotifs.map((n) => n.message_id).filter(Boolean))) as string[];
      const { data: msgs } = await supabase
        .from("messages")
        .select("id, content, message_type, deleted_at")
        .in("id", msgIds);

      const msgMap = new Map<string, { content: string; message_type: string; deleted_at: string | null }>();
      (msgs || []).forEach((m) => msgMap.set(m.id, m));

      // 5. Construct detailed notification items
      const detailed: NotificationWithDetails[] = rawNotifs.map((n) => {
        const sender = profileMap.get(n.sender_id) || null;
        const conv = convMap.get(n.conversation_id);
        const msg = n.message_id ? msgMap.get(n.message_id) : null;

        const isDeleted = !!msg?.deleted_at;
        let preview = "";
        if (isDeleted) {
          preview = "This message was deleted";
        } else if (msg?.message_type === "image" && !msg?.content?.trim()) {
          preview = "📷 Photo";
        } else {
          preview = msg?.content || "New notification";
        }

        const convName = conv?.name || sender?.display_name || "Conversation";

        return {
          id: n.id,
          userId: n.user_id,
          conversationId: n.conversation_id,
          messageId: n.message_id,
          senderId: n.sender_id,
          type: n.type,
          readAt: n.read_at,
          createdAt: n.created_at,
          sender,
          conversationName: convName,
          conversationType: conv?.type || "direct",
          preview,
          isDeleted,
        };
      });

      setNotifications(detailed);
      setUnreadCount(detailed.filter((d) => !d.readAt).length);
    } catch (err) {
      console.warn("Error loading notifications:", err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, supabase]);

  React.useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Handle incoming notification
  const handleIncomingNotification = React.useCallback(
    async (rawNotif: Notification) => {
      // 1. Deduplication check
      if (processedNotifIds.current.has(rawNotif.id)) {
        return;
      }
      processedNotifIds.current.add(rawNotif.id);

      // 2. Fetch sender profile
      const { data: sender } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", rawNotif.sender_id)
        .maybeSingle();

      // 3. Fetch conversation
      const { data: conv } = await supabase
        .from("conversations")
        .select("*")
        .eq("id", rawNotif.conversation_id)
        .maybeSingle();

      // 4. Fetch message content safely
      let preview = "New message";
      let isDeleted = false;

      if (rawNotif.message_id) {
        const { data: msg } = await supabase
          .from("messages")
          .select("content, message_type, deleted_at")
          .eq("id", rawNotif.message_id)
          .maybeSingle();

        if (msg) {
          if (msg.deleted_at) {
            isDeleted = true;
            preview = "This message was deleted";
          } else if (msg.message_type === "image" && !msg.content?.trim()) {
            preview = "📷 Photo";
          } else {
            preview = msg.content;
          }
        }
      }

      const convName = conv?.name || sender?.display_name || "Conversation";

      const item: NotificationWithDetails = {
        id: rawNotif.id,
        userId: rawNotif.user_id,
        conversationId: rawNotif.conversation_id,
        messageId: rawNotif.message_id,
        senderId: rawNotif.sender_id,
        type: rawNotif.type,
        readAt: rawNotif.read_at,
        createdAt: rawNotif.created_at,
        sender: sender as Profile | null,
        conversationName: convName,
        conversationType: conv?.type || "direct",
        preview,
        isDeleted,
      };

      // Update state
      setNotifications((prev) => [item, ...prev.filter((p) => p.id !== item.id)]);
      setUnreadCount((prev) => prev + 1);

      // 5. Suppression evaluation
      const isActiveConversation = activeConvIdRef.current === rawNotif.conversation_id;
      const isMuted = isConversationMuted(rawNotif.conversation_id);
      const isGlobalDisabled = !preferences.notifications_enabled;

      // If viewing current conversation or muted or globally disabled -> suppress toast/audio/desktop
      if (isActiveConversation || isMuted || isGlobalDisabled) {
        return;
      }

      // 6. Audio Cue
      if (preferences.sound_enabled) {
        playNotificationSound();
      }

      // 7. Desktop notification
      if (preferences.desktop_notifications_enabled) {
        const title =
          conv?.type === "group" && conv.name
            ? `${sender?.display_name || "Someone"} in ${conv.name}`
            : sender?.display_name || "Heat Chat";

        const bodyText = preferences.message_preview_enabled
          ? preview
          : `New message from ${sender?.display_name || "a friend"}`;

        showDesktopNotification(title, {
          body: bodyText,
          tag: rawNotif.conversation_id,
        });
      }

      // 8. In-App Toast
      setToasts((prev) => [...prev, item]);
    },
    [supabase, preferences, isConversationMuted, showDesktopNotification]
  );

  // Realtime subscription to user's notifications
  React.useEffect(() => {
    if (!user?.id) return;

    const channelName = `user-notifs-${user.id}`;
    const channel = supabase.channel(channelName);

    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      },
      (payload) => {
        if (payload.new) {
          handleIncomingNotification(payload.new as Notification);
        }
      }
    );

    channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      },
      (payload) => {
        if (payload.new) {
          const updated = payload.new as Notification;
          setNotifications((prev) =>
            prev.map((n) => (n.id === updated.id ? { ...n, readAt: updated.read_at } : n))
          );
          setUnreadCount((prev) =>
            Math.max(0, prev - (updated.read_at ? 1 : 0))
          );
        }
      }
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, supabase, handleIncomingNotification]);

  // Mark single notification as read
  const markAsRead = React.useCallback(
    async (notifId: string) => {
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notifId ? { ...n, readAt: new Date().toISOString() } : n
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      try {
        await (supabase.rpc as any)("mark_notification_as_read", {
          notif_id: notifId,
        });
      } catch (err) {
        console.warn("Failed to mark notification read:", err);
      }
    },
    [supabase]
  );

  // Mark all notifications as read
  const markAllAsRead = React.useCallback(async () => {
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || now })));
    setUnreadCount(0);

    try {
      await (supabase.rpc as any)("mark_all_notifications_as_read");
    } catch (err) {
      console.warn("Failed to mark all notifications read:", err);
    }
  }, [supabase]);

  // Dismiss a toast
  const dismissToast = React.useCallback((notifId: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== notifId));
  }, []);

  return {
    notifications,
    unreadCount,
    isLoading,
    toasts,
    dismissToast,
    markAsRead,
    markAllAsRead,
    refreshNotifications: fetchNotifications,
  };
}
