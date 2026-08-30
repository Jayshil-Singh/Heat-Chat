import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

/**
 * GET /api/conversations/[id]/media
 *
 * Returns paginated media attachments for a conversation, filtered by category.
 *
 * Query params:
 *   category  - "all" | "media" | "audio" | "files"  (default: "all")
 *   limit     - number of items per page               (default: 30, max: 60)
 *   before    - ISO timestamp for cursor pagination
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: conversationId } = await params;
  const { searchParams } = new URL(request.url);

  const category = searchParams.get("category") || "all";
  const rawLimit = parseInt(searchParams.get("limit") || "30", 10);
  const limit = Math.min(Math.max(rawLimit, 1), 60);
  const before = searchParams.get("before") || null;

  if (!["all", "media", "audio", "files"].includes(category)) {
    return NextResponse.json(
      { error: "Invalid category. Must be one of: all, media, audio, files" },
      { status: 400 }
    );
  }

  // Call secure RPC that enforces membership and hidden-message exclusion
  // eslint-disable-next-line
  const { data, error } = await (supabase.rpc as any)("get_conversation_media", {
    p_conversation_id: conversationId,
    p_category: category,
    p_limit: limit,
    p_before: before,
  }) as { data: any[] | null; error: { message?: string } | null };

  if (error) {
    if (error.message?.includes("CONVERSATION_ACCESS_DENIED")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error.message?.includes("UNAUTHENTICATED")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[media-gallery] rpc error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  if (!data || (data as any[]).length === 0) {
    return NextResponse.json({ items: [], hasMore: false, nextCursor: null });
  }

  const rows = data as any[];
  // Batch-resolve signed URLs for all storage_path and thumbnail_path values
  const storagePaths: string[] = rows.map((item) => item.storage_path as string);
  const thumbnailPaths: string[] = rows
    .map((item) => item.thumbnail_path as string | null)
    .filter((p): p is string => !!p);

  const [signedRes, thumbRes] = await Promise.all([
    supabase.storage.from("chat-attachments").createSignedUrls(storagePaths, 3600),
    thumbnailPaths.length > 0
      ? supabase.storage.from("chat-attachments").createSignedUrls(thumbnailPaths, 3600)
      : Promise.resolve({ data: [] as Array<{ path: string | null; signedUrl: string | null; signedURL: string | null; error: string | null }> }),
  ]);

  // Map thumbnail_path → signed URL
  const thumbSignedMap = new Map<string, string>();
  (thumbRes.data || []).forEach((row) => {
    if (row.path && row.signedUrl) thumbSignedMap.set(row.path, row.signedUrl);
  });

  const items = rows.map((item, idx: number) => ({
    attachmentId: item.attachment_id,
    messageId: item.message_id,
    senderId: item.sender_id,
    conversationId: item.conversation_id,
    messageType: item.message_type,
    fileName: item.file_name,
    fileType: item.file_type,
    fileSize: item.file_size,
    width: item.width,
    height: item.height,
    durationSeconds: item.duration_seconds,
    metadata: item.metadata,
    storagePath: item.storage_path,
    thumbnailPath: item.thumbnail_path,
    createdAt: item.created_at,
    signedUrl: signedRes.data?.[idx]?.signedUrl || "",
    thumbnailSignedUrl: item.thumbnail_path
      ? (thumbSignedMap.get(item.thumbnail_path as string) || null)
      : null,
  }));

  const hasMore = items.length === limit;
  const nextCursor = hasMore ? (items[items.length - 1].createdAt as string) : null;

  return NextResponse.json({ items, hasMore, nextCursor });
}
