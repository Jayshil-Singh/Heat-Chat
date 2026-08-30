import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import {
  validateUsername,
  validateDisplayName,
  validateBio,
  validateStatusMessage,
  validateStatusEmoji,
  normalizeUsername,
  VALID_PRESENCE_STATUSES,
} from "@/lib/validation/profile";
import type { Database, PresenceStatus } from "@/types/database";

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

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

    // Fetch profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });
    }

    // Fetch privacy settings
    let { data: privacySettings } = await supabase
      .from("user_privacy_settings")
      .select("*")
      .eq("user_id", user.id)
      .single();

    // Auto-provision default privacy settings if missing
    if (!privacySettings) {
      const { data: newSettings } = await supabase
        .from("user_privacy_settings")
        .insert({ user_id: user.id })
        .select("*")
        .single();
      privacySettings = newSettings;
    }

    return NextResponse.json({
      profile: {
        ...profile,
        privacy_settings: privacySettings,
      },
    });
  } catch (err: any) {
    console.error("[Heat Chat] GET /api/profile error:", err);
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
    const {
      display_name,
      username,
      bio,
      status_message,
      status_emoji,
      presence_status,
      timezone,
      language,
      avatar_url,
      cover_url,
    } = body;

    const updates: ProfileUpdate = {};

    // Avatar URL
    if (avatar_url !== undefined) {
      updates.avatar_url = avatar_url;
    }

    // Cover URL
    if (cover_url !== undefined) {
      updates.cover_url = cover_url;
    }

    // Validate Display Name
    if (display_name !== undefined) {
      const validation = validateDisplayName(display_name);
      if (!validation.isValid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      updates.display_name = display_name.trim();
    }

    // Validate Username
    if (username !== undefined) {
      const validation = validateUsername(username);
      if (!validation.isValid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      const normalized = normalizeUsername(username);

      // Check uniqueness against other users
      const { data: existingUser } = await supabase
        .from("profiles")
        .select("id")
        .ilike("username", normalized)
        .neq("id", user.id)
        .limit(1);

      if (existingUser && existingUser.length > 0) {
        return NextResponse.json(
          { error: "USERNAME_TAKEN", message: "This username is already taken." },
          { status: 409 }
        );
      }
      updates.username = normalized;
    }

    // Validate Bio
    if (bio !== undefined) {
      const validation = validateBio(bio);
      if (!validation.isValid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      updates.bio = bio ? bio.trim() : null;
    }

    // Validate Status Message
    if (status_message !== undefined) {
      const validation = validateStatusMessage(status_message);
      if (!validation.isValid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      updates.status_message = status_message ? status_message.trim() : null;
    }

    // Validate Status Emoji
    if (status_emoji !== undefined) {
      const validation = validateStatusEmoji(status_emoji);
      if (!validation.isValid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      updates.status_emoji = status_emoji ? status_emoji.trim() : null;
    }

    // Validate Presence Status
    if (presence_status !== undefined) {
      if (!VALID_PRESENCE_STATUSES.includes(presence_status as PresenceStatus)) {
        return NextResponse.json({ error: "INVALID_PRESENCE_STATUS" }, { status: 400 });
      }
      updates.presence_status = presence_status;
    }

    // Validate Timezone
    if (timezone !== undefined && typeof timezone === "string") {
      if (timezone.length > 64) {
        return NextResponse.json({ error: "INVALID_TIMEZONE" }, { status: 400 });
      }
      updates.timezone = timezone.trim();
    }

    // Validate Language
    if (language !== undefined && typeof language === "string") {
      if (language.length < 2 || language.length > 10) {
        return NextResponse.json({ error: "INVALID_LANGUAGE" }, { status: 400 });
      }
      updates.language = language.trim().toLowerCase();
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "NO_UPDATES_PROVIDED" }, { status: 400 });
    }

    updates.updated_at = new Date().toISOString();

    const { data: updatedProfile, error: updateError } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", user.id)
      .select("*")
      .single();

    if (updateError) {
      console.error("[Heat Chat] Profile update error:", updateError.message);
      return NextResponse.json({ error: "PROFILE_UPDATE_FAILED" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      profile: updatedProfile,
    });
  } catch (err: any) {
    console.error("[Heat Chat] PATCH /api/profile error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
