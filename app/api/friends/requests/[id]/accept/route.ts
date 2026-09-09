import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { sendWebPushToUser } from "@/lib/notifications/push-delivery";

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

    const { data, error } = await supabase.rpc("accept_friend_request", {
      request_id: requestId,
    });

    if (error) {
      if (error.message.includes("REQUEST_NOT_FOUND")) {
        return NextResponse.json({ error: "REQUEST_NOT_FOUND" }, { status: 404 });
      }
      if (error.message.includes("REQUEST_NOT_YOURS")) {
        return NextResponse.json({ error: "FORBIDDEN", message: "Only the recipient can accept this request." }, { status: 403 });
      }
      if (error.message.includes("REQUEST_NOT_PENDING")) {
        return NextResponse.json({ error: "REQUEST_NOT_PENDING", message: "This request is no longer pending." }, { status: 409 });
      }
      if (error.message.includes("BLOCKED_USER")) {
        return NextResponse.json({ error: "BLOCKED_USER", message: "Cannot accept request from a blocked user." }, { status: 403 });
      }

      console.error("[Heat Chat] accept_friend_request RPC error:", error.message);
      return NextResponse.json({ error: "ACCEPT_FAILED" }, { status: 500 });
    }

    const resData = (data as Record<string, any>) || {};
    const requesterId = resData.senderId || resData.sender_id;

    if (requesterId && typeof requesterId === "string") {
      const accepterName =
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.user_metadata?.username ||
        "Someone";

      try {
        await sendWebPushToUser({
          userId: requesterId,
          title: "Friend Request Accepted",
          body: `${accepterName} accepted your friend request`,
          url: "/friends",
          eventType: "friend_request_accepted",
          senderId: user.id,
          data: {
            senderId: user.id,
            senderName: accepterName,
          },
        });
      } catch (err) {
        console.error("[Heat Chat] Friend accept push delivery error:", err);
      }
    }

    return NextResponse.json({ success: true, ...resData });
  } catch (err: any) {
    console.error("[Heat Chat] POST /api/friends/requests/[id]/accept error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
