"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { classifyNetworkError, type NetworkErrorType } from "@/lib/utils/network-error";
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
  const [errorType, setErrorType] = React.useState<NetworkErrorType | null>(null);
  const [isRetryable, setIsRetryable] = React.useState<boolean>(false);

  // Retain last known valid discoverable state in a ref
  const lastKnownDiscoverableRef = React.useRef<boolean>(false);

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
      lastKnownDiscoverableRef.current = false;
      setIsPreferenceLoading(false);
      return;
    }

    // SSR-safe offline guard: retain last known state without attempting network
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setIsPreferenceLoading(false);
      return;
    }

    try {
      const { data, error: rpcError } = await (supabase.rpc as any)("get_my_discoverability");
      if (rpcError) {
        const classified = classifyNetworkError(rpcError);

        // Do not perform cascading fallback requests during network outages
        if (
          classified.type === "NETWORK_OFFLINE" ||
          classified.type === "NETWORK_CONNECTION_CLOSED" ||
          classified.type === "NETWORK_TIMEOUT"
        ) {
          // Retain last known valid state
          setIsDiscoverable(lastKnownDiscoverableRef.current);
          return;
        }

        // If RPC is missing or not deployed yet, attempt fallback query to discovery_preferences
        try {
          const { data: pref, error: prefError } = await (supabase
            .from("discovery_preferences" as any)
            .select("discoverable")
            .eq("user_id", user.id)
            .maybeSingle() as any);

          if (!prefError && pref) {
            const val = Boolean(pref.discoverable);
            lastKnownDiscoverableRef.current = val;
            setIsDiscoverable(val);
          }
        } catch {
          // Retain last known state
          setIsDiscoverable(lastKnownDiscoverableRef.current);
        }
      } else {
        const val = Boolean(data);
        lastKnownDiscoverableRef.current = val;
        setIsDiscoverable(val);
      }
    } catch (err) {
      const classified = classifyNetworkError(err);
      // Retain last known valid state without crashing or forcing false on transient error
      setIsDiscoverable(lastKnownDiscoverableRef.current);
      if (
        classified.type !== "NETWORK_OFFLINE" &&
        classified.type !== "NETWORK_CONNECTION_CLOSED"
      ) {
        console.warn("[Heat Chat] fetchDiscoverability exception:", classified.message);
      }
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

    // SSR-safe offline check
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const classified = classifyNetworkError(new Error("offline"));
      setError(classified.message);
      setErrorType("NETWORK_OFFLINE");
      setIsRetryable(true);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setErrorType(null);
    setIsRetryable(false);

    try {
      const queryParam = debouncedQuery.length >= 2 ? debouncedQuery : null;
      const { data, error: rpcError } = await (supabase.rpc as any)("discover_people", {
        search_query: queryParam,
        result_limit: 30,
        result_offset: 0,
      });

      if (rpcError) {
        const classified = classifyNetworkError(rpcError);
        setError(classified.message);
        setErrorType(classified.type);
        setIsRetryable(classified.isRetryable);

        if (classified.type === "AUTH_EXPIRED") {
          setPeople([]);
        }
        // Retain people on transient network errors if we already had them
      } else {
        setPeople((data as unknown as DiscoverablePerson[]) || []);
        setError(null);
        setErrorType(null);
        setIsRetryable(false);
      }
    } catch (err) {
      const classified = classifyNetworkError(err);
      setError(classified.message);
      setErrorType(classified.type);
      setIsRetryable(classified.isRetryable);

      if (classified.type === "AUTH_EXPIRED") {
        setPeople([]);
      }
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
        const classified = classifyNetworkError(rpcError);
        setError(classified.message);
        setErrorType(classified.type);
        setIsRetryable(classified.isRetryable);
        return;
      }

      const val = Boolean(data);
      lastKnownDiscoverableRef.current = val;
      setIsDiscoverable(val);
      setError(null);
    } catch (err) {
      const classified = classifyNetworkError(err);
      setError(classified.message);
      setErrorType(classified.type);
      setIsRetryable(classified.isRetryable);
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
          const classified = classifyNetworkError(rpcError);
          fetchPeople();
          return { success: false, error: classified.message };
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
        const classified = classifyNetworkError(err);
        fetchPeople();
        return { success: false, error: classified.message };
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
          const classified = classifyNetworkError(rpcError);
          fetchPeople();
          return { success: false, error: classified.message };
        }

        return { success: true };
      } catch (err: any) {
        const classified = classifyNetworkError(err);
        fetchPeople();
        return { success: false, error: classified.message };
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
          const classified = classifyNetworkError(rpcError);
          fetchPeople();
          return { success: false, error: classified.message };
        }

        return { success: true };
      } catch (err: any) {
        const classified = classifyNetworkError(err);
        fetchPeople();
        return { success: false, error: classified.message };
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
    errorType,
    isRetryable,
    searchQuery,
    setSearchQuery,
    refreshPeople: fetchPeople,
    retry: fetchPeople,
    retryDiscoverability: fetchDiscoverability,
    sendRequest,
    cancelRequest,
    acceptRequest,
  };
}
