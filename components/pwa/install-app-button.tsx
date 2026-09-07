"use client";

import * as React from "react";
import { Download, Check, Share, X, Smartphone, Laptop } from "lucide-react";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { Button } from "@/components/ui/button";

interface InstallAppButtonProps {
  variant?: "card" | "button";
  className?: string;
}

export function InstallAppButton({
  variant = "card",
  className = "",
}: InstallAppButtonProps) {
  const { isInstallable, isInstalled, isStandalone, isIOS, promptInstall } =
    usePwaInstall();
  const [isInstalling, setIsInstalling] = React.useState(false);
  const [isIosDismissed, setIsIosDismissed] = React.useState(false);

  React.useEffect(() => {
    try {
      const dismissed = localStorage.getItem("heat_chat_pwa_ios_dismissed");
      if (dismissed === "true") {
        setIsIosDismissed(true);
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const handleDismissIos = () => {
    setIsIosDismissed(true);
    try {
      localStorage.setItem("heat_chat_pwa_ios_dismissed", "true");
    } catch {
      // Ignore localStorage errors
    }
  };

  const handleInstallClick = async () => {
    setIsInstalling(true);
    try {
      await promptInstall();
    } finally {
      setIsInstalling(false);
    }
  };

  // If already in standalone mode, show confirmation badge or nothing
  if (isStandalone || isInstalled) {
    if (variant === "card") {
      return (
        <div
          className={`flex items-center justify-between p-4 rounded-xl border border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300 ${className}`}
          role="status"
          aria-label="App installation status"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-sm">
              <Check className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-semibold">Heat Chat is Installed</p>
              <p className="text-[11px] opacity-80">
                Running in standalone Progressive Web App mode
              </p>
            </div>
          </div>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800">
            Active PWA
          </span>
        </div>
      );
    }
    return null;
  }

  // iOS Safari specific installation instruction banner
  if (isIOS && !isStandalone) {
    if (isIosDismissed && variant !== "card") {
      return null;
    }

    return (
      <div
        className={`relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/70 ${className}`}
        role="region"
        aria-label="iOS Installation Guidance"
      >
        <div className="flex items-start sm:items-center gap-3 pr-6 sm:pr-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-heat-500 text-white shadow-sm">
            <Share className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="space-y-0.5 text-left">
            <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              Install Heat Chat on iOS
            </p>
            <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
              Tap <span className="font-semibold text-heat-600 dark:text-heat-400">Share</span> (
              <Share className="inline h-3 w-3 mx-0.5 align-text-top" aria-hidden="true" />) then select{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-200">
                &ldquo;Add to Home Screen&rdquo;
              </span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDismissIos}
          className="absolute right-3 top-3 sm:static rounded-md p-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 cursor-pointer"
          aria-label="Dismiss iOS install guidance"
          title="Dismiss"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  // Standard Chrome/Edge/Android beforeinstallprompt flow
  if (isInstallable) {
    if (variant === "card") {
      return (
        <div
          className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/60 shadow-sm ${className}`}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-heat-600 to-amber-500 text-white shadow-sm shadow-heat-500/20">
              <Download className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="text-left space-y-0.5">
              <p className="text-xs font-semibold text-zinc-900 dark:text-white">
                Install Heat Chat
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Install as a standalone app on your desktop or mobile home screen
              </p>
            </div>
          </div>

          <Button
            type="button"
            onClick={handleInstallClick}
            disabled={isInstalling}
            className="w-full sm:w-auto h-9 text-xs font-semibold gap-1.5 shrink-0 bg-heat-500 hover:bg-heat-600 text-white shadow-sm shadow-heat-500/20 focus-visible:ring-heat-500 cursor-pointer"
            aria-label="Install Heat Chat app"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{isInstalling ? "Installing..." : "Install Heat Chat"}</span>
          </Button>
        </div>
      );
    }

    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleInstallClick}
        disabled={isInstalling}
        className={`h-9 text-xs gap-1.5 font-medium cursor-pointer ${className}`}
        aria-label="Install Heat Chat application"
      >
        <Download className="h-3.5 w-3.5 text-heat-500" aria-hidden="true" />
        <span>{isInstalling ? "Installing..." : "Install App"}</span>
      </Button>
    );
  }

  // If unsupported or prompt not triggered yet (e.g. standard browser tab),
  // in card mode provide helpful informational state
  if (variant === "card") {
    return (
      <div
        className={`flex items-center justify-between p-4 rounded-xl border border-zinc-200 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-900/40 text-zinc-600 dark:text-zinc-400 ${className}`}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
            <Laptop className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="text-left space-y-0.5">
            <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-200">
              Web App Mode
            </p>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              To install, use your browser&apos;s &ldquo;Install App&rdquo; or &ldquo;Add to Home Screen&rdquo; option.
            </p>
          </div>
        </div>
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
          Browser Tab
        </span>
      </div>
    );
  }

  return null;
}
