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

    // Sent requests: user_id = user.id AND status = 'pending'
    const { data: requests, error: requestsError } = await supabase
      .from("friendships")
      .select("id, friend_id, created_at, updated_at")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (requestsError) {
      console.error("[Heat Chat] GET /api/friends/requests/sent error:", requestsError.message);
      return NextResponse.json({ error: "FAILED_TO_FETCH_SENT_REQUESTS" }, { status: 500 });
    }

    if (!requests || requests.length === 0) {
      return NextResponse.json({ requests: [] });
    }

    const recipientIds = requests.map((r) => r.friend_id);

    // Fetch recipient profiles
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, status_message, status_emoji, presence_status")
      .in("id", recipientIds);

    if (profilesError) {
      console.error("[Heat Chat] Recipient profiles fetch error:", profilesError.message);
      return NextResponse.json({ error: "FAILED_TO_FETCH_PROFILES" }, { status: 500 });
    }

    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

    const formattedRequests = await Promise.all(
      requests.map(async (r) => {
        const profile = profileMap.get(r.friend_id);
        const { data: mutualData } = await supabase.rpc("get_mutual_friends", {
          p_viewer_id: user.id,
          p_target_id: r.friend_id,
        });

        return {
          requestId: r.id,
          createdAt: r.created_at,
          recipient: profile,
          mutualCount: (mutualData as any)?.count || 0,
        };
      })
    );

    return NextResponse.json({ requests: formattedRequests });
  } catch (err: any) {
    console.error("[Heat Chat] GET /api/friends/requests/sent error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
