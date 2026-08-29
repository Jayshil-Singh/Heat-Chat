import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission, validateHierarchyConstraint } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { createClient } from "@/lib/supabase/server";
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
  const auth = await requireAdminPermission("users.delete", { requireRecentMfa: true });
  if (auth.errorResponse || !auth.session) return auth.errorResponse!;

  const { id: userId } = await context.params;

  try {
    const { searchParams } = new URL(request.url);
    const reason = searchParams.get("reason") || "User deleted by admin";

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

    // Mark as disabled / soft delete
    const { error: delErr } = await supabase
      .from("profiles")
      .update({
        is_disabled: true,
        status: "offline",
        force_logout_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 400 });
    }

    await logAdminAction({
      session: auth.session,
      action: "USER_DELETED",
      targetType: "user",
      targetId: userId,
      reason,
    });

    return NextResponse.json({ success: true, message: "User disabled/deleted successfully." });
  } catch (err) {
    console.error("User delete API error:", err);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
