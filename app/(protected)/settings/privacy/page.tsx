"use client";

import * as React from "react";
import {
  Lock,
  Eye,
  EyeOff,
  MessageCircle,
  UserPlus,
  Phone,
  Users,
  Clock,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  ChevronLeft,
  ChevronRight,
  Shield,
  Flag,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { UserPrivacySettings, PrivacyAudience } from "@/types/database";

const AUDIENCE_OPTIONS: { value: PrivacyAudience; label: string; description: string }[] = [
  { value: "everyone", label: "Everyone", description: "Any Heat Chat user" },
  { value: "friends", label: "Friends Only", description: "People you are friends with" },
  { value: "friends_of_friends", label: "Friends of Friends", description: "Extended network" },
  { value: "nobody", label: "Nobody", description: "Completely private" },
];

interface AudienceSelectProps {
  field: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  value: PrivacyAudience;
  onChange: (field: string, value: PrivacyAudience) => void;
  disabled?: boolean;
}

function AudienceSelect({
  field,
  label,
  description,
  icon,
  value,
  onChange,
  disabled,
}: AudienceSelectProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800 p-1.5">{icon}</div>
        <div>
          <p className="text-xs font-semibold text-zinc-900 dark:text-white">{label}</p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{description}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pl-8">
        {AUDIENCE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(field, opt.value)}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold border transition-all duration-150 ${
              value === opt.value
                ? "bg-heat-500 text-white border-heat-500 shadow-sm"
                : "bg-zinc-50 text-zinc-600 border-zinc-200 hover:border-heat-300 hover:text-heat-600 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-700 dark:hover:border-heat-700"
            } disabled:opacity-60 disabled:cursor-not-allowed`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  description: string;
  icon: React.ReactNode;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

function ToggleRow({ label, description, icon, value, onChange, disabled }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 min-w-0">
        <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800 p-1.5 shrink-0">{icon}</div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-zinc-900 dark:text-white">{label}</p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{description}</p>
        </div>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!value)}
        className="shrink-0 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
        aria-label={`${value ? "Disable" : "Enable"} ${label}`}
      >
        {value ? (
          <ToggleRight className="h-7 w-7 text-heat-500" />
        ) : (
          <ToggleLeft className="h-7 w-7 text-zinc-400 dark:text-zinc-600" />
        )}
      </button>
    </div>
  );
}

export default function PrivacySettingsPage() {
  const [settings, setSettings] = React.useState<UserPrivacySettings | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pendingUpdates, setPendingUpdates] = React.useState<Partial<UserPrivacySettings>>({});
  const saveTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Load privacy settings
  React.useEffect(() => {
    setIsLoading(true);
    fetch("/api/settings/privacy")
      .then((r) => r.json())
      .then((data) => {
        if (data?.settings) setSettings(data.settings);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  // Auto-save with debounce
  const handleChange = (field: string, value: PrivacyAudience | boolean) => {
    setSaved(false);
    setSettings((prev) => (prev ? { ...prev, [field]: value } : null));
    setPendingUpdates((prev) => ({ ...prev, [field]: value }));

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveUpdates({ [field]: value });
    }, 800);
  };

  const saveUpdates = async (updates: Record<string, any>) => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/privacy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "Save failed");
      setSaved(true);
      setPendingUpdates({});
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to save privacy settings.");
    } finally {
      setIsSaving(false);
    }
  };

  React.useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <Link
          href="/profile"
          className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Privacy Settings
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Control who can see your profile, message you, and track your presence
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSaving && (
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-heat-500" />
              <span>Saving…</span>
            </div>
          )}
          {saved && !isSaving && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Saved</span>
            </div>
          )}
        </div>
      </div>

      {/* Quick Access Links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link
          href="/settings/blocked"
          className="flex items-center justify-between rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 px-4 py-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-red-50 dark:bg-red-950/30 p-2">
              <Shield className="h-4 w-4 text-red-500" />
            </div>
            <div>
              <p className="text-xs font-semibold text-zinc-900 dark:text-white">Blocked Users</p>
              <p className="text-[11px] text-zinc-400">Manage who you have blocked</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-zinc-300 group-hover:text-zinc-500 transition-colors" />
        </Link>

        <Link
          href="/settings/reports"
          className="flex items-center justify-between rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 px-4 py-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 p-2">
              <Flag className="h-4 w-4 text-amber-500" />
            </div>
            <div>
              <p className="text-xs font-semibold text-zinc-900 dark:text-white">My Reports</p>
              <p className="text-[11px] text-zinc-400">View your submitted reports</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-zinc-300 group-hover:text-zinc-500 transition-colors" />
        </Link>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-32 rounded-3xl bg-zinc-100 dark:bg-zinc-900/50 animate-pulse"
            />
          ))}
        </div>
      ) : settings ? (
        <div className="space-y-6">
          {/* Profile Visibility */}
          <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 space-y-5">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-violet-500" />
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Profile Visibility</h2>
            </div>
            <div className="space-y-5 divide-y divide-zinc-100 dark:divide-zinc-800">
              <AudienceSelect
                field="who_can_see_profile"
                label="Who can see my profile"
                description="Bio, full name, and profile details"
                icon={<Eye className="h-3.5 w-3.5 text-zinc-500" />}
                value={settings.who_can_see_profile as PrivacyAudience}
                onChange={handleChange}
                disabled={isSaving}
              />
              <div className="pt-4">
                <AudienceSelect
                  field="who_can_see_avatar"
                  label="Who can see my avatar & cover"
                  description="Profile picture and cover photo"
                  icon={<Eye className="h-3.5 w-3.5 text-zinc-500" />}
                  value={settings.who_can_see_avatar as PrivacyAudience}
                  onChange={handleChange}
                  disabled={isSaving}
                />
              </div>
            </div>
          </div>

          {/* Presence & Status */}
          <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 space-y-5">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Presence & Status</h2>
            </div>
            <div className="space-y-5 divide-y divide-zinc-100 dark:divide-zinc-800">
              <AudienceSelect
                field="who_can_see_status"
                label="Who can see my status message"
                description="Status emoji and custom status text"
                icon={<EyeOff className="h-3.5 w-3.5 text-zinc-500" />}
                value={settings.who_can_see_status as PrivacyAudience}
                onChange={handleChange}
                disabled={isSaving}
              />
              <div className="pt-4">
                <AudienceSelect
                  field="who_can_see_online"
                  label="Who can see when I'm online"
                  description="Online, Away, or Busy indicator"
                  icon={<Clock className="h-3.5 w-3.5 text-zinc-500" />}
                  value={settings.who_can_see_online as PrivacyAudience}
                  onChange={handleChange}
                  disabled={isSaving}
                />
              </div>
              <div className="pt-4">
                <AudienceSelect
                  field="who_can_see_last_seen"
                  label="Who can see my last seen time"
                  description="When you were last active"
                  icon={<Clock className="h-3.5 w-3.5 text-zinc-500" />}
                  value={settings.who_can_see_last_seen as PrivacyAudience}
                  onChange={handleChange}
                  disabled={isSaving}
                />
              </div>
            </div>
          </div>

          {/* Interactions */}
          <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 space-y-5">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-heat-500" />
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Interactions</h2>
            </div>
            <div className="space-y-5 divide-y divide-zinc-100 dark:divide-zinc-800">
              <AudienceSelect
                field="who_can_message"
                label="Who can send me direct messages"
                description="New conversation requests"
                icon={<MessageCircle className="h-3.5 w-3.5 text-zinc-500" />}
                value={settings.who_can_message as PrivacyAudience}
                onChange={handleChange}
                disabled={isSaving}
              />
              <div className="pt-4">
                <AudienceSelect
                  field="who_can_friend_request"
                  label="Who can send me friend requests"
                  description="New friendship invitations"
                  icon={<UserPlus className="h-3.5 w-3.5 text-zinc-500" />}
                  value={settings.who_can_friend_request as PrivacyAudience}
                  onChange={handleChange}
                  disabled={isSaving}
                />
              </div>
              <div className="pt-4">
                <AudienceSelect
                  field="who_can_add_to_groups"
                  label="Who can add me to groups"
                  description="Group conversation invites"
                  icon={<Users className="h-3.5 w-3.5 text-zinc-500" />}
                  value={settings.who_can_add_to_groups as PrivacyAudience}
                  onChange={handleChange}
                  disabled={isSaving}
                />
              </div>
              <div className="pt-4">
                <AudienceSelect
                  field="who_can_call"
                  label="Who can call me"
                  description="Audio and video call requests"
                  icon={<Phone className="h-3.5 w-3.5 text-zinc-500" />}
                  value={settings.who_can_call as PrivacyAudience}
                  onChange={handleChange}
                  disabled={isSaving}
                />
              </div>
            </div>
          </div>

          {/* Message behaviour */}
          <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 space-y-5">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-blue-500" />
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Message Behaviour</h2>
            </div>
            <div className="space-y-4 divide-y divide-zinc-100 dark:divide-zinc-800">
              <ToggleRow
                label="Read Receipts"
                description="Show when you have read messages"
                icon={<CheckCircle2 className="h-3.5 w-3.5 text-zinc-500" />}
                value={settings.read_receipts_enabled}
                onChange={(val) => handleChange("read_receipts_enabled", val)}
                disabled={isSaving}
              />
              <div className="pt-4">
                <ToggleRow
                  label="Typing Indicators"
                  description="Show when you are typing a message"
                  icon={<MessageCircle className="h-3.5 w-3.5 text-zinc-500" />}
                  value={settings.typing_indicators_enabled}
                  onChange={(val) => handleChange("typing_indicators_enabled", val)}
                  disabled={isSaving}
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-zinc-200 bg-white p-12 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
          <AlertCircle className="h-10 w-10 mx-auto text-zinc-300 dark:text-zinc-700 mb-3" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Could not load privacy settings. Please try refreshing.
          </p>
        </div>
      )}
    </div>
  );
}
