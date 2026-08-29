import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/auth";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const auth = await requireAdminPermission("security.view");
  if (auth.errorResponse) return auth.errorResponse;

  const { searchParams } = new URL(request.url);
  const eventType = searchParams.get("type") || "all";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(10, parseInt(searchParams.get("limit") || "20", 10)));
  const offset = (page - 1) * limit;

  try {
    const supabase = await createClient();

    let query = supabase
      .from("admin_security_events")
      .select("*", { count: "exact" });

    if (eventType !== "all") {
      query = query.eq("event_type", eventType);
    }

    query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

    const { data: events, count, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      events: events || [],
      total: count || (events || []).length,
      page,
      limit,
      totalPages: Math.ceil((count || (events || []).length) / limit),
    });
  } catch (err) {
    console.error("Security events API error:", err);
    return NextResponse.json({ error: "Failed to fetch security events" }, { status: 500 });
  }
}
