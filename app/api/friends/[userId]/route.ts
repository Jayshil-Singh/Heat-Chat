import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function DELETE(
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

    const { data, error } = await supabase.rpc("remove_friend", {
      p_target_user_id: targetUserId,
    });

    if (error) {
      console.error("[Heat Chat] remove_friend RPC error:", error.message);
      return NextResponse.json({ error: "FAILED_TO_REMOVE_FRIEND" }, { status: 500 });
    }

    return NextResponse.json({ success: true, ...((data as Record<string, any>) || {}) });
  } catch (err: any) {
    console.error("[Heat Chat] DELETE /api/friends/[userId] error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
