import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { isValidUuid } from "@/lib/validation/uuid";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: messageId } = await params;

    if (!isValidUuid(messageId)) {
      return NextResponse.json(
        { error: "INVALID_MESSAGE_ID", message: "Invalid message ID format" },
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

    const { data, error } = await supabase.rpc("delete_message_for_everyone", {
      p_message_id: messageId,
    });

    if (error) {
      if (error.message.includes("MESSAGE_NOT_FOUND")) {
        return NextResponse.json({ error: "MESSAGE_NOT_FOUND" }, { status: 404 });
      }
      if (error.message.includes("MESSAGE_DELETE_FORBIDDEN")) {
        return NextResponse.json({ error: "FORBIDDEN", message: "Only the author can delete this message for everyone." }, { status: 403 });
      }
      console.error("[Heat Chat] delete_message_for_everyone RPC error:", error.message);
      return NextResponse.json({ error: "FAILED_TO_DELETE_MESSAGE" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      ...((data as Record<string, any>) || {}),
    });
  } catch (err: any) {
    console.error("[Heat Chat] DELETE /api/messages/[id]/everyone error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
