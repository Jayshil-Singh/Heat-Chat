import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { isValidUuid } from "@/lib/validation/uuid";

/**
 * GET /api/groups/[id]
 * Fetch detailed group conversation data, member details, roles, permissions.
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

  // Verify caller membership
  const { data: memberRecord, error: memErr } = await supabase
    .from("conversation_members")
    .select("role")
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (memErr || !memberRecord) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "FORBIDDEN", message: "You are not a member of this group" } },
      { status: 403 }
    );
  }

  // Fetch conversation record
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, type, name, description, avatar_url, cover_url, privacy, permissions, created_by, created_at, updated_at")
    .eq("id", conversationId)
    .single();

  if (convErr || !conv || conv.type !== "group") {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "NOT_FOUND", message: "Group conversation not found" } },
      { status: 404 }
    );
  }

  // Fetch all members with profiles
  const { data: members, error: membersErr } = await supabase
    .from("conversation_members")
    .select(`
      user_id,
      role,
      joined_at,
      profiles:user_id (
        id,
        username,
        display_name,
        avatar_url,
        status,
        presence_status
      )
    `)
    .eq("conversation_id", conversationId);

  if (membersErr) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "DATABASE_ERROR", message: membersErr.message } },
      { status: 500 }
    );
  }

  const memberDetails = (members || []).map((m: any) => ({
    userId: m.user_id,
    role: m.role,
    joinedAt: m.joined_at,
    profile: m.profiles,
  }));

  return NextResponse.json({
    ok: true,
    data: {
      group: {
        id: conv.id,
        name: conv.name,
        description: conv.description || "",
        avatarUrl: conv.avatar_url,
        coverUrl: conv.cover_url,
        privacy: conv.privacy || "private",
        permissions: conv.permissions || {},
        createdBy: conv.created_by,
        createdAt: conv.created_at,
        updatedAt: conv.updated_at,
        memberCount: memberDetails.length,
        currentUserRole: memberRecord.role,
        members: memberDetails,
      },
    },
    error: null,
  });
}

/**
 * PATCH /api/groups/[id]
 * Update group metadata (name, description, avatarUrl, coverUrl, privacy, permissions)
 */
export async function PATCH(
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

  // Verify caller is admin or owner
  const { data: memberRecord } = await supabase
    .from("conversation_members")
    .select("role")
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!memberRecord || (memberRecord.role !== "owner" && memberRecord.role !== "admin")) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "FORBIDDEN", message: "Only group owners and admins can edit group settings" } },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const updates: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof body.name === "string") {
    const trimmed = body.name.trim();
    if (trimmed.length < 1 || trimmed.length > 100) {
      return NextResponse.json(
        { ok: false, data: null, error: { code: "VALIDATION_ERROR", message: "Group name must be between 1 and 100 characters" } },
        { status: 400 }
      );
    }
    updates.name = trimmed;
  }

  if (typeof body.description === "string") {
    updates.description = body.description.trim().slice(0, 500);
  }

  if (typeof body.avatarUrl === "string" || body.avatarUrl === null) {
    updates.avatar_url = body.avatarUrl;
  }

  if (typeof body.coverUrl === "string" || body.coverUrl === null) {
    updates.cover_url = body.coverUrl;
  }

  if (body.privacy === "public" || body.privacy === "private") {
    updates.privacy = body.privacy;
  }

  if (typeof body.permissions === "object" && body.permissions !== null) {
    updates.permissions = body.permissions;
  }

  const { data: updatedConv, error: updateErr } = await (supabase
    .from("conversations")
    .update as any)(updates)
    .eq("id", conversationId)
    .select("id, name, description, avatar_url, cover_url, privacy, permissions, updated_at")
    .single();

  if (updateErr) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "DATABASE_ERROR", message: updateErr.message } },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    data: { group: updatedConv },
    error: null,
  });
}

/**
 * DELETE /api/groups/[id]
 * Owner-only group deletion.
 */
export async function DELETE(
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

  const { error: rpcErr } = await (supabase.rpc as any)("delete_group_conversation", {
    p_conv_id: conversationId,
  });

  if (rpcErr) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "FORBIDDEN", message: rpcErr.message || "Failed to delete group" } },
      { status: 403 }
    );
  }

  return NextResponse.json({
    ok: true,
    data: { deleted: true },
    error: null,
  });
}
