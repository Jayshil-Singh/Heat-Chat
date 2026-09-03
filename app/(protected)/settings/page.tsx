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
  Smartphone,
  Send,
  Trash2,
  Clock,
  Globe,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/components/layout/theme-provider";
import { Button } from "@/components/ui/button";
import { useNotificationContext } from "@/components/notifications/notification-provider";
import { useNotificationPermission } from "@/hooks/use-notification-permission";
import { playTestSound } from "@/lib/audio/sound-cue";

interface RegisteredDevice {
  id: string;
  device_type: string;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
  failure_count: number;
}

export default function SettingsPage() {
  const router = useRouter();
  const { user, profile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { preferences, updatePreferences } = useNotificationContext();
  const {
    permission,
    isSupported,
    isPushSupported,
    isPushSubscribed,
    isPushLoading,
    requestPermission,
    subscribeToPush,
    unsubscribeFromPush,
    sendTestNotification,
  } = useNotificationPermission();

  const [isPlayingTestSound, setIsPlayingTestSound] = React.useState(false);
  const [isSendingTestPush, setIsSendingTestPush] = React.useState(false);
  const [testPushFeedback, setTestPushFeedback] = React.useState<string | null>(null);
  const [registeredDevices, setRegisteredDevices] = React.useState<RegisteredDevice[]>([]);
  const [isLoadingDevices, setIsLoadingDevices] = React.useState(false);

  const fetchRegisteredDevices = React.useCallback(async () => {
    setIsLoadingDevices(true);
    try {
      const res = await fetch("/api/notifications/push/subscriptions");
      if (res.ok) {
        const json = await res.json();
        setRegisteredDevices(json.subscriptions || []);
      }
    } catch {
      // Ignore network errors in fetching device list
    } finally {
      setIsLoadingDevices(false);
    }
  }, []);

  React.useEffect(() => {
    if (user?.id) {
      fetchRegisteredDevices();
    }
  }, [user?.id, fetchRegisteredDevices]);

  const handleTestSound = async () => {
    setIsPlayingTestSound(true);
    await playTestSound();
    setTimeout(() => setIsPlayingTestSound(false), 500);
  };

  const handleToggleWebPush = async () => {
    if (isPushSubscribed) {
      await unsubscribeFromPush();
      await updatePreferences({ push_enabled: false } as any);
      fetchRegisteredDevices();
    } else {
      const res = await subscribeToPush();
      if (res.success) {
        await updatePreferences({ push_enabled: true } as any);
        fetchRegisteredDevices();
      } else {
        alert(res.error || "Failed to subscribe to push notifications");
      }
    }
  };

  const handleSendTestPush = async () => {
    setIsSendingTestPush(true);
    setTestPushFeedback(null);
    const res = await sendTestNotification();
    setIsSendingTestPush(false);
    if (res.success) {
      setTestPushFeedback("Test notification dispatched! Check your device notifications.");
    } else {
      setTestPushFeedback(res.error || "Failed to dispatch test notification");
    }
    setTimeout(() => setTestPushFeedback(null), 5000);
  };

  const handleRevokeDevice = async (subId: string) => {
    try {
      const res = await fetch("/api/notifications/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId: subId }),
      });
      if (res.ok) {
        setRegisteredDevices((prev) => prev.filter((d) => d.id !== subId));
      }
    } catch {
      alert("Failed to revoke device");
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
              Notifications & Alerts
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
                  Receive in-app alerts when friends message you or add you to groups
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

            {/* 2. Web Push PWA Notifications */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-3.5 w-3.5 text-zinc-400" />
                  <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                    Web Push (PWA & Background Alerts)
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                      isPushSubscribed
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900"
                        : "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
                    }`}
                  >
                    {isPushSubscribed ? (
                      <>
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        Subscribed on this device
                      </>
                    ) : (
                      "Not Registered"
                    )}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Receive background push notifications even when Heat Chat is closed
                </p>
              </div>

              <div className="flex items-center gap-2">
                {isPushSubscribed && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSendTestPush}
                    disabled={isSendingTestPush}
                    className="h-8 text-xs gap-1.5"
                  >
                    <Send className="h-3 w-3 text-heat-500" />
                    <span>{isSendingTestPush ? "Sending..." : "Test Push"}</span>
                  </Button>
                )}
                <Button
                  type="button"
                  variant={isPushSubscribed ? "outline" : "default"}
                  size="sm"
                  onClick={handleToggleWebPush}
                  disabled={isPushLoading || !isPushSupported}
                  className="h-8 text-xs shrink-0"
                >
                  {isPushLoading
                    ? "Updating..."
                    : isPushSubscribed
                    ? "Unsubscribe Device"
                    : "Subscribe This Device"}
                </Button>
              </div>
            </div>

            {testPushFeedback && (
              <div className="p-2.5 rounded-lg text-xs bg-heat-50 border border-heat-200 text-heat-800 dark:bg-heat-950/50 dark:border-heat-900 dark:text-heat-300">
                {testPushFeedback}
              </div>
            )}

            {/* 3. Sound Effects Toggle */}
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

            {/* 4. Message Previews Toggle */}
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
          </div>
        </div>

        {/* Registered Devices Section */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
              <Laptop className="h-4 w-4 text-heat-500" />
              Registered Push Devices
            </h2>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {registeredDevices.length} {registeredDevices.length === 1 ? "device" : "devices"}
            </span>
          </div>

          {isLoadingDevices ? (
            <div className="py-4 text-center text-xs text-zinc-500">Loading registered devices...</div>
          ) : registeredDevices.length === 0 ? (
            <p className="text-xs text-zinc-500 py-2">
              No devices currently registered for Web Push notifications.
            </p>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {registeredDevices.map((device) => (
                <div key={device.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-xs font-semibold text-zinc-900 dark:text-white capitalize">
                      {device.device_type} Device
                    </p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate max-w-md">
                      {device.user_agent || "Browser Client"}
                    </p>
                    <p className="text-[10px] text-zinc-400">
                      Last active: {new Date(device.last_seen_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevokeDevice(device.id)}
                    className="h-7 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 gap-1"
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>Revoke</span>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Account Section */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 space-y-4">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
            <Shield className="h-4 w-4 text-heat-500" />
            Account Overview
          </h2>
          <div className="space-y-2 text-xs text-zinc-600 dark:text-zinc-400">
            <p>
              <span className="font-semibold text-zinc-900 dark:text-zinc-200">Email:</span>{" "}
              {user?.email || "Not signed in"}
            </p>
            <p>
              <span className="font-semibold text-zinc-900 dark:text-zinc-200">Username:</span>{" "}
              @{profile?.username || "pending"}
            </p>
            <p>
              <span className="font-semibold text-zinc-900 dark:text-zinc-200">User ID:</span>{" "}
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
              <Sun className="h-4 w-4 text-amber-500" />
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
              <Moon className="h-4 w-4 text-indigo-400" />
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
              <Monitor className="h-4 w-4 text-zinc-400" />
              <span>System Default</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
