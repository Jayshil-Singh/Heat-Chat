"use client";

import * as React from "react";
import {
  Search,
  UserPlus,
  MessageSquare,
  Clock,
  Check,
  Loader2,
  User,
  Users,
  AlertCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { UserProfileDialog } from "@/components/profile/user-profile-dialog";
import type { UserSearchResult } from "@/types/user";

interface FindFriendsTabProps {
  currentUserId?: string;
  getRelationshipStatus: (userId: string) => "none" | "pending_incoming" | "pending_outgoing" | "accepted" | "self";
  onSendRequest: (targetUserId: string) => Promise<{ success: boolean; error?: string }>;
  onStartChat: (targetUserId: string) => Promise<void>;
  onAcceptRequest?: (targetUserId: string) => Promise<{ success: boolean; error?: string }>;
}

export function FindFriendsTab({
  currentUserId,
  getRelationshipStatus,
  onSendRequest,
  onStartChat,
  onAcceptRequest,
}: FindFriendsTabProps) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [results, setResults] = React.useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const [hasSearched, setHasSearched] = React.useState(false);
  const [actionLoadingId, setActionLoadingId] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [selectedUserForProfile, setSelectedUserForProfile] = React.useState<UserSearchResult | null>(null);

  const supabase = React.useMemo(() => createClient(), []);

  // Debounced search
  React.useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setResults([]);
      setIsSearching(false);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    setHasSearched(true);
    setActionError(null);

    const timer = setTimeout(async () => {
      try {
        let query = supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url, bio, status")
          .or(`username.ilike.%${trimmed}%,display_name.ilike.%${trimmed}%`)
          .limit(20);

        if (currentUserId) {
          query = query.neq("id", currentUserId);
        }

        const { data, error } = await query;

        if (error) {
          console.warn("Search query error:", error.message);
          setResults([]);
        } else {
          setResults((data as UserSearchResult[]) || []);
        }
      } catch (err) {
        console.error("Search error:", err);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery, currentUserId, supabase]);

  const handleSendRequest = async (targetUserId: string) => {
    setActionLoadingId(targetUserId);
    setActionError(null);
    try {
      const res = await onSendRequest(targetUserId);
      if (!res.success && res.error) {
        setActionError(res.error);
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleStartChat = async (targetUserId: string) => {
    setActionLoadingId(targetUserId);
    setActionError(null);
    try {
      await onStartChat(targetUserId);
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Input Bar */}
      <div className="relative">
        <Input
          placeholder="Search by username or display name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          leftIcon={<Search className="h-4 w-4" />}
          rightIcon={
            isSearching ? (
              <Loader2 className="h-4 w-4 animate-spin text-heat-500" />
            ) : undefined
          }
          className="h-11 bg-white dark:bg-zinc-900 text-sm shadow-sm"
        />
      </div>

      {actionError && (
        <div
          className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-900/50"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Results Container */}
      <div className="space-y-3">
        {isSearching && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50"
              >
                <div className="flex items-center gap-3 flex-1">
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
        )}

        {!isSearching && results.length > 0 && (
          <div className="space-y-2.5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 px-1">
              Discovered Users ({results.length})
            </h4>

            {results.map((target) => {
              const relStatus = getRelationshipStatus(target.id);
              const isLoading = actionLoadingId === target.id;

              return (
                <div
                  key={target.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-zinc-700 transition-all"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <Avatar
                      src={target.avatar_url}
                      name={target.display_name || target.username}
                      size="lg"
                      status={target.status}
                    />
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {target.display_name}
                      </h4>
                      <p className="truncate text-xs text-heat-600 dark:text-heat-400 font-medium">
                        @{target.username}
                      </p>
                      {target.bio && (
                        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                          {target.bio}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setSelectedUserForProfile(target)}
                      className="gap-1 text-xs hidden sm:inline-flex"
                    >
                      <User className="h-3.5 w-3.5" />
                      <span>Profile</span>
                    </Button>

                    {/* Contextual Action Button based on friendship status */}
                    {relStatus === "accepted" && (
                      <Button
                        variant="heat"
                        size="sm"
                        onClick={() => handleStartChat(target.id)}
                        disabled={isLoading}
                        className="gap-1.5 text-xs"
                      >
                        {isLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <MessageSquare className="h-3.5 w-3.5" />
                        )}
                        <span>Message</span>
                      </Button>
                    )}

                    {relStatus === "pending_outgoing" && (
                      <div className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        <Clock className="h-3.5 w-3.5 text-amber-500" />
                        <span>Request Sent</span>
                      </div>
                    )}

                    {relStatus === "pending_incoming" && (
                      <div className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900">
                        <span>Check Requests</span>
                      </div>
                    )}

                    {relStatus === "none" && (
                      <Button
                        variant="heat"
                        size="sm"
                        onClick={() => handleSendRequest(target.id)}
                        disabled={isLoading}
                        className="gap-1.5 text-xs"
                      >
                        {isLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <UserPlus className="h-3.5 w-3.5" />
                        )}
                        <span>Add Friend</span>
                      </Button>
                    )}

                    {relStatus === "self" && (
                      <span className="text-xs font-medium text-zinc-400">
                        (You)
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!isSearching && hasSearched && results.length === 0 && (
          <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
            <EmptyState
              icon={<Users className="h-7 w-7 text-zinc-400" />}
              title="No users found"
              description="Try a different name or username."
            />
          </div>
        )}

        {!hasSearched && (
          <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
            <EmptyState
              icon={<Search className="h-7 w-7 text-heat-500" />}
              title="Find your friends"
              description="Search for a username or display name to send a friend request."
            />
          </div>
        )}
      </div>

      {/* User Profile View Dialog */}
      <UserProfileDialog
        user={selectedUserForProfile}
        isOpen={Boolean(selectedUserForProfile)}
        onClose={() => setSelectedUserForProfile(null)}
        onStartChat={(p) => {
          setSelectedUserForProfile(null);
          handleStartChat(p.id);
        }}
      />
    </div>
  );
}
