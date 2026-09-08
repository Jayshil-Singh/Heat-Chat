import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const rawLimit = parseInt(searchParams.get("limit") || "50", 10);
  const limit = Math.min(50, Math.max(1, isNaN(rawLimit) ? 50 : rawLimit));

  const rawOffset = parseInt(searchParams.get("offset") || "0", 10);
  const offset = Math.max(0, isNaN(rawOffset) ? 0 : rawOffset);

  const rawCategory = searchParams.get("category") || "all";
  const validCategories = ["all", "messages", "mentions", "groups", "friends", "reactions", "system"];
  const category = validCategories.includes(rawCategory) ? rawCategory : "all";

  const cursor = searchParams.get("cursor_created_at") || searchParams.get("cursor");
  const cursorId = searchParams.get("cursor_id");
  const cursorIdRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Validate cursor parameters if provided
  if (cursor) {
    if (isNaN(Date.parse(cursor))) {
      return NextResponse.json({ error: "Invalid cursor date format" }, { status: 400 });
    }

    if (cursorId && !cursorIdRegex.test(cursorId)) {
      return NextResponse.json({ error: "Invalid cursor id format" }, { status: 400 });
    }

    const { data: page, error: cursorError } = await (supabase.rpc as any)("get_user_notifications_cursor", {
      p_limit: limit,
      p_cursor_created_at: cursor,
      p_cursor_id: cursorId || null,
      p_category: category,
    });

    if (cursorError) {
      return NextResponse.json({ error: "Unable to load notifications" }, { status: 500 });
    }

    const { data: unreadCount } = await supabase.rpc("get_notification_unread_count");
    const pageData = page as { items?: any[]; has_more?: boolean; next_cursor?: any } | null;

    return NextResponse.json({
      notifications: pageData?.items || [],
      unreadCount: typeof unreadCount === "number" ? unreadCount : 0,
      hasMore: Boolean(pageData?.has_more),
      nextCursor: pageData?.next_cursor || null,
      limit,
    });
  }

  // Fetch paginated notifications (offset fallback)
  const { data: notifications, error: notifError } = await supabase.rpc("get_user_notifications", {
    p_limit: limit,
    p_offset: offset,
    p_category: category,
  });

  if (notifError) {
    return NextResponse.json({ error: "Unable to load notifications: Failed to retrieve notifications" }, { status: 500 });
  }

  // Fetch unread count
  const { data: unreadCount } = await supabase.rpc("get_notification_unread_count");

  return NextResponse.json({
    notifications: notifications || [],
    unreadCount: typeof unreadCount === "number" ? unreadCount : 0,
    limit,
    offset,
  });
}
