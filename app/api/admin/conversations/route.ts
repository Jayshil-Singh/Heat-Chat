import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const auth = await requireAdminPermission("conversations.metadata.view");
  if (auth.errorResponse) return auth.errorResponse;

  const { searchParams } = new URL(request.url);
  const typeFilter = searchParams.get("type") || "all";
  const search = (searchParams.get("search") || "").trim();
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(10, parseInt(searchParams.get("limit") || "20", 10)));
  const offset = (page - 1) * limit;

  try {
    const supabase = await createClient();

    let query = supabase
      .from("conversations")
      .select("id, type, name, description, avatar_url, created_by, created_at, updated_at", { count: "exact" });

    if (typeFilter === "direct" || typeFilter === "group") {
      query = query.eq("type", typeFilter);
    }

    if (search) {
      query = query.ilike("name", `%${search}%`);
    }

    query = query.order("updated_at", { ascending: false }).range(offset, offset + limit - 1);

    const { data: conversations, count, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch member count and message count for each conversation
    const convIds = (conversations || []).map((c) => c.id);
    const memberCounts: Record<string, number> = {};
    const messageCounts: Record<string, number> = {};

    if (convIds.length > 0) {
      const { data: members } = await supabase
        .from("conversation_members")
        .select("conversation_id")
        .in("conversation_id", convIds);

      (members || []).forEach((m) => {
        memberCounts[m.conversation_id] = (memberCounts[m.conversation_id] || 0) + 1;
      });

      const { data: msgs } = await supabase
        .from("messages")
        .select("conversation_id")
        .in("conversation_id", convIds);

      (msgs || []).forEach((m) => {
        messageCounts[m.conversation_id] = (messageCounts[m.conversation_id] || 0) + 1;
      });
    }

    const formatted = (conversations || []).map((c) => ({
      id: c.id,
      type: c.type,
      name: c.name || (c.type === "direct" ? "Direct Message" : "Group Chat"),
      description: c.description,
      avatar_url: c.avatar_url,
      created_by: c.created_by,
      created_at: c.created_at,
      updated_at: c.updated_at,
      member_count: memberCounts[c.id] || 0,
      message_count: messageCounts[c.id] || 0,
    }));

    return NextResponse.json({
      conversations: formatted,
      total: count || formatted.length,
      page,
      limit,
      totalPages: Math.ceil((count || formatted.length) / limit),
    });
  } catch (err) {
    console.error("Conversations API error:", err);
    return NextResponse.json({ error: "Failed to fetch conversations" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdminPermission("conversations.delete");
  if (auth.errorResponse || !auth.session) return auth.errorResponse!;

  try {
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get("id");
    const reason = searchParams.get("reason") || "Conversation deleted administratively";

    if (!conversationId) {
      return NextResponse.json({ error: "id parameter is required." }, { status: 400 });
    }

    const supabase = await createClient();

    const { data: oldConv } = await supabase
      .from("conversations")
      .select("id, name, type")
      .eq("id", conversationId)
      .single();

    const { error: delErr } = await supabase
      .from("conversations")
      .delete()
      .eq("id", conversationId);

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 400 });
    }

    await logAdminAction({
      session: auth.session,
      action: "CONVERSATION_DELETED",
      targetType: "conversation",
      targetId: conversationId,
      reason,
      oldValue: oldConv || null,
    });

    return NextResponse.json({ success: true, message: "Conversation deleted." });
  } catch (err) {
    console.error("Delete conversation error:", err);
    return NextResponse.json({ error: "Failed to delete conversation" }, { status: 500 });
  }
}
