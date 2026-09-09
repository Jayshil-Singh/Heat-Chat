"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { FriendRequestWithProfile } from "@/types/chat";

export function useFriendRequests() {
  const { user } = useAuth();
  const [incoming, setIncoming] = React.useState<FriendRequestWithProfile[]>([]);
  const [outgoing, setOutgoing] = React.useState<FriendRequestWithProfile[]>([]);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);

  const supabase = React.useMemo(() => createClient(), []);

  const fetchRequests = React.useCallback(async () => {
    if (!user?.id) {
      setIncoming([]);
      setOutgoing([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: rpcError } = await (supabase.rpc as any)("get_my_friend_requests");
      if (rpcError) {
        console.error("[Heat Chat] get_my_friend_requests error:", rpcError.message);
        setError("Could not load friend requests.");
      } else {
        const res = data as any;
        setIncoming(res?.incoming || []);
        setOutgoing(res?.outgoing || []);
      }
    } catch (err) {
      console.error("[Heat Chat] fetchRequests exception:", err);
      setError("Network error loading requests.");
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, supabase]);

  React.useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Accept request action
  const acceptRequest = React.useCallback(
    async (requestId: string): Promise<{ success: boolean; error?: string }> => {
      if (!user?.id) return { success: false, error: "Not authenticated" };

      // Optimistic removal from incoming list
      setIncoming((prev) => prev.filter((r) => r.requestId !== requestId));

      try {
        let rpcError: any = null;

        try {
          const apiRes = await fetch(`/api/friends/requests/${requestId}/accept`, {
            method: "POST",
          });
          if (!apiRes.ok) {
            const apiJson = await apiRes.json().catch(() => ({}));
            rpcError = new Error(apiJson.message || apiJson.error || "Failed to accept request");
          }
        } catch {
          const fallback = await (supabase.rpc as any)("accept_friend_request", {
            request_id: requestId,
          });
          rpcError = fallback.error;
        }

        if (rpcError) {
          fetchRequests();
          return { success: false, error: rpcError.message };
        }

        return { success: true };
      } catch (err: any) {
        fetchRequests();
        return { success: false, error: err.message || "Failed to accept request" };
      }
    },
    [user?.id, supabase, fetchRequests]
  );

  // Decline request action
  const declineRequest = React.useCallback(
    async (requestId: string): Promise<{ success: boolean; error?: string }> => {
      if (!user?.id) return { success: false, error: "Not authenticated" };

      // Optimistic removal
      setIncoming((prev) => prev.filter((r) => r.requestId !== requestId));

      try {
        const { error: rpcError } = await (supabase.rpc as any)("decline_friend_request", {
          request_id: requestId,
        });

        if (rpcError) {
          fetchRequests();
          return { success: false, error: rpcError.message };
        }

        return { success: true };
      } catch (err: any) {
        fetchRequests();
        return { success: false, error: err.message || "Failed to decline request" };
      }
    },
    [user?.id, supabase, fetchRequests]
  );

  // Cancel request action
  const cancelRequest = React.useCallback(
    async (requestId: string): Promise<{ success: boolean; error?: string }> => {
      if (!user?.id) return { success: false, error: "Not authenticated" };

      // Optimistic removal
      setOutgoing((prev) => prev.filter((r) => r.requestId !== requestId));

      try {
        const { error: rpcError } = await (supabase.rpc as any)("cancel_friend_request", {
          request_id: requestId,
        });

        if (rpcError) {
          fetchRequests();
          return { success: false, error: rpcError.message };
        }

        return { success: true };
      } catch (err: any) {
        fetchRequests();
        return { success: false, error: err.message || "Failed to cancel request" };
      }
    },
    [user?.id, supabase, fetchRequests]
  );

  return {
    incoming,
    outgoing,
    isLoading,
    error,
    refreshRequests: fetchRequests,
    acceptRequest,
    declineRequest,
    cancelRequest,
  };
}
