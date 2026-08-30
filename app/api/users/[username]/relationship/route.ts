import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username: targetIdentifier } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    // Resolve target profile by ID or username
    let targetProfileId: string | null = null;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      targetIdentifier
    );

    if (isUuid) {
      targetProfileId = targetIdentifier;
    } else {
      const { data: targetProfile } = await supabase
        .from("profiles")
        .select("id")
        .ilike("username", targetIdentifier)
        .single();
      targetProfileId = targetProfile?.id || null;
    }

    if (!targetProfileId) {
      return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    }

    const { data: state, error: stateError } = await supabase.rpc(
      "get_user_relationship_state",
      {
        p_viewer_id: user.id,
        p_target_id: targetProfileId,
      }
    );

    if (stateError) {
      console.error("[Heat Chat] get_user_relationship_state RPC error:", stateError.message);
      return NextResponse.json({ error: "FAILED_TO_GET_RELATIONSHIP" }, { status: 500 });
    }

    return NextResponse.json({
      targetId: targetProfileId,
      ...(state as any),
    });
  } catch (err: any) {
    console.error("[Heat Chat] GET /api/users/[username]/relationship error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
