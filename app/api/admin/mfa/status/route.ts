import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    // List factors
    const { data: factorsData } = await supabase.auth.mfa.listFactors();
    const totpFactors = factorsData?.totp || [];
    const verifiedFactors = totpFactors.filter((f) => f.status === "verified");

    // Check assurance level
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const currentLevel = aalData?.currentLevel || "aal1";
    const isAal2 = currentLevel === "aal2";

    // Query DB record
    const { data: adminRole } = await supabase
      .from("admin_user_roles")
      .select("mfa_enrolled_at, mfa_last_verified_at, is_primary_superadmin, account_state")
      .eq("user_id", user.id)
      .single();

    return NextResponse.json({
      enrolled: verifiedFactors.length > 0 || Boolean(adminRole?.mfa_enrolled_at),
      verified: isAal2 || Boolean(adminRole?.mfa_last_verified_at),
      currentLevel,
      factorId: verifiedFactors[0]?.id || null,
      mfaLastVerifiedAt: adminRole?.mfa_last_verified_at || null,
      accountState: adminRole?.account_state || "ACTIVE",
    });
  } catch (error) {
    console.error("Error checking MFA status:", error);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
