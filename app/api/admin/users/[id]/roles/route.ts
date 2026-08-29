import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission, validateHierarchyConstraint } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { createClient } from "@/lib/supabase/server";
import type { AdminRoleName } from "@/types/admin";
import { ROLE_HIERARCHY } from "@/types/admin";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminPermission("roles.manage");
  if (auth.errorResponse || !auth.session) return auth.errorResponse!;

  const { id: userId } = await context.params;

  try {
    const body = await request.json();
    const { roleId, reason } = body;

    if (!roleId || !reason || reason.trim().length < 3) {
      return NextResponse.json(
        { error: "Validation error: roleId and reason (min 3 chars) are required." },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Check target role hierarchy level
    const { data: targetRole, error: roleErr } = await supabase
      .from("admin_roles")
      .select("id, name, hierarchy_level")
      .eq("id", roleId)
      .single();

    if (roleErr || !targetRole) {
      return NextResponse.json({ error: "Role not found." }, { status: 404 });
    }

    const targetRoleLevel = targetRole.hierarchy_level || ROLE_HIERARCHY[targetRole.name as AdminRoleName] || 0;
    const hierarchyCheck = validateHierarchyConstraint(auth.session, userId, targetRoleLevel);

    if (!hierarchyCheck.allowed) {
      return NextResponse.json({ error: hierarchyCheck.reason }, { status: 403 });
    }

    // Call hardened DB RPC
    const { error: rpcErr } = await supabase.rpc("admin_assign_role", {
      p_target_user_id: userId,
      p_role_id: roleId,
      p_reason: reason.trim(),
    });

    if (rpcErr) {
      // Fallback direct insert
      const { error: insertErr } = await supabase
        .from("admin_user_roles")
        .insert({
          user_id: userId,
          role_id: roleId,
          assigned_by: auth.session.userId,
        });

      if (insertErr && !insertErr.message.includes("duplicate key")) {
        return NextResponse.json({ error: insertErr.message }, { status: 400 });
      }

      await logAdminAction({
        session: auth.session,
        action: "ROLE_ASSIGNED",
        targetType: "role",
        targetId: userId,
        reason: reason.trim(),
        newValue: { role_id: roleId, role_name: targetRole.name },
      });
    }

    return NextResponse.json({ success: true, message: `Role ${targetRole.name} assigned successfully.` });
  } catch (err) {
    console.error("Assign role API error:", err);
    return NextResponse.json({ error: "Failed to assign role" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminPermission("roles.manage");
  if (auth.errorResponse || !auth.session) return auth.errorResponse!;

  const { id: userId } = await context.params;

  try {
    const { searchParams } = new URL(request.url);
    const roleId = searchParams.get("roleId");
    const reason = searchParams.get("reason") || "Role revoked by admin";

    if (!roleId) {
      return NextResponse.json({ error: "roleId query parameter is required." }, { status: 400 });
    }

    const supabase = await createClient();

    const { data: targetRole, error: roleErr } = await supabase
      .from("admin_roles")
      .select("id, name, hierarchy_level")
      .eq("id", roleId)
      .single();

    if (roleErr || !targetRole) {
      return NextResponse.json({ error: "Role not found." }, { status: 404 });
    }

    const targetRoleLevel = targetRole.hierarchy_level || ROLE_HIERARCHY[targetRole.name as AdminRoleName] || 0;
    const hierarchyCheck = validateHierarchyConstraint(auth.session, userId, targetRoleLevel);

    if (!hierarchyCheck.allowed) {
      return NextResponse.json({ error: hierarchyCheck.reason }, { status: 403 });
    }

    // Call hardened DB RPC
    const { error: rpcErr } = await supabase.rpc("admin_remove_role", {
      p_target_user_id: userId,
      p_role_id: roleId,
      p_reason: reason.trim(),
    });

    if (rpcErr) {
      // Fallback direct delete
      const { error: delErr } = await supabase
        .from("admin_user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role_id", roleId);

      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 400 });
      }

      await logAdminAction({
        session: auth.session,
        action: "ROLE_REMOVED",
        targetType: "role",
        targetId: userId,
        reason: reason.trim(),
        oldValue: { role_id: roleId, role_name: targetRole.name },
      });
    }

    return NextResponse.json({ success: true, message: `Role ${targetRole.name} removed successfully.` });
  } catch (err) {
    console.error("Remove role API error:", err);
    return NextResponse.json({ error: "Failed to remove role" }, { status: 500 });
  }
}
