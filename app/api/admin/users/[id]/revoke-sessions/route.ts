import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminPermission("users.revoke_sessions");
  if (auth.errorResponse || !auth.session) return auth.errorResponse!;

  const { id: userId } = await context.params;

  try {
    const body = await request.json();
    const { reason } = body;

    const supabase = await createClient();

    // Set force_logout_at timestamp on profile to invalidate subsequent requests
    const forceLogoutTime = new Date().toISOString();
    const { error: updErr } = await supabase
      .from("profiles")
      .update({
        force_logout_at: forceLogoutTime,
        status: "offline",
      })
      .eq("id", userId);

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 400 });
    }

    // Record security event
    await supabase.from("admin_security_events").insert({
      event_type: "FORCE_LOGOUT",
      user_id: userId,
      severity: "warning",
      metadata: { initiated_by: auth.session.userId, reason: reason || "Administrative force logout" },
    });

    await logAdminAction({
      session: auth.session,
      action: "SESSIONS_REVOKED",
      targetType: "session",
      targetId: userId,
      reason: reason || "Administrator forced session revocation",
      newValue: { force_logout_at: forceLogoutTime },
    });

    return NextResponse.json({ success: true, message: "User sessions revoked successfully." });
  } catch (err) {
    console.error("Revoke sessions API error:", err);
    return NextResponse.json({ error: "Failed to revoke user sessions" }, { status: 500 });
  }
}
