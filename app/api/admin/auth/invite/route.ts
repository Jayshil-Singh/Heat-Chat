import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireAdminPermission } from "@/lib/admin/auth";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const auth = await requireAdminPermission("roles.manage", { requireRecentMfa: true });
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { email, roleId, expiresHours } = await req.json();

    if (!email || !roleId) {
      return NextResponse.json(
        { error: "MISSING_FIELDS", message: "Email and role ID are required." },
        { status: 400 }
      );
    }

    // 1. Generate random token and hash
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    const supabase = await createClient();

    // 2. Call RPC to create invitation with hierarchy checks
    const { data: invitationId, error } = await supabase.rpc("admin_create_invitation", {
      p_email: email.trim().toLowerCase(),
      p_role_id: roleId,
      p_token_hash: tokenHash,
      p_expires_hours: expiresHours || 48,
    });

    if (error) {
      return NextResponse.json(
        { error: "INVITATION_FAILED", message: error.message },
        { status: 400 }
      );
    }

    // Return the one-time rawToken so the frontend/mailer can construct the link
    return NextResponse.json({
      success: true,
      invitationId,
      token: rawToken,
      email: email.trim().toLowerCase(),
      inviteUrl: `/admin/invite/${rawToken}`,
      message: "Administrator invitation generated successfully.",
    });
  } catch (error) {
    console.error("Error generating admin invitation:", error);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Failed to generate administrator invitation." },
      { status: 500 }
    );
  }
}
