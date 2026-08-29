"use client";

import * as React from "react";
import {
  Settings,
  Moon,
  Sun,
  Monitor,
  Shield,
  LogOut,
  Bell,
  Volume2,
  Eye,
  Laptop,
  CheckCircle2,
  AlertCircle,
  VolumeX,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/components/layout/theme-provider";
import { Button } from "@/components/ui/button";
import { useNotificationContext } from "@/components/notifications/notification-provider";
import { useNotificationPermission } from "@/hooks/use-notification-permission";
import { playTestSound } from "@/lib/audio/sound-cue";

export default function SettingsPage() {
  const router = useRouter();
  const { user, profile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { preferences, updatePreferences } = useNotificationContext();
  const { permission, isSupported, requestPermission } = useNotificationPermission();
  const [isPlayingTestSound, setIsPlayingTestSound] = React.useState(false);

  const handleTestSound = async () => {
    setIsPlayingTestSound(true);
    await playTestSound();
    setTimeout(() => setIsPlayingTestSound(false), 500);
  };

  const handleRequestDesktopPermission = async () => {
    const result = await requestPermission();
    if (result === "granted") {
      await updatePreferences({ desktop_notifications_enabled: true });
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-8">
      <div className="border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Settings
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Manage your account preferences, notifications, and application appearance
        </p>
      </div>

      <div className="grid gap-6">
        {/* Notification Preferences Section */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
              <Bell className="h-4 w-4 text-heat-500" />
              Notifications & Sound
            </h2>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${
                preferences.notifications_enabled
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900"
                  : "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
              }`}
            >
              {preferences.notifications_enabled ? "Active" : "Muted"}
            </span>
          </div>

          <div className="space-y-4 divide-y divide-zinc-100 dark:divide-zinc-800/80">
            {/* 1. Master Notifications Toggle */}
            <div className="flex items-center justify-between pt-1">
              <div className="space-y-0.5">
                <label
                  htmlFor="toggle-notifications"
                  className="text-xs font-semibold text-zinc-900 dark:text-white cursor-pointer"
                >
                  Enable Notifications
                </label>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Receive alerts when friends message you or add you to groups
                </p>
              </div>
              <input
                id="toggle-notifications"
                type="checkbox"
                checked={preferences.notifications_enabled}
                onChange={(e) =>
                  updatePreferences({ notifications_enabled: e.target.checked })
                }
                className="h-4 w-4 rounded border-zinc-300 text-heat-500 focus:ring-heat-500 dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>

            {/* 2. Sound Effects Toggle + Test Sound */}
            <div className="flex items-center justify-between pt-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Volume2 className="h-3.5 w-3.5 text-zinc-400" />
                  <label
                    htmlFor="toggle-sound"
                    className="text-xs font-semibold text-zinc-900 dark:text-white cursor-pointer"
                  >
                    Audio Cues (Sound)
                  </label>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Play gentle chime for incoming messages
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestSound}
                  disabled={!preferences.sound_enabled}
                  className="h-8 text-xs gap-1.5"
                  aria-label="Test sound notification"
                >
                  <Volume2
                    className={`h-3 w-3 ${
                      isPlayingTestSound ? "text-heat-500 animate-pulse" : ""
                    }`}
                  />
                  <span>Test Sound</span>
                </Button>
                <input
                  id="toggle-sound"
                  type="checkbox"
                  checked={preferences.sound_enabled}
                  onChange={(e) =>
                    updatePreferences({ sound_enabled: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-zinc-300 text-heat-500 focus:ring-heat-500 dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>
            </div>

            {/* 3. Message Preview Toggle */}
            <div className="flex items-center justify-between pt-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Eye className="h-3.5 w-3.5 text-zinc-400" />
                  <label
                    htmlFor="toggle-preview"
                    className="text-xs font-semibold text-zinc-900 dark:text-white cursor-pointer"
                  >
                    Message Previews
                  </label>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Show message snippet in toast and notification center
                </p>
              </div>
              <input
                id="toggle-preview"
                type="checkbox"
                checked={preferences.message_preview_enabled}
                onChange={(e) =>
                  updatePreferences({ message_preview_enabled: e.target.checked })
                }
                className="h-4 w-4 rounded border-zinc-300 text-heat-500 focus:ring-heat-500 dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>

            {/* 4. Desktop Notifications */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Laptop className="h-3.5 w-3.5 text-zinc-400" />
                  <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                    Desktop Notifications
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                      permission === "granted"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900"
                        : permission === "denied"
                        ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900"
                        : "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
                    }`}
                  >
                    {permission === "granted" ? (
                      <>
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        Enabled
                      </>
                    ) : permission === "denied" ? (
                      <>
                        <AlertCircle className="h-2.5 w-2.5" />
                        Blocked
                      </>
                    ) : isSupported ? (
                      "Not Enabled"
                    ) : (
                      "Unsupported"
                    )}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Receive browser notifications even when tab is backgrounded
                </p>
              </div>

              {permission !== "granted" && isSupported ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRequestDesktopPermission}
                  className="h-8 text-xs shrink-0"
                >
                  Enable Desktop Notifications
                </Button>
              ) : permission === "granted" ? (
                <input
                  id="toggle-desktop"
                  type="checkbox"
                  checked={preferences.desktop_notifications_enabled}
                  onChange={(e) =>
                    updatePreferences({ desktop_notifications_enabled: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-zinc-300 text-heat-500 focus:ring-heat-500 dark:border-zinc-700 dark:bg-zinc-800"
                />
              ) : null}
            </div>
          </div>
        </div>

        {/* Account Section */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 space-y-4">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
            <Shield className="h-4 w-4 text-heat-500" />
            Account Overview
          </h2>
          <div className="space-y-2 text-xs text-zinc-600 dark:text-zinc-400">
            <p>
              <span className="font-semibold text-zinc-900 dark:text-zinc-200">
                Email:
              </span>{" "}
              {user?.email || "Not signed in"}
            </p>
            <p>
              <span className="font-semibold text-zinc-900 dark:text-zinc-200">
                Username:
              </span>{" "}
              @{profile?.username || "pending"}
            </p>
            <p>
              <span className="font-semibold text-zinc-900 dark:text-zinc-200">
                User ID:
              </span>{" "}
              <code className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">
                {user?.id || "none"}
              </code>
            </p>
          </div>
          {user && (
            <div className="pt-2">
              <Button
                variant="destructive"
                size="sm"
                className="gap-2"
                onClick={async () => {
                  await signOut();
                  router.replace("/login");
                }}
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Log Out</span>
              </Button>
            </div>
          )}
        </div>

        {/* Appearance Section */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 space-y-4">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
            <Settings className="h-4 w-4 text-heat-500" />
            Theme & Appearance
          </h2>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setTheme("light")}
              className={`flex items-center gap-2 rounded-xl border p-3 text-xs font-medium transition-all ${
                theme === "light"
                  ? "border-heat-500 bg-heat-50 text-heat-700 dark:bg-heat-950/40 dark:text-heat-400"
                  : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
              }`}
            >
              <Sun className="h-4 w-4" />
              <span>Light Mode</span>
            </button>

            <button
              onClick={() => setTheme("dark")}
              className={`flex items-center gap-2 rounded-xl border p-3 text-xs font-medium transition-all ${
                theme === "dark"
                  ? "border-heat-500 bg-heat-50 text-heat-700 dark:bg-heat-950/40 dark:text-heat-400"
                  : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
              }`}
            >
              <Moon className="h-4 w-4" />
              <span>Dark Mode</span>
            </button>

            <button
              onClick={() => setTheme("system")}
              className={`flex items-center gap-2 rounded-xl border p-3 text-xs font-medium transition-all ${
                theme === "system"
                  ? "border-heat-500 bg-heat-50 text-heat-700 dark:bg-heat-950/40 dark:text-heat-400"
                  : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
              }`}
            >
              <Monitor className="h-4 w-4" />
              <span>System Default</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
