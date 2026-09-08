"use client";

import * as React from "react";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { useConnectionStatus } from "@/hooks/use-connection-status";

export function ConnectionStatusIndicator() {
  const { status, isOffline, isReconnecting } = useConnectionStatus();
  const [showRecovered, setShowRecovered] = React.useState(false);
  const prevStatusRef = React.useRef(status);

  React.useEffect(() => {
    if (prevStatusRef.current === "reconnecting" && status === "connected") {
      setShowRecovered(true);
      const timer = setTimeout(() => setShowRecovered(false), 2000);
      return () => clearTimeout(timer);
    }
    prevStatusRef.current = status;
  }, [status]);

  if (!isOffline && !isReconnecting && !showRecovered) {
    return null;
  }

  return (
    <aside
      aria-label="Connection Status"
      aria-live="polite"
      className="fixed top-2 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 pointer-events-none"
    >
      {isOffline && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900/90 text-zinc-100 text-xs font-medium shadow-md backdrop-blur-xs border border-zinc-700/60 dark:bg-zinc-800/90">
          <WifiOff className="h-3.5 w-3.5 text-amber-400" />
          <span>Offline — viewing in-memory messages</span>
        </div>
      )}

      {isReconnecting && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/90 text-white text-xs font-medium shadow-md backdrop-blur-xs border border-amber-400/40">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          <span>Reconnecting to live chat...</span>
        </div>
      )}

      {showRecovered && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-600/90 text-white text-xs font-medium shadow-md backdrop-blur-xs border border-emerald-400/40 animate-in fade-in slide-in-from-top-2">
          <Wifi className="h-3.5 w-3.5" />
          <span>Connected</span>
        </div>
      )}
    </aside>
  );
}
