"use client";

import * as React from "react";
import { Flame, WifiOff, RefreshCw, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function OfflinePage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = React.useState(false);
  const [isOnline, setIsOnline] = React.useState(false);

  React.useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Auto-reconnect when network returns
      router.replace("/chat");
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    if (typeof window !== "undefined") {
      setIsOnline(navigator.onLine);
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      }
    };
  }, [router]);

  const handleRetry = () => {
    setIsChecking(true);
    if (typeof window !== "undefined") {
      if (navigator.onLine) {
        window.location.href = "/chat";
      } else {
        setTimeout(() => {
          setIsChecking(false);
        }, 600);
      }
    }
  };

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center p-4 bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50 selection:bg-heat-500 selection:text-white"
      role="main"
      aria-labelledby="offline-title"
    >
      <div className="w-full max-w-md text-center space-y-6">
        {/* Brand Icon */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-heat-600 via-heat-500 to-amber-400 text-white shadow-lg shadow-heat-500/25">
          <Flame className="h-8 w-8 fill-current" aria-hidden="true" />
        </div>

        {/* Offline Badge */}
        <div className="inline-flex items-center gap-1.5 rounded-full bg-zinc-200/80 px-3 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          <WifiOff className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
          <span>No Internet Connection</span>
        </div>

        {/* Headings */}
        <div className="space-y-2">
          <h1
            id="offline-title"
            className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-3xl"
          >
            You&apos;re offline.
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Reconnect to continue chatting. Heat Chat protects your privacy by never storing unencrypted private messages in offline storage.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleRetry}
            disabled={isChecking}
            className="flex h-11 w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-heat-500 px-6 text-sm font-semibold text-white shadow-md shadow-heat-500/25 transition-all hover:bg-heat-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 focus-visible:ring-offset-2 disabled:opacity-50 dark:focus-visible:ring-offset-zinc-950 cursor-pointer"
            aria-label="Retry connection"
          >
            <RefreshCw
              className={`h-4 w-4 ${isChecking ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            <span>{isChecking ? "Checking Connection..." : "Retry Connection"}</span>
          </button>

          <Link
            href="/chat"
            className="flex h-11 w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Go to Chat</span>
          </Link>
        </div>

        {/* Help Tip */}
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Tip: Once your device reconnects to Wi-Fi or mobile data, Heat Chat will resume automatically.
        </p>
      </div>
    </main>
  );
}
