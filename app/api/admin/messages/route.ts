import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const auth = await requireAdminPermission("messages.metadata.view");
  if (auth.errorResponse) return auth.errorResponse;

  const { searchParams } = new URL(request.url);
  const convId = searchParams.get("conversationId");
  const senderId = searchParams.get("senderId");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(10, parseInt(searchParams.get("limit") || "20", 10)));
  const offset = (page - 1) * limit;

  try {
    const supabase = await createClient();

    let query = supabase
      .from("messages")
      .select(
        "id, conversation_id, sender_id, message_type, created_at, updated_at, deleted_at, sender:profiles!messages_sender_id_fkey(username, display_name)",
        { count: "exact" }
      );

    if (convId) {
      query = query.eq("conversation_id", convId);
    }
    if (senderId) {
      query = query.eq("sender_id", senderId);
    }

    query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

    const { data: messages, count, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const formattedMessages = (messages || []).map((m) => {
      const sender = m.sender as unknown as { username: string; display_name: string } | null;
      return {
        id: m.id,
        conversation_id: m.conversation_id,
        sender_id: m.sender_id,
        sender_username: sender?.username || "unknown",
        sender_display_name: sender?.display_name || "Unknown User",
        content_preview: "[PROTECTED_PRIVATE_CONTENT]", // Redacted by default
        message_type: m.message_type,
        created_at: m.created_at,
        updated_at: m.updated_at,
        deleted_at: m.deleted_at,
      };
    });

    return NextResponse.json({
      messages: formattedMessages,
      total: count || formattedMessages.length,
      page,
      limit,
      totalPages: Math.ceil((count || formattedMessages.length) / limit),
    });
  } catch (err) {
    console.error("Messages list API error:", err);
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdminPermission("messages.delete");
  if (auth.errorResponse || !auth.session) return auth.errorResponse!;

  try {
    const { searchParams } = new URL(request.url);
    const messageId = searchParams.get("id");
    const reason = searchParams.get("reason") || "Abusive message deleted administratively";

    if (!messageId) {
      return NextResponse.json({ error: "id parameter is required." }, { status: 400 });
    }

    const supabase = await createClient();

    // Soft delete message
    const { error: updErr } = await supabase
      .from("messages")
      .update({
        deleted_at: new Date().toISOString(),
        content: "[Message removed by administrator]",
      })
      .eq("id", messageId);

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 400 });
    }

    await logAdminAction({
      session: auth.session,
      action: "MESSAGE_DELETED",
      targetType: "message",
      targetId: messageId,
      reason,
    });

    return NextResponse.json({ success: true, message: "Message removed successfully." });
  } catch (err) {
    console.error("Delete message API error:", err);
    return NextResponse.json({ error: "Failed to delete message" }, { status: 500 });
  }
}
