import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/auth";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const auth = await requireAdminPermission("permissions.view");
  if (auth.errorResponse) {
    const fallback = await requireAdminPermission("roles.view");
    if (fallback.errorResponse) return auth.errorResponse;
  }

  try {
    const supabase = await createClient();

    const { data: permissions, error } = await supabase
      .from("admin_permissions")
      .select("*")
      .order("category", { ascending: true })
      .order("key", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ permissions: permissions || [] });
  } catch (err) {
    console.error("Permissions API error:", err);
    return NextResponse.json({ error: "Failed to fetch permissions" }, { status: 500 });
  }
}
