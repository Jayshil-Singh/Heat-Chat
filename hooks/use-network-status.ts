"use client";

import * as React from "react";
import { classifyNetworkError } from "@/lib/utils/network-error";

export type ConnectionState = "online" | "offline" | "reconnecting" | "degraded";

export interface NetworkStatus {
  isOnline: boolean;
  connectionState: ConnectionState;
  recordNetworkSuccess: () => void;
  recordNetworkFailure: (error?: unknown) => void;
}

// Global module-level state to share network telemetry across components without duplicate listeners
let globalIsOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
let globalConnectionState: ConnectionState = globalIsOnline ? "online" : "offline";
let consecutiveFailures = 0;
const subscribers = new Set<(state: { isOnline: boolean; connectionState: ConnectionState }) => void>();

function notifySubscribers() {
  const payload = { isOnline: globalIsOnline, connectionState: globalConnectionState };
  subscribers.forEach((cb) => {
    try {
      cb(payload);
    } catch {
      // Ignore callback errors
    }
  });
}

export function recordGlobalNetworkSuccess() {
  consecutiveFailures = 0;
  let changed = false;
  if (!globalIsOnline) {
    globalIsOnline = true;
    changed = true;
  }
  if (globalConnectionState !== "online") {
    globalConnectionState = "online";
    changed = true;
  }
  if (changed) {
    notifySubscribers();
  }
}

export function recordGlobalNetworkFailure(error?: unknown) {
  consecutiveFailures++;
  let changed = false;

  const classified = error ? classifyNetworkError(error) : null;

  if (classified?.type === "NETWORK_OFFLINE" || (typeof navigator !== "undefined" && !navigator.onLine)) {
    if (globalIsOnline) {
      globalIsOnline = false;
      changed = true;
    }
    if (globalConnectionState !== "offline") {
      globalConnectionState = "offline";
      changed = true;
    }
  } else if (classified?.type === "NETWORK_CONNECTION_CLOSED" || classified?.type === "NETWORK_TIMEOUT") {
    if (consecutiveFailures >= 3) {
      if (globalConnectionState !== "offline") {
        globalConnectionState = "offline";
        changed = true;
      }
    } else {
      if (globalConnectionState !== "reconnecting") {
        globalConnectionState = "reconnecting";
        changed = true;
      }
    }
  } else if (consecutiveFailures >= 2) {
    if (globalConnectionState !== "degraded" && globalConnectionState !== "offline") {
      globalConnectionState = "degraded";
      changed = true;
    }
  }

  if (changed) {
    notifySubscribers();
  }
}

// Setup browser event listeners once
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    globalIsOnline = true;
    globalConnectionState = consecutiveFailures > 0 ? "reconnecting" : "online";
    notifySubscribers();
  });

  window.addEventListener("offline", () => {
    globalIsOnline = false;
    globalConnectionState = "offline";
    notifySubscribers();
  });
}

export function useNetworkStatus(): NetworkStatus {
  const [state, setState] = React.useState<{ isOnline: boolean; connectionState: ConnectionState }>({
    isOnline: true,
    connectionState: "online",
  });

  React.useEffect(() => {
    // Initial sync
    setState({
      isOnline: globalIsOnline,
      connectionState: globalConnectionState,
    });

    const handler = (nextState: { isOnline: boolean; connectionState: ConnectionState }) => {
      setState((prev) => {
        if (prev.isOnline === nextState.isOnline && prev.connectionState === nextState.connectionState) {
          return prev;
        }
        return nextState;
      });
    };

    subscribers.add(handler);
    return () => {
      subscribers.delete(handler);
    };
  }, []);

  const recordNetworkSuccess = React.useCallback(() => {
    recordGlobalNetworkSuccess();
  }, []);

  const recordNetworkFailure = React.useCallback((error?: unknown) => {
    recordGlobalNetworkFailure(error);
  }, []);

  return {
    isOnline: state.isOnline,
    connectionState: state.connectionState,
    recordNetworkSuccess,
    recordNetworkFailure,
  };
}
