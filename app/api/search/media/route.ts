import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import type { SearchMediaResult } from "@/types/chat";

/**
 * GET /api/search/media
 *
 * Search shared media, audio, and files across authorized conversations.
 *
 * Query params:
 *   q              - Search query string (optional)
 *   category       - 'all' | 'media' | 'audio' | 'files' (default 'all')
 *   conversationId - Filter to specific conversation (optional)
 *   before         - ISO timestamp cursor
 *   limit          - Page size (default 30, max 60)
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
  const category = searchParams.get("category") || "all";
  const conversationId = searchParams.get("conversationId") || null;
  const before = searchParams.get("before") || null;
  const rawLimit = parseInt(searchParams.get("limit") || "30", 10);
  const limit = Math.min(Math.max(isNaN(rawLimit) ? 30 : rawLimit, 1), 60);

  if (!["all", "media", "audio", "files"].includes(category)) {
    return NextResponse.json(
      {
        ok: false,
        data: null,
        error: { code: "INVALID_CATEGORY", message: "Category must be one of: all, media, audio, files" },
      },
      { status: 400 }
    );
  }

  try {
    // eslint-disable-next-line
    const { data, error } = (await (supabase.rpc as any)("search_media", {
      p_query: q?.trim() || null,
      p_category: category,
      p_conversation_id: conversationId,
      p_before: before,
      p_limit: limit,
    })) as { data: any[] | null; error: { message?: string } | null };

    if (error) {
      console.error("[search_media] RPC error:", error);
      return NextResponse.json(
        { ok: false, data: null, error: { code: "SEARCH_FAILED", message: error.message || "Media search failed" } },
        { status: 500 }
      );
    }

    const rows = data || [];

    // Batch-resolve signed URLs for all storage_path and thumbnail_path values
    const storagePaths: string[] = rows.map((item) => item.storage_path as string);
    const thumbnailPaths: string[] = rows
      .map((item) => item.thumbnail_path as string | null)
      .filter((p): p is string => Boolean(p));

    const [signedRes, thumbRes] = await Promise.all([
      storagePaths.length > 0
        ? supabase.storage.from("chat-attachments").createSignedUrls(storagePaths, 3600)
        : Promise.resolve({ data: [] as Array<{ path: string | null; signedUrl: string | null }> }),
      thumbnailPaths.length > 0
        ? supabase.storage.from("chat-attachments").createSignedUrls(thumbnailPaths, 3600)
        : Promise.resolve({ data: [] as Array<{ path: string | null; signedUrl: string | null }> }),
    ]);

    const thumbSignedMap = new Map<string, string>();
    (thumbRes.data || []).forEach((row) => {
      if (row.path && row.signedUrl) thumbSignedMap.set(row.path, row.signedUrl);
    });

    const items: SearchMediaResult[] = rows.map((item, idx: number) => ({
      attachmentId: item.attachment_id,
      messageId: item.message_id,
      conversationId: item.conversation_id,
      conversationName: item.conversation_name,
      senderId: item.sender_id,
      senderName: item.sender_name || "Unknown",
      senderUsername: item.sender_username || "unknown",
      fileName: item.file_name,
      fileType: item.file_type,
      fileSize: item.file_size,
      width: item.width,
      height: item.height,
      durationSeconds: item.duration_seconds,
      storagePath: item.storage_path,
      thumbnailPath: item.thumbnail_path,
      messageType: item.message_type,
      messageContent: item.message_content || "",
      createdAt: item.created_at,
      signedUrl: signedRes.data?.[idx]?.signedUrl || "",
      thumbnailSignedUrl: item.thumbnail_path
        ? thumbSignedMap.get(item.thumbnail_path) || null
        : null,
    }));

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
    console.error("[api/search/media] Unexpected error:", err);
    return NextResponse.json(
      { ok: false, data: null, error: { code: "SEARCH_FAILED", message: err.message || "Media search failed" } },
      { status: 500 }
    );
  }
}
