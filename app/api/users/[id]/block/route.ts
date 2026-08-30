import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    if (user.id === targetId) {
      return NextResponse.json(
        { error: "BLOCK_SELF_FORBIDDEN", message: "You cannot block yourself." },
        { status: 400 }
      );
    }

    // Verify target user exists
    const { data: targetProfile, error: targetError } = await supabase
      .from("profiles")
      .select("id, username")
      .eq("id", targetId)
      .single();

    if (targetError || !targetProfile) {
      return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    }

    let reason: string | null = null;
    try {
      const body = await request.json();
      if (body.reason && typeof body.reason === "string") {
        reason = body.reason.slice(0, 500);
      }
    } catch {
      // Empty body is acceptable
    }

    // Insert block record
    const { error: blockError } = await supabase
      .from("blocked_users")
      .upsert({
        user_id: user.id,
        blocked_user_id: targetId,
        reason,
      });

    if (blockError) {
      console.error("[Heat Chat] Block insert error:", blockError.message);
      return NextResponse.json({ error: "BLOCK_FAILED" }, { status: 500 });
    }

    // Terminate any active friendship or pending requests
    await supabase
      .from("friendships")
      .delete()
      .or(`and(user_id.eq.${user.id},friend_id.eq.${targetId}),and(user_id.eq.${targetId},friend_id.eq.${user.id})`);

    return NextResponse.json({
      success: true,
      blocked: true,
      targetId,
    });
  } catch (err: any) {
    console.error("[Heat Chat] POST /api/users/[id]/block error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { error: unblockError } = await supabase
      .from("blocked_users")
      .delete()
      .eq("user_id", user.id)
      .eq("blocked_user_id", targetId);

    if (unblockError) {
      console.error("[Heat Chat] Unblock error:", unblockError.message);
      return NextResponse.json({ error: "UNBLOCK_FAILED" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      blocked: false,
      targetId,
    });
  } catch (err: any) {
    console.error("[Heat Chat] DELETE /api/users/[id]/block error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
