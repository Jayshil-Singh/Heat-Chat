"use client";

import * as React from "react";
import { User, ShieldCheck, Edit3, Mail, Calendar, Activity } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EditProfileDialog } from "@/components/profile/edit-profile-dialog";

export default function ProfilePage() {
  const { user, profile, refreshProfile, isLoading } = useAuth();
  const [isEditDialogOpen, setIsEditDialogOpen] = React.useState(false);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 space-y-8">
        <div className="border-b border-zinc-200 dark:border-zinc-800 pb-4">
          <Skeleton className="h-8 w-48 rounded-lg" />
          <Skeleton className="h-4 w-64 rounded-md mt-2" />
        </div>
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 md:p-8 dark:border-zinc-800 dark:bg-zinc-900/50 space-y-6">
          <div className="flex items-center gap-6">
            <Skeleton className="h-20 w-20 rounded-full" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-6 w-48 rounded" />
              <Skeleton className="h-4 w-32 rounded" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 pt-6 border-t border-zinc-100 dark:border-zinc-800">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            My Profile
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Manage your personal profile and presence on Heat Chat
          </p>
        </div>

        {user && (
          <Button
            variant="heat"
            size="sm"
            onClick={() => setIsEditDialogOpen(true)}
            className="gap-2"
          >
            <Edit3 className="h-3.5 w-3.5" />
            <span>Edit Profile</span>
          </Button>
        )}
      </div>

      {/* Main Profile Card */}
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 md:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 space-y-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 text-center sm:text-left">
          <Avatar
            src={profile?.avatar_url}
            name={profile?.display_name || user?.email || "User"}
            size="xl"
            status={profile?.status || "online"}
            className="h-20 w-20 text-2xl ring-4 ring-zinc-100 dark:ring-zinc-800 shadow-md"
          />

          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
                  {profile?.display_name || user?.email?.split("@")[0] || "Guest"}
                </h2>
                <p className="text-xs text-heat-600 dark:text-heat-400 font-semibold">
                  @{profile?.username || "username"}
                </p>
              </div>

              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60 self-center sm:self-auto capitalize">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>{profile?.status || "online"}</span>
              </div>
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed pt-1">
              {profile?.bio || (
                <span className="italic text-zinc-400">
                  No bio added yet. Click &quot;Edit Profile&quot; to tell friends about yourself.
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
              <Activity className="h-3.5 w-3.5" />
              <span>Presence & Last Seen</span>
            </div>
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">
              {profile?.last_seen
                ? new Date(profile.last_seen).toLocaleString()
                : "Active now"}
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-100 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/40 space-y-1">
            <div className="flex items-center gap-1.5 text-zinc-400 font-medium">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              <span>Security & Row Level Security</span>
            </div>
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">
              Self-Edit Only Policy Active
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-100 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/40 space-y-1">
            <div className="flex items-center gap-1.5 text-zinc-400 font-medium">
              <Calendar className="h-3.5 w-3.5" />
              <span>Member Since</span>
            </div>
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">
              {profile?.created_at
                ? new Date(profile.created_at).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })
                : "Active"}
            </p>
          </div>
        </div>
      </div>

      {/* Edit Profile Dialog */}
      {user && (
        <EditProfileDialog
          isOpen={isEditDialogOpen}
          onClose={() => setIsEditDialogOpen(false)}
          profile={profile}
          userId={user.id}
          onProfileUpdated={refreshProfile}
        />
      )}
    </div>
  );
}
