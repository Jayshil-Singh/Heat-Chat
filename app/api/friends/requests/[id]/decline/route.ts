import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: requestId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { data, error } = await supabase.rpc("decline_friend_request", {
      p_friendship_id: requestId,
    });

    if (error) {
      if (error.message.includes("REQUEST_NOT_FOUND")) {
        return NextResponse.json({ error: "REQUEST_NOT_FOUND" }, { status: 404 });
      }
      if (error.message.includes("REQUEST_NOT_YOURS")) {
        return NextResponse.json({ error: "FORBIDDEN", message: "Only the recipient can decline this request." }, { status: 403 });
      }
      if (error.message.includes("REQUEST_NOT_PENDING")) {
        return NextResponse.json({ error: "REQUEST_NOT_PENDING", message: "This request is no longer pending." }, { status: 409 });
      }

      console.error("[Heat Chat] decline_friend_request RPC error:", error.message);
      return NextResponse.json({ error: "DECLINE_FAILED" }, { status: 500 });
    }

    return NextResponse.json({ success: true, ...((data as Record<string, any>) || {}) });
  } catch (err: any) {
    console.error("[Heat Chat] POST /api/friends/requests/[id]/decline error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
