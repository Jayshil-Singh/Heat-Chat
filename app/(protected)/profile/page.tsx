"use client";

import * as React from "react";
import { User, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Avatar } from "@/components/ui/avatar";

export default function ProfilePage() {
  const { user, profile } = useAuth();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-8">
      <div className="border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
          My Profile
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          View your profile details and status
        </p>
      </div>

      <div className="rounded-3xl border border-zinc-200 bg-white p-6 md:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 space-y-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 text-center sm:text-left">
          <Avatar
            src={profile?.avatar_url}
            name={profile?.display_name || user?.email || "User"}
            size="xl"
            status={profile?.status || "online"}
          />
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
              {profile?.display_name || user?.email?.split("@")[0] || "Guest"}
            </h2>
            <p className="text-sm text-heat-600 dark:text-heat-400 font-medium">
              @{profile?.username || "username"}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md pt-1">
              {profile?.bio || "No bio set yet."}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 pt-6 border-t border-zinc-100 dark:border-zinc-800 text-xs">
          <div className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-800/50 space-y-1">
            <span className="text-zinc-400 font-medium">Email Address</span>
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">
              {user?.email || "Not signed in"}
            </p>
          </div>

          <div className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-800/50 space-y-1">
            <span className="text-zinc-400 font-medium">Presence Status</span>
            <p className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 capitalize">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {profile?.status || "Online"}
            </p>
          </div>

          <div className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-800/50 space-y-1">
            <span className="text-zinc-400 font-medium">Security & RLS</span>
            <p className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              Self-Edit Only Policy Active
            </p>
          </div>

          <div className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-800/50 space-y-1">
            <span className="text-zinc-400 font-medium">Member Since</span>
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">
              {profile?.created_at
                ? new Date(profile.created_at).toLocaleDateString()
                : "Active"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
