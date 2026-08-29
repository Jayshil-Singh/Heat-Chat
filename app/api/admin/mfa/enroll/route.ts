import { NextResponse } from "next/server";
import { generateRecoveryCodes } from "@/lib/admin/mfa";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "Authentication required for MFA enrollment." },
        { status: 401 }
      );
    }

    // 1. Enroll TOTP factor in Supabase Auth
    const { data: enrollData, error: enrollErr } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Heat Chat Admin (${user.email})`,
    });

    if (enrollErr || !enrollData) {
      return NextResponse.json(
        { error: "MFA_ENROLL_FAILED", message: enrollErr?.message || "Failed to initiate MFA enrollment." },
        { status: 400 }
      );
    }

    // 2. Generate backup recovery codes
    const { plainCodes, hashedCodes } = generateRecoveryCodes(10);

    // 3. Store hashed recovery codes in DB
    const recoveryCodeInserts = hashedCodes.map((hc) => ({
      user_id: user.id,
      code_hash: hc.hash,
    }));

    await supabase.from("admin_mfa_recovery_codes").insert(recoveryCodeInserts);

    return NextResponse.json({
      success: true,
      factorId: enrollData.id,
      qrCode: enrollData.totp.qr_code,
      secret: enrollData.totp.secret,
      uri: enrollData.totp.uri,
      recoveryCodes: plainCodes,
    });
  } catch (error) {
    console.error("Error during MFA enrollment:", error);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Failed to process MFA enrollment." },
      { status: 500 }
    );
  }
}
