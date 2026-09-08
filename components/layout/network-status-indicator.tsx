"use client";

import * as React from "react";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { WifiOff, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NetworkStatusIndicator() {
  const { isOnline, connectionState, recordNetworkSuccess } = useNetworkStatus();
  const [isRetrying, setIsRetrying] = React.useState(false);

  if (connectionState === "online") {
    return null;
  }

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch("/api/notifications", { method: "HEAD", signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok || res.status < 500) {
        recordNetworkSuccess();
      }
    } catch {
      // Reconnection check failed
    } finally {
      setIsRetrying(false);
    }
  };

  const isOffline = connectionState === "offline" || !isOnline;
  const isReconnecting = connectionState === "reconnecting";

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-2 inset-x-2 z-50 flex justify-center pointer-events-none"
    >
      <div className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-full shadow-md text-xs font-medium max-w-[calc(100vw-24px)] min-w-0 bg-zinc-900 text-zinc-100 dark:bg-zinc-800 dark:text-zinc-50 border border-zinc-700/80 animate-in fade-in slide-in-from-top-2 duration-200">
        {isOffline ? (
          <WifiOff className="h-3.5 w-3.5 text-amber-400 shrink-0" aria-hidden="true" />
        ) : isReconnecting ? (
          <RefreshCw className="h-3.5 w-3.5 text-sky-400 shrink-0 animate-spin" aria-hidden="true" />
        ) : (
          <AlertCircle className="h-3.5 w-3.5 text-orange-400 shrink-0" aria-hidden="true" />
        )}

        <span className="truncate min-w-0 max-w-[200px] sm:max-w-xs">
          {isOffline
            ? "You're offline. Reconnecting…"
            : isReconnecting
            ? "Connection interrupted. Retrying…"
            : "Network connection degraded"}
        </span>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleRetry}
          disabled={isRetrying}
          className="h-6 px-2 text-[11px] font-semibold text-heat-400 hover:text-heat-300 hover:bg-zinc-800 dark:hover:bg-zinc-700 rounded-full shrink-0"
          aria-label="Retry connection"
        >
          {isRetrying ? "Checking…" : "Retry"}
        </Button>
      </div>
    </div>
  );
}
