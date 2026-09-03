"use client";

import * as React from "react";

export type PermissionState = "default" | "granted" | "denied" | "unsupported";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function useNotificationPermission() {
  const [permission, setPermission] = React.useState<PermissionState>("default");
  const [isSupported, setIsSupported] = React.useState(false);
  const [isPushSupported, setIsPushSupported] = React.useState(false);
  const [isPushSubscribed, setIsPushSubscribed] = React.useState(false);
  const [isPushLoading, setIsPushLoading] = React.useState(false);

  React.useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setIsSupported(true);
      setPermission(Notification.permission as PermissionState);
      const pushCheck = "serviceWorker" in navigator && "PushManager" in window;
      setIsPushSupported(pushCheck);

      if (pushCheck) {
        navigator.serviceWorker.ready
          .then((reg) => reg.pushManager.getSubscription())
          .then((sub) => {
            setIsPushSubscribed(Boolean(sub));
          })
          .catch(() => setIsPushSubscribed(false));
      }
    } else {
      setIsSupported(false);
      setIsPushSupported(false);
      setPermission("unsupported");
    }
  }, []);

  const requestPermission = React.useCallback(async (): Promise<PermissionState> => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      return "unsupported";
    }

    try {
      const res = await Notification.requestPermission();
      setPermission(res as PermissionState);
      return res as PermissionState;
    } catch {
      setPermission("denied");
      return "denied";
    }
  }, []);

  const subscribeToPush = React.useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!isPushSupported) {
      return { success: false, error: "Push notifications not supported on this browser" };
    }

    setIsPushLoading(true);
    try {
      const perm = await requestPermission();
      if (perm !== "granted") {
        setIsPushLoading(false);
        return { success: false, error: "Notification permission denied" };
      }

      // 1. Register service worker
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;

      // 2. Fetch VAPID public key
      const keyRes = await fetch("/api/notifications/push/public-key");
      if (!keyRes.ok) throw new Error("Failed to fetch VAPID public key");
      const { publicKey } = await keyRes.json();

      // 3. Subscribe with PushManager
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
      });

      const p256dh = arrayBufferToBase64Url(subscription.getKey("p256dh"));
      const auth = arrayBufferToBase64Url(subscription.getKey("auth"));

      // Determine device type
      const ua = navigator.userAgent.toLowerCase();
      let deviceType = "desktop";
      if (/ipad|tablet/i.test(ua)) deviceType = "tablet";
      else if (/mobile|iphone|android/i.test(ua)) deviceType = "mobile";

      // 4. Send subscription to server
      const subRes = await fetch("/api/notifications/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          p256dh,
          auth,
          device_type: deviceType,
        }),
      });

      if (!subRes.ok) {
        const errJson = await subRes.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to register push subscription on server");
      }

      setIsPushSubscribed(true);
      setIsPushLoading(false);
      return { success: true };
    } catch (err: any) {
      setIsPushLoading(false);
      return { success: false, error: err.message || "Push subscription failed" };
    }
  }, [isPushSupported, requestPermission]);

  const unsubscribeFromPush = React.useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    setIsPushLoading(true);
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
        }
      }
      setIsPushSubscribed(false);
      setIsPushLoading(false);
      return { success: true };
    } catch (err: any) {
      setIsPushLoading(false);
      return { success: false, error: err.message || "Failed to unsubscribe" };
    }
  }, []);

  const sendTestNotification = React.useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/notifications/push/test", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, error: json.error || "Test notification request failed" };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || "Network error" };
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
