"use client";

import * as React from "react";

export interface PwaStatus {
  isStandalone: boolean;
  isIOS: boolean;
  isSupported: boolean;
}

export function usePwaStatus(): PwaStatus {
  const [status, setStatus] = React.useState<PwaStatus>({
    isStandalone: false,
    isIOS: false,
    isSupported: false,
  });

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    // Detect iOS environment (iPhone, iPad, iPod)
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOS =
      /iphone|ipad|ipod/.test(userAgent) ||
      (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);

    // Detect standalone display mode
    const isStandaloneMQ = window.matchMedia("(display-mode: standalone)").matches;
    const isIOSStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    const isAndroidApp = document.referrer.startsWith("android-app://");
    const isStandalone = isStandaloneMQ || isIOSStandalone || isAndroidApp;

    const isSupported = "serviceWorker" in navigator;

    setStatus({
      isStandalone,
      isIOS,
      isSupported,
    });

    // Listen for display-mode media query changes
    const mediaQueryList = window.matchMedia("(display-mode: standalone)");
    const handleModeChange = (e: MediaQueryListEvent) => {
      setStatus((prev) => ({
        ...prev,
        isStandalone: e.matches || isIOSStandalone,
      }));
    };

    if (mediaQueryList.addEventListener) {
      mediaQueryList.addEventListener("change", handleModeChange);
    } else {
      mediaQueryList.addListener(handleModeChange);
    }

    return () => {
      if (mediaQueryList.removeEventListener) {
        mediaQueryList.removeEventListener("change", handleModeChange);
      } else {
        mediaQueryList.removeListener(handleModeChange);
      }
    };
  }, []);

  return status;
}
