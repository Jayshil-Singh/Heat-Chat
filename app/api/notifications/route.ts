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
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
  const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10));
  const category = searchParams.get("category") || "all";

  // Fetch paginated notifications
  const { data: notifications, error: notifError } = await supabase.rpc("get_user_notifications", {
    p_limit: limit,
    p_offset: offset,
    p_category: category,
  });

  if (notifError) {
    return NextResponse.json({ error: notifError.message }, { status: 500 });
  }

  // Fetch unread count
  const { data: unreadCount, error: countError } = await supabase.rpc("get_notification_unread_count");

  return NextResponse.json({
    notifications: notifications || [],
    unreadCount: unreadCount || 0,
    limit,
    offset,
  });
}
