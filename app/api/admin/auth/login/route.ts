import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "MISSING_FIELDS", message: "Email and password are required." },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // 1. Authenticate credentials
    const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInErr || !signInData.user) {
      return NextResponse.json(
        { error: "INVALID_CREDENTIALS", message: "Invalid email or password." },
        { status: 401 }
      );
    }

    const user = signInData.user;

    // 2. Check email confirmation
    if (!user.email_confirmed_at) {
      return NextResponse.json({
        success: true,
        nextStep: "VERIFY_EMAIL",
        message: "Email verification required.",
      });
    }

    // 3. Verify user has assigned admin role
    const { data: userRoles, error: rolesErr } = await supabase
      .from("admin_user_roles")
      .select("role_id, account_state, mfa_enrolled_at, is_primary_superadmin, admin_roles(name, hierarchy_level)")
      .eq("user_id", user.id);

    if (rolesErr || !userRoles || userRoles.length === 0) {
      // Normal user attempted to log in via /admin/login — deny and sign out
      await supabase.auth.signOut();
      return NextResponse.json(
        {
          error: "FORBIDDEN_NOT_ADMIN",
          message: "Access denied. You do not possess administrative permissions.",
        },
        { status: 403 }
      );
    }

    // 4. Check account status
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_disabled, is_suspended")
      .eq("id", user.id)
      .single();

    if (profile?.is_disabled) {
      await supabase.auth.signOut();
      return NextResponse.json(
        { error: "ACCOUNT_DISABLED", message: "This administrative account has been disabled." },
        { status: 403 }
      );
    }

    if (profile?.is_suspended) {
      await supabase.auth.signOut();
      return NextResponse.json(
        { error: "ACCOUNT_SUSPENDED", message: "This administrative account is currently suspended." },
        { status: 403 }
      );
    }

    // 5. Inspect MFA factors & Assurance Level
    const { data: mfaFactors } = await supabase.auth.mfa.listFactors();
    const totpFactors = mfaFactors?.totp || [];
    const verifiedFactors = totpFactors.filter((f) => f.status === "verified");

    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const isAal2 = aalData?.currentLevel === "aal2";

    if (verifiedFactors.length === 0) {
      return NextResponse.json({
        success: true,
        nextStep: "MFA_SETUP",
        message: "MFA enrollment required to access administrative portal.",
      });
    }

    if (!isAal2) {
      return NextResponse.json({
        success: true,
        nextStep: "MFA_VERIFY",
        factorId: verifiedFactors[0].id,
        message: "MFA verification required.",
      });
    }

    // User is fully authenticated + email verified + AAL2 MFA verified
    return NextResponse.json({
      success: true,
      nextStep: "DASHBOARD",
      message: "Administrator session authenticated successfully.",
    });
  } catch (error) {
    console.error("Admin login error:", error);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "An unexpected error occurred during administrative login." },
      { status: 500 }
    );
  }
}
