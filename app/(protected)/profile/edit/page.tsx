"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  User,
  AtSign,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Globe,
  Languages,
  MessageSquare,
  ArrowLeft,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AvatarUpload } from "@/components/profile/avatar-upload";
import { CoverUpload } from "@/components/profile/cover-upload";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { TimezoneSelect } from "@/components/ui/timezone-select";
import { sanitizeUsername } from "@/lib/validation/auth";
import {
  validateUsername,
  validateDisplayName,
  validateBio,
  validateStatusMessage,
  validateStatusEmoji,
} from "@/lib/validation/profile";
import type { PresenceStatus } from "@/types/database";

const PRESENCE_OPTIONS: { value: PresenceStatus; label: string; color: string }[] = [
  { value: "ONLINE", label: "Online", color: "bg-emerald-500" },
  { value: "AWAY", label: "Away", color: "bg-amber-500" },
  { value: "BUSY", label: "Do Not Disturb", color: "bg-rose-500" },
  { value: "OFFLINE", label: "Invisible / Offline", color: "bg-zinc-400" },
];

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English (en)" },
  { value: "es", label: "Español (es)" },
  { value: "fr", label: "Français (fr)" },
  { value: "de", label: "Deutsch (de)" },
  { value: "ja", label: "日本語 (ja)" },
];

