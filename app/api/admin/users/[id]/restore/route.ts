import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminPermission("users.restore");
  if (auth.errorResponse || !auth.session) return auth.errorResponse!;

  const { id: userId } = await context.params;

  try {
    const body = await request.json();
    const { reason } = body;

    if (!reason || reason.trim().length < 3) {
      return NextResponse.json(
        { error: "A valid reason (minimum 3 characters) is required to restore an account." },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Call hardened DB RPC
    const { error: rpcErr } = await supabase.rpc("admin_restore_user", {
      p_target_user_id: userId,
      p_reason: reason.trim(),
    });

    if (rpcErr) {
      // Fallback direct update
      const { error: updErr } = await supabase
        .from("profiles")
        .update({
          is_suspended: false,
          suspended_until: null,
          suspension_reason: null,
          is_disabled: false,
        })
        .eq("id", userId);

      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 400 });
      }

      await logAdminAction({
        session: auth.session,
        action: "USER_RESTORED",
        targetType: "user",
        targetId: userId,
        reason: reason.trim(),
        newValue: { is_suspended: false, is_disabled: false },
      });
    }

    return NextResponse.json({ success: true, message: "User account restored successfully." });
  } catch (err) {
    console.error("User restore API error:", err);
    return NextResponse.json({ error: "Failed to restore user" }, { status: 500 });
  }
}
