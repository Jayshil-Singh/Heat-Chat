"use client";

import * as React from "react";
import { useNotifications } from "@/hooks/use-notifications";
import { useNotificationPreferences } from "@/hooks/use-notification-preferences";
import { NotificationToast } from "./notification-toast";
import type { NotificationWithDetails } from "@/types/chat";
import type { NotificationPreference } from "@/types/database";

interface NotificationContextValue {
  notifications: NotificationWithDetails[];
  unreadCount: number;
  isLoading: boolean;
  toasts: NotificationWithDetails[];
  preferences: NotificationPreference;
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  dismissToast: (id: string) => void;
  updatePreferences: (updates: Partial<Omit<NotificationPreference, "user_id" | "updated_at">>) => Promise<boolean>;
  isConversationMuted: (conversationId: string) => boolean;
  toggleMute: (conversationId: string, shouldMute: boolean) => Promise<boolean>;
  refreshNotifications: () => Promise<void>;
}

const NotificationContext = React.createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [activeConvId, setActiveConvId] = React.useState<string | null>(null);

  const {
    notifications,
    unreadCount,
    isLoading,
    toasts,
    dismissToast,
    markAsRead,
    markAllAsRead,
    refreshNotifications,
  } = useNotifications(activeConvId);

  const {
    preferences,
    updatePreferences,
    isConversationMuted,
    toggleMute,
  } = useNotificationPreferences();

  const value = React.useMemo(
    () => ({
      notifications,
      unreadCount,
      isLoading,
      toasts,
      preferences,
      activeConversationId: activeConvId,
      setActiveConversationId: setActiveConvId,
      markAsRead,
      markAllAsRead,
      dismissToast,
      updatePreferences,
      isConversationMuted,
      toggleMute,
      refreshNotifications,
    }),
    [
      notifications,
      unreadCount,
      isLoading,
      toasts,
      preferences,
      activeConvId,
      markAsRead,
      markAllAsRead,
      dismissToast,
      updatePreferences,
      isConversationMuted,
      toggleMute,
      refreshNotifications,
    ]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <NotificationToast toasts={toasts} onDismiss={dismissToast} />
    </NotificationContext.Provider>
  );
}

export function useNotificationContext() {
  const ctx = React.useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotificationContext must be used within a NotificationProvider");
  }
  return ctx;
}