export default function EditProfilePage() {
  const { user, profile, refreshProfile, isLoading } = useAuth();
  const router = useRouter();

  // Form Fields
  const [displayName, setDisplayName] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [bio, setBio] = React.useState("");
  const [statusEmoji, setStatusEmoji] = React.useState<string | null>(null);
  const [statusMessage, setStatusMessage] = React.useState("");
  const [presenceStatus, setPresenceStatus] = React.useState<PresenceStatus>("ONLINE");
  const [timezone, setTimezone] = React.useState("UTC");
  const [language, setLanguage] = React.useState("en");
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);
  const [coverUrl, setCoverUrl] = React.useState<string | null>(null);

  const initialStateRef = React.useRef({
    displayName: "",
    username: "",
    bio: "",
    statusEmoji: null as string | null,
    statusMessage: "",
    presenceStatus: "ONLINE" as PresenceStatus,
    timezone: "UTC",
    language: "en",
    avatarUrl: null as string | null,
    coverUrl: null as string | null,
  });

  const [usernameStatus, setUsernameStatus] = React.useState<"idle" | "checking" | "available" | "taken">("idle");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = React.useState(false);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = React.useState(false);
  const [isLoaded, setIsLoaded] = React.useState(false);

  // Sync state from profile
  React.useEffect(() => {
    if (profile && !isLoaded) {
      const initial = {
        displayName: profile.display_name || "",
        username: profile.username || "",
        bio: profile.bio || "",
        statusEmoji: profile.status_emoji || null,
        statusMessage: profile.status_message || "",
        presenceStatus: (profile.presence_status as PresenceStatus) || "ONLINE",
        timezone: profile.timezone || "UTC",
        language: profile.language || "en",
        avatarUrl: profile.avatar_url || null,
        coverUrl: profile.cover_url || null,
      };

      initialStateRef.current = initial;

      setDisplayName(initial.displayName);
      setUsername(initial.username);
      setBio(initial.bio);
      setStatusEmoji(initial.statusEmoji);
      setStatusMessage(initial.statusMessage);
      setPresenceStatus(initial.presenceStatus);
      setTimezone(initial.timezone);
      setLanguage(initial.language);
      setAvatarUrl(initial.avatarUrl);
      setCoverUrl(initial.coverUrl);
      setIsLoaded(true);
    }
  }, [profile, isLoaded]);

  // Compute dirty state
  const isDirty = React.useMemo(() => {
    const init = initialStateRef.current;
    return (
      displayName.trim() !== init.displayName.trim() ||
      username.toLowerCase().trim() !== init.username.toLowerCase().trim() ||
      bio.trim() !== init.bio.trim() ||
      statusEmoji !== init.statusEmoji ||
      statusMessage.trim() !== init.statusMessage.trim() ||
      presenceStatus !== init.presenceStatus ||
      timezone !== init.timezone ||
      language !== init.language ||
      avatarUrl !== init.avatarUrl ||
      coverUrl !== init.coverUrl
    );
  }, [
    displayName,
    username,
    bio,
    statusEmoji,
    statusMessage,
    presenceStatus,
    timezone,
    language,
    avatarUrl,
    coverUrl,
  ]);

  const handleBack = () => {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      router.push("/profile");
    }
  };

  // Debounced username availability check
  React.useEffect(() => {
    const cleanUsername = username.toLowerCase().trim();
    if (!cleanUsername || cleanUsername === profile?.username?.toLowerCase()) {
      setUsernameStatus("idle");
      return;
    }

    const validationErr = validateUsername(cleanUsername);
    if (validationErr) {
      setUsernameStatus("idle");
      return;
    }

    setUsernameStatus("checking");
    const timeoutId = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/${cleanUsername}`);
        if (res.status === 404) {
          setUsernameStatus("available");
        } else if (res.ok) {
          const data = await res.json();
          if (data.profile && data.profile.id !== user?.id) {
            setUsernameStatus("taken");
          } else {
            setUsernameStatus("available");
          }
        } else {
          setUsernameStatus("idle");
        }
      } catch {
        setUsernameStatus("idle");
      }
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [username, profile?.username, user?.id]);

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const clean = sanitizeUsername(e.target.value);
    setUsername(clean);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setSuccessMessage(null);

    const nameValidation = validateDisplayName(displayName);
    const userValidation = validateUsername(username);
    const bioValidation = validateBio(bio);
    const msgValidation = validateStatusMessage(statusMessage);
    const emojiValidation = validateStatusEmoji(statusEmoji);

    const validationErrors: Record<string, string> = {};
    if (!nameValidation.isValid && nameValidation.error) validationErrors.displayName = nameValidation.error;
    if (!userValidation.isValid && userValidation.error) validationErrors.username = userValidation.error;
    if (!bioValidation.isValid && bioValidation.error) validationErrors.bio = bioValidation.error;
    if (!msgValidation.isValid && msgValidation.error) validationErrors.statusMessage = msgValidation.error;
    if (!emojiValidation.isValid && emojiValidation.error) validationErrors.statusEmoji = emojiValidation.error;

    if (usernameStatus === "taken") {
      validationErrors.username = "That username is already taken.";
    }

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSaving(true);

    try {
      const payload = {
        display_name: displayName.trim(),
        username: username.toLowerCase().trim(),
        bio: bio.trim() || null,
        status_message: statusMessage.trim() || null,
        status_emoji: statusEmoji || null,
        presence_status: presenceStatus,
        timezone: timezone || "UTC",
        language: language || "en",
        avatar_url: avatarUrl,
        cover_url: coverUrl,
      };

      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === "USERNAME_TAKEN") {
          setErrors({ username: "That username is already taken." });
        } else {
          setErrors({ general: data.message || data.error || "Failed to update profile." });
        }
        return;
      }

      setSuccessMessage("Profile updated successfully.");
      await refreshProfile();

      setTimeout(() => {
        router.push("/profile");
      }, 1000);
    } catch {
      setErrors({ general: "A network error occurred. Please try again." });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <Skeleton className="h-8 w-48 rounded-lg" />
        <Skeleton className="h-44 w-full rounded-3xl" />
        <div className="space-y-4">
          <Skeleton className="h-12 w-full rounded-2xl" />
          <Skeleton className="h-12 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
              Edit Profile
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Update your public identity, presence, avatar, and account preferences
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleBack}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="edit-profile-page-form"
            variant="heat"
            size="sm"
            className="gap-1.5 shadow-sm font-semibold"
            disabled={isSaving || usernameStatus === "checking" || usernameStatus === "taken"}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <span>Save Changes</span>
            )}
          </Button>
        </div>
      </div>

      {/* Main Card */}
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50">
        <form id="edit-profile-page-form" onSubmit={handleSubmit} className="space-y-6" noValidate>
          {/* Alerts */}
          {successMessage && (
            <div
              className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50"
              role="status"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              <span>{successMessage}</span>
            </div>
          )}

          {errors.general && (
            <div
              className="flex items-center gap-2 rounded-xl bg-red-50 p-3.5 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-900/50"
              role="alert"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
              <span>{errors.general}</span>
            </div>
          )}

          {/* 1. Profile Picture */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Profile Picture
            </label>
            <AvatarUpload
              userId={user.id}
              currentAvatarUrl={avatarUrl}
              name={displayName || username || "User"}
              onAvatarUpdated={(newUrl) => {
                setAvatarUrl(newUrl);
                setSuccessMessage("Profile picture updated.");
              }}
              disabled={isSaving}
            />
          </div>

          {/* 2. Cover Picture */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Cover Picture
            </label>
            <CoverUpload
              currentCoverUrl={coverUrl}
              onCoverUpdated={(newUrl) => {
                setCoverUrl(newUrl);
                setSuccessMessage("Cover photo updated.");
              }}
              disabled={isSaving}
            />
          </div>

          {/* 3. Display Name */}
          <div className="space-y-1.5">
            <label
              htmlFor="page-edit-display-name"
              className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300"
            >
              Display Name
            </label>
            <Input
              id="page-edit-display-name"
              name="displayName"
              placeholder="e.g. Alex Rivera"
              value={displayName}
              maxLength={50}
              onChange={(e) => setDisplayName(e.target.value)}
              leftIcon={<User className="h-4 w-4" />}
              error={errors.displayName}
              disabled={isSaving}
              required
            />
          </div>

          {/* 4. Username */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="page-edit-username"
                className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300"
              >
                Username
              </label>
              {usernameStatus === "checking" && (
                <span className="flex items-center gap-1 text-[11px] text-zinc-400">
                  <Loader2 className="h-3 w-3 animate-spin" /> Checking...
                </span>
              )}
              {usernameStatus === "available" && (
                <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  ✓ Available
                </span>
              )}
              {usernameStatus === "taken" && (
                <span className="text-[11px] font-medium text-red-500">
                  ✗ Already taken
                </span>
              )}
            </div>
            <Input
              id="page-edit-username"
              name="username"
              placeholder="e.g. alex_rivera"
              value={username}
              maxLength={30}
              onChange={handleUsernameChange}
              leftIcon={<AtSign className="h-4 w-4" />}
              error={errors.username}
              disabled={isSaving}
              required
            />
          </div>

          {/* 5. Status Section (Emoji + Message + Presence) */}
          <div className="space-y-4 rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-5 dark:border-zinc-800 dark:bg-zinc-900/30">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-heat-500" />
              <h3 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                Status & Presence
              </h3>
            </div>

            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                    Status Emoji
                  </label>
                  <EmojiPicker
                    value={statusEmoji}
                    onChange={(emoji) => setStatusEmoji(emoji)}
                    disabled={isSaving}
                  />
                  {errors.statusEmoji && (
                    <p className="mt-1 text-[11px] text-red-500">{errors.statusEmoji}</p>
                  )}
                </div>

                <div className="flex-1 w-full min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor="page-edit-status-message"
                      className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400"
                    >
                      Status Message
                    </label>
                    <span className="text-[10px] text-zinc-400">
                      {statusMessage.length}/160
                    </span>
                  </div>
                  <Input
                    id="page-edit-status-message"
                    name="statusMessage"
                    placeholder="e.g. Available for chats today..."
                    value={statusMessage}
                    maxLength={160}
                    onChange={(e) => setStatusMessage(e.target.value)}
                    error={errors.statusMessage}
                    disabled={isSaving}
                  />
                </div>
              </div>
            </div>

            {/* Presence Selector */}
            <div className="space-y-1.5 pt-1">
              <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                Presence Status
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PRESENCE_OPTIONS.map((opt) => (
                  <button
                    type="button"
                    key={opt.value}
                    onClick={() => setPresenceStatus(opt.value)}
                    className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-xs font-medium transition-all text-left ${
                      presenceStatus === opt.value
                        ? "border-heat-500 bg-heat-50 text-zinc-900 dark:bg-heat-950/40 dark:text-white ring-1 ring-heat-500/20"
                        : "border-zinc-200 hover:bg-white dark:border-zinc-800 dark:hover:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400"
                    }`}
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${opt.color} shrink-0`} />
                    <span className="truncate">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 6. Bio */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="page-edit-bio"
                className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300"
              >
                Bio
              </label>
              <span className="text-[11px] text-zinc-400">
                {bio.length}/250
              </span>
            </div>
            <div className="relative">
              <textarea
                id="page-edit-bio"
                rows={3}
                placeholder="Tell your friends something about yourself..."
                value={bio}
                maxLength={250}
                onChange={(e) => setBio(e.target.value)}
                disabled={isSaving}
                className="flex w-full rounded-xl border border-zinc-200 bg-white p-3 text-xs text-zinc-900 placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 focus-visible:border-transparent disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-100 dark:placeholder:text-zinc-500 transition-colors"
              />
            </div>
            {errors.bio && (
              <p className="mt-1 text-xs text-red-500 font-medium">{errors.bio}</p>
            )}
          </div>

          {/* 7. Timezone */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Timezone
            </label>
            <TimezoneSelect
              value={timezone}
              onChange={(tz) => setTimezone(tz)}
              disabled={isSaving}
            />
          </div>

          {/* 8. Language */}
          <div className="space-y-1.5">
            <label
              htmlFor="page-edit-language"
              className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300"
            >
              Language
            </label>
            <div className="relative">
              <Languages className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              <select
                id="page-edit-language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={isSaving}
                className="flex w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-8 py-2.5 text-xs text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-100 transition-colors"
              >
                {LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Bottom Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <Button
              type="button"
              variant="secondary"
              size="default"
              onClick={handleBack}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="heat"
              size="default"
              className="gap-2 shadow-sm font-semibold"
              disabled={isSaving || usernameStatus === "checking" || usernameStatus === "taken"}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Changes</span>
              )}
            </Button>
          </div>
        </form>
      </div>

      {/* Discard Changes Modal */}
      {showDiscardConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150 cursor-pointer"
          onClick={() => setShowDiscardConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 space-y-4 cursor-default"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="page-discard-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 id="page-discard-dialog-title" className="text-sm font-bold text-zinc-900 dark:text-white">
                  Discard unsaved changes?
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  You have unsaved changes that will be lost if you navigate away.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowDiscardConfirm(false)}
              >
                Keep Editing
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => router.push("/profile")}
              >
                Discard
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
