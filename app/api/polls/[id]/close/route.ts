import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { isValidUuid } from "@/lib/validation/uuid";

/**
 * POST /api/polls/[id]/close
 * Close an active poll (creator or admin only).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: pollId } = await params;

  if (!isValidUuid(pollId)) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "INVALID_POLL_ID", message: "Invalid poll ID format" } },
      { status: 400 }
    );
  }

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

  // Call atomic close_poll RPC
  const { error: rpcErr } = await (supabase.rpc as any)("close_poll", {
    p_poll_id: pollId,
  });

  if (rpcErr) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "CLOSE_FAILED", message: rpcErr.message || "Failed to close poll" } },
      { status: 403 }
    );
  }

  return NextResponse.json({
    ok: true,
    data: { closed: true },
    error: null,
  });
}
