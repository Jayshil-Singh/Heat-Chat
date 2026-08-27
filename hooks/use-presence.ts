"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./use-auth";

export function usePresence() {
  const { user } = useAuth();
  const [onlineUserIds, setOnlineUserIds] = React.useState<Set<string>>(new Set());

  const supabase = React.useMemo(() => createClient(), []);

  React.useEffect(() => {
    if (!user?.id) {
      setOnlineUserIds(new Set());
      return;
    }

    const presenceChannel = supabase.channel("global:presence", {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const activeIds = new Set<string>();
        Object.keys(state).forEach((key) => {
          activeIds.add(key);
        });
        setOnlineUserIds(activeIds);
      })
      .on("presence", { event: "join" }, ({ key }) => {
        setOnlineUserIds((prev) => new Set(prev).add(key));
      })
      .on("presence", { event: "leave" }, ({ key }) => {
        setOnlineUserIds((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      presenceChannel.untrack();
      supabase.removeChannel(presenceChannel);
    };
  }, [user?.id, supabase]);

  const isUserOnline = React.useCallback(
    (userId: string) => {
      return onlineUserIds.has(userId);
    },
    [onlineUserIds]
  );

  return {
    onlineUserIds,
    isUserOnline,
  };
}
