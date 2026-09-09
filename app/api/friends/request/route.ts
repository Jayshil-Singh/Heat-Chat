import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { sendWebPushToUser } from "@/lib/notifications/push-delivery";

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
      target_user_id: recipientId,
    });

    if (error) {
      if (error.message.includes("USER_BLOCKED") || error.message.includes("BLOCKED_USER")) {
        return NextResponse.json(
          { error: "BLOCKED_USER", message: "You cannot send a friend request to this user." },
          { status: 403 }
        );
      }
      if (error.message.includes("PRIVACY_RESTRICTED") || error.message.includes("TARGET_NOT_DISCOVERABLE")) {
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
      if (error.message.includes("CANNOT_REQUEST_SELF") || error.message.includes("CANNOT_FRIEND_SELF")) {
        return NextResponse.json({ error: "CANNOT_FRIEND_SELF" }, { status: 400 });
      }
      if (error.message.includes("RATE_LIMIT_EXCEEDED")) {
        return NextResponse.json({ error: "RATE_LIMIT_EXCEEDED", message: "Too many friend requests. Try again tomorrow." }, { status: 429 });
      }
      if (error.message.includes("TARGET_USER_NOT_FOUND")) {
        return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
      }

      console.error("[Heat Chat] send_friend_request RPC error:", error.message);
      return NextResponse.json({ error: "FAILED_TO_SEND_REQUEST" }, { status: 500 });
    }

    // Dispatch background Web Push to recipient (non-blocking)
    const senderName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.user_metadata?.username ||
      "Someone";

    sendWebPushToUser({
      userId: recipientId,
      title: "New Friend Request",
      body: `${senderName} sent you a friend request`,
      url: "/friends/requests",
      eventType: "friend_request",
      senderId: user.id,
      data: {
        senderId: user.id,
        senderName,
      },
    }).catch((err) => {
      console.error("[Heat Chat] Friend request push delivery error:", err);
    });

    return NextResponse.json({
      success: true,
      ...((data as Record<string, any>) || {}),
    });
  } catch (err: any) {
    console.error("[Heat Chat] POST /api/friends/request error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
