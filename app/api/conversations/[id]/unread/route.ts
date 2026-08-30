import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { data, error } = await supabase.rpc("mark_conversation_unread", {
      p_conversation_id: conversationId,
    });

    if (error) {
      if (error.message.includes("CONVERSATION_ACCESS_DENIED")) {
        return NextResponse.json({ error: "FORBIDDEN", message: "You are not a member of this conversation." }, { status: 403 });
      }
      console.error("[Heat Chat] mark_conversation_unread RPC error:", error.message);
      return NextResponse.json({ error: "FAILED_TO_MARK_UNREAD" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      ...((data as Record<string, any>) || {}),
    });
  } catch (err: any) {
    console.error("[Heat Chat] POST /api/conversations/[id]/unread error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
