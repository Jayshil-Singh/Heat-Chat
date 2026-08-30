import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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

    // Fetch all accepted friendships where current user is user_id OR friend_id
    const { data: friendships, error: friendshipsError } = await supabase
      .from("friendships")
      .select("id, user_id, friend_id, status, created_at, updated_at")
      .eq("status", "accepted")
      .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
      .order("updated_at", { ascending: false });

    if (friendshipsError) {
      console.error("[Heat Chat] GET /api/friends error:", friendshipsError.message);
      return NextResponse.json({ error: "FAILED_TO_FETCH_FRIENDS" }, { status: 500 });
    }

    if (!friendships || friendships.length === 0) {
      return NextResponse.json({ friends: [] });
    }

    // Collect other user IDs
    const friendMap = new Map<string, { friendshipId: string; since: string }>();
    friendships.forEach((f) => {
      const friendUid = f.user_id === user.id ? f.friend_id : f.user_id;
      friendMap.set(friendUid, { friendshipId: f.id, since: f.created_at });
    });

    const friendUids = Array.from(friendMap.keys());

    // Fetch friend profiles
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, status, presence_status, last_seen_at, status_message, status_emoji")
      .in("id", friendUids);

    if (profilesError) {
      console.error("[Heat Chat] Friend profiles fetch error:", profilesError.message);
      return NextResponse.json({ error: "FAILED_TO_FETCH_PROFILES" }, { status: 500 });
    }

    // Filter out any blocked users in either direction
    const { data: blockedList } = await supabase
      .from("blocked_users")
      .select("user_id, blocked_user_id")
      .or(`user_id.eq.${user.id},blocked_user_id.eq.${user.id}`);

    const blockedUids = new Set<string>();
    (blockedList || []).forEach((b) => {
      blockedUids.add(b.user_id === user.id ? b.blocked_user_id : b.user_id);
    });

    const formattedFriends = (profiles || [])
      .filter((p) => !blockedUids.has(p.id))
      .map((p) => {
        const meta = friendMap.get(p.id);
        return {
          friendshipId: meta?.friendshipId,
          friendSince: meta?.since,
          profile: p,
        };
      });

    return NextResponse.json({ friends: formattedFriends });
  } catch (err: any) {
    console.error("[Heat Chat] GET /api/friends error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
