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
  Download,
  Compass,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/components/layout/theme-provider";
import { Button } from "@/components/ui/button";
import { useNotificationContext } from "@/components/notifications/notification-provider";
import { parseMessageDate } from "@/lib/utils/date";
import { useNotificationPermission } from "@/hooks/use-notification-permission";
import { useDiscoverPeople } from "@/hooks/use-discover-people";
import { playTestSound } from "@/lib/audio/sound-cue";
import { InstallAppButton } from "@/components/pwa/install-app-button";

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
    subscriptionStatus,
    isPushLoading,
    requestPermission,
    subscribeToPush,
    unsubscribeFromPush,
    sendTestNotification,
  } = useNotificationPermission();

  const {
    isDiscoverable,
    isPreferenceLoading: isDiscoverLoading,
    isToggling: isDiscoverToggling,
    toggleDiscoverability,
  } = useDiscoverPeople({ autoFetch: false });

  const [isPlayingTestSound, setIsPlayingTestSound] = React.useState(false);
  const [isSendingTestPush, setIsSendingTestPush] = React.useState(false);
  const [testPushFeedback, setTestPushFeedback] = React.useState<string | null>(null);
  const [pushFeedback, setPushFeedback] = React.useState<{ type: "success" | "error"; message: string } | null>(null);
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
    setPushFeedback(null);
    try {
      if (isPushSubscribed) {
        const res = await unsubscribeFromPush();
        if (res.success) {
          await updatePreferences({ push_enabled: false } as any);
          fetchRegisteredDevices();
          setPushFeedback({ type: "success", message: "Push notifications disabled on this device." });
        } else {
          setPushFeedback({ type: "error", message: res.error || "Failed to disable push notifications." });
        }
      } else {
        const res = await subscribeToPush();
        if (res.success) {
          await updatePreferences({ push_enabled: true } as any);
          fetchRegisteredDevices();
          setPushFeedback({ type: "success", message: "Background push notifications enabled successfully!" });
        } else {
          const userFriendlyMsg =
            res.code === "PUSH_PERMISSION_DENIED"
              ? "Notifications are blocked by your browser. Enable notifications in browser settings."
              : res.code === "PUSH_UNSUPPORTED"
              ? "Push notifications aren't supported on this browser."
              : "Couldn't enable notifications. Try again.";
          setPushFeedback({ type: "error", message: userFriendlyMsg });
        }
      }
    } catch {
      setPushFeedback({ type: "error", message: "An unexpected error occurred while updating push notifications." });
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
        setPushFeedback({ type: "success", message: "Device subscription removed." });
      } else {
        setPushFeedback({ type: "error", message: "Failed to remove device subscription." });
      }
    } catch {
      setPushFeedback({ type: "error", message: "Network error while removing device." });
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 w-full min-w-0 max-w-full">
              <div className="space-y-1 min-w-0 max-w-full flex-1">
                <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
                  <Smartphone className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                  <span className="text-xs font-semibold text-zinc-900 dark:text-white break-words min-w-0">
                    Web Push (PWA & Background Alerts)
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border shrink-0 text-center ${
                      subscriptionStatus === "checking"
                        ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900"
                        : subscriptionStatus === "subscribed" || isPushSubscribed
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900"
                        : subscriptionStatus === "recovering"
                        ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900"
                        : subscriptionStatus === "expired" || subscriptionStatus === "subscription_expired"
                        ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900"
                        : subscriptionStatus === "error"
                        ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900"
                        : subscriptionStatus === "invalid" || subscriptionStatus === "subscription_invalid"
                        ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900"
                        : subscriptionStatus === "permission-denied" || permission === "denied"
                        ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900"
                        : !isPushSupported || subscriptionStatus === "unsupported"
                        ? "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
                        : "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
                    }`}
                  >
                    {subscriptionStatus === "checking" ? (
                      "Checking…"
                    ) : subscriptionStatus === "subscribed" || isPushSubscribed ? (
                      <>
                        <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
                        <span>Subscribed on this device</span>
                      </>
                    ) : subscriptionStatus === "recovering" ? (
                      "Recovering…"
                    ) : subscriptionStatus === "expired" || subscriptionStatus === "subscription_expired" ? (
                      "Subscription expired"
                    ) : subscriptionStatus === "error" ? (
                      "Registration failed"
                    ) : subscriptionStatus === "invalid" || subscriptionStatus === "subscription_invalid" ? (
                      "Subscription invalid"
                    ) : subscriptionStatus === "permission-denied" || permission === "denied" ? (
                      "Permission denied"
                    ) : !isPushSupported || subscriptionStatus === "unsupported" ? (
                      "Unsupported"
                    ) : (
                      "Not Registered"
                    )}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 break-words min-w-0">
                  {!isPushSupported || subscriptionStatus === "unsupported"
                    ? "Push notifications aren't supported on this browser."
                    : subscriptionStatus === "permission-denied" || permission === "denied"
                    ? "Notifications are blocked by your browser. Enable notifications in browser settings."
                    : subscriptionStatus === "error" || subscriptionStatus === "invalid"
                    ? "Couldn't enable notifications. Try again."
                    : "Receive background push notifications even when Heat Chat is closed"}
                </p>
              </div>

              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0 w-full sm:w-auto pt-1 sm:pt-0">
                {isPushSubscribed && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSendTestPush}
                    disabled={isSendingTestPush}
                    className="h-8 text-xs gap-1.5 flex-1 sm:flex-none min-w-[90px]"
                    aria-label="Send test push notification"
                  >
                    <Send className="h-3 w-3 text-heat-500 shrink-0" />
                    <span>{isSendingTestPush ? "Sending..." : "Test Push"}</span>
                  </Button>
                )}
                <Button
                  type="button"
                  variant={isPushSubscribed ? "outline" : "default"}
                  size="sm"
                  onClick={handleToggleWebPush}
                  disabled={isPushLoading || !isPushSupported}
                  className="h-8 text-xs flex-1 sm:flex-none shrink-0"
                  aria-label={isPushSubscribed ? "Unsubscribe this device" : "Subscribe this device"}
                >
                  {isPushLoading
                    ? "Updating..."
                    : isPushSubscribed
                    ? "Unsubscribe Device"
                    : subscriptionStatus === "error" || subscriptionStatus === "invalid"
                    ? "Try Again"
                    : "Subscribe This Device"}
                </Button>
              </div>
            </div>

            {pushFeedback && (
              <div
                className={`p-2.5 rounded-lg text-xs border ${
                  pushFeedback.type === "success"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-300"
                    : "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-300"
                }`}
              >
                {pushFeedback.message}
              </div>
            )}

            {testPushFeedback && (
              <div className="p-2.5 rounded-lg text-xs bg-heat-50 border border-heat-200 text-heat-800 dark:bg-heat-950/50 dark:border-heat-900 dark:text-heat-300">
                {testPushFeedback}
              </div>
            )}

            {/* Granular Notification Channels */}
            <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800/80 space-y-3">
              <h3 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                Notification Categories
              </h3>

              {/* Messages */}
              <div className="flex items-center justify-between py-1">
                <div>
                  <label htmlFor="toggle-notif-messages" className="text-xs font-semibold text-zinc-900 dark:text-white cursor-pointer">
                    Messages
                  </label>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Direct 1-on-1 chats</p>
                </div>
                <input
                  id="toggle-notif-messages"
                  type="checkbox"
                  checked={preferences.messages_notify ?? true}
                  onChange={(e) => updatePreferences({ messages_notify: e.target.checked } as any)}
                  className="h-4 w-4 rounded border-zinc-300 text-heat-500 focus:ring-heat-500 dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>

              {/* Mentions */}
              <div className="flex items-center justify-between py-1">
                <div>
                  <label htmlFor="toggle-notif-mentions" className="text-xs font-semibold text-zinc-900 dark:text-white cursor-pointer">
                    Mentions
                  </label>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">When someone mentions @you</p>
                </div>
                <input
                  id="toggle-notif-mentions"
                  type="checkbox"
                  checked={preferences.mentions_notify ?? true}
                  onChange={(e) => updatePreferences({ mentions_notify: e.target.checked } as any)}
                  className="h-4 w-4 rounded border-zinc-300 text-heat-500 focus:ring-heat-500 dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>

              {/* Replies */}
              <div className="flex items-center justify-between py-1">
                <div>
                  <label htmlFor="toggle-notif-replies" className="text-xs font-semibold text-zinc-900 dark:text-white cursor-pointer">
                    Replies
                  </label>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Direct replies to your messages</p>
                </div>
                <input
                  id="toggle-notif-replies"
                  type="checkbox"
                  checked={preferences.replies_notify ?? true}
                  onChange={(e) => updatePreferences({ replies_notify: e.target.checked } as any)}
                  className="h-4 w-4 rounded border-zinc-300 text-heat-500 focus:ring-heat-500 dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>

              {/* Group Activity */}
              <div className="flex items-center justify-between py-1">
                <div>
                  <label htmlFor="toggle-notif-groups" className="text-xs font-semibold text-zinc-900 dark:text-white cursor-pointer">
                    Group Activity
                  </label>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">New messages and members in your groups</p>
                </div>
                <input
                  id="toggle-notif-groups"
                  type="checkbox"
                  checked={preferences.group_activity_notify ?? true}
                  onChange={(e) => updatePreferences({ group_activity_notify: e.target.checked } as any)}
                  className="h-4 w-4 rounded border-zinc-300 text-heat-500 focus:ring-heat-500 dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>

              {/* Friends */}
              <div className="flex items-center justify-between py-1">
                <div>
                  <label htmlFor="toggle-notif-friends" className="text-xs font-semibold text-zinc-900 dark:text-white cursor-pointer">
                    Friends
                  </label>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Incoming friend requests and accepted connections</p>
                </div>
                <input
                  id="toggle-notif-friends"
                  type="checkbox"
                  checked={preferences.friend_activity_notify ?? true}
                  onChange={(e) => updatePreferences({ friend_activity_notify: e.target.checked } as any)}
                  className="h-4 w-4 rounded border-zinc-300 text-heat-500 focus:ring-heat-500 dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>

              {/* Reactions */}
              <div className="flex items-center justify-between py-1">
                <div>
                  <label htmlFor="toggle-notif-reactions" className="text-xs font-semibold text-zinc-900 dark:text-white cursor-pointer">
                    Reactions
                  </label>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Emoji reactions on your messages</p>
                </div>
                <input
                  id="toggle-notif-reactions"
                  type="checkbox"
                  checked={preferences.reactions_notify ?? true}
                  onChange={(e) => updatePreferences({ reactions_notify: e.target.checked } as any)}
                  className="h-4 w-4 rounded border-zinc-300 text-heat-500 focus:ring-heat-500 dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>

              {/* Security Alerts - ALWAYS ON / PROTECTED */}
              <div className="flex items-center justify-between py-2 bg-amber-50/50 dark:bg-amber-950/20 p-2.5 rounded-xl border border-amber-200/60 dark:border-amber-900/40">
                <div className="space-y-0.5 min-w-0 flex-1 pr-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <label className="text-xs font-semibold text-zinc-900 dark:text-white">
                      Security Alerts
                    </label>
                    <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/80 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                      Always on / Protected
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Login attempts, password resets, and critical account security warnings
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={true}
                  disabled={true}
                  aria-label="Security Alerts (Always on / Protected)"
                  className="h-4 w-4 rounded border-zinc-300 text-heat-500 opacity-80 cursor-not-allowed dark:border-zinc-700 dark:bg-zinc-800 shrink-0"
                />
              </div>
            </div>

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

        {/* Discover People Privacy Section */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 space-y-4 min-w-0 max-w-full">
          <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 min-w-0 max-w-full">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2 min-w-0">
              <Compass className="h-4 w-4 text-heat-500 shrink-0" />
              <span>Discover People</span>
            </h2>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0 ${
                isDiscoverable
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-400"
                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              Discoverability: {isDiscoverable ? "On" : "Off"}
            </span>
          </div>

          <div className="flex items-center justify-between pt-2 gap-3 min-w-0 max-w-full">
            <div className="space-y-0.5 max-w-md min-w-0">
              <label
                htmlFor="toggle-discoverability"
                className="text-xs font-semibold text-zinc-900 dark:text-white cursor-pointer"
              >
                Allow people to discover me
              </label>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed break-words min-w-0">
                When enabled, your public profile can appear in Discover People so other users can find you and connect.
              </p>
            </div>
            <input
              id="toggle-discoverability"
              type="checkbox"
              checked={isDiscoverable}
              disabled={isDiscoverLoading || isDiscoverToggling}
              onChange={toggleDiscoverability}
              className="h-4 w-4 rounded border-zinc-300 text-heat-500 focus:ring-heat-500 dark:border-zinc-700 dark:bg-zinc-800 shrink-0"
            />
          </div>

          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-zinc-500 dark:text-zinc-400 break-words min-w-0">
              Browse discoverable users or review incoming requests.
            </span>
            <Link
              href="/discover"
              className="text-xs font-semibold text-heat-500 hover:text-heat-600 dark:text-heat-400 flex items-center gap-1 shrink-0"
            >
              <span>Manage Discover People</span>
              <span>&rarr;</span>
            </Link>
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
                <div key={device.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 min-w-0 max-w-full">
                  <div className="space-y-0.5 min-w-0 max-w-full flex-1">
                    <p className="text-xs font-semibold text-zinc-900 dark:text-white capitalize">
                      {device.device_type} Device
                    </p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 break-all sm:truncate max-w-md min-w-0">
                      {device.user_agent || "Browser Client"}
                    </p>
                    <p className="text-[10px] text-zinc-400">
                      Last active: {parseMessageDate(device.last_seen_at)?.toLocaleDateString() || "Recently"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevokeDevice(device.id)}
                    className="h-7 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 gap-1 self-start sm:self-center shrink-0"
                    aria-label="Revoke device"
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>Revoke</span>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* App Installation & PWA Section */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
              <Download className="h-4 w-4 text-heat-500" />
              App Installation & PWA
            </h2>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Installable Web App
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Install Heat Chat on your device for standalone window mode, faster access, and seamless background notifications.
          </p>
          <div className="pt-1">
            <InstallAppButton variant="card" />
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
            <button type="button"
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
            <button type="button"
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
            <button type="button"
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
