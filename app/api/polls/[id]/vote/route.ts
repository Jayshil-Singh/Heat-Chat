import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

/**
 * POST /api/polls/[id]/vote
 * Cast or toggle votes on a poll.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: pollId } = await params;
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

  const body = await request.json().catch(() => ({}));
  const optionIds = Array.isArray(body.optionIds) ? body.optionIds : [];

  // Call atomic vote_poll RPC
  const { error: rpcErr } = await (supabase.rpc as any)("vote_poll", {
    p_poll_id: pollId,
    p_option_ids: optionIds,
  });

  if (rpcErr) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "VOTE_FAILED", message: rpcErr.message || "Failed to submit vote" } },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    data: { voted: true },
    error: null,
  });
}
