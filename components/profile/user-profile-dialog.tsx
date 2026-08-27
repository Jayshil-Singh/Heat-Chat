"use client";

import * as React from "react";
import { MessageSquare, ShieldCheck, Calendar, Sparkles } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { PublicUserProfile, UserSearchResult } from "@/types/user";

interface UserProfileDialogProps {
  user: PublicUserProfile | UserSearchResult | null;
  isOpen: boolean;
  onClose: () => void;
  onStartChat?: (user: PublicUserProfile | UserSearchResult) => void;
}

export function UserProfileDialog({
  user,
  isOpen,
  onClose,
  onStartChat,
}: UserProfileDialogProps) {
  if (!user) return null;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="User Profile"
      className="max-w-md"
    >
      <div className="space-y-6">
        {/* Header with Avatar & Names */}
        <div className="flex flex-col items-center text-center space-y-3 pt-2">
          <Avatar
            src={user.avatar_url}
            name={user.display_name || user.username}
            size="xl"
            status={user.status}
          />
          <div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
              {user.display_name}
            </h3>
            <p className="text-xs font-semibold text-heat-600 dark:text-heat-400">
              @{user.username}
            </p>
          </div>
        </div>

        {/* Bio */}
        {user.bio ? (
          <div className="rounded-xl bg-zinc-50 p-3.5 text-xs text-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-300 leading-relaxed text-center">
            {user.bio}
          </div>
        ) : (
          <p className="text-center text-xs italic text-zinc-400">
            No bio provided yet.
          </p>
        )}

        {/* Details list */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl border border-zinc-100 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
            <span className="text-zinc-400 block text-[11px]">Presence</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400 capitalize mt-0.5 inline-block">
              {user.status || "Online"}
            </span>
          </div>

          <div className="rounded-xl border border-zinc-100 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
            <span className="text-zinc-400 block text-[11px]">Verified Profile</span>
            <span className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1 mt-0.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              Heat Chat User
            </span>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex gap-2 pt-2">
          <Button
            variant="secondary"
            size="default"
            onClick={onClose}
            className="flex-1"
          >
            Close
          </Button>

          <Button
            variant="heat"
            size="default"
            onClick={() => {
              if (onStartChat) onStartChat(user);
            }}
            className="flex-1 gap-2"
          >
            <MessageSquare className="h-4 w-4" />
            <span>Start Chat</span>
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
