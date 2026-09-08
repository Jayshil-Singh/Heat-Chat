"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./use-auth";
import type { NotificationPreference } from "@/types/database";

export interface GranularNotificationPreferences {
  messages: boolean;
  mentions: boolean;
  replies: boolean;
  groupActivity: boolean;
  friends: boolean;
  reactions: boolean;
  security: boolean;
  push: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreference = {
  user_id: "",
  notifications_enabled: true,
  sound_enabled: true,
  desktop_notifications_enabled: false,
  message_preview_enabled: true,
  messages_notify: true,
  mentions_notify: true,
  replies_notify: true,
  group_activity_notify: true,
  friend_activity_notify: true,
  reactions_notify: true,
  security_notify: true,
  push_enabled: true,
  updated_at: new Date().toISOString(),
};

export function useNotificationPreferences() {
  const { user } = useAuth();
  const [preferences, setPreferences] = React.useState<NotificationPreference>(DEFAULT_PREFERENCES);
  const [mutedConversations, setMutedConversations] = React.useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const supabase = React.useMemo(() => createClient(), []);

  // Fetch preferences and mute list
  const fetchPreferences = React.useCallback(async () => {
    if (!user?.id) {
      setPreferences(DEFAULT_PREFERENCES);
      setMutedConversations(new Set());
      setIsLoading(false);
      return;
    }

    try {
      // 1. Fetch user preferences
      const { data: prefData } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (prefData) {
        // Enforce security_notify is always true
        setPreferences({
          ...prefData,
          security_notify: true,
        });
      } else {
        setPreferences({ ...DEFAULT_PREFERENCES, user_id: user.id, security_notify: true });
      }

      // 2. Fetch conversation mute preferences
      const { data: muteData } = await supabase
        .from("conversation_notification_preferences")
        .select("conversation_id, muted")
        .eq("user_id", user.id)
        .eq("muted", true);

      if (muteData) {
        setMutedConversations(new Set(muteData.map((m) => m.conversation_id)));
      }
    } catch (err) {
      console.warn("Failed to load notification preferences:", err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, supabase]);

  React.useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  // Update preferences with optimistic update & rollback on rejection
  const updatePreferences = React.useCallback(
    async (updates: Partial<Omit<NotificationPreference, "user_id" | "updated_at">>): Promise<boolean> => {
      if (!user?.id) return false;

      const previous = preferences;
      // Invariant: security_notify must ALWAYS be true
      const normalizedUpdates = {
        ...updates,
        ...(updates.security_notify !== undefined ? { security_notify: true } : {}),
      };

      const optimistic: NotificationPreference = {
        ...preferences,
        ...normalizedUpdates,
        security_notify: true, // Always on / protected
        updated_at: new Date().toISOString(),
      };

      setPreferences(optimistic);
      setError(null);

      try {
        const { data, error: dbError } = await supabase
          .from("notification_preferences")
          .upsert({
            user_id: user.id,
            notifications_enabled: optimistic.notifications_enabled,
            sound_enabled: optimistic.sound_enabled,
            desktop_notifications_enabled: optimistic.desktop_notifications_enabled,
            message_preview_enabled: optimistic.message_preview_enabled,
            messages_notify: optimistic.messages_notify ?? true,
            mentions_notify: optimistic.mentions_notify ?? true,
            replies_notify: optimistic.replies_notify ?? true,
            group_activity_notify: optimistic.group_activity_notify ?? true,
            friend_activity_notify: optimistic.friend_activity_notify ?? true,
            reactions_notify: optimistic.reactions_notify ?? true,
            security_notify: true, // Server-authoritative enforcement
            push_enabled: optimistic.push_enabled ?? true,
            updated_at: optimistic.updated_at,
          })
          .select()
          .single();

        if (dbError) throw dbError;
        if (data) {
          setPreferences({
            ...data,
            security_notify: true,
          });
        }
        return true;
      } catch (err) {
        console.error("Failed to update notification preferences:", err);
        // Rollback to server-authoritative value
        setPreferences(previous);
        setError("Unable to save notification preferences. Restored previous settings.");
        return false;
      }
    },
    [user?.id, preferences, supabase]
  );

  // Granular preference helper
  const updateGranular = React.useCallback(
    async (key: keyof GranularNotificationPreferences, value: boolean): Promise<boolean> => {
      if (key === "security") {
        // Security notifications cannot be disabled
        return true;
      }

      const keyMapping: Record<keyof GranularNotificationPreferences, keyof NotificationPreference> = {
        messages: "messages_notify",
        mentions: "mentions_notify",
        replies: "replies_notify",
        groupActivity: "group_activity_notify",
        friends: "friend_activity_notify",
        reactions: "reactions_notify",
        security: "security_notify",
        push: "push_enabled",
      };

      const prefField = keyMapping[key];
      return updatePreferences({ [prefField]: value });
    },
    [updatePreferences]
  );

  // Toggle conversation mute
  const toggleMute = React.useCallback(
    async (conversationId: string, shouldMute: boolean) => {
      if (!user?.id) return false;

      const prevMuted = new Set(mutedConversations);
      const nextMuted = new Set(mutedConversations);
      if (shouldMute) {
        nextMuted.add(conversationId);
      } else {
        nextMuted.delete(conversationId);
      }
      setMutedConversations(nextMuted);

      try {
        const { error: rpcError } = await (supabase.rpc as any)("toggle_conversation_mute", {
          conv_id: conversationId,
          is_muted: shouldMute,
        });

        if (rpcError) throw rpcError;
        return true;
      } catch (err) {
        console.error("Failed to toggle conversation mute:", err);
        setMutedConversations(prevMuted);
        return false;
      }
    },
    [user?.id, mutedConversations, supabase]
  );

  const isConversationMuted = React.useCallback(
    (conversationId: string) => mutedConversations.has(conversationId),
    [mutedConversations]
  );

  // Granular preference accessors
  const granular: GranularNotificationPreferences = {
    messages: preferences.messages_notify ?? true,
    mentions: preferences.mentions_notify ?? true,
    replies: preferences.replies_notify ?? true,
    groupActivity: preferences.group_activity_notify ?? true,
    friends: preferences.friend_activity_notify ?? true,
    reactions: preferences.reactions_notify ?? true,
    security: true, // Always true
    push: preferences.push_enabled ?? true,
  };

  return {
    preferences,
    granular,
    messages: granular.messages,
    mentions: granular.mentions,
    replies: granular.replies,
    groupActivity: granular.groupActivity,
    friends: granular.friends,
    reactions: granular.reactions,
    security: true,
    push: granular.push,
    isLoading,
    error,
    updatePreferences,
    updateGranular,
    toggleMute,
    isConversationMuted,
    refreshPreferences: fetchPreferences,
  };
}
