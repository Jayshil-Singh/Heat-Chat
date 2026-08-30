import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId: targetUserId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { data, error } = await supabase.rpc("get_mutual_friends", {
      p_viewer_id: user.id,
      p_target_id: targetUserId,
    });

    if (error) {
      console.error("[Heat Chat] get_mutual_friends RPC error:", error.message);
      return NextResponse.json({ error: "FAILED_TO_FETCH_MUTUAL_FRIENDS" }, { status: 500 });
    }

    return NextResponse.json({
      count: (data as any)?.count || 0,
      profiles: (data as any)?.profiles || [],
    });
  } catch (err: any) {
    console.error("[Heat Chat] GET /api/friends/mutual/[userId] error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
