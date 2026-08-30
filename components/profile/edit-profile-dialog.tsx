"use client";

import * as React from "react";
import { User, AtSign, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AvatarUpload } from "./avatar-upload";
import { validateUsername, validateDisplayName, sanitizeUsername } from "@/lib/validation/auth";
import { validateBio } from "@/lib/validation/profile";
import type { Profile, UserStatus } from "@/types/database";

interface EditProfileDialogProps {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile | null;
  userId: string;
  onProfileUpdated: () => Promise<void>;
}

const statusOptions: { value: UserStatus; label: string; color: string }[] = [
  { value: "online", label: "Online", color: "bg-emerald-500" },
  { value: "away", label: "Away", color: "bg-amber-500" },
  { value: "busy", label: "Do Not Disturb", color: "bg-rose-500" },
  { value: "offline", label: "Invisible / Offline", color: "bg-zinc-400" },
];

export function EditProfileDialog({
  isOpen,
  onClose,
  profile,
  userId,
  onProfileUpdated,
}: EditProfileDialogProps) {
  const [displayName, setDisplayName] = React.useState(profile?.display_name || "");
  const [username, setUsername] = React.useState(profile?.username || "");
  const [bio, setBio] = React.useState(profile?.bio || "");
  const [status, setStatus] = React.useState<UserStatus>(profile?.status || "online");
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(profile?.avatar_url || null);

  const [usernameStatus, setUsernameStatus] = React.useState<"idle" | "checking" | "available" | "taken">("idle");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = React.useState(false);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  const supabase = React.useMemo(() => createClient(), []);

  // Sync state when dialog opens or profile changes
  React.useEffect(() => {
    if (profile && isOpen) {
      setDisplayName(profile.display_name || "");
      setUsername(profile.username || "");
      setBio(profile.bio || "");
      setStatus(profile.status || "online");
      setAvatarUrl(profile.avatar_url || null);
      setErrors({});
      setUsernameStatus("idle");
      setSuccessMessage(null);
    }
  }, [profile, isOpen]);

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
        const { data, error } = await supabase
          .from("profiles")
          .select("id")
          .ilike("username", cleanUsername)
          .neq("id", userId)
          .maybeSingle();

        if (error) {
          setUsernameStatus("idle");
          return;
        }

        if (data) {
          setUsernameStatus("taken");
        } else {
          setUsernameStatus("available");
        }
      } catch {
        setUsernameStatus("idle");
      }
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [username, profile?.username, userId, supabase]);

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const clean = sanitizeUsername(e.target.value);
    setUsername(clean);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setSuccessMessage(null);

    const nameErr = validateDisplayName(displayName);
    const userErr = validateUsername(username);
    const bioValidation = validateBio(bio);

    const validationErrors: Record<string, string> = {};
    if (nameErr) validationErrors.displayName = nameErr;
    if (userErr) validationErrors.username = userErr;
    if (!bioValidation.isValid && bioValidation.error) validationErrors.bio = bioValidation.error;
    if (usernameStatus === "taken") {
      validationErrors.username = "That username is already taken.";
    }

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSaving(true);

    try {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          display_name: displayName.trim(),
          username: username.toLowerCase().trim(),
          bio: bio.trim() || null,
          status,
          avatar_url: avatarUrl,
        })
        .eq("id", userId);

      if (updateError) {
        if (updateError.code === "23505" || updateError.message.includes("unique")) {
          setErrors({ username: "That username is already taken." });
        } else {
          setErrors({ general: updateError.message || "Failed to update profile." });
        }
        return;
      }

      setSuccessMessage("Profile updated successfully.");
      await onProfileUpdated();

      setTimeout(() => {
        onClose();
      }, 1000);
    } catch {
      setErrors({ general: "A network error occurred. Please try again." });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Profile"
      description="Update your display name, username, and public profile information."
      className="max-w-lg"
      footer={
        <div className="flex w-full flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
          <Button
            type="button"
            variant="secondary"
            size="default"
            onClick={onClose}
            disabled={isSaving}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="edit-profile-form"
            variant="heat"
            size="default"
            className="w-full sm:w-auto gap-2 shadow-sm font-semibold"
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
      }
    >
      <form id="edit-profile-form" onSubmit={handleSubmit} className="space-y-5" noValidate>
        {/* Avatar Upload */}
        <div className="pb-1">
          <AvatarUpload
            userId={userId}
            currentAvatarUrl={avatarUrl}
            name={displayName || username || "User"}
            onAvatarUpdated={(newUrl) => {
              setAvatarUrl(newUrl);
              setSuccessMessage("Profile picture updated.");
            }}
            disabled={isSaving}
          />
        </div>

        {successMessage && (
          <div
            className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50"
            role="status"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            <span>{successMessage}</span>
          </div>
        )}

        {errors.general && (
          <div
            className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-900/50"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
            <span>{errors.general}</span>
          </div>
        )}

        {/* Display Name */}
        <div className="space-y-1.5">
          <label
            htmlFor="edit-display-name"
            className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300"
          >
            Display Name
          </label>
          <Input
            id="edit-display-name"
            name="displayName"
            placeholder="e.g. Alex Rivera"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            leftIcon={<User className="h-4 w-4" />}
            error={errors.displayName}
            disabled={isSaving}
            required
          />
        </div>

        {/* Username with Live Availability feedback */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="edit-username"
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
            id="edit-username"
            name="username"
            placeholder="e.g. alex_rivera"
            value={username}
            onChange={handleUsernameChange}
            leftIcon={<AtSign className="h-4 w-4" />}
            error={errors.username}
            disabled={isSaving}
            required
          />
        </div>

        {/* Status Selector */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            Status Message / Presence
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {statusOptions.map((opt) => (
              <button
                type="button"
                key={opt.value}
                onClick={() => setStatus(opt.value)}
                className={`flex items-center gap-2 rounded-xl border p-2.5 text-xs font-medium transition-all text-left ${
                  status === opt.value
                    ? "border-heat-500 bg-heat-50 text-zinc-900 dark:bg-heat-950/40 dark:text-white ring-1 ring-heat-500/20"
                    : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400"
                }`}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${opt.color} shrink-0`} />
                <span className="truncate">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Bio */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="edit-bio"
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
              id="edit-bio"
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
      </form>
    </Dialog>
  );
}
