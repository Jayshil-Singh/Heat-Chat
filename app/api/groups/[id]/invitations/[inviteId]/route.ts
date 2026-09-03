import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

/**
 * PATCH /api/groups/[id]/invitations/[inviteId]
 * Accept or Decline an invitation.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
) {
  const { id: conversationId, inviteId } = await params;
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
  const action = body.action; // 'accept' | 'decline'

  if (action !== "accept" && action !== "decline") {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "VALIDATION_ERROR", message: "action must be 'accept' or 'decline'" } },
      { status: 400 }
    );
  }

  // Fetch invitation
  const { data: invite, error: fetchErr } = await supabase
    .from("group_invitations")
    .select("id, conversation_id, invitee_id, status, expires_at")
    .eq("id", inviteId)
    .eq("conversation_id", conversationId)
    .single();

  if (fetchErr || !invite) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "NOT_FOUND", message: "Invitation not found" } },
      { status: 404 }
    );
  }

  if (invite.invitee_id !== user.id) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "FORBIDDEN", message: "Only the invitee can respond to this invitation" } },
      { status: 403 }
    );
  }

  if (invite.status !== "pending") {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "INVALID_STATE", message: `Invitation is already ${invite.status}` } },
      { status: 400 }
    );
  }

  if (new Date(invite.expires_at) < new Date()) {
    await supabase
      .from("group_invitations")
      .update({ status: "expired" })
      .eq("id", inviteId);

    return NextResponse.json(
      { ok: false, data: null, error: { code: "EXPIRED", message: "Invitation has expired" } },
      { status: 400 }
    );
  }

  if (action === "accept") {
    // Add user as member
    const { error: joinErr } = await supabase
      .from("conversation_members")
      .insert({
        conversation_id: conversationId,
        user_id: user.id,
        role: "member",
      });

    if (joinErr && !joinErr.message.includes("duplicate")) {
      return NextResponse.json(
        { ok: false, data: null, error: { code: "JOIN_FAILED", message: joinErr.message } },
        { status: 500 }
      );
    }

    await supabase
      .from("group_invitations")
      .update({ status: "accepted", responded_at: new Date().toISOString() })
      .eq("id", inviteId);

    return NextResponse.json({
      ok: true,
      data: { status: "accepted", conversationId },
      error: null,
    });
  } else {
    await supabase
      .from("group_invitations")
      .update({ status: "declined", responded_at: new Date().toISOString() })
      .eq("id", inviteId);

    return NextResponse.json({
      ok: true,
      data: { status: "declined" },
      error: null,
    });
  }
}

/**
 * DELETE /api/groups/[id]/invitations/[inviteId]
 * Cancel an invitation (inviter or admin only).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
) {
  const { id: conversationId, inviteId } = await params;
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

  // Fetch invitation
  const { data: invite } = await supabase
    .from("group_invitations")
    .select("id, inviter_id, status")
    .eq("id", inviteId)
    .eq("conversation_id", conversationId)
    .maybeSingle();

  if (!invite) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "NOT_FOUND", message: "Invitation not found" } },
      { status: 404 }
    );
  }

  const isInviter = invite.inviter_id === user.id;

  if (!isInviter) {
    // Check if caller is admin
    const { data: member } = await supabase
      .from("conversation_members")
      .select("role")
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!member || (member.role !== "owner" && member.role !== "admin")) {
      return NextResponse.json(
        { ok: false, data: null, error: { code: "FORBIDDEN", message: "Not authorized to cancel this invitation" } },
        { status: 403 }
      );
    }
  }

  await supabase
    .from("group_invitations")
    .update({ status: "cancelled", responded_at: new Date().toISOString() })
    .eq("id", inviteId);

  return NextResponse.json({
    ok: true,
    data: { cancelled: true },
    error: null,
  });
}
