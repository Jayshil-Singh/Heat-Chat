"use client";

import * as React from "react";
import { use } from "react";
import {
  MessageCircle,
  UserPlus,
  UserCheck,
  ShieldAlert,
  AlertCircle,
  Globe,
  ArrowLeft,
  UserX,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockDialog } from "@/components/profile/block-dialog";
import type { PublicProfileDto } from "@/types/database";

const PRESENCE_LABELS: Record<string, { label: string; dotColor: string }> = {
  ONLINE: { label: "Online", dotColor: "bg-emerald-500" },
  AWAY: { label: "Away", dotColor: "bg-amber-500" },
  BUSY: { label: "Do Not Disturb", dotColor: "bg-red-500" },
  OFFLINE: { label: "Offline", dotColor: "bg-zinc-400" },
  INVISIBLE: { label: "Offline", dotColor: "bg-zinc-400" },
};

export default function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  const { user } = useAuth();
  const router = useRouter();
  const [profileData, setProfileData] = React.useState<PublicProfileDto | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);
  const [showBlockDialog, setShowBlockDialog] = React.useState(false);

  const loadProfile = React.useCallback(() => {
    if (!username) return;
    setIsLoading(true);
    setNotFound(false);
    fetch(`/api/users/${username}`)
      .then((r) => {
        if (r.status === 404) {
          setNotFound(true);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data?.profile) setProfileData(data.profile as PublicProfileDto);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [username]);

  React.useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const presenceInfo =
    profileData?.presenceStatus
      ? PRESENCE_LABELS[profileData.presenceStatus] || PRESENCE_LABELS["OFFLINE"]
      : PRESENCE_LABELS["OFFLINE"];

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        <Skeleton className="h-44 w-full rounded-3xl" />
        <div className="flex items-start gap-4">
          <Skeleton className="h-20 w-20 rounded-full" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-6 w-40 rounded" />
            <Skeleton className="h-4 w-24 rounded" />
            <Skeleton className="h-3 w-64 rounded mt-3" />
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !profileData) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <UserX className="h-12 w-12 mx-auto text-zinc-300 dark:text-zinc-700 mb-4" />
        <h1 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">User not found</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          This profile doesn&rsquo;t exist or may have been removed.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.back()}
          className="mt-6 gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Go Back
        </Button>
      </div>
    );
  }

  if (profileData.hasBlockedViewer) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <ShieldAlert className="h-12 w-12 mx-auto text-red-300 dark:text-red-800 mb-4" />
        <h1 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Profile unavailable</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">This profile is not available.</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.back()}
          className="mt-6 gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      {/* Back button */}
      <button
        type="button"
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back
      </button>

      {/* Cover Banner */}
      <div className="relative h-44 w-full rounded-3xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-sm">
        {profileData.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profileData.coverUrl}
            alt={`${profileData.displayName}'s cover`}
            className="h-full w-full object-cover object-center"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-r from-heat-500/30 via-amber-500/20 to-heat-600/25" />
        )}
      </div>

      {/* Profile Card */}
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 space-y-6">
        {/* Avatar + Identity row */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
          <Avatar
            src={profileData.avatarUrl}
            name={profileData.displayName || profileData.username}
            size="xl"
            status={profileData.presenceStatus.toLowerCase() as "online" | "away" | "busy" | "offline"}
            className="h-20 w-20 text-2xl ring-4 ring-zinc-100 dark:ring-zinc-800 shadow-md shrink-0"
          />

          <div className="flex-1 min-w-0 text-center sm:text-left">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h1 className="text-xl font-bold text-zinc-900 dark:text-white">
                  {profileData.displayName || profileData.username}
                </h1>
                <p className="text-xs text-heat-600 dark:text-heat-400 font-semibold">
                  @{profileData.username}
                </p>
              </div>

              {/* Presence badge */}
              <div
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border self-center sm:self-auto ${
                  profileData.presenceStatus === "ONLINE"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-900/60"
                    : "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${presenceInfo.dotColor}`} />
                <span>{presenceInfo.label}</span>
              </div>
            </div>

            {/* Status message */}
            {(profileData.statusEmoji || profileData.statusMessage) && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-zinc-500 dark:text-zinc-400 justify-center sm:justify-start">
                {profileData.statusEmoji && (
                  <span className="text-base leading-none">{profileData.statusEmoji}</span>
                )}
                {profileData.statusMessage && <span className="italic">{profileData.statusMessage}</span>}
              </div>
            )}

            {/* Bio */}
            {profileData.bio ? (
              <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed mt-3">
                {profileData.bio}
              </p>
            ) : (
              <p className="text-xs text-zinc-400 dark:text-zinc-600 italic mt-3">
                No bio provided.
              </p>
            )}

            {/* Friendship badge */}
            {!profileData.isSelf && profileData.isFriend && (
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-heat-50 px-3 py-1 text-[11px] font-semibold text-heat-700 border border-heat-200 dark:bg-heat-950/30 dark:text-heat-400 dark:border-heat-900/50">
                <UserCheck className="h-3 w-3" />
                <span>Friends</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        {!profileData.isSelf && user && (
          <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            {profileData.canMessage && (
              <Button
                variant="heat"
                size="sm"
                className="gap-2"
                id={`profile-message-${profileData.id}`}
                onClick={() => router.push(`/chat?userId=${profileData.id}`)}
              >
                <MessageCircle className="h-4 w-4" />
                <span>Message</span>
              </Button>
            )}

            {profileData.canFriendRequest && !profileData.isFriend && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                id={`profile-add-friend-${profileData.id}`}
              >
                <UserPlus className="h-4 w-4" />
                <span>Add Friend</span>
              </Button>
            )}

            {!profileData.isBlocked && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 ml-auto"
                onClick={() => setShowBlockDialog(true)}
                id={`profile-block-${profileData.id}`}
              >
                <ShieldAlert className="h-4 w-4" />
                <span>Block</span>
              </Button>
            )}

            {profileData.isBlocked && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-zinc-500 hover:text-zinc-700 ml-auto"
                onClick={() => setShowBlockDialog(true)}
                id={`profile-unblock-${profileData.id}`}
              >
                <ShieldAlert className="h-4 w-4" />
                <span>Unblock</span>
              </Button>
            )}
          </div>
        )}

        {/* Timezone (visible to friends or self) */}
        {profileData.timezone && (
          <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-600 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <Globe className="h-3.5 w-3.5 shrink-0" />
            <span>{profileData.timezone}</span>
          </div>
        )}

        {/* Blocked notice */}
        {profileData.isBlocked && (
          <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>You have blocked this user. They cannot message or interact with you.</span>
          </div>
        )}
      </div>

      {/* Block/Unblock Dialog */}
      {showBlockDialog && (
        <BlockDialog
          isOpen={showBlockDialog}
          onClose={() => setShowBlockDialog(false)}
          targetUserId={profileData.id}
          targetUsername={profileData.username}
          targetDisplayName={profileData.displayName}
          isCurrentlyBlocked={profileData.isBlocked}
          onSuccess={(isNowBlocked) => {
            setShowBlockDialog(false);
            setProfileData((prev) =>
              prev
                ? {
                    ...prev,
                    isBlocked: isNowBlocked,
                    canMessage: !isNowBlocked,
                    canFriendRequest: !isNowBlocked,
                  }
                : null
            );
          }}
        />
      )}
    </div>
  );
}
