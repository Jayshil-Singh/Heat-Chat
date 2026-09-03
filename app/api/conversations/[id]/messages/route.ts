import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { isValidUuid } from "@/lib/validation/uuid";

export async function GET(
  request: NextRequest,
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

    const { searchParams } = new URL(request.url);
    const before = searchParams.get("before");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    // Verify conversation membership
    const { data: isMember } = await supabase.rpc("is_conversation_member", {
      conv_id: conversationId,
      check_user_id: user.id,
    });

    if (!isMember) {
      return NextResponse.json({ error: "CONVERSATION_ACCESS_DENIED" }, { status: 403 });
    }

    // Query messages
    let query = supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt("created_at", before);
    }

    const { data: rawMessages, error: msgError } = await query;

    if (msgError) {
      console.error("[Heat Chat] GET messages error:", msgError.message);
      return NextResponse.json({ error: "FAILED_TO_FETCH_MESSAGES" }, { status: 500 });
    }

    if (!rawMessages || rawMessages.length === 0) {
      return NextResponse.json({ messages: [], hasMore: false });
    }

    const messageIds = rawMessages.map((m) => m.id);

    // Fetch user-hidden messages ("Delete for Me")
    const { data: hiddenList } = await supabase
      .from("message_user_states")
      .select("message_id")
      .eq("user_id", user.id)
      .in("message_id", messageIds);

    const hiddenSet = new Set((hiddenList || []).map((h) => h.message_id));

    // Filter out hidden messages
    const visibleMessages = rawMessages.filter((m) => !hiddenSet.has(m.id));

    if (visibleMessages.length === 0) {
      return NextResponse.json({ messages: [], hasMore: rawMessages.length === limit });
    }

    const visibleIds = visibleMessages.map((m) => m.id);
    const nonDeletedIds = visibleMessages.filter((m) => !m.deleted_at).map((m) => m.id);
    const senderIds = Array.from(new Set(visibleMessages.map((m) => m.sender_id)));
    const replyIds = visibleMessages
      .map((m) => m.reply_to_message_id)
      .filter((id): id is string => !!id);

    // Batch fetch enrichment data
    const [profilesRes, readsRes, reactionsRes, pinsRes, attachmentsRes, replyParentsRes] =
      await Promise.all([
        supabase.from("profiles").select("*").in("id", senderIds),
        supabase
          .from("message_reads")
          .select("message_id, user_id")
          .in("message_id", visibleIds),
        supabase
          .from("message_reactions")
          .select("message_id, user_id, reaction")
          .in("message_id", visibleIds),
        supabase
          .from("message_pins")
          .select("message_id")
          .eq("conversation_id", conversationId)
          .in("message_id", visibleIds),
        nonDeletedIds.length > 0
          ? supabase.from("attachments").select("*").in("message_id", nonDeletedIds)
          : Promise.resolve({ data: [] }),
        replyIds.length > 0
          ? supabase
              .from("messages")
              .select("id, sender_id, content, deleted_at")
              .in("id", replyIds)
          : Promise.resolve({ data: [] }),
      ]);

    const profilesMap = new Map((profilesRes.data || []).map((p) => [p.id, p]));
    const pinnedSet = new Set((pinsRes.data || []).map((p) => p.message_id));

    // Reactions map
    const reactionsMap = new Map<string, Array<{ reaction: any; count: number; userIds: string[] }>>();
    (reactionsRes.data || []).forEach((r) => {
      const list = reactionsMap.get(r.message_id) || [];
      const existing = list.find((s) => s.reaction === r.reaction);
      if (existing) {
        existing.count++;
        existing.userIds.push(r.user_id);
      } else {
        list.push({ reaction: r.reaction, count: 1, userIds: [r.user_id] });
      }
      reactionsMap.set(r.message_id, list);
    });

    // Reads map
    const readsMap = new Map<string, string[]>();
    (readsRes.data || []).forEach((r) => {
      const list = readsMap.get(r.message_id) || [];
      list.push(r.user_id);
      readsMap.set(r.message_id, list);
    });

    // Attachments map
    const attachmentsMap = new Map<string, any[]>();
    (attachmentsRes.data || []).forEach((att) => {
      const list = attachmentsMap.get(att.message_id) || [];
      list.push(att);
      attachmentsMap.set(att.message_id, list);
    });

    // Parent replies map
    const parentMap = new Map((replyParentsRes.data || []).map((pm) => [pm.id, pm]));

    // Format messages
    const formattedMessages = visibleMessages.reverse().map((m) => {
      const isDeleted = m.deleted_at !== null;
      let replyPreview = null;

      if (m.reply_to_message_id) {
        const parent = parentMap.get(m.reply_to_message_id);
        if (parent) {
          const parentSender = profilesMap.get(parent.sender_id);
          replyPreview = {
            messageId: parent.id,
            senderName: parentSender?.display_name || parentSender?.username || "Unknown",
            content: parent.deleted_at ? "" : parent.content.slice(0, 100),
            isDeleted: parent.deleted_at !== null,
          };
        } else {
          replyPreview = {
            messageId: m.reply_to_message_id,
            senderName: "Unknown",
            content: "",
            isDeleted: true,
          };
        }
      }

      return {
        ...m,
        content: isDeleted ? "This message was deleted" : m.content,
        sender: profilesMap.get(m.sender_id) || null,
        status: m.sender_id === user.id ? "sent" : undefined,
        readBy: readsMap.get(m.id) || [],
        reactions: reactionsMap.get(m.id) || [],
        replyPreview,
        attachments: isDeleted ? [] : attachmentsMap.get(m.id) || [],
        isPinned: pinnedSet.has(m.id),
      };
    });

    return NextResponse.json({
      messages: formattedMessages,
      hasMore: rawMessages.length === limit,
    });
  } catch (err: any) {
    console.error("[Heat Chat] GET /api/conversations/[id]/messages error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
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

    // Check group message permissions
    const { data: conv } = await supabase
      .from("conversations")
      .select("type, permissions")
      .eq("id", conversationId)
      .maybeSingle();

    if (conv && conv.type === "group") {
      const perms = (conv.permissions as any) || {};
      const whoCanSend = perms.who_can_send_messages || "all_members";
      if (whoCanSend === "admin_only") {
        const { data: member } = await supabase
          .from("conversation_members")
          .select("role")
          .eq("conversation_id", conversationId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (!member || (member.role !== "owner" && member.role !== "admin")) {
          return NextResponse.json(
            { error: "FORBIDDEN", message: "Only group admins can send messages in this group." },
            { status: 403 }
          );
        }
      }
    }

    const body = await request.json();
    const { content, clientMessageId, replyToMessageId, forwardedFromMessageId, messageType } = body;

    const { data, error } = await supabase.rpc("send_message", {
      p_conversation_id: conversationId,
      p_content: content,
      p_client_message_id: clientMessageId || null,
      p_reply_to_message_id: replyToMessageId || null,
      p_forwarded_from_message_id: forwardedFromMessageId || null,
      p_message_type: messageType || "text",
    });

    if (error) {
      if (error.message.includes("CONVERSATION_ACCESS_DENIED")) {
        return NextResponse.json({ error: "FORBIDDEN", message: "You are not a member of this conversation." }, { status: 403 });
      }
      if (error.message.includes("MESSAGE_BLOCKED")) {
        return NextResponse.json({ error: "MESSAGE_BLOCKED", message: "You cannot message this user." }, { status: 403 });
      }
      if (error.message.includes("PRIVACY_RESTRICTED")) {
        return NextResponse.json({ error: "PRIVACY_RESTRICTED", message: "This user does not accept direct messages." }, { status: 403 });
      }
      if (error.message.includes("MESSAGE_TOO_LONG") || error.message.includes("message_content_length")) {
        return NextResponse.json({ error: "MESSAGE_TOO_LONG", message: "Message or caption exceeds character limit." }, { status: 400 });
      }
      if (error.message.includes("MESSAGE_EMPTY")) {
        return NextResponse.json({ error: "MESSAGE_EMPTY", message: "Cannot send an empty message." }, { status: 400 });
      }
      if (error.message.includes("INVALID_REPLY_TARGET")) {
        return NextResponse.json({ error: "INVALID_REPLY_TARGET", message: "Cannot reply to a message outside this conversation." }, { status: 400 });
      }
      console.error("[Heat Chat] send_message RPC error:", error.message);
      return NextResponse.json({ error: "FAILED_TO_SEND_MESSAGE", message: "Couldn't send this message. Please try again." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      ...((data as Record<string, any>) || {}),
    });
  } catch (err: any) {
    console.error("[Heat Chat] POST /api/conversations/[id]/messages error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
