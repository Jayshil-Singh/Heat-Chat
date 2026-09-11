import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { isValidUuid } from "@/lib/validation/uuid";
import { createHash } from "node:crypto";

interface MessagePostDiagParams {
  requestId: string;
  conversationId: string;
  userId?: string;
  stage:
    | "validation"
    | "auth"
    | "group_permission_check"
    | "rpc_start"
    | "rpc_success"
    | "rpc_failure"
    | "response_completion";
  status?: number;
  errorCode?: string;
  errorMessage?: string;
  elapsedMs: number;
}

/**
 * Normalizes clientMessageId into a valid UUID.
 * If already a valid UUID, returns it unchanged.
 * If a non-empty string (such as client tempId 'temp_123_abc'), deterministically
 * hashes it into a valid UUID v4 format so PostgreSQL accepts it and idempotency works.
 * If null/empty, returns null.
 */
function toValidUuidOrNull(val?: string | null): string | null {
  if (!val || typeof val !== "string") return null;
  const trimmed = val.trim();
  if (isValidUuid(trimmed)) return trimmed;
  const hash = createHash("md5").update(trimmed).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/**
 * Emits safe structured diagnostics across major message-sending stages.
 * Strictly avoids logging private content, tokens, cookies, passwords, keys, or full headers.
 */
function logMessageDiag(params: MessagePostDiagParams) {
  const safeUserId = params.userId ? `${params.userId.slice(0, 8)}...` : "none";
  const errCode = params.errorCode || "none";
  const errMsg = params.errorMessage
    ? `"${params.errorMessage.replace(/[\r\n"']/g, " ").slice(0, 80)}"`
    : "none";
  const statusStr = params.status !== undefined ? String(params.status) : "none";

  console.log(
    `[Messages POST Diag] req_id=${params.requestId} conv_id=${params.conversationId} user_id=${safeUserId} stage=${params.stage} status=${statusStr} error_code=${errCode} error_msg=${errMsg} elapsed_ms=${params.elapsedMs}`
  );
}

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
  const startTime = Date.now();
  const requestId =
    request.headers.get("x-vercel-id") ||
    request.headers.get("x-request-id") ||
    `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  let conversationId = "unknown";

  try {
    const resolvedParams = await params;
    conversationId = resolvedParams.id;

    // 1. Validate conversation ID
    const valMs = Date.now() - startTime;
    if (!isValidUuid(conversationId)) {
      logMessageDiag({
        requestId,
        conversationId,
        stage: "validation",
        status: 400,
        errorCode: "INVALID_CONVERSATION_ID",
        errorMessage: "Invalid conversation ID format",
        elapsedMs: valMs,
      });
      return NextResponse.json(
        { error: "INVALID_CONVERSATION_ID", message: "Invalid conversation ID format" },
        { status: 400 }
      );
    }

    // 2. Authenticate session
    const tAuthStart = Date.now();
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    const authMs = Date.now() - tAuthStart;

    if (authError || !user) {
      logMessageDiag({
        requestId,
        conversationId,
        stage: "auth",
        status: 401,
        errorCode: authError?.name || "UNAUTHORIZED",
        errorMessage: authError?.message || "User session not found",
        elapsedMs: Date.now() - startTime,
      });
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    logMessageDiag({
      requestId,
      conversationId,
      userId: user.id,
      stage: "auth",
      status: 200,
      errorMessage: `auth_ms=${authMs}`,
      elapsedMs: Date.now() - startTime,
    });

    // 3. Check group message permissions
    const tPermStart = Date.now();
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
          logMessageDiag({
            requestId,
            conversationId,
            userId: user.id,
            stage: "group_permission_check",
            status: 403,
            errorCode: "FORBIDDEN",
            errorMessage: "Only group admins can send messages in this group",
            elapsedMs: Date.now() - startTime,
          });
          return NextResponse.json(
            { error: "FORBIDDEN", message: "Only group admins can send messages in this group." },
            { status: 403 }
          );
        }
      }
    }
    const permMs = Date.now() - tPermStart;

    // 4. Parse request body
    let body: any;
    try {
      body = await request.json();
    } catch {
      logMessageDiag({
        requestId,
        conversationId,
        userId: user.id,
        stage: "validation",
        status: 400,
        errorCode: "INVALID_REQUEST_BODY",
        errorMessage: "Malformed JSON request body",
        elapsedMs: Date.now() - startTime,
      });
      return NextResponse.json(
        { error: "INVALID_REQUEST_BODY", message: "Invalid JSON format" },
        { status: 400 }
      );
    }

    const { content, clientMessageId, replyToMessageId, forwardedFromMessageId, messageType } = body || {};

    const safeClientMessageId = toValidUuidOrNull(clientMessageId);
    const safeReplyToMessageId = isValidUuid(replyToMessageId) ? replyToMessageId : null;
    const safeForwardedFromMessageId = isValidUuid(forwardedFromMessageId) ? forwardedFromMessageId : null;

    // 5. Invoke send_message RPC
    logMessageDiag({
      requestId,
      conversationId,
      userId: user.id,
      stage: "rpc_start",
      elapsedMs: Date.now() - startTime,
    });

    const tRpcStart = Date.now();
    const { data, error } = await supabase.rpc("send_message", {
      p_conversation_id: conversationId,
      p_content: content,
      p_client_message_id: safeClientMessageId,
      p_reply_to_message_id: safeReplyToMessageId,
      p_forwarded_from_message_id: safeForwardedFromMessageId,
      p_message_type: messageType || "text",
    });
    const rpcMs = Date.now() - tRpcStart;

    // 6. Handle RPC failures with preserved HTTP status mappings
    if (error) {
      let status = 500;
      let publicError = "FAILED_TO_SEND_MESSAGE";
      let publicMsg = "Couldn't send this message. Please try again.";

      if (error.message.includes("CONVERSATION_ACCESS_DENIED")) {
        status = 403;
        publicError = "FORBIDDEN";
        publicMsg = "You are not a member of this conversation.";
      } else if (error.message.includes("CONVERSATION_NOT_FOUND")) {
        status = 404;
        publicError = "NOT_FOUND";
        publicMsg = "Conversation not found.";
      } else if (error.message.includes("UNAUTHENTICATED")) {
        status = 401;
        publicError = "UNAUTHORIZED";
        publicMsg = "Authentication required.";
      } else if (error.message.includes("MESSAGE_BLOCKED")) {
        status = 403;
        publicError = "MESSAGE_BLOCKED";
        publicMsg = "You cannot message this user.";
      } else if (error.message.includes("PRIVACY_RESTRICTED")) {
        status = 403;
        publicError = "PRIVACY_RESTRICTED";
        publicMsg = "This user does not accept direct messages.";
      } else if (
        error.message.includes("MESSAGE_TOO_LONG") ||
        error.message.includes("message_content_length")
      ) {
        status = 400;
        publicError = "MESSAGE_TOO_LONG";
        publicMsg = "Message or caption exceeds character limit.";
      } else if (error.message.includes("MESSAGE_EMPTY")) {
        status = 400;
        publicError = "MESSAGE_EMPTY";
        publicMsg = "Cannot send an empty message.";
      } else if (error.message.includes("INVALID_REPLY_TARGET")) {
        status = 400;
        publicError = "INVALID_REPLY_TARGET";
        publicMsg = "Cannot reply to a message outside this conversation.";
      } else if (error.message.includes("INVALID_FORWARD_TARGET")) {
        status = 400;
        publicError = "INVALID_FORWARD_TARGET";
        publicMsg = "Original message not found or inaccessible.";
      } else if (
        (error as any).code === "22P02" ||
        error.message.includes("invalid input syntax for type uuid")
      ) {
        status = 400;
        publicError = "INVALID_PARAMETER_FORMAT";
        publicMsg = "One or more provided identifiers have an invalid format.";
      }

      logMessageDiag({
        requestId,
        conversationId,
        userId: user.id,
        stage: "rpc_failure",
        status,
        errorCode: (error as any).code || publicError,
        errorMessage: error.message,
        elapsedMs: Date.now() - startTime,
      });

      return NextResponse.json({ error: publicError, message: publicMsg }, { status });
    }

    logMessageDiag({
      requestId,
      conversationId,
      userId: user.id,
      stage: "rpc_success",
      status: 200,
      errorMessage: `rpc_ms=${rpcMs}`,
      elapsedMs: Date.now() - startTime,
    });

    // 7. Resolve the canonical message ID supporting messageId, message_id, and id
    const rawData = (data as Record<string, any>) || {};
    const persistedMessageId =
      rawData.messageId ||
      rawData.message_id ||
      rawData.id ||
      (typeof data === "string" ? data : undefined);

    const totalMs = Date.now() - startTime;
    const serverTiming = `val;dur=${valMs}, auth;dur=${authMs}, perm;dur=${permMs}, rpc;dur=${rpcMs}, total;dur=${totalMs}`;

    // 8. Return HTTP 201 immediately.
    // Web Push notifications are enqueued in PostgreSQL by the trg_enqueue_notification_delivery trigger
    // and reliably processed by the cron-job.org worker at /api/internal/notifications/process-queue.
    // No push dispatch occurs on the critical response path.
    logMessageDiag({
      requestId,
      conversationId,
      userId: user.id,
      stage: "response_completion",
      status: 201,
      errorMessage: `val_ms=${valMs} auth_ms=${authMs} perm_ms=${permMs} rpc_ms=${rpcMs}`,
      elapsedMs: totalMs,
    });

    return NextResponse.json(
      {
        success: true,
        ...rawData,
        id: persistedMessageId,
        messageId: persistedMessageId,
        message_id: persistedMessageId,
        clientMessageId: clientMessageId || rawData.clientMessageId,
        timings: {
          valMs,
          authMs,
          permMs,
          rpcMs,
          totalMs,
        },
      },
      {
        status: 201,
        headers: {
          "Server-Timing": serverTiming,
          "x-diag-timings": `val=${valMs}ms, auth=${authMs}ms, perm=${permMs}ms, rpc=${rpcMs}ms, total=${totalMs}ms`,
        },
      }
    );
  } catch (err: any) {
    logMessageDiag({
      requestId,
      conversationId,
      stage: "response_completion",
      status: 500,
      errorCode: "INTERNAL_SERVER_ERROR",
      errorMessage: err?.message || "Unexpected exception",
      elapsedMs: Date.now() - startTime,
    });
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

