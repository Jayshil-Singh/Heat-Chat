import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { createClient } from "@/lib/supabase/server";
import { createAdminServiceClient } from "@/lib/supabase/admin";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminPermission("users.delete", { requireRecentMfa: true, maxMfaAgeMinutes: 10 });
  if (auth.errorResponse || !auth.session) return auth.errorResponse!;

  if (!auth.session.roles.includes("SuperAdmin") && !auth.session.isPrimarySuperAdmin) {
    return NextResponse.json(
      {
        error: "FORBIDDEN_SUPERADMIN_REQUIRED",
        message: "Access denied: Reconciling deletion operations strictly requires SuperAdmin role.",
      },
      { status: 403 }
    );
  }

  const { id: operationId } = await context.params;

  try {
    const supabase = await createClient();
    const adminClient = createAdminServiceClient();

    // 1. Atomic Lock & Initiation
    const { data: lockResult, error: lockErr } = await supabase.rpc(
      "admin_start_deletion_reconciliation",
      { p_operation_id: operationId }
    );

    if (lockErr) {
      console.error("Failed to acquire reconciliation lock:", lockErr.message);
      return NextResponse.json({ error: "Failed to initiate reconciliation." }, { status: 500 });
    }

    const lockObj = lockResult as {
      status: string;
      deletion_id?: string;
      target_user_id?: string;
      target_email?: string;
      target_username?: string;
      target_display_name?: string;
      previous_state?: string;
      storage_paths?: string[];
      retry_count?: number;
      completed_at?: string;
      reconciled_by?: string;
    };

    if (lockObj.status === "NOT_FOUND") {
      return NextResponse.json({ error: "Deletion operation record not found." }, { status: 404 });
    }

    if (lockObj.status === "ALREADY_COMPLETED") {
      return NextResponse.json({
        success: true,
        message: "Operation has already completed successfully.",
        state: "ALREADY_COMPLETED",
        completedAt: lockObj.completed_at,
      });
    }

    if (lockObj.status === "IN_PROGRESS") {
      return NextResponse.json({
        success: true,
        message: "Reconciliation is actively being processed by another administrator.",
        state: "IN_PROGRESS",
      });
    }

    const targetUserId = lockObj.target_user_id!;
    const previousState = lockObj.previous_state || "UNKNOWN";

    // 2. Audit: Reconciliation Started
    await logAdminAction({
      session: auth.session,
      action: "USER_DELETION_RECONCILIATION_STARTED",
      targetType: "user",
      targetId: targetUserId,
      reason: `Administrative reconciliation started for operation ${operationId}`,
      metadata: {
        operation_id: operationId,
        target_user_id: targetUserId,
        target_email: lockObj.target_email || "unknown",
        previous_state: previousState,
        retry_count: lockObj.retry_count || 1,
      },
    });

    // 3. Step A: Clean Storage Files if paths remain
    const storagePaths = lockObj.storage_paths || [];
    if (storagePaths.length > 0) {
      try {
        await adminClient.storage.from("chat-attachments").remove(storagePaths);
      } catch (storageErr: any) {
        console.warn("Storage cleanup warning during reconciliation:", storageErr?.message);
      }
    }

    // 4. Step B: Purge Application Data if profile still exists
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", targetUserId)
      .maybeSingle();

    if (existingProfile) {
      await supabase.rpc("admin_advance_deletion_state", {
        p_deletion_id: operationId,
        p_next_state: "DELETING_APPLICATION_DATA",
      });

      const { error: rpcErr } = await supabase.rpc("admin_delete_user", {
        p_target_user_id: targetUserId,
        p_reason: "Administrative reconciliation purge",
      });

      if (rpcErr) {
        await supabase.rpc("admin_advance_deletion_state", {
          p_deletion_id: operationId,
          p_next_state: "FAILED_REQUIRES_RECONCILIATION",
          p_last_error: `Reconciliation DB error: ${rpcErr.message}`,
        });

        await logAdminAction({
          session: auth.session,
          action: "USER_DELETION_RECONCILIATION_FAILED",
          targetType: "user",
          targetId: targetUserId,
          reason: `Database purge failed during reconciliation: ${rpcErr.message}`,
          result: "FAILURE",
          metadata: {
            operation_id: operationId,
            target_user_id: targetUserId,
            stage: "DELETING_APPLICATION_DATA",
            error: rpcErr.message,
          },
        });

        return NextResponse.json(
          { error: "Database purge failed during reconciliation. Please retry." },
          { status: 500 }
        );
      }
    }

    // 5. Step C: Purge Supabase Auth User Identity if still present
    await supabase.rpc("admin_advance_deletion_state", {
      p_deletion_id: operationId,
      p_next_state: "DELETING_AUTH",
    });

    try {
      await adminClient.auth.admin.deleteUser(targetUserId);
    } catch (authErr: any) {
      const errMsg = authErr?.message || "";
      if (!errMsg.toLowerCase().includes("user not found")) {
        await supabase.rpc("admin_advance_deletion_state", {
          p_deletion_id: operationId,
          p_next_state: "FAILED_REQUIRES_RECONCILIATION",
          p_last_error: `Reconciliation Auth error: ${errMsg}`,
        });

        await logAdminAction({
          session: auth.session,
          action: "USER_DELETION_RECONCILIATION_FAILED",
          targetType: "user",
          targetId: targetUserId,
          reason: `Auth user deletion failed during reconciliation: ${errMsg}`,
          result: "FAILURE",
          metadata: {
            operation_id: operationId,
            target_user_id: targetUserId,
            stage: "DELETING_AUTH",
            error: errMsg,
          },
        });

        return NextResponse.json(
          { error: "Auth deletion failed during reconciliation. Please retry." },
          { status: 500 }
        );
      }
    }

    // 6. Step D: Mark Completed & Audit
    await supabase.rpc("admin_advance_deletion_state", {
      p_deletion_id: operationId,
      p_next_state: "COMPLETED",
    });

    await logAdminAction({
      session: auth.session,
      action: "USER_DELETION_RECONCILIATION_COMPLETED",
      targetType: "user",
      targetId: targetUserId,
      reason: `Deletion operation ${operationId} successfully reconciled`,
      result: "SUCCESS",
      metadata: {
        operation_id: operationId,
        target_user_id: targetUserId,
        target_email: lockObj.target_email || "unknown",
        previous_state: previousState,
        new_state: "COMPLETED",
      },
    });

    return NextResponse.json({
      success: true,
      message: "User deletion operation reconciled and completed successfully.",
      state: "COMPLETED",
      operationId,
      deletedUserId: targetUserId,
    });
  } catch (err: any) {
    console.error("Reconciliation error:", err);
    return NextResponse.json({ error: "Reconciliation encountered an internal error." }, { status: 500 });
  }
}
