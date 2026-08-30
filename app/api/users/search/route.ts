import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() || "";

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    if (!query || query.length < 2) {
      return NextResponse.json({ users: [] });
    }

    // Search profiles by username or display_name (excluding self)
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, bio, presence_status, status_message, status_emoji")
      .neq("id", user.id)
      .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
      .limit(20);

    if (profilesError) {
      console.error("[Heat Chat] User search error:", profilesError.message);
      return NextResponse.json({ error: "SEARCH_FAILED" }, { status: 500 });
    }

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({ users: [] });
    }

    // Filter blocked users in both directions
    const { data: blockedList } = await supabase
      .from("blocked_users")
      .select("user_id, blocked_user_id")
      .or(`user_id.eq.${user.id},blocked_user_id.eq.${user.id}`);

    const blockedUids = new Set<string>();
    (blockedList || []).forEach((b) => {
      blockedUids.add(b.user_id === user.id ? b.blocked_user_id : b.user_id);
    });

    const filteredProfiles = profiles.filter((p) => !blockedUids.has(p.id));

    // Attach relationship state & mutual friends to each found profile
    const usersWithState = await Promise.all(
      filteredProfiles.map(async (p) => {
        const [relRes, mutualRes] = await Promise.all([
          supabase.rpc("get_user_relationship_state", {
            p_viewer_id: user.id,
            p_target_id: p.id,
          }),
          supabase.rpc("get_mutual_friends", {
            p_viewer_id: user.id,
            p_target_id: p.id,
          }),
        ]);

        return {
          profile: p,
          relationship: (relRes.data as any) || {
            friendship: "NONE",
            isBlocked: false,
            canMessage: true,
            canFriendRequest: true,
          },
          mutualCount: (mutualRes.data as any)?.count || 0,
        };
      })
    );

    return NextResponse.json({ users: usersWithState });
  } catch (err: any) {
    console.error("[Heat Chat] GET /api/users/search error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
