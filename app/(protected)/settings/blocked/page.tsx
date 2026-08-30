"use client";

import * as React from "react";
import {
  ShieldAlert,
  User,
  ChevronLeft,
  AlertCircle,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockDialog } from "@/components/profile/block-dialog";

interface BlockedUserEntry {
  id: string;
  blockedUserId: string;
  reason: string | null;
  createdAt: string;
  profile: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
}

export default function BlockedUsersPage() {
  const [blockedUsers, setBlockedUsers] = React.useState<BlockedUserEntry[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [unblockTarget, setUnblockTarget] = React.useState<BlockedUserEntry | null>(null);

  const loadBlockedUsers = React.useCallback(() => {
    setIsLoading(true);
    setError(null);
    fetch("/api/users/blocked")
      .then((r) => r.json())
      .then((data) => {
        if (data?.blockedUsers) setBlockedUsers(data.blockedUsers);
        else setError("Failed to load blocked users.");
      })
      .catch(() => setError("Failed to load blocked users."))
      .finally(() => setIsLoading(false));
  }, []);

  React.useEffect(() => {
    loadBlockedUsers();
  }, [loadBlockedUsers]);

  const handleUnblockSuccess = (targetId: string) => {
    setBlockedUsers((prev) => prev.filter((u) => u.blockedUserId !== targetId));
    setUnblockTarget(null);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <Link
          href="/settings/privacy"
          className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300 transition-colors"
          title="Back to Privacy Settings"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Blocked Users
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Manage users you have blocked from contacting you
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button
            type="button"
            onClick={loadBlockedUsers}
            className="ml-auto text-red-700 underline hover:no-underline dark:text-red-300"
          >
            Retry
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-2xl border border-zinc-100 p-4 dark:border-zinc-800"
            >
              <Skeleton className="h-12 w-12 rounded-full shrink-0" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-4 w-40 rounded" />
                <Skeleton className="h-3 w-24 rounded" />
              </div>
              <Skeleton className="h-8 w-20 rounded-xl" />
            </div>
          ))}
        </div>
      ) : blockedUsers.length === 0 ? (
        <div className="rounded-3xl border border-zinc-200 bg-white p-12 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
          <ShieldCheck className="h-12 w-12 mx-auto text-emerald-400 dark:text-emerald-600 mb-3" />
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-white mb-1">
            No blocked users
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xs mx-auto">
            You haven&rsquo;t blocked anyone. If a user is bothering you, you can block them from
            their profile.
          </p>
        </div>
      ) : (
        <div className="rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 overflow-hidden">
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {blockedUsers.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-4 px-5 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-900/70 transition-colors"
              >
                <Avatar
                  src={entry.profile.avatar_url}
                  name={entry.profile.display_name || entry.profile.username || "User"}
                  size="default"
                  className="h-12 w-12 shrink-0"
                />

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                    {entry.profile.display_name || entry.profile.username}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    @{entry.profile.username}
                  </p>
                  {entry.reason && (
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-600 italic truncate mt-0.5">
                      &ldquo;{entry.reason}&rdquo;
                    </p>
                  )}
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-600 mt-0.5">
                    Blocked {new Date(entry.createdAt).toLocaleDateString()}
                  </p>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setUnblockTarget(entry)}
                  className="gap-1.5 text-xs shrink-0"
                  id={`unblock-btn-${entry.blockedUserId}`}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  <span>Unblock</span>
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unblock Confirmation Dialog */}
      {unblockTarget && (
        <BlockDialog
          isOpen={true}
          onClose={() => setUnblockTarget(null)}
          targetUserId={unblockTarget.blockedUserId}
          targetUsername={unblockTarget.profile.username}
          targetDisplayName={unblockTarget.profile.display_name || unblockTarget.profile.username}
          isCurrentlyBlocked={true}
          onSuccess={() => handleUnblockSuccess(unblockTarget.blockedUserId)}
        />
      )}
    </div>
  );
}
