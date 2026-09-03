"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./use-auth";
import type { MemberRole } from "@/types/database";
import type { GroupPermissions } from "@/types/chat";

export function useGroupManagement(conversationId: string | null) {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const supabase = React.useMemo(() => createClient(), []);

  const addMembers = async (
    newUserIds: string[]
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user?.id || !conversationId) return { success: false, error: "Not authenticated or invalid group" };
    if (!newUserIds || newUserIds.length === 0) return { success: false, error: "No users selected" };

    setIsLoading(true);
    setError(null);
    try {
      const { error: rpcError } = await (supabase.rpc as any)("add_group_members", {
        conv_id: conversationId,
        new_user_ids: newUserIds,
      });

      if (rpcError) {
        setError(rpcError.message);
        return { success: false, error: rpcError.message };
      }
      return { success: true };
    } catch (err: any) {
      const msg = err.message || "Failed to add members";
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setIsLoading(false);
    }
  };

  const removeMember = async (
    targetUserId: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user?.id || !conversationId) return { success: false, error: "Not authenticated or invalid group" };

    setIsLoading(true);
    setError(null);
    try {
      // 1. Primary: Server API route with complete RBAC & atomic removal
      const res = await fetch(`/api/groups/${conversationId}/members/${targetUserId}`, {
        method: "DELETE",
      });

      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        return { success: true };
      }

      if (json?.error?.message) {
        setError(json.error.message);
        return { success: false, error: json.error.message };
      }

      // 2. Fallback: Direct RPC call with jsonb / error handling
      const { data: rpcData, error: rpcError } = await (supabase.rpc as any)("remove_group_member", {
        conv_id: conversationId,
        target_user_id: targetUserId,
      });

      if (rpcError) {
        setError(rpcError.message);
        return { success: false, error: rpcError.message };
      }

      if (rpcData && typeof rpcData === "object" && rpcData.success === false) {
        const msg = rpcData.message || "Failed to remove member";
        setError(msg);
        return { success: false, error: msg };
      }

      return { success: true };
    } catch (err: any) {
      const msg = err.message || "Failed to remove member";
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setIsLoading(false);
    }
  };

  const updateMemberRole = async (
    targetUserId: string,
    newRole: MemberRole
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user?.id || !conversationId) return { success: false, error: "Not authenticated or invalid group" };

    setIsLoading(true);
    setError(null);
    try {
      const { error: rpcError } = await (supabase.rpc as any)("update_group_member_role", {
        conv_id: conversationId,
        target_user_id: targetUserId,
        new_role: newRole,
      });

      if (rpcError) {
        setError(rpcError.message);
        return { success: false, error: rpcError.message };
      }
      return { success: true };
    } catch (err: any) {
      const msg = err.message || "Failed to update role";
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setIsLoading(false);
    }
  };

  const updateGroupMetadata = async (metadata: {
    name?: string;
    description?: string;
    avatarUrl?: string | null;
    coverUrl?: string | null;
    privacy?: "public" | "private";
    permissions?: GroupPermissions;
  }): Promise<{ success: boolean; error?: string }> => {
    if (!user?.id || !conversationId) return { success: false, error: "Not authenticated or invalid group" };

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metadata),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        const msg = json.error?.message || "Failed to update group metadata";
        setError(msg);
        return { success: false, error: msg };
      }
      return { success: true };
    } catch (err: any) {
      const msg = err.message || "Failed to update group metadata";
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setIsLoading(false);
    }
  };

  const updateGroupDetails = async (
    newName: string,
    newAvatarUrl?: string | null
  ): Promise<{ success: boolean; error?: string }> => {
    return updateGroupMetadata({ name: newName, avatarUrl: newAvatarUrl });
  };

  const sendDirectInvitation = async (
    inviteeId: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user?.id || !conversationId) return { success: false, error: "Not authenticated or invalid group" };

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${conversationId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteeId }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        const msg = json.error?.message || "Failed to send invitation";
        setError(msg);
        return { success: false, error: msg };
      }
      return { success: true };
    } catch (err: any) {
      const msg = err.message || "Failed to send invitation";
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setIsLoading(false);
    }
  };

  const leaveGroup = async (): Promise<{ success: boolean; error?: string }> => {
    if (!user?.id || !conversationId) return { success: false, error: "Not authenticated or invalid group" };

    setIsLoading(true);
    setError(null);
    try {
      const { error: rpcError } = await (supabase.rpc as any)("leave_group", {
        conv_id: conversationId,
      });

      if (rpcError) {
        setError(rpcError.message);
        return { success: false, error: rpcError.message };
      }
      return { success: true };
    } catch (err: any) {
      const msg = err.message || "Failed to leave group";
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setIsLoading(false);
    }
  };

  const deleteGroup = async (): Promise<{ success: boolean; error?: string }> => {
    if (!user?.id || !conversationId) return { success: false, error: "Not authenticated or invalid group" };

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${conversationId}`, {
        method: "DELETE",
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        const msg = json.error?.message || "Failed to delete group";
        setError(msg);
        return { success: false, error: msg };
      }
      return { success: true };
    } catch (err: any) {
      const msg = err.message || "Failed to delete group";
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    error,
    addMembers,
    removeMember,
    updateMemberRole,
    updateGroupDetails,
    updateGroupMetadata,
    sendDirectInvitation,
    leaveGroup,
    deleteGroup,
  };
}
