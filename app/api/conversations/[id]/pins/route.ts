import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { isValidUuid } from "@/lib/validation/uuid";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;

    if (!isValidUuid(conversationId)) {
      return NextResponse.json(
        { error: "INVALID_CONVERSATION_ID", message: "Invalid conversation ID format" },
        { status: 400 }
      );
    }
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { data: isMember } = await supabase.rpc("is_conversation_member", {
      conv_id: conversationId,
      check_user_id: user.id,
    });

    if (!isMember) {
      return NextResponse.json({ error: "CONVERSATION_ACCESS_DENIED" }, { status: 403 });
    }

    // Fetch pins
    const { data: pins, error: pinsError } = await supabase
      .from("message_pins")
      .select("id, message_id, pinned_by, pinned_at")
      .eq("conversation_id", conversationId)
      .order("pinned_at", { ascending: false });

    if (pinsError) {
      console.error("[Heat Chat] GET /api/conversations/[id]/pins error:", pinsError.message);
      return NextResponse.json({ error: "FAILED_TO_FETCH_PINS" }, { status: 500 });
    }

    if (!pins || pins.length === 0) {
      return NextResponse.json({ pins: [] });
    }

    const messageIds = pins.map((p) => p.message_id);

    // Fetch pinned message details
    const { data: msgs } = await supabase
      .from("messages")
      .select("id, sender_id, content, created_at, deleted_at")
      .in("id", messageIds);

    const msgMap = new Map((msgs || []).map((m) => [m.id, m]));
    const senderIds = Array.from(new Set((msgs || []).map((m) => m.sender_id)));

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", senderIds);

    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

    const formattedPins = pins.map((p) => {
      const msg = msgMap.get(p.message_id);
      const sender = msg ? profileMap.get(msg.sender_id) : null;
      return {
        pinId: p.id,
        pinnedAt: p.pinned_at,
        pinnedBy: p.pinned_by,
        message: msg
          ? {
              id: msg.id,
              content: msg.deleted_at ? "This message was deleted" : msg.content,
              createdAt: msg.created_at,
              isDeleted: msg.deleted_at !== null,
              sender,
            }
          : null,
      };
    });

    return NextResponse.json({ pins: formattedPins.filter((p) => p.message !== null) });
  } catch (err: any) {
    console.error("[Heat Chat] GET /api/conversations/[id]/pins error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
