import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/auth";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const auth = await requireAdminPermission("users.delete");
  if (auth.errorResponse || !auth.session) return auth.errorResponse!;

  if (!auth.session.roles.includes("SuperAdmin") && !auth.session.isPrimarySuperAdmin) {
    return NextResponse.json(
      {
        error: "FORBIDDEN_SUPERADMIN_REQUIRED",
        message: "Access denied: Viewing deletion operations requires SuperAdmin role.",
      },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const timeoutMinutes = Math.max(1, Math.min(60, parseInt(searchParams.get("timeoutMinutes") || "5", 10)));

    const supabase = await createClient();

    const { data: operations, error } = await supabase.rpc("admin_get_stuck_deletions", {
      p_timeout_minutes: timeoutMinutes,
    });

    if (error) {
      console.error("Error loading deletion operations:", error.message);
      return NextResponse.json({ error: "Failed to load deletion operations." }, { status: 500 });
    }

    const ops = operations || [];
    const stuckCount = ops.filter((o) => o.is_stuck).length;
    const failedCount = ops.filter((o) => o.state === "FAILED_REQUIRES_RECONCILIATION").length;
    const inProgressCount = ops.filter((o) =>
      ["DELETION_REQUESTED", "DELETING_STORAGE", "DELETING_APPLICATION_DATA", "DELETING_AUTH"].includes(o.state)
    ).length;

    // Sanitize any internal database error messages before returning to UI
    const sanitizedOps = ops.map((op) => ({
      ...op,
      last_error: op.last_error
        ? op.last_error.replace(/PGRES_\w+/g, "").replace(/error:\s*/i, "").trim()
        : null,
    }));

    return NextResponse.json({
      operations: sanitizedOps,
      summary: {
        total: ops.length,
        stuck: stuckCount,
        failed: failedCount,
        in_progress: inProgressCount,
        timeoutMinutes,
      },
    });
  } catch (err: any) {
    console.error("Deletion operations API error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
