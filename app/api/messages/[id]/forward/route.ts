import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: messageId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await request.json();
    const { targetConversationId, clientMessageId } = body;

    if (!targetConversationId || typeof targetConversationId !== "string") {
      return NextResponse.json({ error: "TARGET_CONVERSATION_REQUIRED" }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("forward_message", {
      p_message_id: messageId,
      p_target_conversation_id: targetConversationId,
      p_client_message_id: clientMessageId || null,
    });

    if (error) {
      if (error.message.includes("INVALID_FORWARD_SOURCE")) {
        return NextResponse.json({ error: "FORBIDDEN", message: "You do not have access to the original message." }, { status: 403 });
      }
      if (error.message.includes("CANNOT_FORWARD_DELETED_MESSAGE")) {
        return NextResponse.json({ error: "MESSAGE_ALREADY_DELETED", message: "Cannot forward a deleted message." }, { status: 409 });
      }
      if (error.message.includes("CONVERSATION_ACCESS_DENIED")) {
        return NextResponse.json({ error: "FORBIDDEN", message: "You are not a member of the destination conversation." }, { status: 403 });
      }
      if (error.message.includes("MESSAGE_BLOCKED")) {
        return NextResponse.json({ error: "MESSAGE_BLOCKED", message: "You cannot forward to this user." }, { status: 403 });
      }
      if (error.message.includes("PRIVACY_RESTRICTED")) {
        return NextResponse.json({ error: "PRIVACY_RESTRICTED", message: "Recipient does not accept direct messages." }, { status: 403 });
      }
      console.error("[Heat Chat] forward_message RPC error:", error.message);
      return NextResponse.json({ error: "FORWARD_FAILED" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      ...((data as Record<string, any>) || {}),
    });
  } catch (err: any) {
    console.error("[Heat Chat] POST /api/messages/[id]/forward error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
