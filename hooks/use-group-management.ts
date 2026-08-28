"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./use-auth";
import type { MemberRole } from "@/types/database";

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
      const { error: rpcError } = await (supabase.rpc as any)("remove_group_member", {
        conv_id: conversationId,
        target_user_id: targetUserId,
      });

      if (rpcError) {
        setError(rpcError.message);
        return { success: false, error: rpcError.message };
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

  const updateGroupDetails = async (
    newName: string,
    newAvatarUrl?: string | null
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user?.id || !conversationId) return { success: false, error: "Not authenticated or invalid group" };
    const trimmed = newName.trim();
    if (!trimmed) return { success: false, error: "Group name cannot be empty" };

    setIsLoading(true);
    setError(null);
    try {
      const { error: rpcError } = await (supabase.rpc as any)("update_group_details", {
        conv_id: conversationId,
        new_name: trimmed,
        new_avatar_url: newAvatarUrl || null,
      });

      if (rpcError) {
        setError(rpcError.message);
        return { success: false, error: rpcError.message };
      }
      return { success: true };
    } catch (err: any) {
      const msg = err.message || "Failed to update group details";
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

  return {
    isLoading,
    error,
    addMembers,
    removeMember,
    updateMemberRole,
    updateGroupDetails,
    leaveGroup,
  };
}
