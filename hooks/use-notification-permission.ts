"use client";

import * as React from "react";

export type PermissionState = "default" | "granted" | "denied" | "unsupported";

export function useNotificationPermission() {
  const [permission, setPermission] = React.useState<PermissionState>("default");
  const [isSupported, setIsSupported] = React.useState(false);

  React.useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setIsSupported(true);
      setPermission(Notification.permission as PermissionState);
    } else {
      setIsSupported(false);
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
          icon: "/favicon.ico",
          badge: "/favicon.ico",
          ...options,
        });

        if (options?.onClick) {
          notif.onclick = () => {
            window.focus();
            options.onClick?.();
            notif.close();
          };
        }

        // Auto close after 5 seconds
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
    requestPermission,
    showDesktopNotification,
  };
}
