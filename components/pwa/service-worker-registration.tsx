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
      return () => {
        isSubscribed = false;
        window.removeEventListener("load", registerSW);
      };
    }

    return () => {
      isSubscribed = false;
    };
  }, []);

  return null;
}
