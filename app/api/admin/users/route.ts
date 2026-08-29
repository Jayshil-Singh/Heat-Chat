import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { createClient } from "@/lib/supabase/server";
import type { AdminRoleName, AdminUserSummary } from "@/types/admin";
import { ROLE_HIERARCHY } from "@/types/admin";

export async function GET(request: NextRequest) {
  const auth = await requireAdminPermission("users.view");
  if (auth.errorResponse) return auth.errorResponse;

  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") || "").trim();
  const statusFilter = searchParams.get("status") || "all";
  const roleFilter = searchParams.get("role") || "all";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(10, parseInt(searchParams.get("limit") || "20", 10)));
  const offset = (page - 1) * limit;

  try {
    const supabase = await createClient();

    let query = supabase
      .from("profiles")
      .select(
        "id, username, display_name, avatar_url, bio, status, created_at, updated_at, last_seen, is_suspended, suspended_until, suspension_reason, is_disabled, force_logout_at",
        { count: "exact" }
      );

    if (search) {
      query = query.or(`username.ilike.%${search}%,display_name.ilike.%${search}%`);
    }

    if (statusFilter === "suspended") {
      query = query.eq("is_suspended", true);
    } else if (statusFilter === "disabled") {
      query = query.eq("is_disabled", true);
    } else if (statusFilter === "active") {
      query = query.eq("is_suspended", false).eq("is_disabled", false);
    }

    query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

    const { data: profiles, count, error } = await query;

    if (error) {
      console.error("Error fetching users:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch administrative roles for all returned profiles
    const userIds = (profiles || []).map((p) => p.id);
    let rolesMap: Record<string, AdminRoleName[]> = {};

    if (userIds.length > 0) {
      const { data: userRoles } = await supabase
        .from("admin_user_roles")
        .select("user_id, admin_roles(name)")
        .in("user_id", userIds);

      if (userRoles) {
        userRoles.forEach((ur) => {
          const roleName = (ur.admin_roles as unknown as { name: AdminRoleName })?.name;
          if (roleName) {
            if (!rolesMap[ur.user_id]) rolesMap[ur.user_id] = [];
            rolesMap[ur.user_id].push(roleName);
          }
        });
      }
    }

    // Apply role filter if requested
    let resultProfiles = profiles || [];
    if (roleFilter !== "all") {
      resultProfiles = resultProfiles.filter((p) => (rolesMap[p.id] || []).includes(roleFilter as AdminRoleName));
    }

    const formattedUsers: AdminUserSummary[] = resultProfiles.map((p) => {
      const roles = rolesMap[p.id] || [];
      const topRoleLevel = roles.reduce((max, r) => Math.max(max, ROLE_HIERARCHY[r] || 0), 0);
      return {
        id: p.id,
        username: p.username,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        bio: p.bio,
        status: p.status,
        created_at: p.created_at,
        updated_at: p.updated_at,
        last_seen: p.last_seen,
        is_suspended: Boolean(p.is_suspended),
        suspended_until: p.suspended_until,
        suspension_reason: p.suspension_reason,
        is_disabled: Boolean(p.is_disabled),
        force_logout_at: p.force_logout_at,
        roles,
        top_role_level: topRoleLevel,
      };
    });

    return NextResponse.json({
      users: formattedUsers,
      total: count || formattedUsers.length,
      page,
      limit,
      totalPages: Math.ceil((count || formattedUsers.length) / limit),
    });
  } catch (err) {
    console.error("Users list API error:", err);
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminPermission("users.create");
  if (auth.errorResponse || !auth.session) return auth.errorResponse!;

  try {
    const body = await request.json();
    const { email, password, username, displayName, reason } = body;

    if (!email || !password || !username || !displayName) {
      return NextResponse.json(
        { error: "Validation error: email, password, username, and displayName are required." },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          username: username.toLowerCase().trim(),
          display_name: displayName.trim(),
        },
      },
    });

    if (signUpErr || !signUpData.user) {
      return NextResponse.json({ error: signUpErr?.message || "Failed to create user" }, { status: 400 });
    }

    await logAdminAction({
      session: auth.session,
      action: "USER_CREATED",
      targetType: "user",
      targetId: signUpData.user.id,
      reason: reason || "User created via administrative control panel",
      newValue: { email, username, displayName },
    });

    return NextResponse.json({ success: true, user: signUpData.user }, { status: 201 });
  } catch (err) {
    console.error("Create user API error:", err);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
