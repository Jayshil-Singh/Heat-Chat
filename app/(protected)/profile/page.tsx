"use client";

import * as React from "react";
import {
  User,
  ShieldCheck,
  Edit3,
  Mail,
  Calendar,
  Globe,
  Clock,
  Smile,
  MessageCircle,
  ShieldAlert,
  Lock,
  ChevronRight,
  Languages,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EditProfileDialog } from "@/components/profile/edit-profile-dialog";
import type { OwnProfileDto, UserPrivacySettings } from "@/types/database";

const PRESENCE_LABELS: Record<string, { label: string; color: string }> = {
  ONLINE: { label: "Online", color: "bg-emerald-500" },
  AWAY: { label: "Away", color: "bg-amber-500" },
  BUSY: { label: "Do Not Disturb", color: "bg-red-500" },
  OFFLINE: { label: "Offline", color: "bg-zinc-400" },
  INVISIBLE: { label: "Invisible", color: "bg-zinc-400" },
};

export default function ProfilePage() {
  const { user, profile, refreshProfile, isLoading } = useAuth();
  const [isEditDialogOpen, setIsEditDialogOpen] = React.useState(false);
  const [ownProfile, setOwnProfile] = React.useState<OwnProfileDto | null>(null);
  const [isFetching, setIsFetching] = React.useState(true);

  // Fetch rich profile with privacy_settings
  React.useEffect(() => {
    if (!user) return;
    setIsFetching(true);
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        if (data?.profile) setOwnProfile(data.profile as OwnProfileDto);
      })
      .catch(console.error)
      .finally(() => setIsFetching(false));
  }, [user]);

  const presenceStatus = (ownProfile?.presence_status as string) || "ONLINE";
  const presenceInfo = PRESENCE_LABELS[presenceStatus] || PRESENCE_LABELS["ONLINE"];

  if (isLoading || isFetching) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
        <div className="border-b border-zinc-200 dark:border-zinc-800 pb-4">
          <Skeleton className="h-8 w-48 rounded-lg" />
          <Skeleton className="h-4 w-64 rounded-md mt-2" />
        </div>
        {/* Cover skeleton */}
        <Skeleton className="h-44 w-full rounded-3xl" />
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900/50 space-y-6">
          <div className="flex items-center gap-6">
            <Skeleton className="h-24 w-24 rounded-full" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-6 w-48 rounded" />
              <Skeleton className="h-4 w-32 rounded" />
              <Skeleton className="h-3 w-64 rounded mt-2" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 pt-6 border-t border-zinc-100 dark:border-zinc-800">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            My Profile
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Manage your public identity and presence on Heat Chat
          </p>
        </div>

        {user && (
          <Button
            variant="heat"
            size="sm"
            onClick={() => setIsEditDialogOpen(true)}
            className="gap-2"
            id="edit-profile-btn"
          >
            <Edit3 className="h-3.5 w-3.5" />
            <span>Edit Profile</span>
          </Button>
        )}
      </div>

      {/* Cover Banner */}
      <div className="relative h-44 w-full rounded-3xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-sm">
        {ownProfile?.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ownProfile.cover_url}
            alt="Profile Cover"
            className="h-full w-full object-cover object-center"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-r from-heat-500/30 via-amber-500/20 to-heat-600/25 flex items-center justify-center">
            <p className="text-xs text-zinc-400 dark:text-zinc-600 italic">
              No cover image — edit your profile to upload one
            </p>
          </div>
        )}
      </div>

      {/* Main Profile Card */}
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 md:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 space-y-6">
        {/* Avatar + Identity */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 text-center sm:text-left">
          <Avatar
            src={ownProfile?.avatar_url || profile?.avatar_url}
            name={ownProfile?.display_name || profile?.display_name || user?.email || "User"}
            size="xl"
            status={presenceStatus.toLowerCase() as "online" | "away" | "busy" | "offline"}
            className="h-24 w-24 text-2xl ring-4 ring-zinc-100 dark:ring-zinc-800 shadow-md shrink-0"
          />

          <div className="space-y-2 flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
              <div>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
                  {ownProfile?.display_name || profile?.display_name || user?.email?.split("@")[0] || "Guest"}
                </h2>
                <p className="text-xs text-heat-600 dark:text-heat-400 font-semibold">
                  @{ownProfile?.username || profile?.username || "username"}
                </p>
              </div>

              {/* Presence badge */}
              <div
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border self-center sm:self-auto ${
                  presenceStatus === "ONLINE"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-900/60"
                    : presenceStatus === "AWAY"
                    ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-900/60"
                    : presenceStatus === "BUSY"
                    ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-900/60"
                    : "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${presenceInfo.color}`} />
                <span>{presenceInfo.label}</span>
              </div>
            </div>

            {/* Status message */}
            {ownProfile?.status_emoji || ownProfile?.status_message ? (
              <div className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                {ownProfile.status_emoji && (
                  <span className="text-base leading-none">{ownProfile.status_emoji}</span>
                )}
                {ownProfile.status_message && <span className="italic">{ownProfile.status_message}</span>}
              </div>
            ) : null}

            {/* Bio */}
            <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed pt-1">
              {ownProfile?.bio || profile?.bio || (
                <span className="italic text-zinc-400">
                  No bio yet. Click &ldquo;Edit Profile&rdquo; to introduce yourself.
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Details Grid */}
        <div className="grid gap-4 sm:grid-cols-2 pt-6 border-t border-zinc-100 dark:border-zinc-800 text-xs">
          <div className="rounded-2xl border border-zinc-100 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/40 space-y-1">
            <div className="flex items-center gap-1.5 text-zinc-400 font-medium">
              <Mail className="h-3.5 w-3.5" />
              <span>Email Address</span>
            </div>
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">
              {user?.email || "Not signed in"}
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-100 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/40 space-y-1">
            <div className="flex items-center gap-1.5 text-zinc-400 font-medium">
              <Calendar className="h-3.5 w-3.5" />
              <span>Member Since</span>
            </div>
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">
              {ownProfile?.created_at || profile?.created_at
                ? new Date(ownProfile?.created_at || profile?.created_at || "").toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })
                : "Active"}
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-100 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/40 space-y-1">
            <div className="flex items-center gap-1.5 text-zinc-400 font-medium">
              <Globe className="h-3.5 w-3.5" />
              <span>Timezone</span>
            </div>
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">
              {ownProfile?.timezone || "UTC"}
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-100 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/40 space-y-1">
            <div className="flex items-center gap-1.5 text-zinc-400 font-medium">
              <Languages className="h-3.5 w-3.5" />
              <span>Language</span>
            </div>
            <p className="font-semibold text-zinc-900 dark:text-zinc-100 capitalize">
              {ownProfile?.language === "en"
                ? "English (en)"
                : ownProfile?.language === "es"
                ? "Español (es)"
                : ownProfile?.language === "fr"
                ? "Français (fr)"
                : ownProfile?.language === "de"
                ? "Deutsch (de)"
                : ownProfile?.language === "ja"
                ? "日本語 (ja)"
                : ownProfile?.language || "English (en)"}
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-100 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/40 space-y-1">
            <div className="flex items-center gap-1.5 text-zinc-400 font-medium">
              <Clock className="h-3.5 w-3.5" />
              <span>Last Seen</span>
            </div>
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">
              {ownProfile?.last_seen_at
                ? new Date(ownProfile.last_seen_at).toLocaleString()
                : (ownProfile as any)?.last_seen
                ? new Date((ownProfile as any).last_seen).toLocaleString()
                : "Active now"}
            </p>
          </div>
        </div>

        {/* Security Badge */}
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
          <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            Self-Edit Only RLS Policy · Profile data is server-authorised and protected
          </span>
        </div>
      </div>

      {/* Quick Actions Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link
          href="/settings/privacy"
          className="group flex items-center justify-between rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm hover:border-heat-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-heat-700 transition-all duration-200"
          id="profile-quick-privacy"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-violet-50 p-2.5 dark:bg-violet-950/40">
              <Lock className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-zinc-900 dark:text-white">Privacy Settings</p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Control who can see you</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-zinc-400 group-hover:text-heat-500 transition-colors" />
        </Link>

        <Link
          href="/friends"
          className="group flex items-center justify-between rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm hover:border-heat-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-heat-700 transition-all duration-200"
          id="profile-quick-friends"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-heat-50 p-2.5 dark:bg-heat-950/40">
              <User className="h-4 w-4 text-heat-600 dark:text-heat-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-zinc-900 dark:text-white">Friends</p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Manage connections</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-zinc-400 group-hover:text-heat-500 transition-colors" />
        </Link>

        <Link
          href="/settings/blocked"
          className="group flex items-center justify-between rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm hover:border-heat-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-heat-700 transition-all duration-200"
          id="profile-quick-blocked"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-red-50 p-2.5 dark:bg-red-950/40">
              <ShieldAlert className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-zinc-900 dark:text-white">Blocked Users</p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Manage blocks</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-zinc-400 group-hover:text-heat-500 transition-colors" />
        </Link>
      </div>

      {/* Edit Profile Dialog */}
      {user && (
        <EditProfileDialog
          isOpen={isEditDialogOpen}
          onClose={() => setIsEditDialogOpen(false)}
          profile={profile}
          userId={user.id}
          onProfileUpdated={async () => {
            await refreshProfile();
            // Refetch rich profile
            try {
              const r = await fetch("/api/profile");
              const data = await r.json();
              if (data?.profile) setOwnProfile(data.profile as OwnProfileDto);
            } catch {/* silent */}
          }}
        />
      )}
    </div>
  );
}
