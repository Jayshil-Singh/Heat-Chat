import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission, validateHierarchyConstraint } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { createClient } from "@/lib/supabase/server";
import { createAdminServiceClient } from "@/lib/supabase/admin";
import type { AdminRoleName, AdminUserSummary } from "@/types/admin";
import { ROLE_HIERARCHY } from "@/types/admin";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminPermission("users.view");
  if (auth.errorResponse) return auth.errorResponse;

  const { id: userId } = await context.params;

  try {
    const supabase = await createClient();

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error || !profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Fetch user roles
    const { data: userRoles } = await supabase
      .from("admin_user_roles")
      .select("role_id, admin_roles(id, name, hierarchy_level)")
      .eq("user_id", userId);

    const roles: AdminRoleName[] = [];
    let topRoleLevel = 0;
    (userRoles || []).forEach((ur) => {
      const r = ur.admin_roles as unknown as { name: AdminRoleName; hierarchy_level: number };
      if (r?.name) {
        roles.push(r.name);
        topRoleLevel = Math.max(topRoleLevel, r.hierarchy_level || ROLE_HIERARCHY[r.name] || 0);
      }
    });

    // Fetch moderation reports for user
    const { data: reports } = await supabase
      .from("moderation_reports")
      .select("*")
      .eq("target_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    // Fetch audit history on this target
    const { data: auditHistory } = await supabase
      .from("admin_audit_logs")
      .select("*")
      .eq("target_type", "user")
      .eq("target_id", userId)
      .order("created_at", { ascending: false })
      .limit(15);

    const userSummary: AdminUserSummary = {
      id: profile.id,
      username: profile.username,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
      bio: profile.bio,
      status: profile.status,
      created_at: profile.created_at,
      updated_at: profile.updated_at,
      last_seen: profile.last_seen,
      is_suspended: Boolean(profile.is_suspended),
      suspended_until: profile.suspended_until,
      suspension_reason: profile.suspension_reason,
      is_disabled: Boolean(profile.is_disabled),
      force_logout_at: profile.force_logout_at,
      roles,
      top_role_level: topRoleLevel,
    };

    return NextResponse.json({
      user: userSummary,
      reports: reports || [],
      auditHistory: auditHistory || [],
    });
  } catch (err) {
    console.error("User detail API error:", err);
    return NextResponse.json({ error: "Failed to fetch user details" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminPermission("users.edit");
  if (auth.errorResponse || !auth.session) return auth.errorResponse!;

  const { id: userId } = await context.params;

  try {
    const body = await request.json();
    const { displayName, bio, reason } = body;
    const supabase = await createClient();

    const { data: oldProfile } = await supabase
      .from("profiles")
      .select("display_name, bio")
      .eq("id", userId)
      .single();

    const updates: { display_name?: string; bio?: string } = {};
    if (typeof displayName === "string" && displayName.trim()) {
      updates.display_name = displayName.trim();
    }
    if (typeof bio === "string") {
      updates.bio = bio.trim();
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No update fields provided." }, { status: 400 });
    }

    const { data: updated, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", userId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await logAdminAction({
      session: auth.session,
      action: "USER_UPDATED",
      targetType: "user",
      targetId: userId,
      reason: reason || "User profile updated by admin",
      oldValue: oldProfile,
      newValue: updates,
    });

    return NextResponse.json({ success: true, user: updated });
  } catch (err) {
    console.error("User edit API error:", err);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminPermission("users.delete", { requireRecentMfa: true, maxMfaAgeMinutes: 10 });
  if (auth.errorResponse || !auth.session) return auth.errorResponse!;

  // 1. Strict SuperAdmin Role Requirement
  if (!auth.session.roles.includes("SuperAdmin") && !auth.session.isPrimarySuperAdmin) {
    return NextResponse.json(
      {
        error: "FORBIDDEN_SUPERADMIN_REQUIRED",
        message: "Access denied: Permanent user deletion is strictly restricted to SuperAdmin.",
      },
      { status: 403 }
    );
  }

  const { id: userId } = await context.params;

  try {
    let body: { confirmation?: string; reason?: string; requestId?: string } = {};
    try {
      body = await request.json();
    } catch {
      // Body may be empty if passed via query params
    }

    const { searchParams } = new URL(request.url);
    const confirmation = body.confirmation || searchParams.get("confirmation") || "";
    const reason = (body.reason || searchParams.get("reason") || "").trim();

    if (!reason || reason.length < 3) {
      return NextResponse.json(
        { error: "A justification reason (minimum 3 characters) is required for permanent deletion." },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const adminClient = createAdminServiceClient();

    // 2. Idempotency Check: Existing Durable Deletion State
    const { data: existingDeletion } = await supabase
      .from("admin_user_deletions")
      .select("*")
      .eq("target_user_id", userId)
      .maybeSingle();

    if (existingDeletion) {
      if (existingDeletion.state === "COMPLETED") {
        return NextResponse.json({
          success: true,
          message: "User has already been permanently deleted.",
          state: "ALREADY_DELETED",
          deletedUserId: userId,
          completedAt: existingDeletion.completed_at,
          operationId: existingDeletion.id,
        });
      }

      // Check if another concurrent deletion request is currently active (< 30s)
      const isRecent =
        new Date().getTime() - new Date(existingDeletion.updated_at).getTime() < 30 * 1000;
      if (
        isRecent &&
        ["DELETION_REQUESTED", "DELETING_STORAGE", "DELETING_APPLICATION_DATA", "DELETING_AUTH"].includes(
          existingDeletion.state
        )
      ) {
        return NextResponse.json({
          success: true,
          message: "User deletion is already in progress.",
          state: "IN_PROGRESS",
          deletedUserId: userId,
          operationId: existingDeletion.id,
        });
      }
    }

    // 3. Fetch Target User Profile and Auth Details
    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .eq("id", userId)
      .maybeSingle();

    let targetEmail = "";
    let targetAuthExists = false;
    try {
      const { data: targetAuthUser } = await adminClient.auth.admin.getUserById(userId);
      if (targetAuthUser?.user) {
        targetEmail = targetAuthUser.user.email || "";
        targetAuthExists = true;
      }
    } catch {
      targetAuthExists = false;
    }

    if (!targetProfile && !targetAuthExists && !existingDeletion) {
      return NextResponse.json({
        success: true,
        message: "Target user not found or already deleted.",
        state: "ALREADY_DELETED",
        deletedUserId: userId,
      });
    }

    // 4. Hierarchy & Self Deletion Checks
    if (auth.session.userId === userId) {
      return NextResponse.json(
        { error: "Security violation: Administrators cannot delete their own account." },
        { status: 403 }
      );
    }

    // Check if target is Primary SuperAdmin
    const { data: targetRoles } = await supabase
      .from("admin_user_roles")
      .select("is_primary_superadmin, admin_roles(hierarchy_level)")
      .eq("user_id", userId);

    const isTargetPrimary = (targetRoles || []).some((r) => r.is_primary_superadmin);
    if (isTargetPrimary) {
      return NextResponse.json(
        { error: "Security violation: Primary SuperAdmin account cannot be deleted." },
        { status: 403 }
      );
    }

    let targetTopLevel = 0;
    (targetRoles || []).forEach((tr) => {
      const r = tr.admin_roles as unknown as { hierarchy_level: number };
      if (r?.hierarchy_level) targetTopLevel = Math.max(targetTopLevel, r.hierarchy_level);
    });

    const hierarchyCheck = validateHierarchyConstraint(auth.session, userId, targetTopLevel, isTargetPrimary);
    if (!hierarchyCheck.allowed) {
      return NextResponse.json({ error: hierarchyCheck.reason }, { status: 403 });
    }

    // 5. Exact Confirmation Phrase Verification
    const expectedEmailPhrase = targetEmail ? `DELETE ${targetEmail.trim()}` : "";
    const expectedUsernamePhrase = targetProfile?.username ? `DELETE ${targetProfile.username.trim()}` : "";

    const isMatch =
      (expectedEmailPhrase && confirmation.trim() === expectedEmailPhrase) ||
      (expectedUsernamePhrase && confirmation.trim() === expectedUsernamePhrase) ||
      confirmation.trim() === `DELETE ${userId}`;

    if (!isMatch) {
      return NextResponse.json(
        {
          error: `Invalid confirmation phrase. Please type '${expectedEmailPhrase || expectedUsernamePhrase}' exactly.`,
        },
        { status: 400 }
      );
    }

    // 6. Discover and Index Target Attachments for Storage Deletion
    let storageFilePaths: string[] = existingDeletion?.storage_paths_to_delete || [];
    if (storageFilePaths.length === 0) {
      try {
        const { data: userMessages } = await supabase
          .from("messages")
          .select("id")
          .eq("sender_id", userId);

        if (userMessages && userMessages.length > 0) {
          const msgIds = userMessages.map((m) => m.id);
          const { data: userAttachments } = await supabase
            .from("attachments")
            .select("storage_path")
            .in("message_id", msgIds);

          if (userAttachments && userAttachments.length > 0) {
            storageFilePaths = userAttachments.map((a) => a.storage_path).filter(Boolean);
          }
        }
      } catch (storageScanErr) {
        console.warn("Storage discovery warning:", storageScanErr);
      }
    }

    // 7. Atomic State Machine Initiation (Server-side Persistence)
    const { data: initResult, error: initErr } = await supabase.rpc("admin_initiate_user_deletion", {
      p_target_user_id: userId,
      p_reason: reason,
      p_target_email: targetEmail,
      p_target_username: targetProfile?.username || "unknown",
      p_target_display_name: targetProfile?.display_name || "unknown",
      p_storage_paths: storageFilePaths,
    });

    if (initErr) {
      console.error("Failed to initiate durable deletion state:", initErr.message);
      return NextResponse.json(
        { error: `Failed to initiate durable deletion: ${initErr.message}` },
        { status: 500 }
      );
    }

    const initObj = initResult as { status: string; deletion_id: string };
    if (initObj.status === "ALREADY_COMPLETED") {
      return NextResponse.json({
        success: true,
        message: "User has already been permanently deleted.",
        state: "ALREADY_DELETED",
        deletedUserId: userId,
      });
    }
    if (initObj.status === "IN_PROGRESS") {
      return NextResponse.json({
        success: true,
        message: "User deletion is already in progress.",
        state: "IN_PROGRESS",
        deletedUserId: userId,
      });
    }

    const deletionId = initObj.deletion_id;

    // 8. Stage 1: Storage Deletion
    await supabase.rpc("admin_advance_deletion_state", {
      p_deletion_id: deletionId,
      p_next_state: "DELETING_STORAGE",
    });

    if (storageFilePaths.length > 0) {
      try {
        await adminClient.storage.from("chat-attachments").remove(storageFilePaths);
      } catch (storageErr: any) {
        console.warn("Storage cleanup warning during deletion:", storageErr?.message);
        await supabase.rpc("admin_advance_deletion_state", {
          p_deletion_id: deletionId,
          p_next_state: "DELETING_STORAGE",
          p_last_error: storageErr?.message || "Storage partial failure",
        });
      }
    }

    // 9. Stage 2: Database Application Data Deletion via SECURITY DEFINER RPC
    await supabase.rpc("admin_advance_deletion_state", {
      p_deletion_id: deletionId,
      p_next_state: "DELETING_APPLICATION_DATA",
    });

    const { error: rpcErr } = await supabase.rpc("admin_delete_user", {
      p_target_user_id: userId,
      p_reason: reason,
    });

    if (rpcErr) {
      console.error("Database user deletion RPC error:", rpcErr.message);
      await supabase.rpc("admin_advance_deletion_state", {
        p_deletion_id: deletionId,
        p_next_state: "FAILED_REQUIRES_RECONCILIATION",
        p_last_error: `Database deletion failed: ${rpcErr.message}`,
      });

      await logAdminAction({
        session: auth.session,
        action: "USER_DELETION_FAILED",
        targetType: "user",
        targetId: userId,
        reason: `Database purge failed: ${rpcErr.message}`,
        result: "FAILURE",
        metadata: {
          operation_id: deletionId,
          target_user_id: userId,
          stage: "DELETING_APPLICATION_DATA",
          error: rpcErr.message,
        },
      });

      return NextResponse.json(
        { error: `Database user deletion failed: ${rpcErr.message}` },
        { status: 500 }
      );
    }

    // 10. Stage 3: Supabase Auth Identity Permanent Deletion
    await supabase.rpc("admin_advance_deletion_state", {
      p_deletion_id: deletionId,
      p_next_state: "DELETING_AUTH",
    });

    try {
      await adminClient.auth.admin.deleteUser(userId);
    } catch (authDelErr: any) {
      const errMsg = authDelErr?.message || "";
      if (!errMsg.toLowerCase().includes("user not found")) {
        console.error("Auth user deletion error:", errMsg);
        await supabase.rpc("admin_advance_deletion_state", {
          p_deletion_id: deletionId,
          p_next_state: "FAILED_REQUIRES_RECONCILIATION",
          p_last_error: `Auth identity deletion failed: ${errMsg}`,
        });

        await logAdminAction({
          session: auth.session,
          action: "USER_DELETION_RECONCILIATION_REQUIRED",
          targetType: "user",
          targetId: userId,
          reason: `Auth user deletion failed after DB purge: ${errMsg}`,
          result: "FAILURE",
          metadata: {
            operation_id: deletionId,
            target_user_id: userId,
            stage: "DELETING_AUTH",
            error: errMsg,
          },
        });

        return NextResponse.json(
          {
            error: `Permanent deletion partially succeeded (database purged), but Auth service failed: ${errMsg}. Retry to complete reconciliation.`,
            requiresReconciliation: true,
          },
          { status: 500 }
        );
      }
    }

    // 11. Stage 4: Deletion Completed & Final Immutable Audit Log
    await supabase.rpc("admin_advance_deletion_state", {
      p_deletion_id: deletionId,
      p_next_state: "COMPLETED",
    });

    await logAdminAction({
      session: auth.session,
      action: "USER_PERMANENTLY_DELETED",
      targetType: "user",
      targetId: userId,
      reason,
      metadata: {
        operation_id: deletionId,
        target_user_id: userId,
        target_email: targetEmail,
        target_username: targetProfile?.username || "unknown",
        target_display_name: targetProfile?.display_name || "unknown",
        reason,
        deleted_by_superadmin: auth.session.userId,
        result: "SUCCESS",
      },
    });

    return NextResponse.json({
      success: true,
      message: "User permanently deleted.",
      state: "COMPLETED",
      deletedUserId: userId,
      operationId: deletionId,
    });
  } catch (err: any) {
    console.error("User permanent delete API error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to permanently delete user" },
      { status: 500 }
    );
  }
}
