"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { DiscoverablePerson } from "@/types/chat";

export interface UseDiscoverPeopleOptions {
  autoFetch?: boolean;
}

export function useDiscoverPeople(options: UseDiscoverPeopleOptions = {}) {
  const { autoFetch = true } = options;
  const { user } = useAuth();
  const [isDiscoverable, setIsDiscoverable] = React.useState<boolean>(false);
  const [isToggling, setIsToggling] = React.useState<boolean>(false);
  const [people, setPeople] = React.useState<DiscoverablePerson[]>([]);
  const [searchQuery, setSearchQuery] = React.useState<string>("");
  const [debouncedQuery, setDebouncedQuery] = React.useState<string>("");
  const [isLoading, setIsLoading] = React.useState<boolean>(autoFetch);
  const [isPreferenceLoading, setIsPreferenceLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);

  const supabase = React.useMemo(() => createClient(), []);

  // Debounce search input (350ms)
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch current user's discoverability preference
  const fetchDiscoverability = React.useCallback(async () => {
    if (!user?.id) {
      setIsDiscoverable(false);
      setIsPreferenceLoading(false);
      return;
    }

    try {
      const { data, error: rpcError } = await (supabase.rpc as any)("get_my_discoverability");
      if (rpcError) {
        console.warn("[Heat Chat] get_my_discoverability error:", rpcError.message);
        // Fallback query to discovery_preferences
        const { data: pref } = await (supabase
          .from("discovery_preferences" as any)
          .select("discoverable")
          .eq("user_id", user.id)
          .maybeSingle() as any);
        setIsDiscoverable(pref?.discoverable ?? false);
      } else {
        setIsDiscoverable(Boolean(data));
      }
    } catch (err) {
      console.warn("[Heat Chat] fetchDiscoverability exception:", err);
      setIsDiscoverable(false);
    } finally {
      setIsPreferenceLoading(false);
    }
  }, [user?.id, supabase]);

  // Fetch discoverable people
  const fetchPeople = React.useCallback(async () => {
    if (!user?.id) {
      setPeople([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const queryParam = debouncedQuery.length >= 2 ? debouncedQuery : null;
      const { data, error: rpcError } = await (supabase.rpc as any)("discover_people", {
        search_query: queryParam,
        result_limit: 30,
        result_offset: 0,
      });

      if (rpcError) {
        console.error("[Heat Chat] discover_people error:", rpcError.message);
        setError("Couldn't load people. Please try again.");
        setPeople([]);
      } else {
        setPeople((data as unknown as DiscoverablePerson[]) || []);
      }
    } catch (err) {
      console.error("[Heat Chat] fetchPeople exception:", err);
      setError("Network error while discovering people.");
      setPeople([]);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, debouncedQuery, supabase]);

  // Initial load
  React.useEffect(() => {
    fetchDiscoverability();
  }, [fetchDiscoverability]);

  React.useEffect(() => {
    if (autoFetch) {
      fetchPeople();
    }
  }, [autoFetch, fetchPeople]);

  // Toggle discoverability
  const toggleDiscoverability = React.useCallback(async () => {
    if (!user?.id || isToggling) return;
    const nextVal = !isDiscoverable;
    setIsToggling(true);

    try {
      const { data, error: rpcError } = await (supabase.rpc as any)("set_discoverability", {
        enabled: nextVal,
      });

      if (rpcError) {
        console.error("[Heat Chat] set_discoverability error:", rpcError.message);
        throw new Error(rpcError.message);
      }

      setIsDiscoverable(Boolean(data));
    } catch (err) {
      console.error("[Heat Chat] toggleDiscoverability error:", err);
    } finally {
      setIsToggling(false);
    }
  }, [user?.id, isDiscoverable, isToggling, supabase]);

  // Send friend request action
  const sendRequest = React.useCallback(
    async (targetUserId: string): Promise<{ success: boolean; error?: string }> => {
      if (!user?.id) return { success: false, error: "Not authenticated" };

      // Optimistic state update
      setPeople((prev) =>
        prev.map((p) =>
          p.user_id === targetUserId
            ? { ...p, relationship_status: "outgoing_pending" as const }
            : p
        )
      );

      try {
        const { data, error: rpcError } = await (supabase.rpc as any)("send_friend_request", {
          target_user_id: targetUserId,
        });

        if (rpcError) {
          // Revert optimistic update
          fetchPeople();
          return { success: false, error: rpcError.message };
        }

        const res = data as any;
        if (res?.status === "friends") {
          setPeople((prev) =>
            prev.map((p) =>
              p.user_id === targetUserId
                ? { ...p, relationship_status: "friends" as const }
                : p
            )
          );
        } else if (res?.requestId) {
          setPeople((prev) =>
            prev.map((p) =>
              p.user_id === targetUserId
                ? {
                    ...p,
                    relationship_status: "outgoing_pending" as const,
                    pending_request_id: res.requestId,
                  }
                : p
            )
          );
        }

        return { success: true };
      } catch (err: any) {
        fetchPeople();
        return { success: false, error: err.message || "Failed to send request" };
      }
    },
    [user?.id, supabase, fetchPeople]
  );

  // Cancel friend request action
  const cancelRequest = React.useCallback(
    async (requestId: string, targetUserId: string): Promise<{ success: boolean; error?: string }> => {
      if (!user?.id) return { success: false, error: "Not authenticated" };

      // Optimistic update
      setPeople((prev) =>
        prev.map((p) =>
          p.user_id === targetUserId
            ? { ...p, relationship_status: "none" as const, pending_request_id: null }
            : p
        )
      );

      try {
        const { error: rpcError } = await (supabase.rpc as any)("cancel_friend_request", {
          request_id: requestId,
        });

        if (rpcError) {
          fetchPeople();
          return { success: false, error: rpcError.message };
        }

        return { success: true };
      } catch (err: any) {
        fetchPeople();
        return { success: false, error: err.message || "Failed to cancel request" };
      }
    },
    [user?.id, supabase, fetchPeople]
  );

  // Accept friend request action
  const acceptRequest = React.useCallback(
    async (requestId: string, targetUserId: string): Promise<{ success: boolean; error?: string }> => {
      if (!user?.id) return { success: false, error: "Not authenticated" };

      // Optimistic update
      setPeople((prev) =>
        prev.map((p) =>
          p.user_id === targetUserId
            ? { ...p, relationship_status: "friends" as const, pending_request_id: null }
            : p
        )
      );

      try {
        const { error: rpcError } = await (supabase.rpc as any)("accept_friend_request", {
          request_id: requestId,
        });

        if (rpcError) {
          fetchPeople();
          return { success: false, error: rpcError.message };
        }

        return { success: true };
      } catch (err: any) {
        fetchPeople();
        return { success: false, error: err.message || "Failed to accept request" };
      }
    },
    [user?.id, supabase, fetchPeople]
  );

  return {
    isDiscoverable,
    isPreferenceLoading,
    isToggling,
    toggleDiscoverability,
    people,
    isLoading,
    error,
    searchQuery,
    setSearchQuery,
    refreshPeople: fetchPeople,
    sendRequest,
    cancelRequest,
    acceptRequest,
  };
}
