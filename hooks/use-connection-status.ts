"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";

export type ConnectionState = "connected" | "connecting" | "reconnecting" | "offline";

export function useConnectionStatus() {
  const [status, setStatus] = React.useState<ConnectionState>("connected");
  const supabase = React.useMemo(() => createClient(), []);
  const reconnectTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    // Check initial online status
    if (!navigator.onLine) {
      setStatus("offline");
    }

    const handleOnline = () => {
      setStatus("reconnecting");
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        setStatus("connected");
      }, 1500);
    };

    const handleOffline = () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      setStatus("offline");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Monitor Supabase Realtime socket events if available
    try {
      const realtime = (supabase as any).realtime;
      if (realtime) {
        realtime.onOpen?.(() => {
          if (navigator.onLine) {
            setStatus("connected");
          }
        });
        realtime.onClose?.(() => {
          if (navigator.onLine) {
            setStatus("reconnecting");
          } else {
            setStatus("offline");
          }
        });
        realtime.onError?.(() => {
          if (navigator.onLine) {
            setStatus("reconnecting");
          } else {
            setStatus("offline");
          }
        });
      }
    } catch {}

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [supabase]);

  return {
    status,
    isOnline: status === "connected",
    isReconnecting: status === "reconnecting",
    isOffline: status === "offline",
  };
}
