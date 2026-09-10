"use client";

import * as React from "react";

/**
 * ServiceWorkerRegistration
 * Registers the production service worker (/sw.js) only in production environments.
 * Handles unsupported browsers gracefully and avoids duplicate registrations.
 */
export function ServiceWorkerRegistration() {
  React.useEffect(() => {
    // Only register in production or when explicitly enabled
    if (process.env.NODE_ENV !== "production") {
      return;
    }

    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    let isSubscribed = true;
    let hadControllerAtStart = Boolean(navigator.serviceWorker.controller);
    let refreshing = false;

    const onControllerChange = () => {
      // Only reload if the page was previously controlled by an older service worker
      if (!hadControllerAtStart) {
        hadControllerAtStart = true;
        return;
      }
      if (refreshing) return;
      refreshing = true;
      console.info("[PWA] Service worker updated. Reloading page to fetch latest deployment assets...");
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        if (!isSubscribed) return;

        // Check for updates on page focus
        registration.addEventListener("updatefound", () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener("statechange", () => {
            if (
              installingWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              // A new update is ready
              console.info("[PWA] New version ready.");
            }
          });
        });
      } catch (error) {
        // Non-blocking error handling to ensure app shell never breaks
        if (process.env.NODE_ENV === "development") {
          console.warn("[PWA] Service worker registration failed:", error);
        }
      }
    };

    // Register after initial page load to avoid blocking critical paint
    if (document.readyState === "complete") {
      registerSW();
    } else {
      window.addEventListener("load", registerSW);
    }

    return () => {
      isSubscribed = false;
      window.removeEventListener("load", registerSW);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
