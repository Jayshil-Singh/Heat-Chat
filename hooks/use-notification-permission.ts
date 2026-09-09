"use client";

import * as React from "react";

export type BrowserPermissionState = "granted" | "denied" | "default" | "unsupported";
export type PermissionState = BrowserPermissionState;

export type PushSubscriptionStatus =
  | "unsupported"
  | "permission-default"
  | "permission-denied"
  | "checking"
  | "subscribed"
  | "expired"
  | "invalid"
  | "recovering"
  | "error"
  // Legacy aliases for backwards compatibility
  | "not_subscribed"
  | "subscription_expired"
  | "subscription_invalid"
  | "subscription_unavailable";

export type AppNotificationPreferenceState = "notifications_enabled" | "notifications_disabled";

export interface PushOperationResult {
  success: boolean;
  error?: string;
  code?: string;
}

// In-memory installation identifier (ephemeral, zero persistent payload)
const IN_MEMORY_INSTALLATION_ID =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `inst_${Math.random().toString(36).substring(2, 15)}`;

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  if (!base64String || typeof base64String !== "string" || base64String.trim().length === 0) {
    const err = new Error("VAPID public key is missing or empty");
    (err as any).code = "VAPID_PUBLIC_KEY_INVALID";
    throw err;
  }

  const clean = base64String.trim();
  const padding = "=".repeat((4 - (clean.length % 4)) % 4);
  const base64 = (clean + padding).replace(/-/g, "+").replace(/_/g, "/");

  let rawData: string;
  try {
    rawData = typeof window !== "undefined" ? window.atob(base64) : atob(base64);
  } catch {
    const err = new Error("VAPID public key contains invalid base64 characters");
    (err as any).code = "VAPID_PUBLIC_KEY_INVALID";
    throw err;
  }

  if (rawData.length !== 65) {
    const err = new Error(`VAPID public key has invalid length (${rawData.length} bytes, expected 65 bytes)`);
    (err as any).code = "VAPID_PUBLIC_KEY_INVALID";
    throw err;
  }

  const outputArray = new Uint8Array(65);
  for (let i = 0; i < 65; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  if (outputArray[0] !== 0x04) {
    const err = new Error(
      `VAPID public key is not an uncompressed P-256 EC point (expected first byte 0x04, got 0x${outputArray[0].toString(16)})`
    );
    (err as any).code = "VAPID_PUBLIC_KEY_INVALID";
    throw err;
  }

  return outputArray;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function useNotificationPermission() {
  const [permission, setPermission] = React.useState<BrowserPermissionState>("default");
  const [subscriptionStatus, setSubscriptionStatus] = React.useState<PushSubscriptionStatus>("checking");
  const [isSupported, setIsSupported] = React.useState(false);
  const [isPushSupported, setIsPushSupported] = React.useState(false);
  const [isPushLoading, setIsPushLoading] = React.useState(false);

  // Recovery & concurrency tracking refs
  const healAttemptsRef = React.useRef(0);
  const isHealingRef = React.useRef(false);
  const isSubscribingRef = React.useRef(false);
  const isMountedRef = React.useRef(true);

  // Backward-compatible boolean: isPushSubscribed
  const isPushSubscribed: boolean = subscriptionStatus === "subscribed";

  const requestPermission = React.useCallback(async (): Promise<BrowserPermissionState> => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      return "unsupported";
    }

    try {
      const result = await Notification.requestPermission();
      const mapped = result as BrowserPermissionState;
      setPermission(mapped);
      return mapped;
    } catch {
      setPermission("denied");
      return "denied";
    }
  }, []);

  const subscribeToPush = React.useCallback(
    async (isRecovery: boolean = false): Promise<PushOperationResult> => {
      // Prevent concurrent duplicate subscribe attempts
      if (isSubscribingRef.current) {
        return {
          success: false,
          error: "Push subscription operation already in progress",
          code: "PUSH_CONCURRENT_OPERATION",
        };
      }

      if (!isPushSupported) {
        setSubscriptionStatus("unsupported");
        return {
          success: false,
          error: "Push notifications not supported in this browser",
          code: "PUSH_UNSUPPORTED",
        };
      }

      isSubscribingRef.current = true;
      setIsPushLoading(true);

      try {
        // Fast-path: check if permission is already denied to avoid redundant browser prompts
        if (typeof Notification !== "undefined" && Notification.permission === "denied") {
          if (isMountedRef.current) setSubscriptionStatus("permission-denied");
          return {
            success: false,
            error: "Notification permission was blocked in your browser settings",
            code: "PUSH_PERMISSION_DENIED",
          };
        }

        const permissionResult = await requestPermission();
        if (permissionResult !== "granted") {
          if (isMountedRef.current) setSubscriptionStatus("permission-denied"); // subscription_unavailable
          return {
            success: false,
            error: "Notification permission denied",
            code: "PUSH_PERMISSION_DENIED",
          };
        }

        // 1. Register service worker and await readiness
        if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
          if (isMountedRef.current) setSubscriptionStatus("unsupported"); // subscription_unavailable
          return {
            success: false,
            error: "Service worker not supported in this browser",
            code: "PUSH_SERVICE_WORKER_UNAVAILABLE",
          };
        }

        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;

        // 2. Fetch & validate VAPID public key
        let rawPublicKey: string = "";
        if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
          rawPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        } else {
          const keyRes = await fetch("/api/notifications/push/public-key");
          if (!keyRes.ok) {
            const err = new Error("Failed to fetch VAPID public key from server");
            (err as any).code = "PUSH_VAPID_KEY_MISSING";
            throw err;
          }
          const keyJson = await keyRes.json().catch(() => ({}));
          rawPublicKey = keyJson.publicKey || "";
        }

        // Validate VAPID key before calling PushManager
        const applicationServerKey = urlBase64ToUint8Array(rawPublicKey);

        // 3. Inspect existing subscription: reuse if valid, otherwise create new
        let subscription = await reg.pushManager.getSubscription();

        if (!subscription) {
          subscription = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey as unknown as BufferSource,
          });
        }

        const p256dh = arrayBufferToBase64Url(subscription.getKey("p256dh"));
        const auth = arrayBufferToBase64Url(subscription.getKey("auth"));

        // Determine device type
        const ua = navigator.userAgent.toLowerCase();
        let deviceType = "desktop";
        if (/ipad|tablet/i.test(ua)) deviceType = "tablet";
        else if (/mobile|iphone|android/i.test(ua)) deviceType = "mobile";

        // 4. Send subscription to server with in-memory installation_id
        const subRes = await fetch("/api/notifications/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: subscription.endpoint,
            p256dh,
            auth,
            device_type: deviceType,
            installation_id: IN_MEMORY_INSTALLATION_ID,
          }),
        });

        if (!subRes.ok) {
          const errJson = await subRes.json().catch(() => ({}));
          const err = new Error(errJson.message || errJson.error || "Failed to register push subscription on server");
          (err as any).code = errJson.code || "PUSH_API_FAILED";
          throw err;
        }

        // 5. Verify server record exists and is active
        const verifyRes = await fetch(
          `/api/notifications/push/subscriptions?verify_endpoint=${encodeURIComponent(subscription.endpoint)}`
        );
        const verifyJson = await verifyRes.json().catch(() => ({}));

        if (verifyJson.verified) {
          if (isMountedRef.current) {
            setSubscriptionStatus("subscribed");
            healAttemptsRef.current = 0;
          }
          return { success: true };
        } else {
          const err = new Error("Server verification failed for registered push subscription");
          (err as any).code = "PUSH_VERIFICATION_FAILED";
          throw err;
        }
      } catch (err) {
        const error = err as any;
        if (isMountedRef.current) {
          setSubscriptionStatus(isRecovery ? "error" : "permission-default");
        }
        return {
          success: false,
          error: error.message || "Push subscription failed",
          code: error.code || "PUSH_SUBSCRIBE_FAILED",
        };
      } finally {
        // Required Invariant: loading & concurrency flags must ALWAYS be cleared
        if (isMountedRef.current) {
          setIsPushLoading(false);
        }
        isSubscribingRef.current = false;
      }
    },
    [isPushSupported, requestPermission]
  );

  const selfHealSubscription = React.useCallback(
    async (staleSub?: PushSubscription | null) => {
      if (isHealingRef.current || healAttemptsRef.current >= 2) {
        if (isMountedRef.current) setSubscriptionStatus("error");
        return;
      }

      isHealingRef.current = true;
      if (isMountedRef.current) setSubscriptionStatus("recovering");
      healAttemptsRef.current += 1;

      try {
        // 1. Remove/revoke stale subscription
        if (staleSub) {
          await staleSub.unsubscribe().catch(() => {});
        } else if ("serviceWorker" in navigator) {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          if (sub) await sub.unsubscribe().catch(() => {});
        }

        // Bounded jitter delay: 150ms - 350ms
        await new Promise((r) => setTimeout(r, 150 + Math.random() * 200));

        // 2. Create, register, and verify fresh subscription
        const res = await subscribeToPush(true);
        if (!res.success && isMountedRef.current) {
          setSubscriptionStatus("error");
        }
      } catch {
        if (isMountedRef.current) setSubscriptionStatus("error");
      } finally {
        isHealingRef.current = false;
      }
    },
    [subscribeToPush]
  );

  const evaluateSubscription = React.useCallback(
    async (pushCheck: boolean) => {
      if (!pushCheck || typeof window === "undefined") {
        setSubscriptionStatus("unsupported");
        return;
      }

      const currentPerm = Notification.permission;
      if (currentPerm === "denied") {
        setSubscriptionStatus("permission-denied");
        return;
      }
      if (currentPerm === "default") {
        setSubscriptionStatus("permission-default");
        return;
      }

      try {
        setSubscriptionStatus("checking");
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();

        if (!sub) {
          setSubscriptionStatus("permission-default");
          return;
        }

        // Check if subscription has expired
        if (typeof sub.expirationTime === "number" && sub.expirationTime > 0 && sub.expirationTime < Date.now()) {
          setSubscriptionStatus("expired");
          await selfHealSubscription(sub);
          return;
        }

        // Check if endpoint is valid
        if (!sub.endpoint || !sub.endpoint.startsWith("http")) {
          setSubscriptionStatus("invalid");
          await selfHealSubscription(sub);
          return;
        }

        // Verify with server: MUST NOT show "subscribed" solely based on browser push subscription!
        const verifyRes = await fetch(
          `/api/notifications/push/subscriptions?verify_endpoint=${encodeURIComponent(sub.endpoint)}`
        );
        const verifyJson = await verifyRes.json().catch(() => ({}));

        if (verifyJson.verified) {
          setSubscriptionStatus("subscribed");
          healAttemptsRef.current = 0;
        } else {
          // Server says subscription is revoked or not found: Self-heal!
          setSubscriptionStatus("invalid");
          await selfHealSubscription(sub);
        }
      } catch {
        setSubscriptionStatus("error");
      }
    },
    [selfHealSubscription]
  );

  React.useEffect(() => {
    isMountedRef.current = true;

    if (typeof window !== "undefined" && "Notification" in window) {
      setIsSupported(true);
      const currentPerm = Notification.permission as BrowserPermissionState;
      setPermission(currentPerm);

      if (!("PushManager" in window) || !("serviceWorker" in navigator)) {
        setIsPushSupported(false);
        setSubscriptionStatus("unsupported");
      } else {
        setIsPushSupported(true);
        evaluateSubscription(true);
      }
    } else {
      setIsSupported(false);
      setIsPushSupported(false);
      setPermission("unsupported");
      setSubscriptionStatus("unsupported");
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [evaluateSubscription]);

  // Listen for Notification permission changes when supported
  React.useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return;

    let permissionStatus: PermissionStatus | null = null;
    try {
      navigator.permissions.query({ name: "notifications" as PermissionName }).then((status) => {
          permissionStatus = status;
          status.onchange = () => {
            if (!isMountedRef.current) return;
            const updated = Notification.permission as BrowserPermissionState;
            setPermission(updated);
            evaluateSubscription(true);
          };
        })
        .catch(() => {});
    } catch {}

    return () => {
      if (permissionStatus) {
        permissionStatus.onchange = null;
      }
    };
  }, [evaluateSubscription]);

  // Verify server state on: focus, visibilitychange, online, and service-worker controllerchange
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const handleFocusOrVisible = () => {
      if (document.visibilityState === "visible") {
        evaluateSubscription(isPushSupported);
      }
    };

    const handleOnline = () => {
      evaluateSubscription(isPushSupported);
    };

    const handleControllerChange = () => {
      evaluateSubscription(isPushSupported);
    };

    window.addEventListener("focus", handleFocusOrVisible);
    document.addEventListener("visibilitychange", handleFocusOrVisible);
    window.addEventListener("online", handleOnline);
    navigator.serviceWorker?.addEventListener("controllerchange", handleControllerChange);

    return () => {
      window.removeEventListener("focus", handleFocusOrVisible);
      document.removeEventListener("visibilitychange", handleFocusOrVisible);
      window.removeEventListener("online", handleOnline);
      navigator.serviceWorker?.removeEventListener("controllerchange", handleControllerChange);
    };
  }, [isPushSupported, evaluateSubscription]);

  const unsubscribeFromPush = React.useCallback(async (): Promise<PushOperationResult> => {
    setIsPushLoading(true);
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          // Revoke on server
          await fetch("/api/notifications/push/subscriptions", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          }).catch(() => {});

          await sub.unsubscribe();
        }
      }
      if (isMountedRef.current) {
        setSubscriptionStatus("permission-default"); // setSubscriptionStatus("not_subscribed")
      }
      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to unsubscribe",
        code: "PUSH_UNSUBSCRIBE_FAILED",
      };
    } finally {
      // Required Invariant: loading flag must ALWAYS be cleared
      if (isMountedRef.current) {
        setIsPushLoading(false);
      }
    }
  }, []);

  const sendTestNotification = React.useCallback(async (): Promise<PushOperationResult> => {
    try {
      const res = await fetch("/api/notifications/push/test", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          success: false,
          error: json.error || "Test notification request failed",
          code: json.code || "PUSH_TEST_FAILED",
        };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || "Network error", code: "NETWORK_ERROR" };
    }
  }, []);

  const showDesktopNotification = React.useCallback(
    (title: string, options?: NotificationOptions & { onClick?: () => void }) => {
      if (
        typeof window === "undefined" ||
        !("Notification" in window) ||
        Notification.permission !== "granted"
      ) {
        return null;
      }

      try {
        const notif = new Notification(title, {
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          ...options,
        });

        if (options?.onClick) {
          notif.onclick = () => {
            window.focus();
            options.onClick?.();
            notif.close();
          };
        }

        setTimeout(() => {
          try {
            notif.close();
          } catch {}
        }, 5000);

        return notif;
      } catch {
        return null;
      }
    },
    []
  );

  return {
    permission,
    permissionState: permission,
    subscriptionStatus,
    isSupported,
    isPushSupported,
    isPushSubscribed,
    isPushLoading,
    requestPermission,
    subscribeToPush,
    unsubscribeFromPush,
    sendTestNotification,
    showDesktopNotification,
  };
}
