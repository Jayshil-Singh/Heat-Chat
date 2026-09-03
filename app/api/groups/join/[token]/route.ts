import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

/**
 * POST /api/groups/join/[token]
 * Join a group conversation using a valid, non-revoked, unexpired invite link token.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
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

  if (!token || typeof token !== "string") {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "INVALID_TOKEN", message: "Invalid invite token" } },
      { status: 400 }
    );
  }

  // Call atomic SECURITY DEFINER RPC
  const { data: conversationId, error: rpcErr } = await (supabase.rpc as any)("join_group_via_invite_link", {
    p_token: token.trim(),
  });

  if (rpcErr) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "JOIN_FAILED", message: rpcErr.message || "Failed to join group" } },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    data: { conversationId },
    error: null,
  });
}
