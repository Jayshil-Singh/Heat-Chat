import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(
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

    const { data: draft, error: draftError } = await supabase
      .from("conversation_drafts")
      .select("content, reply_to_message_id, updated_at")
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (draftError) {
      console.error("[Heat Chat] GET draft error:", draftError.message);
      return NextResponse.json({ error: "FAILED_TO_FETCH_DRAFT" }, { status: 500 });
    }

    return NextResponse.json({ draft: draft || null });
  } catch (err: any) {
    console.error("[Heat Chat] GET /api/conversations/[id]/draft error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
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

    const body = await request.json();
    const { content, replyToMessageId } = body;

    const { data, error } = await supabase.rpc("save_draft", {
      p_conversation_id: conversationId,
      p_content: content || "",
      p_reply_to_message_id: replyToMessageId || null,
    });

    if (error) {
      if (error.message.includes("CONVERSATION_ACCESS_DENIED")) {
        return NextResponse.json({ error: "FORBIDDEN", message: "You are not a member of this conversation." }, { status: 403 });
      }
      console.error("[Heat Chat] save_draft RPC error:", error.message);
      return NextResponse.json({ error: "FAILED_TO_SAVE_DRAFT" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      ...((data as Record<string, any>) || {}),
    });
  } catch (err: any) {
    console.error("[Heat Chat] PUT /api/conversations/[id]/draft error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

export async function DELETE(
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

    const { data, error } = await supabase.rpc("delete_draft", {
      p_conversation_id: conversationId,
    });

    if (error) {
      console.error("[Heat Chat] delete_draft RPC error:", error.message);
      return NextResponse.json({ error: "FAILED_TO_DELETE_DRAFT" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      ...((data as Record<string, any>) || {}),
    });
  } catch (err: any) {
    console.error("[Heat Chat] DELETE /api/conversations/[id]/draft error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
