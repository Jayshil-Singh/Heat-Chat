import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { createClient } from "@/lib/supabase/server";
import type { AdminPermissionKey, AdminRole } from "@/types/admin";

export async function GET() {
  const auth = await requireAdminPermission("roles.view");
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const supabase = await createClient();

    const { data: roles, error: rolesErr } = await supabase
      .from("admin_roles")
      .select("*")
      .order("hierarchy_level", { ascending: false });

    if (rolesErr) {
      return NextResponse.json({ error: rolesErr.message }, { status: 500 });
    }

    // Fetch permissions for each role
    const { data: rolePerms } = await supabase
      .from("admin_role_permissions")
      .select("role_id, admin_permissions(key)");

    const permMap: Record<string, AdminPermissionKey[]> = {};
    (rolePerms || []).forEach((rp) => {
      const key = (rp.admin_permissions as unknown as { key: AdminPermissionKey })?.key;
      if (key) {
        if (!permMap[rp.role_id]) permMap[rp.role_id] = [];
        permMap[rp.role_id].push(key);
      }
    });

    const enrichedRoles: AdminRole[] = (roles || []).map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      hierarchy_level: r.hierarchy_level,
      is_system: r.is_system,
      created_at: r.created_at,
      updated_at: r.updated_at,
      permissions: permMap[r.id] || [],
    }));

    return NextResponse.json({ roles: enrichedRoles });
  } catch (err) {
    console.error("Roles API error:", err);
    return NextResponse.json({ error: "Failed to fetch roles" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminPermission("roles.manage");
  if (auth.errorResponse || !auth.session) return auth.errorResponse!;

  try {
    const body = await request.json();
    const { name, description, hierarchyLevel, permissionKeys, reason } = body;

    if (!name || !description || typeof hierarchyLevel !== "number") {
      return NextResponse.json({ error: "name, description, and hierarchyLevel are required." }, { status: 400 });
    }

    if (hierarchyLevel >= auth.session.topRoleLevel) {
      return NextResponse.json(
        { error: `Hierarchy violation: cannot create a role with level (${hierarchyLevel}) >= your level (${auth.session.topRoleLevel}).` },
        { status: 403 }
      );
    }

    const supabase = await createClient();

    const { data: createdRole, error: roleErr } = await supabase
      .from("admin_roles")
      .insert({
        name: name.trim(),
        description: description.trim(),
        hierarchy_level: hierarchyLevel,
        is_system: false,
      })
      .select()
      .single();

    if (roleErr) {
      return NextResponse.json({ error: roleErr.message }, { status: 400 });
    }

    if (Array.isArray(permissionKeys) && permissionKeys.length > 0) {
      const { data: perms } = await supabase
        .from("admin_permissions")
        .select("id, key")
        .in("key", permissionKeys);

      if (perms && perms.length > 0) {
        const mappings = perms.map((p) => ({ role_id: createdRole.id, permission_id: p.id }));
        await supabase.from("admin_role_permissions").insert(mappings);
      }
    }

    await logAdminAction({
      session: auth.session,
      action: "ROLE_CREATED",
      targetType: "role",
      targetId: createdRole.id,
      reason: reason || "Custom admin role created",
      newValue: { name, description, hierarchyLevel, permissionKeys },
    });

    return NextResponse.json({ success: true, role: createdRole }, { status: 201 });
  } catch (err) {
    console.error("Create role API error:", err);
    return NextResponse.json({ error: "Failed to create role" }, { status: 500 });
  }
}
