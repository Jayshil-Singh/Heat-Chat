import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { isValidUuid } from "@/lib/validation/uuid";

/**
 * GET /api/groups/[id]/invitations
 * List pending invitations for the group.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params;

  if (!isValidUuid(conversationId)) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "INVALID_CONVERSATION_ID", message: "Invalid conversation ID format" } },
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

  // Caller must be member
  const { data: member } = await supabase
    .from("conversation_members")
    .select("role")
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "FORBIDDEN", message: "You are not a member of this group" } },
      { status: 403 }
    );
  }

  const { data: invites, error: inviteErr } = await supabase
    .from("group_invitations")
    .select(`
      id,
      conversation_id,
      inviter_id,
      invitee_id,
      status,
      created_at,
      expires_at,
      inviter:inviter_id (
        id,
        username,
        display_name,
        avatar_url
      ),
      invitee:invitee_id (
        id,
        username,
        display_name,
        avatar_url
      )
    `)
    .eq("conversation_id", conversationId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (inviteErr) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "DATABASE_ERROR", message: inviteErr.message } },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    data: {
      invitations: (invites || []).map((inv: any) => ({
        id: inv.id,
        conversationId: inv.conversation_id,
        inviterId: inv.inviter_id,
        inviterName: inv.inviter?.display_name || "Unknown",
        inviterUsername: inv.inviter?.username || "unknown",
        inviterAvatar: inv.inviter?.avatar_url || null,
        inviteeId: inv.invitee_id,
        inviteeName: inv.invitee?.display_name || "Unknown",
        inviteeUsername: inv.invitee?.username || "unknown",
        inviteeAvatar: inv.invitee?.avatar_url || null,
        status: inv.status,
        createdAt: inv.created_at,
        expiresAt: inv.expires_at,
      })),
    },
    error: null,
  });
}

/**
 * POST /api/groups/[id]/invitations
 * Send a group invitation to a user.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params;

  if (!isValidUuid(conversationId)) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "INVALID_CONVERSATION_ID", message: "Invalid conversation ID format" } },
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

  const body = await request.json().catch(() => ({}));
  const inviteeId = body.inviteeId;

  if (!inviteeId || typeof inviteeId !== "string" || !isValidUuid(inviteeId)) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "VALIDATION_ERROR", message: "Valid inviteeId UUID is required" } },
      { status: 400 }
    );
  }

  // Caller must be member
  const { data: member } = await supabase
    .from("conversation_members")
    .select("role")
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "FORBIDDEN", message: "You are not a member of this group" } },
      { status: 403 }
    );
  }

  // Check group permissions for who_can_add_members
  const { data: conv } = await supabase
    .from("conversations")
    .select("permissions")
    .eq("id", conversationId)
    .maybeSingle();

  const whoCanAdd = (conv?.permissions as any)?.who_can_add_members || "all_members";
  if (whoCanAdd === "admin_only" && member.role !== "owner" && member.role !== "admin") {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "FORBIDDEN", message: "Only group owners and admins can invite new members" } },
      { status: 403 }
    );
  }

  // Check if caller or target has blocked the other
  const { data: isBlocked } = await (supabase.rpc as any)("is_user_blocked", {
    user_a: user.id,
    user_b: inviteeId,
  });

  if (isBlocked) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "BLOCKED_USER", message: "Cannot send group invitations to or from blocked users" } },
      { status: 403 }
    );
  }

  // Check if target is already member
  const { data: targetMember } = await supabase
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", inviteeId)
    .maybeSingle();

  if (targetMember) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "ALREADY_MEMBER", message: "User is already a member of this group" } },
      { status: 400 }
    );
  }

  // Create invitation
  const { data: newInvite, error: insertErr } = await supabase
    .from("group_invitations")
    .insert({
      conversation_id: conversationId,
      inviter_id: user.id,
      invitee_id: inviteeId,
      status: "pending",
    })
    .select("id, conversation_id, inviter_id, invitee_id, status, created_at, expires_at")
    .single();

  if (insertErr) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "INVITATION_FAILED", message: insertErr.message } },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    data: { invitation: newInvite },
    error: null,
  });
}
