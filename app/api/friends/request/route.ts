import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
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
    const { recipientId } = body;

    if (!recipientId || typeof recipientId !== "string") {
      return NextResponse.json({ error: "RECIPIENT_ID_REQUIRED" }, { status: 400 });
    }

    if (recipientId === user.id) {
      return NextResponse.json({ error: "CANNOT_FRIEND_SELF" }, { status: 400 });
    }

    // Call atomic send_friend_request RPC
    const { data, error } = await supabase.rpc("send_friend_request", {
      p_recipient_id: recipientId,
    });

    if (error) {
      if (error.message.includes("BLOCKED_USER")) {
        return NextResponse.json(
          { error: "BLOCKED_USER", message: "You cannot send a friend request to this user." },
          { status: 403 }
        );
      }
      if (error.message.includes("PRIVACY_RESTRICTED")) {
        return NextResponse.json(
          { error: "PRIVACY_RESTRICTED", message: "This person doesn't accept friend requests." },
          { status: 403 }
        );
      }
      if (error.message.includes("ALREADY_FRIENDS")) {
        return NextResponse.json(
          { error: "ALREADY_FRIENDS", message: "You are already friends with this user." },
          { status: 409 }
        );
      }
      if (error.message.includes("CANNOT_FRIEND_SELF")) {
        return NextResponse.json({ error: "CANNOT_FRIEND_SELF" }, { status: 400 });
      }

      console.error("[Heat Chat] send_friend_request RPC error:", error.message);
      return NextResponse.json({ error: "FAILED_TO_SEND_REQUEST" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      ...((data as Record<string, any>) || {}),
    });
  } catch (err: any) {
    console.error("[Heat Chat] POST /api/friends/request error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
