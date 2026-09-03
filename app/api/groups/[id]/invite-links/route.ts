import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { getSiteUrl } from "@/lib/utils/site-url";

/**
 * GET /api/groups/[id]/invite-links
 * List active invite links for the group.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params;
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

  // Verify caller membership
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

  const { data: links, error: fetchErr } = await supabase
    .from("group_invite_links")
    .select("id, conversation_id, token, created_by, max_uses, uses_count, is_revoked, expires_at, created_at")
    .eq("conversation_id", conversationId)
    .eq("is_revoked", false)
    .order("created_at", { ascending: false });

  if (fetchErr) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "DATABASE_ERROR", message: fetchErr.message } },
      { status: 500 }
    );
  }

  const siteUrl = getSiteUrl();

  return NextResponse.json({
    ok: true,
    data: {
      inviteLinks: (links || []).map((link) => ({
        id: link.id,
        conversationId: link.conversation_id,
        token: link.token,
        inviteUrl: `${siteUrl}/group/invite/${link.token}`,
        createdBy: link.created_by,
        maxUses: link.max_uses,
        usesCount: link.uses_count,
        isRevoked: link.is_revoked,
        expiresAt: link.expires_at,
        createdAt: link.created_at,
      })),
    },
    error: null,
  });
}

/**
 * POST /api/groups/[id]/invite-links
 * Generate a new cryptographically secure invite link.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params;
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

  // Caller must be admin or owner
  const { data: member } = await supabase
    .from("conversation_members")
    .select("role")
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "FORBIDDEN", message: "Only group owners and admins can generate invite links" } },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const maxUses = typeof body.maxUses === "number" && body.maxUses > 0 ? body.maxUses : null;
  const expiresInDays = typeof body.expiresInDays === "number" && body.expiresInDays > 0 ? body.expiresInDays : null;

  let expiresAt: string | null = null;
  if (expiresInDays) {
    const d = new Date();
    d.setDate(d.getDate() + expiresInDays);
    expiresAt = d.toISOString();
  }

  // High entropy token (32 bytes = 256 bits hex = 64 characters)
  const token = crypto.randomBytes(32).toString("hex");

  const { data: link, error: insertErr } = await supabase
    .from("group_invite_links")
    .insert({
      conversation_id: conversationId,
      token,
      created_by: user.id,
      max_uses: maxUses,
      expires_at: expiresAt,
    })
    .select("id, conversation_id, token, created_by, max_uses, uses_count, is_revoked, expires_at, created_at")
    .single();

  if (insertErr) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "LINK_CREATION_FAILED", message: insertErr.message } },
      { status: 500 }
    );
  }

  const siteUrl = getSiteUrl();

  return NextResponse.json({
    ok: true,
    data: {
      inviteLink: {
        id: link.id,
        conversationId: link.conversation_id,
        token: link.token,
        inviteUrl: `${siteUrl}/group/invite/${link.token}`,
        createdBy: link.created_by,
        maxUses: link.max_uses,
        usesCount: link.uses_count,
        isRevoked: link.is_revoked,
        expiresAt: link.expires_at,
        createdAt: link.created_at,
      },
    },
    error: null,
  });
}

/**
 * DELETE /api/groups/[id]/invite-links
 * Revoke an existing invite link.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params;
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
  const linkId = searchParams.get("linkId");

  if (!linkId) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "VALIDATION_ERROR", message: "linkId is required" } },
      { status: 400 }
    );
  }

  // Caller must be admin or owner
  const { data: member } = await supabase
    .from("conversation_members")
    .select("role")
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "FORBIDDEN", message: "Only group owners and admins can revoke invite links" } },
      { status: 403 }
    );
  }

  const { error: updateErr } = await supabase
    .from("group_invite_links")
    .update({ is_revoked: true })
    .eq("id", linkId)
    .eq("conversation_id", conversationId);

  if (updateErr) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "DATABASE_ERROR", message: updateErr.message } },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    data: { revoked: true },
    error: null,
  });
}
