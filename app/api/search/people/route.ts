import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import type { SearchPeopleResult } from "@/types/chat";

/**
 * GET /api/search/people
 *
 * Search users by username or display name.
 *
 * Query params:
 *   q     - Search query string (min 1 char)
 *   limit - Max results (default 20, max 50)
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
  const rawLimit = parseInt(searchParams.get("limit") || "20", 10);
  const limit = Math.min(Math.max(isNaN(rawLimit) ? 20 : rawLimit, 1), 50);

  const trimmed = q.trim();
  if (!trimmed) {
    return NextResponse.json({
      ok: true,
      data: { items: [], count: 0 },
      error: null,
    });
  }

  try {
    const { data, error } = (await (supabase.rpc as any)("search_people", {
      p_query: trimmed,
      p_limit: limit,
    })) as { data: any[] | null; error: { message?: string } | null };

    if (error) {
      console.error("[search_people] RPC error:", error);
      return NextResponse.json(
        { ok: false, data: null, error: { code: "SEARCH_FAILED", message: error.message || "People search failed" } },
        { status: 500 }
      );
    }

    const items: SearchPeopleResult[] = (data || []).map((row) => ({
      id: row.id,
      username: row.username,
      displayName: row.display_name || row.username,
      avatarUrl: row.avatar_url || null,
      bio: row.bio || null,
      status: row.status || "offline",
      isFriend: Boolean(row.is_friend),
      isBlocked: Boolean(row.is_blocked),
    }));

    return NextResponse.json({
      ok: true,
      data: {
        items,
        count: items.length,
      },
      error: null,
    });
  } catch (err: any) {
    console.error("[api/search/people] Unexpected error:", err);
    return NextResponse.json(
      { ok: false, data: null, error: { code: "SEARCH_FAILED", message: err.message || "People search failed" } },
      { status: 500 }
    );
  }
}
