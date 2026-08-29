import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission, validateHierarchyConstraint } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminPermission("users.suspend");
  if (auth.errorResponse || !auth.session) return auth.errorResponse!;

  const { id: userId } = await context.params;

  try {
    const body = await request.json();
    const { reason, durationHours } = body;

    if (!reason || reason.trim().length < 3) {
      return NextResponse.json(
        { error: "A valid reason (minimum 3 characters) is required for account suspension." },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Check target role hierarchy
    const { data: targetRoles } = await supabase
      .from("admin_user_roles")
      .select("admin_roles(hierarchy_level)")
      .eq("user_id", userId);

    let targetTopLevel = 0;
    (targetRoles || []).forEach((tr) => {
      const r = tr.admin_roles as unknown as { hierarchy_level: number };
      if (r?.hierarchy_level) targetTopLevel = Math.max(targetTopLevel, r.hierarchy_level);
    });

    const hierarchyCheck = validateHierarchyConstraint(auth.session, userId, targetTopLevel);
    if (!hierarchyCheck.allowed) {
      return NextResponse.json({ error: hierarchyCheck.reason }, { status: 403 });
    }

    // Call DB RPC
    const { data: rpcSuccess, error: rpcErr } = await supabase.rpc("admin_suspend_user", {
      p_target_user_id: userId,
      p_reason: reason.trim(),
      p_duration_hours: typeof durationHours === "number" ? durationHours : null,
    });

    if (rpcErr) {
      // Fallback direct update
      const suspendedUntil =
        typeof durationHours === "number" && durationHours > 0
          ? new Date(Date.now() + durationHours * 3600 * 1000).toISOString()
          : null;

      const { error: updErr } = await supabase
        .from("profiles")
        .update({
          is_suspended: true,
          suspended_until: suspendedUntil,
          suspension_reason: reason.trim(),
          force_logout_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 400 });
      }

      await logAdminAction({
        session: auth.session,
        action: "USER_SUSPENDED",
        targetType: "user",
        targetId: userId,
        reason: reason.trim(),
        newValue: { is_suspended: true, suspended_until: suspendedUntil, suspension_reason: reason.trim() },
      });
    }

    return NextResponse.json({ success: true, message: "User suspended successfully." });
  } catch (err) {
    console.error("User suspend API error:", err);
    return NextResponse.json({ error: "Failed to suspend user" }, { status: 500 });
  }
}
