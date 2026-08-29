"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export interface PresenceContextType {
  onlineUserIds: Set<string>;
  isUserOnline: (userId: string) => boolean;
}

export const PresenceContext = React.createContext<PresenceContextType>({
  onlineUserIds: new Set(),
  isUserOnline: () => false,
});

export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [onlineUserIds, setOnlineUserIds] = React.useState<Set<string>>(new Set());
  const supabase = React.useMemo(() => createClient(), []);

  React.useEffect(() => {
    if (!user?.id) {
      setOnlineUserIds(new Set());
      return;
    }

    // Single global presence channel for the authenticated session
    const channelName = "global:presence";
    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    // CRITICAL: All presence event callbacks MUST be registered BEFORE calling subscribe()
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const activeIds = new Set<string>();
        Object.keys(state).forEach((key) => {
          activeIds.add(key);
        });
        setOnlineUserIds(activeIds);
      })
      .on("presence", { event: "join" }, ({ key }) => {
        if (key) {
          setOnlineUserIds((prev) => new Set(prev).add(key));
        }
      })
      .on("presence", { event: "leave" }, ({ key }) => {
        if (key) {
          setOnlineUserIds((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        }
      });

    // Subscribe to presence channel after all listeners are attached
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        try {
          await channel.track({
            user_id: user.id,
            online_at: new Date().toISOString(),
          });
        } catch (err) {
          console.warn("Presence tracking warning:", err);
        }
      }
    });

    // Cleanup: untrack and remove channel from Supabase client
    return () => {
      channel.untrack().catch(() => {});
      supabase.removeChannel(channel);
    };
  }, [user?.id, supabase]);

  const isUserOnline = React.useCallback(
    (userId: string) => {
      return onlineUserIds.has(userId);
    },
    [onlineUserIds]
  );

  const value = React.useMemo(
    () => ({
      onlineUserIds,
      isUserOnline,
    }),
    [onlineUserIds, isUserOnline]
  );

  return (
    <PresenceContext.Provider value={value}>
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresence() {
  return React.useContext(PresenceContext);
}
