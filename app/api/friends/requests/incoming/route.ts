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

    // Incoming requests: friend_id = user.id AND status = 'pending'
    const { data: requests, error: requestsError } = await supabase
      .from("friendships")
      .select("id, user_id, created_at, updated_at")
      .eq("friend_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (requestsError) {
      console.error("[Heat Chat] GET /api/friends/requests/incoming error:", requestsError.message);
      return NextResponse.json({ error: "FAILED_TO_FETCH_REQUESTS" }, { status: 500 });
    }

    if (!requests || requests.length === 0) {
      return NextResponse.json({ requests: [] });
    }

    const senderIds = requests.map((r) => r.user_id);

    // Fetch sender profiles
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, status_message, status_emoji, presence_status")
      .in("id", senderIds);

    if (profilesError) {
      console.error("[Heat Chat] Sender profiles fetch error:", profilesError.message);
      return NextResponse.json({ error: "FAILED_TO_FETCH_PROFILES" }, { status: 500 });
    }

    // Check blocking filter
    const { data: blockedList } = await supabase
      .from("blocked_users")
      .select("user_id, blocked_user_id")
      .or(`user_id.eq.${user.id},blocked_user_id.eq.${user.id}`);

    const blockedUids = new Set<string>();
    (blockedList || []).forEach((b) => {
      blockedUids.add(b.user_id === user.id ? b.blocked_user_id : b.user_id);
    });

    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

    // Fetch mutual friend counts for each sender
    const formattedRequests = await Promise.all(
      requests
        .filter((r) => !blockedUids.has(r.user_id))
        .map(async (r) => {
          const profile = profileMap.get(r.user_id);
          const { data: mutualData } = await supabase.rpc("get_mutual_friends", {
            p_viewer_id: user.id,
            p_target_id: r.user_id,
          });

          return {
            requestId: r.id,
            createdAt: r.created_at,
            sender: profile,
            mutualCount: (mutualData as any)?.count || 0,
            mutualProfiles: (mutualData as any)?.profiles || [],
          };
        })
    );

    return NextResponse.json({ requests: formattedRequests });
  } catch (err: any) {
    console.error("[Heat Chat] GET /api/friends/requests/incoming error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
