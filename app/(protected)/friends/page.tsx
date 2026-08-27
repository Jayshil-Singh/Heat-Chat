"use client";

import * as React from "react";
import { Users, Search, Sparkles, MessageSquare, Info } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { UserSearch } from "@/components/profile/user-search";
import type { UserSearchResult } from "@/types/user";

export default function FriendsPage() {
  const { user } = useAuth();
  const [chatNotice, setChatNotice] = React.useState<string | null>(null);

  const handleSelectUser = (selected: UserSearchResult) => {
    setChatNotice(
      `Direct messaging with ${selected.display_name} (@${selected.username}) will be enabled in Phase 4.`
    );
    setTimeout(() => {
      setChatNotice(null);
    }, 4000);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-8">
      {/* Header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div className="flex items-center gap-2 text-heat-500 font-semibold text-xs mb-1">
          <Sparkles className="h-3.5 w-3.5" />
          <span>User Discovery & Search</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Find Friends
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Search for close friends on Heat Chat by their unique username or display name
        </p>
      </div>

      {chatNotice && (
        <div
          className="flex items-center gap-2.5 rounded-2xl bg-heat-50 p-4 text-xs font-medium text-heat-800 dark:bg-heat-950/40 dark:text-heat-300 border border-heat-200 dark:border-heat-900/50 animate-in fade-in"
          role="status"
        >
          <Info className="h-4 w-4 shrink-0 text-heat-500" />
          <span>{chatNotice}</span>
        </div>
      )}

      {/* User Search Component */}
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 md:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50">
        <UserSearch
          currentUserId={user?.id}
          onSelectUser={handleSelectUser}
        />
      </div>
    </div>
  );
}
