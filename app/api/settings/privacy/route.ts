import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { VALID_PRIVACY_AUDIENCES } from "@/lib/validation/profile";
import type { PrivacyAudience } from "@/types/database";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    let { data: settings, error: fetchError } = await supabase
      .from("user_privacy_settings")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!settings) {
      const { data: newSettings, error: insertError } = await supabase
        .from("user_privacy_settings")
        .insert({ user_id: user.id })
        .select("*")
        .single();

      if (insertError) {
        console.error("[Heat Chat] Failed to auto-provision privacy settings:", insertError.message);
        return NextResponse.json({ error: "PRIVACY_PROVISION_FAILED" }, { status: 500 });
      }
      settings = newSettings;
    }

    return NextResponse.json({ settings });
  } catch (err: any) {
    console.error("[Heat Chat] GET /api/settings/privacy error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await request.json();
    const updates: Record<string, any> = {};

    const audienceFields = [
      "who_can_message",
      "who_can_friend_request",
      "who_can_see_profile",
      "who_can_see_avatar",
      "who_can_see_status",
      "who_can_see_online",
      "who_can_see_last_seen",
      "who_can_add_to_groups",
      "who_can_call",
    ] as const;

    for (const field of audienceFields) {
      if (body[field] !== undefined) {
        if (!VALID_PRIVACY_AUDIENCES.includes(body[field] as PrivacyAudience)) {
          return NextResponse.json(
            { error: "INVALID_AUDIENCE", message: `Invalid audience setting for ${field}.` },
            { status: 400 }
          );
        }
        updates[field] = body[field];
      }
    }

    if (body.read_receipts_enabled !== undefined) {
      updates.read_receipts_enabled = Boolean(body.read_receipts_enabled);
    }

    if (body.typing_indicators_enabled !== undefined) {
      updates.typing_indicators_enabled = Boolean(body.typing_indicators_enabled);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "NO_UPDATES_PROVIDED" }, { status: 400 });
    }

    updates.updated_at = new Date().toISOString();

    const { data: updatedSettings, error: updateError } = await supabase
      .from("user_privacy_settings")
      .upsert({
        user_id: user.id,
        ...updates,
      })
      .select("*")
      .single();

    if (updateError) {
      console.error("[Heat Chat] Privacy settings update error:", updateError.message);
      return NextResponse.json({ error: "PRIVACY_UPDATE_FAILED" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      settings: updatedSettings,
    });
  } catch (err: any) {
    console.error("[Heat Chat] PATCH /api/settings/privacy error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
