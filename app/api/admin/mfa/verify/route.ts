import { NextRequest, NextResponse } from "next/server";
import { consumeRecoveryCode } from "@/lib/admin/mfa";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const { factorId, code, recoveryCode } = await req.json();

    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "Authentication required." },
        { status: 401 }
      );
    }

    let isVerified = false;

    // 1. If recovery code is provided
    if (recoveryCode) {
      const validCode = await consumeRecoveryCode(user.id, recoveryCode);
      if (!validCode) {
        return NextResponse.json(
          { error: "INVALID_RECOVERY_CODE", message: "Invalid or previously used recovery code." },
          { status: 400 }
        );
      }
      isVerified = true;
    } else if (factorId && code) {
      // 2. TOTP Verification via Supabase Auth
      const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: code.trim(),
      });

      if (challengeErr || !challengeData) {
        return NextResponse.json(
          { error: "INVALID_MFA_CODE", message: challengeErr?.message || "Invalid 6-digit authenticator code." },
          { status: 400 }
        );
      }
      isVerified = true;
    } else {
      return NextResponse.json(
        { error: "MISSING_FIELDS", message: "Authenticator code or recovery code is required." },
        { status: 400 }
      );
    }

    if (isVerified) {
      // Update database MFA timestamp and account state
      await supabase.rpc("admin_update_mfa_status", {
        p_user_id: user.id,
        p_enrolled: true,
        p_verified: true,
      });

      return NextResponse.json({
        success: true,
        message: "MFA challenge verified successfully. Session elevated to AAL2.",
      });
    }

    return NextResponse.json(
      { error: "VERIFICATION_FAILED", message: "Failed to verify MFA factor." },
      { status: 400 }
    );
  } catch (error) {
    console.error("MFA verification error:", error);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "An unexpected error occurred during MFA verification." },
      { status: 500 }
    );
  }
}
