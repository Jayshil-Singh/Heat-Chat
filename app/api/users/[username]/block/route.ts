import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(
  request: NextRequest,
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

    // Resolve target user exists by ID or username
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetIdentifier);
    let targetProfile = null;
    if (isUuid) {
      const { data } = await supabase
        .from("profiles")
        .select("id, username")
        .eq("id", targetIdentifier)
        .maybeSingle();
      targetProfile = data;
    } else {
      const { data } = await supabase
        .from("profiles")
        .select("id, username")
        .ilike("username", targetIdentifier)
        .maybeSingle();
      targetProfile = data;
    }

    if (!targetProfile) {
      return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    }

    if (user.id === targetProfile.id) {
      return NextResponse.json(
        { error: "BLOCK_SELF_FORBIDDEN", message: "You cannot block yourself." },
        { status: 400 }
      );
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
        blocked_user_id: targetProfile.id,
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
      .or(`and(user_id.eq.${user.id},friend_id.eq.${targetProfile.id}),and(user_id.eq.${targetProfile.id},friend_id.eq.${user.id})`);

    return NextResponse.json({
      success: true,
      blocked: true,
      targetId: targetProfile.id,
    });
  } catch (err: any) {
    console.error("[Heat Chat] POST /api/users/[username]/block error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

export async function DELETE(
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

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetIdentifier);
    let targetProfileId: string = targetIdentifier;
    if (!isUuid) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id")
        .ilike("username", targetIdentifier)
        .maybeSingle();
      if (prof) targetProfileId = prof.id;
    }

    const { error: unblockError } = await supabase
      .from("blocked_users")
      .delete()
      .eq("user_id", user.id)
      .eq("blocked_user_id", targetProfileId);

    if (unblockError) {
      console.error("[Heat Chat] Unblock error:", unblockError.message);
      return NextResponse.json({ error: "UNBLOCK_FAILED" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      blocked: false,
      targetId: targetProfileId,
    });
  } catch (err: any) {
    console.error("[Heat Chat] DELETE /api/users/[username]/block error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
