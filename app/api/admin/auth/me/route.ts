import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";

export async function GET() {
  const authResult = await getAdminSession();
  if (!authResult.success || !authResult.session) {
    return NextResponse.json({ error: authResult.error || "UNAUTHENTICATED" }, { status: 401 });
  }

  const { session } = authResult;

  return NextResponse.json({
    user: {
      id: session.userId,
      email: session.email,
      username: session.username,
      displayName: session.displayName,
      roles: session.roles,
      topRoleLevel: session.topRoleLevel,
      isPrimarySuperAdmin: session.isPrimarySuperAdmin,
      isSuperAdmin: session.roles.includes("SuperAdmin") || session.isPrimarySuperAdmin,
      permissions: Array.from(session.permissions),
    },
  });
}
