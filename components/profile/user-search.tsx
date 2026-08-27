"use client";

import * as React from "react";
import { Search, Users, User, MessageSquare, Loader2, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { UserProfileDialog } from "./user-profile-dialog";
import type { UserSearchResult } from "@/types/user";

interface UserSearchProps {
  currentUserId?: string;
  onSelectUser?: (user: UserSearchResult) => void;
}

export function UserSearch({ currentUserId, onSelectUser }: UserSearchProps) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [results, setResults] = React.useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const [hasSearched, setHasSearched] = React.useState(false);
  const [selectedUser, setSelectedUser] = React.useState<UserSearchResult | null>(null);

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

    const timer = setTimeout(async () => {
      try {
        // Safe case-insensitive query on username or display_name
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

      {/* Results Container */}
      <div className="space-y-3">
        {isSearching && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50"
              >
                <div className="flex items-center gap-3 flex-1">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="space-y-2 flex-1 max-w-xs">
                    <Skeleton className="h-4 w-3/4 rounded" />
                    <Skeleton className="h-3 w-1/2 rounded" />
                  </div>
                </div>
                <Skeleton className="h-8 w-20 rounded-lg" />
              </div>
            ))}
          </div>
        )}

        {!isSearching && results.length > 0 && (
          <div className="space-y-2.5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 px-1">
              Search Results ({results.length})
            </h4>

            {results.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-zinc-700 transition-all"
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <Avatar
                    src={user.avatar_url}
                    name={user.display_name || user.username}
                    size="lg"
                    status={user.status}
                  />
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {user.display_name}
                    </h4>
                    <p className="truncate text-xs text-heat-600 dark:text-heat-400 font-medium">
                      @{user.username}
                    </p>
                    {user.bio && (
                      <p className="truncate text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {user.bio}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setSelectedUser(user)}
                    className="gap-1 text-xs"
                  >
                    <User className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">View Profile</span>
                  </Button>

                  <Button
                    variant="heat"
                    size="sm"
                    onClick={() => {
                      if (onSelectUser) onSelectUser(user);
                      else setSelectedUser(user);
                    }}
                    className="gap-1 text-xs"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>Start Chat</span>
                  </Button>
                </div>
              </div>
            ))}
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
              description="Search for a username or display name to get started."
            />
          </div>
        )}
      </div>

      {/* User Profile View Dialog */}
      <UserProfileDialog
        user={selectedUser}
        isOpen={Boolean(selectedUser)}
        onClose={() => setSelectedUser(null)}
        onStartChat={(user) => {
          setSelectedUser(null);
          if (onSelectUser) onSelectUser(user as UserSearchResult);
        }}
      />
    </div>
  );
}
