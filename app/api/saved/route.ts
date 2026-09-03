import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import type { SavedMessageDto } from "@/types/chat";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/saved
 *
 * Fetch paginated saved messages for the authenticated user with optional search query and category filters.
 *
 * Query params:
 *   q              - Search within saved messages (optional)
 *   conversationId - Filter by conversation (optional)
 *   type           - Filter by message_type (optional)
 *   before         - ISO timestamp cursor for pagination
 *   limit          - Page size (default 30, max 100)
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || null;
  const conversationId = searchParams.get("conversationId") || null;
  const messageType = searchParams.get("type") || null;
  const before = searchParams.get("before") || null;
  const rawLimit = parseInt(searchParams.get("limit") || "30", 10);
  const limit = Math.min(Math.max(isNaN(rawLimit) ? 30 : rawLimit, 1), 100);

  // 1. Validate conversationId format if provided
  if (conversationId) {
    if (!UUID_REGEX.test(conversationId)) {
      return NextResponse.json(
        { ok: false, data: null, error: { code: "INVALID_CONVERSATION_ID", message: "Invalid conversation ID format" } },
        { status: 400 }
      );
    }

    // 2. Validate caller's membership in the target conversation
    const { data: memberRecord, error: memErr } = await supabase
      .from("conversation_members")
      .select("role")
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (memErr) {
      console.error("[api/saved] Error verifying membership:", memErr);
      return NextResponse.json(
        { ok: false, data: null, error: { code: "DATABASE_ERROR", message: "Failed to verify conversation access" } },
        { status: 500 }
      );
    }

    if (!memberRecord) {
      return NextResponse.json(
        { ok: false, data: null, error: { code: "FORBIDDEN", message: "You do not have access to this conversation" } },
        { status: 403 }
      );
    }
  }

  try {
    // 3. Resilient Direct PostgREST Query
    // Joins starred_messages -> messages -> conversations + profiles + attachments
    let query = supabase
      .from("starred_messages")
      .select(`
        id,
        created_at,
        message:messages (
          id,
          conversation_id,
          sender_id,
          content,
          message_type,
          deleted_at,
          created_at,
          edited_at,
          conversation:conversations (
            id,
            type,
            name
          ),
          sender:profiles!messages_sender_id_fkey (
            id,
            display_name,
            username,
            avatar_url
          ),
          attachments (
            id,
            file_name,
            file_type,
            file_size,
            storage_path,
            width,
            height,
            duration_seconds,
            thumbnail_path
          )
        )
      `)
      .eq("user_id", user.id);

    if (before) {
      query = query.lt("created_at", before);
    }

    query = query.order("created_at", { ascending: false }).limit(limit * 2);

    const { data: rawRows, error: queryErr } = await query;

    if (queryErr) {
      console.error("[api/saved] Direct query error:", queryErr);
      return NextResponse.json(
        { ok: false, data: null, error: { code: "DATABASE_ERROR", message: "Failed to query saved messages" } },
        { status: 500 }
      );
    }

    // 4. Fetch delete-for-me message IDs for this user
    const { data: hiddenRecords } = await supabase
      .from("message_user_states")
      .select("message_id")
      .eq("user_id", user.id);

    const hiddenIds = new Set((hiddenRecords || []).map((r: any) => r.message_id));

    // 5. Filter & format items
    const filteredRows: any[] = [];
    const normalizedQ = q?.trim().toLowerCase() || null;

    for (const row of rawRows || []) {
      const msg = Array.isArray(row.message) ? row.message[0] : row.message;
      if (!msg) continue;

      // Filter out delete-for-me messages
      if (hiddenIds.has(msg.id)) continue;

      // Filter by conversationId
      if (conversationId && msg.conversation_id !== conversationId) continue;

      // Filter by category / messageType
      if (messageType && messageType !== "all") {
        if (messageType === "media") {
          if (msg.message_type !== "image" && msg.message_type !== "video") continue;
        } else if (messageType === "files") {
          if (msg.message_type !== "file" && msg.message_type !== "audio" && msg.message_type !== "voice") continue;
        } else if (messageType === "links") {
          if (!/https?:\/\/[^\s]+/i.test(msg.content || "")) continue;
        } else if (msg.message_type !== messageType) {
          continue;
        }
      }

      // Filter by search query
      if (normalizedQ) {
        const contentMatch = (msg.content || "").toLowerCase().includes(normalizedQ);
        if (!contentMatch) continue;
      }

      filteredRows.push({
        savedId: row.id,
        savedAt: row.created_at,
        msg,
      });

      if (filteredRows.length === limit) break;
    }

    // 6. Resolve signed URLs for attachments
    const allStoragePaths: string[] = [];
    filteredRows.forEach(({ msg }) => {
      if (Array.isArray(msg.attachments)) {
        msg.attachments.forEach((att: any) => {
          if (att?.storage_path) allStoragePaths.push(att.storage_path);
          if (att?.thumbnail_path) allStoragePaths.push(att.thumbnail_path);
        });
      }
    });

    const signedMap = new Map<string, string>();
    if (allStoragePaths.length > 0) {
      const { data: signedUrls } = await supabase.storage
        .from("chat-attachments")
        .createSignedUrls(allStoragePaths, 3600);

      (signedUrls || []).forEach((row) => {
        if (row.path && row.signedUrl) signedMap.set(row.path, row.signedUrl);
      });
    }

    // 7. Map to SavedMessageDto
    const items: SavedMessageDto[] = filteredRows.map(({ savedId, savedAt, msg }) => {
      const conv = Array.isArray(msg.conversation) ? msg.conversation[0] : msg.conversation;
      const sender = Array.isArray(msg.sender) ? msg.sender[0] : msg.sender;
      const isDeleted = Boolean(msg.deleted_at);

      const attachments = Array.isArray(msg.attachments)
        ? msg.attachments.map((att: any) => ({
            id: att.id,
            messageId: msg.id,
            fileName: att.file_name,
            fileType: att.file_type,
            fileSize: att.file_size,
            width: att.width,
            height: att.height,
            durationSeconds: att.duration_seconds,
            storagePath: att.storage_path,
            signedUrl: signedMap.get(att.storage_path) || "",
            thumbnailSignedUrl: att.thumbnail_path ? signedMap.get(att.thumbnail_path) || null : null,
          }))
        : [];

      return {
        savedId,
        savedAt,
        messageId: msg.id,
        conversationId: msg.conversation_id,
        conversationName: conv?.name || "Conversation",
        conversationType: conv?.type || "direct",
        senderId: msg.sender_id,
        senderName: sender?.display_name || "Unknown",
        senderUsername: sender?.username || "unknown",
        senderAvatar: sender?.avatar_url || null,
        content: isDeleted ? "This message was deleted" : msg.content || "",
        messageType: msg.message_type,
        isDeleted,
        createdAt: msg.created_at,
        editedAt: msg.edited_at,
        attachments,
      };
    });

    const hasMore = filteredRows.length === limit;
    const nextCursor = hasMore ? items[items.length - 1].savedAt : null;

    return NextResponse.json({
      ok: true,
      data: {
        items,
        count: items.length,
        hasMore,
        nextCursor,
      },
      error: null,
    });
  } catch (err: any) {
    console.error("[api/saved] Unexpected error:", err);
    return NextResponse.json(
      { ok: false, data: null, error: { code: "SERVER_ERROR", message: "Failed to fetch saved messages" } },
      { status: 500 }
    );
  }
}
