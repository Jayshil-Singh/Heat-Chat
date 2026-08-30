import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { normalizeUsername } from "@/lib/validation/profile";
import type { PublicProfileDto, PresenceStatus } from "@/types/database";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    if (!username) {
      return NextResponse.json({ error: "USERNAME_REQUIRED" }, { status: 400 });
    }

    const normalized = normalizeUsername(username);
    const supabase = await createClient();

    // Get current viewer (if any)
    const {
      data: { user: viewer },
    } = await supabase.auth.getUser();

    // 1. Fetch target profile
    const { data: targetProfile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .ilike("username", normalized)
      .single();

    if (profileError || !targetProfile) {
      return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    }

    const isSelf = viewer ? viewer.id === targetProfile.id : false;

    // 2. Fetch target privacy settings
    const { data: privacySettings } = await supabase
      .from("user_privacy_settings")
      .select("*")
      .eq("user_id", targetProfile.id)
      .single();

    // Default privacy rules if record missing
    const privacy = privacySettings || {
      who_can_message: "everyone",
      who_can_friend_request: "everyone",
      who_can_see_profile: "everyone",
      who_can_see_avatar: "everyone",
      who_can_see_status: "everyone",
      who_can_see_online: "everyone",
      who_can_see_last_seen: "everyone",
      who_can_add_to_groups: "everyone",
      who_can_call: "everyone",
    };

    let isFriend = false;
    let isBlocked = false;
    let hasBlockedViewer = false;

    if (viewer && !isSelf) {
      // Check if viewer blocked target
      const { data: viewerBlock } = await supabase
        .from("blocked_users")
        .select("id")
        .eq("user_id", viewer.id)
        .eq("blocked_user_id", targetProfile.id)
        .limit(1);

      if (viewerBlock && viewerBlock.length > 0) {
        isBlocked = true;
      }

      // Check if target blocked viewer
      const { data: targetBlock } = await supabase
        .from("blocked_users")
        .select("id")
        .eq("user_id", targetProfile.id)
        .eq("blocked_user_id", viewer.id)
        .limit(1);

      if (targetBlock && targetBlock.length > 0) {
        hasBlockedViewer = true;
      }

      // Check friendship
      const { data: friendship } = await supabase
        .from("friendships")
        .select("id, status")
        .or(
          `and(user_id.eq.${viewer.id},friend_id.eq.${targetProfile.id}),and(user_id.eq.${targetProfile.id},friend_id.eq.${viewer.id})`
        )
        .eq("status", "accepted")
        .limit(1);

      if (friendship && friendship.length > 0) {
        isFriend = true;
      }
    }

    // Determine field-level visibility
    let canSeeAvatar = true;
    let canSeeCover = true;
    let canSeeBio = true;
    let canSeeStatus = true;
    let canSeeOnline = true;
    let canSeeLastSeen = true;
    let canMessage = true;
    let canFriendRequest = true;

    if (isSelf) {
      // Self always sees all own fields
      canSeeAvatar = true;
      canSeeCover = true;
      canSeeBio = true;
      canSeeStatus = true;
      canSeeOnline = true;
      canSeeLastSeen = true;
      canMessage = true;
      canFriendRequest = false;
    } else if (isBlocked || hasBlockedViewer) {
      // Block overrides all visibility
      canSeeAvatar = false;
      canSeeCover = false;
      canSeeBio = false;
      canSeeStatus = false;
      canSeeOnline = false;
      canSeeLastSeen = false;
      canMessage = false;
      canFriendRequest = false;
    } else {
      // Check who_can_see_profile
      if (privacy.who_can_see_profile === "nobody") {
        canSeeBio = false;
      } else if (privacy.who_can_see_profile === "friends" && !isFriend) {
        canSeeBio = false;
      }

      // Check who_can_see_avatar
      if (privacy.who_can_see_avatar === "nobody") {
        canSeeAvatar = false;
        canSeeCover = false;
      } else if (privacy.who_can_see_avatar === "friends" && !isFriend) {
        canSeeAvatar = false;
        canSeeCover = false;
      }

      // Check who_can_see_status
      if (privacy.who_can_see_status === "nobody") {
        canSeeStatus = false;
      } else if (privacy.who_can_see_status === "friends" && !isFriend) {
        canSeeStatus = false;
      }

      // Check who_can_see_online
      if (privacy.who_can_see_online === "nobody") {
        canSeeOnline = false;
      } else if (privacy.who_can_see_online === "friends" && !isFriend) {
        canSeeOnline = false;
      }

      // Check who_can_see_last_seen
      if (privacy.who_can_see_last_seen === "nobody") {
        canSeeLastSeen = false;
      } else if (privacy.who_can_see_last_seen === "friends" && !isFriend) {
        canSeeLastSeen = false;
      }

      // Check who_can_message
      if (privacy.who_can_message === "nobody") {
        canMessage = false;
      } else if (privacy.who_can_message === "friends" && !isFriend) {
        canMessage = false;
      }

      // Check who_can_friend_request
      if (isFriend || !viewer) {
        canFriendRequest = false;
      } else if (privacy.who_can_friend_request === "nobody") {
        canFriendRequest = false;
      }
    }

    const sanitizedProfile: PublicProfileDto = {
      id: targetProfile.id,
      username: targetProfile.username,
      displayName: targetProfile.display_name,
      avatarUrl: canSeeAvatar ? targetProfile.avatar_url : null,
      coverUrl: canSeeCover ? targetProfile.cover_url : null,
      bio: canSeeBio ? targetProfile.bio : null,
      statusMessage: canSeeStatus ? targetProfile.status_message : null,
      statusEmoji: canSeeStatus ? targetProfile.status_emoji : null,
      presenceStatus: (canSeeOnline ? targetProfile.presence_status || "OFFLINE" : "OFFLINE") as PresenceStatus,
      lastSeenAt: canSeeLastSeen ? targetProfile.last_seen_at || targetProfile.last_seen : null,
      timezone: isSelf || isFriend ? targetProfile.timezone : null,
      language: isSelf ? targetProfile.language : null,
      isSelf,
      isFriend,
      isBlocked,
      hasBlockedViewer,
      canMessage,
      canFriendRequest,
    };

    return NextResponse.json({ profile: sanitizedProfile });
  } catch (err: any) {
    console.error("[Heat Chat] GET /api/users/[username] error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
