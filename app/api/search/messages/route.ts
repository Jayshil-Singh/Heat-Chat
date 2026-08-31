import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import type { SearchMessageResult } from "@/types/chat";

/**
 * GET /api/search/messages
 *
 * Full-text message search across authorized conversations.
 *
 * Query params:
 *   q              - Search query string (min 2 chars)
 *   conversationId - Filter to specific conversation (optional)
 *   senderId       - Filter to specific sender (optional)
 *   type           - Filter by message_type ('text' | 'image' | 'video' | 'audio' | 'voice' | 'file')
 *   savedOnly      - 'true' to restrict search to saved/starred messages
 *   before         - ISO timestamp cursor for pagination
 *   after          - ISO timestamp lower bound
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
  const q = searchParams.get("q") || "";
  const conversationId = searchParams.get("conversationId") || null;
  const senderId = searchParams.get("senderId") || null;
  const messageType = searchParams.get("type") || null;
  const savedOnly = searchParams.get("savedOnly") === "true";
  const before = searchParams.get("before") || null;
  const after = searchParams.get("after") || null;
  const rawLimit = parseInt(searchParams.get("limit") || "30", 10);
  const limit = Math.min(Math.max(isNaN(rawLimit) ? 30 : rawLimit, 1), 100);

  const trimmedQuery = q.trim();

  // Validate query length: minimum 2 chars unless specific conversation or savedOnly is set
  if (trimmedQuery.length < 2 && !conversationId && !savedOnly) {
    return NextResponse.json(
      {
        ok: false,
        data: null,
        error: { code: "SEARCH_QUERY_TOO_SHORT", message: "Search query must be at least 2 characters" },
      },
      { status: 400 }
    );
  }

  try {
    // eslint-disable-next-line
    const { data, error } = (await (supabase.rpc as any)("search_messages", {
      p_query: trimmedQuery,
      p_conversation_id: conversationId,
      p_sender_id: senderId,
      p_message_type: messageType,
      p_saved_only: savedOnly,
      p_before: before,
      p_after: after,
      p_limit: limit,
    })) as { data: any[] | null; error: { message?: string } | null };

    if (error) {
      console.error("[search_messages] RPC error:", error);
      return NextResponse.json(
        { ok: false, data: null, error: { code: "SEARCH_FAILED", message: error.message || "Search failed" } },
        { status: 500 }
      );
    }

    const rows = data || [];

    // Collect all attachment storage paths for batch signed URL resolution
    const allStoragePaths: string[] = [];
    rows.forEach((row) => {
      if (Array.isArray(row.attachments)) {
        row.attachments.forEach((att: any) => {
          if (att?.storagePath) allStoragePaths.push(att.storagePath);
          if (att?.thumbnailPath) allStoragePaths.push(att.thumbnailPath);
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

    const items: SearchMessageResult[] = rows.map((row) => {
      const attachments = Array.isArray(row.attachments)
        ? row.attachments.map((att: any) => ({
            id: att.id,
            messageId: row.id,
            fileName: att.fileName,
            fileType: att.fileType,
            fileSize: att.fileSize,
            width: att.width,
            height: att.height,
            durationSeconds: att.durationSeconds,
            storagePath: att.storagePath,
            signedUrl: signedMap.get(att.storagePath) || "",
            thumbnailSignedUrl: att.thumbnailPath ? signedMap.get(att.thumbnailPath) || null : null,
          }))
        : [];

      return {
        id: row.id,
        conversationId: row.conversation_id,
        conversationName: row.conversation_name,
        conversationType: row.conversation_type,
        senderId: row.sender_id,
        senderName: row.sender_name || "Unknown",
        senderUsername: row.sender_username || "unknown",
        senderAvatar: row.sender_avatar || null,
        content: row.content || "",
        messageType: row.message_type,
        createdAt: row.created_at,
        editedAt: row.edited_at,
        rank: row.rank || 0,
        isSaved: Boolean(row.is_saved),
        attachments,
      };
    });

    const hasMore = items.length === limit;
    const nextCursor = hasMore ? items[items.length - 1].createdAt : null;

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
    console.error("[api/search/messages] Unexpected error:", err);
    return NextResponse.json(
      { ok: false, data: null, error: { code: "SEARCH_FAILED", message: err.message || "Search failed" } },
      { status: 500 }
    );
  }
}
