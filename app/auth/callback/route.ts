import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") || "";
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const error = requestUrl.searchParams.get("error");
  const errorDescription = requestUrl.searchParams.get("error_description");

  // Validate next path to prevent open redirect vulnerabilities
  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "";

  // In Heat Chat:
  // Normal registration email verification is strictly OTP-based (/verify-email) and never hits /auth/callback.
  // Therefore, any link arriving at /auth/callback is PASSWORD RECOVERY unless explicitly signup or email_change.
  const isExplicitSignup = type === "signup" || type === "email_change";
  const isPasswordRecovery =
    type === "recovery" ||
    safeNext === "/update-password" ||
    safeNext.startsWith("/update-password") ||
    !isExplicitSignup;

  console.log("[Heat Chat] auth callback received:", {
    type: type || "recovery",
    pathname: requestUrl.pathname,
    safeNext,
    isPasswordRecovery,
    hasCode: Boolean(code),
    hasTokenHash: Boolean(tokenHash),
    hasError: Boolean(error || errorDescription),
  });

  // If Supabase redirected back with an error (e.g. token expired)
  if (error || errorDescription) {
    const errorMsg = errorDescription || error || "Verification failed";
    console.error("[Heat Chat] auth callback incoming error:", errorMsg);
    if (isPasswordRecovery) {
      const redirectUrl = new URL("/update-password", request.url);
      redirectUrl.searchParams.set("error", "invalid_or_expired");
      return NextResponse.redirect(redirectUrl);
    }
    const redirectUrl = new URL("/verify-email", request.url);
    redirectUrl.searchParams.set("error", errorMsg);
    return NextResponse.redirect(redirectUrl);
  }

  const supabase = await createClient();

  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      console.error("[Heat Chat] Auth callback code exchange error:", exchangeError.message);
      if (isPasswordRecovery) {
        const redirectUrl = new URL("/update-password", request.url);
        redirectUrl.searchParams.set("error", "invalid_or_expired");
        return NextResponse.redirect(redirectUrl);
      }
      const redirectUrl = new URL("/verify-email", request.url);
      redirectUrl.searchParams.set(
        "error",
        "Your verification link is invalid or has expired. Please request a new one."
      );
      return NextResponse.redirect(redirectUrl);
    }
  } else if (tokenHash && type) {
    const { error: otpError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as any,
    });
    if (otpError) {
      console.error("[Heat Chat] Auth callback verifyOtp error:", otpError.message);
      if (isPasswordRecovery) {
        const redirectUrl = new URL("/update-password", request.url);
        redirectUrl.searchParams.set("error", "invalid_or_expired");
        return NextResponse.redirect(redirectUrl);
      }
      const redirectUrl = new URL("/verify-email", request.url);
      redirectUrl.searchParams.set(
        "error",
        "Your verification link is invalid or has expired. Please request a new one."
      );
      return NextResponse.redirect(redirectUrl);
    }
  }

  // 1. Password Recovery Flow:
  // Must preserve the active recovery session so the user can call updateUser({ password })
  if (isPasswordRecovery) {
    console.log("[Heat Chat] Password recovery session active -> redirecting to /update-password");
    const updatePasswordUrl = new URL("/update-password", request.url);
    return NextResponse.redirect(updatePasswordUrl);
  }

  // 2. Normal Signup / Email Verification Flow:
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.email_confirmed_at) {
    // Normal registration user is verified: clear temporary token session and redirect to /login
    await supabase.auth.signOut();
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("verified", "true");
    if (safeNext && safeNext !== "/chat" && safeNext !== "/") {
      loginUrl.searchParams.set("redirectTo", safeNext);
    }
    return NextResponse.redirect(loginUrl);
  }

  // User session exists but email is still unconfirmed
  const verifyUrl = new URL("/verify-email", request.url);
  if (user?.email) {
    verifyUrl.searchParams.set("email", user.email);
  }
  return NextResponse.redirect(verifyUrl);
}
