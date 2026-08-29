import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const supabase = await createClient();

    const { data: invRecords, error } = await supabase.rpc("admin_validate_invitation", {
      p_token_hash: tokenHash,
    });

    if (error || !invRecords || invRecords.length === 0) {
      return NextResponse.json(
        { valid: false, error: "Invalid invitation token." },
        { status: 400 }
      );
    }

    const inv = invRecords[0];
    if (!inv.is_valid) {
      return NextResponse.json(
        { valid: false, error: inv.invalid_reason || "Invalid invitation token." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      valid: true,
      email: inv.email,
      roleName: inv.role_name,
      invitedBy: inv.invited_by_username,
    });
  } catch (error) {
    console.error("Error validating invitation:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const { password, displayName } = await req.json();

    if (!token || !password) {
      return NextResponse.json(
        { error: "MISSING_FIELDS", message: "Token and password are required." },
        { status: 400 }
      );
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const supabase = await createClient();

    // 1. Validate invitation
    const { data: invRecords, error: valErr } = await supabase.rpc("admin_validate_invitation", {
      p_token_hash: tokenHash,
    });

    if (valErr || !invRecords || invRecords.length === 0 || !invRecords[0].is_valid) {
      return NextResponse.json(
        { error: "INVALID_TOKEN", message: invRecords?.[0]?.invalid_reason || "Invalid or expired invitation." },
        { status: 400 }
      );
    }

    const inv = invRecords[0];
    const email = inv.email!;

    // 2. Sign up / set credentials
    const { data: signUpData, error: signErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName?.trim() || email.split("@")[0],
          username: email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, ""),
        },
      },
    });

    if (signErr) {
      return NextResponse.json(
        { error: "SIGNUP_FAILED", message: signErr.message },
        { status: 400 }
      );
    }

    const user = signUpData.user;
    if (!user) {
      return NextResponse.json(
        { error: "SIGNUP_FAILED", message: "Failed to initialize administrator user." },
        { status: 400 }
      );
    }

    // 3. If email is already confirmed (e.g. auto-confirm environment), accept invitation immediately
    if (user.email_confirmed_at) {
      const { error: acceptErr } = await supabase.rpc("admin_accept_invitation", {
        p_user_id: user.id,
        p_token_hash: tokenHash,
      });

      if (acceptErr) {
        console.error("Failed to accept invitation immediately:", acceptErr);
      }
    }

    return NextResponse.json({
      success: true,
      userId: user.id,
      email: user.email,
      isEmailVerified: Boolean(user.email_confirmed_at),
      message: "Administrator account initialized. Please proceed to MFA enrollment.",
    });
  } catch (error) {
    console.error("Error accepting invitation:", error);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Failed to process invitation acceptance." },
      { status: 500 }
    );
  }
}
