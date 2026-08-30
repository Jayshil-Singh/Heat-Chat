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

    const { data: blockedList, error: fetchError } = await supabase
      .from("blocked_users")
      .select(`
        id,
        blocked_user_id,
        reason,
        created_at,
        blocked_profile:profiles!blocked_users_blocked_user_id_fkey(
          id,
          username,
          display_name,
          avatar_url
        )
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (fetchError) {
      console.error("[Heat Chat] Fetch blocked list error:", fetchError.message);
      return NextResponse.json({ error: "FETCH_BLOCKED_FAILED" }, { status: 500 });
    }

    const formatted = (blockedList || []).map((item: any) => ({
      id: item.id,
      blockedUserId: item.blocked_user_id,
      reason: item.reason,
      createdAt: item.created_at,
      profile: item.blocked_profile || {
        id: item.blocked_user_id,
        username: "user",
        display_name: "Blocked User",
        avatar_url: null,
      },
    }));

    return NextResponse.json({ blockedUsers: formatted });
  } catch (err: any) {
    console.error("[Heat Chat] GET /api/users/blocked error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
