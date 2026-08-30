"use client";

import * as React from "react";
import {
  Search,
  MessageSquare,
  Users,
  AlertCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { RelationshipActionButton } from "./relationship-action-button";
import { UserProfileDialog } from "@/components/profile/user-profile-dialog";
import type { RelationshipStateDto } from "@/types/database";

interface SearchUserItem {
  profile: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    bio: string | null;
    presence_status?: string;
    status_message?: string | null;
    status_emoji?: string | null;
    status?: any;
  };
  relationship: RelationshipStateDto;
  mutualCount: number;
}

interface FindFriendsTabProps {
  currentUserId?: string;
  onStartChat: (targetUserId: string) => Promise<void>;
}

export function FindFriendsTab({
  currentUserId,
  onStartChat,
}: FindFriendsTabProps) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchUserItem[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const [hasSearched, setHasSearched] = React.useState(false);
  const [selectedUserForProfile, setSelectedUserForProfile] = React.useState<any | null>(null);

  // Debounced search via /api/users/search
  React.useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed || trimmed.length < 2) {
      setResults([]);
      setIsSearching(false);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    setHasSearched(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(trimmed)}`);
        const data = await res.json();
        if (res.ok) {
          setResults(data.users || []);
        } else {
          setResults([]);
        }
      } catch (err) {
        console.error("Search error:", err);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  return (
    <div className="space-y-6">
      {/* Search Input Box */}
      <div className="relative">
        <Input
          placeholder="Search people by name or username (min 2 characters)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          leftIcon={<Search className="h-4 w-4 text-zinc-400" />}
          className="h-11 rounded-2xl bg-white shadow-xs dark:bg-zinc-900/60 text-xs"
          autoComplete="off"
        />
      </div>

      {/* Results Container */}
      {isSearching ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50"
            >
              <div className="flex items-center gap-3.5 flex-1">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="space-y-2 flex-1 max-w-xs">
                  <Skeleton className="h-4 w-3/4 rounded" />
                  <Skeleton className="h-3 w-1/2 rounded" />
                </div>
              </div>
              <Skeleton className="h-8 w-24 rounded-lg" />
            </div>
          ))}
        </div>
      ) : hasSearched && results.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 p-8">
          <EmptyState
            icon={<Users className="h-8 w-8 text-zinc-400" />}
            title="No matching users found"
            description={`We couldn't find anyone matching "${searchQuery}". Check the spelling and try again.`}
          />
        </div>
      ) : results.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Search Results ({results.length})
            </span>
          </div>

          {results.map((item) => (
            <div
              key={item.profile.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-all hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-zinc-700"
            >
              <button
                type="button"
                onClick={() => setSelectedUserForProfile(item.profile)}
                className="flex items-center gap-3.5 min-w-0 flex-1 text-left group"
              >
                <Avatar
                  src={item.profile.avatar_url}
                  name={item.profile.display_name || item.profile.username}
                  size="lg"
                  status={item.profile.status}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="truncate text-sm font-semibold text-zinc-900 group-hover:text-heat-600 dark:text-zinc-100 dark:group-hover:text-heat-400 transition-colors">
                      {item.profile.display_name}
                    </h4>
                    {item.profile.status_emoji && (
                      <span className="text-sm leading-none">{item.profile.status_emoji}</span>
                    )}
                  </div>
                  <p className="truncate text-xs text-heat-600 dark:text-heat-400 font-medium">
                    @{item.profile.username}
                  </p>
                  {item.mutualCount > 0 && (
                    <span className="inline-block mt-1 rounded-full bg-heat-50 dark:bg-heat-950/40 px-2 py-0.5 text-[10px] font-semibold text-heat-600 dark:text-heat-400">
                      {item.mutualCount} mutual {item.mutualCount === 1 ? "friend" : "friends"}
                    </span>
                  )}
                </div>
              </button>

              <div className="flex items-center gap-2 shrink-0">
                {item.relationship.canMessage && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => onStartChat(item.profile.id)}
                    className="gap-1.5 text-xs text-zinc-700 dark:text-zinc-300"
                    title="Send Direct Message"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Message</span>
                  </Button>
                )}

                <RelationshipActionButton
                  userId={item.profile.id}
                  relationship={item.relationship}
                  size="sm"
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 p-8">
          <EmptyState
            icon={<Search className="h-8 w-8 text-zinc-400" />}
            title="Search for friends"
            description="Type a friend's name or @username to discover and connect with them."
          />
        </div>
      )}

      {/* User Profile Preview Dialog */}
      {selectedUserForProfile && (
        <UserProfileDialog
          user={selectedUserForProfile}
          isOpen={!!selectedUserForProfile}
          onClose={() => setSelectedUserForProfile(null)}
          onStartChat={(u) => onStartChat(u.id)}
        />
      )}
    </div>
  );
}
