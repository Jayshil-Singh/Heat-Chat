import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminPermission("messages.content.view", { requireRecentMfa: true });
  if (auth.errorResponse || !auth.session) return auth.errorResponse!;

  const { id: messageId } = await context.params;

  try {
    const body = await request.json();
    const { reason } = body;

    if (!reason || reason.trim().length < 5) {
      return NextResponse.json(
        { error: "A detailed justification (minimum 5 characters) is required for break-glass message inspection." },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Call hardened DB RPC
    const { data: rpcResult, error: rpcErr } = await supabase.rpc("admin_break_glass_message_content", {
      p_message_id: messageId,
      p_reason: reason.trim(),
    });

    if (rpcErr || !rpcResult || rpcResult.length === 0) {
      // Fallback: query message and write audit
      const { data: message, error: msgErr } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_id, content, message_type, created_at, sender:profiles!messages_sender_id_fkey(username)")
        .eq("id", messageId)
        .single();

      if (msgErr || !message) {
        return NextResponse.json({ error: "Message not found." }, { status: 404 });
      }

      await logAdminAction({
        session: auth.session,
        action: "PRIVATE_CONTENT_ACCESSED",
        targetType: "message",
        targetId: messageId,
        reason: reason.trim(),
        metadata: { conversation_id: message.conversation_id, sender_id: message.sender_id },
      });

      const sender = message.sender as unknown as { username: string } | null;
      return NextResponse.json({
        success: true,
        message: {
          message_id: message.id,
          conversation_id: message.conversation_id,
          sender_id: message.sender_id,
          sender_username: sender?.username || "unknown",
          content: message.content,
          message_type: message.message_type,
          created_at: message.created_at,
        },
      });
    }

    return NextResponse.json({ success: true, message: rpcResult[0] });
  } catch (err) {
    console.error("Break-glass message API error:", err);
    return NextResponse.json({ error: "Failed to access message content" }, { status: 500 });
  }
}
