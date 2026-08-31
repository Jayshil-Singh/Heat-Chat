import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import type { MentionCandidate } from "@/types/chat";

/**
 * GET /api/mentions/candidates
 *
 * Query candidate members of a conversation eligible for `@username` autocomplete.
 *
 * Query params:
 *   conversationId - Conversation ID (required)
 *   q              - Prefix/query string (optional)
 *   limit          - Max candidates (default 10, max 25)
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
  const conversationId = searchParams.get("conversationId");
  const q = searchParams.get("q") || "";
  const rawLimit = parseInt(searchParams.get("limit") || "10", 10);
  const limit = Math.min(Math.max(isNaN(rawLimit) ? 10 : rawLimit, 1), 25);

  if (!conversationId) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "INVALID_ARGUMENT", message: "conversationId is required" } },
      { status: 400 }
    );
  }

  try {
    // eslint-disable-next-line
    const { data, error } = (await (supabase.rpc as any)("get_mention_candidates", {
      p_conversation_id: conversationId,
      p_query: q.trim(),
      p_limit: limit,
    })) as { data: any[] | null; error: { message?: string } | null };

    if (error) {
      if (error.message?.includes("CONVERSATION_ACCESS_DENIED")) {
        return NextResponse.json(
          { ok: false, data: null, error: { code: "CONVERSATION_ACCESS_DENIED", message: "Not authorized to mention in this conversation" } },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { ok: false, data: null, error: { code: "SEARCH_FAILED", message: error.message || "Failed to find mention candidates" } },
        { status: 500 }
      );
    }

    const items: MentionCandidate[] = (data || []).map((row) => ({
      userId: row.user_id,
      username: row.username,
      displayName: row.display_name || row.username,
      avatarUrl: row.avatar_url || null,
    }));

    return NextResponse.json({
      ok: true,
      data: {
        candidates: items,
        count: items.length,
      },
      error: null,
    });
  } catch (err: any) {
    console.error("[api/mentions/candidates] Unexpected error:", err);
    return NextResponse.json(
      { ok: false, data: null, error: { code: "SEARCH_FAILED", message: err.message || "Failed to find mention candidates" } },
      { status: 500 }
    );
  }
}
