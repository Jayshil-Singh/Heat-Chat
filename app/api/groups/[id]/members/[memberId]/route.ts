import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import type { MemberRole } from "@/types/database";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * DELETE /api/groups/[id]/members/[memberId]
 *
 * Removes a member from a group conversation with atomic server-side authorization:
 * - Owner: can remove anyone except themselves
 * - Admin: can remove moderators and members (cannot remove owner or other admins)
 * - Moderator: can remove regular members only (cannot remove owner, admin, or fellow moderators)
 * - Member: cannot remove any member
 * - Non-owner self-removal: allowed (voluntary leave)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const { id: conversationId, memberId: targetUserId } = await params;
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

  // 1. Validate UUIDs
  if (!UUID_REGEX.test(conversationId) || !UUID_REGEX.test(targetUserId)) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "INVALID_ARGUMENTS", message: "Invalid group or member ID format" } },
      { status: 400 }
    );
  }

  // 2. Fetch conversation
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, type")
    .eq("id", conversationId)
    .maybeSingle();

  if (convErr) {
    console.error("[api/groups/members] Error fetching conversation:", convErr);
    return NextResponse.json(
      { ok: false, data: null, error: { code: "DATABASE_ERROR", message: "Error verifying group" } },
      { status: 500 }
    );
  }

  if (!conv || conv.type !== "group") {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "GROUP_NOT_FOUND", message: "Group conversation not found" } },
      { status: 404 }
    );
  }

  // 3. Fetch caller role
  const { data: callerMember, error: callerErr } = await supabase
    .from("conversation_members")
    .select("role")
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (callerErr || !callerMember) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "FORBIDDEN", message: "You are not a member of this group" } },
      { status: 403 }
    );
  }

  // 4. Fetch target member role
  const { data: targetMember, error: targetErr } = await supabase
    .from("conversation_members")
    .select("role")
    .eq("conversation_id", conversationId)
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (targetErr) {
    console.error("[api/groups/members] Error fetching target member:", targetErr);
    return NextResponse.json(
      { ok: false, data: null, error: { code: "DATABASE_ERROR", message: "Error verifying target member" } },
      { status: 500 }
    );
  }

  if (!targetMember) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "TARGET_NOT_MEMBER", message: "Target user is not a member of this group" } },
      { status: 404 }
    );
  }

  const callerRole = callerMember.role as MemberRole;
  const targetRole = targetMember.role as MemberRole;
  const isSelf = user.id === targetUserId;

  // 5. Self-removal rules
  if (isSelf) {
    if (callerRole === "owner") {
      return NextResponse.json(
        { ok: false, data: null, error: { code: "OWNER_CANNOT_LEAVE", message: "Owner cannot remove themselves. Transfer ownership first." } },
        { status: 400 }
      );
    }
  } else {
    // 6. Role hierarchy rules for removing others
    if (callerRole === "owner") {
      // Owner can remove anyone
    } else if (callerRole === "admin") {
      if (targetRole === "owner" || targetRole === "admin") {
        return NextResponse.json(
          { ok: false, data: null, error: { code: "FORBIDDEN_HIERARCHY", message: "Admins cannot remove other admins or the group owner" } },
          { status: 403 }
        );
      }
    } else if (callerRole === "moderator") {
      if (targetRole === "owner" || targetRole === "admin" || targetRole === "moderator") {
        return NextResponse.json(
          { ok: false, data: null, error: { code: "FORBIDDEN_HIERARCHY", message: "Moderators cannot remove admins, owners, or other moderators" } },
          { status: 403 }
        );
      }
    } else {
      return NextResponse.json(
        { ok: false, data: null, error: { code: "FORBIDDEN", message: "Regular members cannot remove other members" } },
        { status: 403 }
      );
    }
  }

  // 7. Atomic removal execution
  const { error: deleteErr } = await supabase
    .from("conversation_members")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("user_id", targetUserId);

  if (deleteErr) {
    console.error("[api/groups/members] Deletion error:", deleteErr);
    return NextResponse.json(
      { ok: false, data: null, error: { code: "DATABASE_ERROR", message: "Failed to remove group member" } },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    data: {
      removed: true,
      userId: targetUserId,
      conversationId,
      isSelf,
    },
    error: null,
  });
}
