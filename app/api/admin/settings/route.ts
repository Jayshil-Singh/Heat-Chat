import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { createClient } from "@/lib/supabase/server";
import type { SystemSetting } from "@/types/admin";

export async function GET() {
  const auth = await requireAdminPermission("settings.view");
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const supabase = await createClient();

    const { data: settings, error } = await supabase
      .from("system_settings")
      .select("*")
      .order("category", { ascending: true })
      .order("key", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ settings: (settings as SystemSetting[]) || [] });
  } catch (err) {
    console.error("Settings API error:", err);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminPermission("settings.manage", { requireRecentMfa: true });
  if (auth.errorResponse || !auth.session) return auth.errorResponse!;

  try {
    const body = await request.json();
    const { key, value, reason } = body;

    if (!key || value === undefined || !reason || reason.trim().length < 3) {
      return NextResponse.json(
        { error: "Validation error: key, value, and reason (min 3 chars) are required." },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Call hardened DB RPC
    const { error: rpcErr } = await supabase.rpc("admin_update_system_setting", {
      p_key: key,
      p_value: value,
      p_reason: reason.trim(),
    });

    if (rpcErr) {
      // Fallback direct update
      const { data: oldSetting } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", key)
        .single();

      const { error: updErr } = await supabase
        .from("system_settings")
        .update({
          value,
          updated_by: auth.session.userId,
          updated_at: new Date().toISOString(),
        })
        .eq("key", key);

      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 400 });
      }

      await logAdminAction({
        session: auth.session,
        action: "SETTING_CHANGED",
        targetType: "setting",
        targetId: key,
        reason: reason.trim(),
        oldValue: oldSetting ? { value: oldSetting.value } : null,
        newValue: { value },
      });
    }

    return NextResponse.json({ success: true, message: `Setting '${key}' updated successfully.` });
  } catch (err) {
    console.error("Update setting API error:", err);
    return NextResponse.json({ error: "Failed to update setting" }, { status: 500 });
  }
}
