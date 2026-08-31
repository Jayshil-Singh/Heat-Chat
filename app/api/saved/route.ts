import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import type { SavedMessageDto } from "@/types/chat";

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

  try {
    const { data, error } = (await (supabase.rpc as any)("get_saved_messages", {
      p_query: q?.trim() || null,
      p_conversation_id: conversationId,
      p_message_type: messageType,
      p_before: before,
      p_limit: limit,
    })) as { data: any[] | null; error: { message?: string } | null };

    if (error) {
      console.error("[get_saved_messages] RPC error:", error);
      return NextResponse.json(
        { ok: false, data: null, error: { code: "SAVE_FAILED", message: error.message || "Failed to fetch saved messages" } },
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

    const items: SavedMessageDto[] = rows.map((row) => {
      const attachments = Array.isArray(row.attachments)
        ? row.attachments.map((att: any) => ({
            id: att.id,
            messageId: row.message_id,
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
        savedId: row.saved_id,
        savedAt: row.saved_at,
        messageId: row.message_id,
        conversationId: row.conversation_id,
        conversationName: row.conversation_name,
        conversationType: row.conversation_type,
        senderId: row.sender_id,
        senderName: row.sender_name || "Unknown",
        senderUsername: row.sender_username || "unknown",
        senderAvatar: row.sender_avatar || null,
        content: row.content || "",
        messageType: row.message_type,
        isDeleted: Boolean(row.is_deleted),
        createdAt: row.created_at,
        editedAt: row.edited_at,
        attachments,
      };
    });

    const hasMore = items.length === limit;
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
      { ok: false, data: null, error: { code: "SAVE_FAILED", message: err.message || "Failed to fetch saved messages" } },
      { status: 500 }
    );
  }
}
