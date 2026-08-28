"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./use-auth";
import type { NotificationPreference, ConversationNotificationPreference } from "@/types/database";

const DEFAULT_PREFERENCES: NotificationPreference = {
  user_id: "",
  notifications_enabled: true,
  sound_enabled: true,
  desktop_notifications_enabled: false,
  message_preview_enabled: true,
  updated_at: new Date().toISOString(),
};

export function useNotificationPreferences() {
  const { user } = useAuth();
  const [preferences, setPreferences] = React.useState<NotificationPreference>(DEFAULT_PREFERENCES);
  const [mutedConversations, setMutedConversations] = React.useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = React.useState(true);

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
        setPreferences(prefData);
      } else {
        setPreferences({ ...DEFAULT_PREFERENCES, user_id: user.id });
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

  // Update preferences with optimistic update & rollback
  const updatePreferences = React.useCallback(
    async (updates: Partial<Omit<NotificationPreference, "user_id" | "updated_at">>) => {
      if (!user?.id) return false;

      const previous = preferences;
      const optimistic = {
        ...preferences,
        ...updates,
        updated_at: new Date().toISOString(),
      };
      setPreferences(optimistic);

      try {
        const { data, error } = await supabase
          .from("notification_preferences")
          .upsert({
            user_id: user.id,
            notifications_enabled: optimistic.notifications_enabled,
            sound_enabled: optimistic.sound_enabled,
            desktop_notifications_enabled: optimistic.desktop_notifications_enabled,
            message_preview_enabled: optimistic.message_preview_enabled,
            updated_at: optimistic.updated_at,
          })
          .select()
          .single();

        if (error) throw error;
        if (data) setPreferences(data);
        return true;
      } catch (err) {
        console.error("Failed to update notification preferences:", err);
        setPreferences(previous);
        return false;
      }
    },
    [user?.id, preferences, supabase]
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
        const { error } = await (supabase.rpc as any)("toggle_conversation_mute", {
          conv_id: conversationId,
          is_muted: shouldMute,
        });

        if (error) throw error;
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

  return {
    preferences,
    isLoading,
    updatePreferences,
    toggleMute,
    isConversationMuted,
    refreshPreferences: fetchPreferences,
  };
}
