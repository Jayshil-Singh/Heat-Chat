import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") || "/chat";
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const error = requestUrl.searchParams.get("error");
  const errorDescription = requestUrl.searchParams.get("error_description");

  // If Supabase redirected back with an error (e.g. token expired)
  if (error || errorDescription) {
    const errorMsg = errorDescription || error || "Verification failed";
    const redirectUrl = new URL("/verify-email", request.url);
    redirectUrl.searchParams.set("error", errorMsg);
    return NextResponse.redirect(redirectUrl);
  }

  const supabase = await createClient();

  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      console.error("Auth callback code exchange error:", exchangeError.message);
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
      console.error("Auth callback verifyOtp error:", otpError.message);
      const redirectUrl = new URL("/verify-email", request.url);
      redirectUrl.searchParams.set(
        "error",
        "Your verification link is invalid or has expired. Please request a new one."
      );
      return NextResponse.redirect(redirectUrl);
    }
  }

  // Check the authoritative user verification state
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.email_confirmed_at) {
    // User is fully verified: proceed to destination
    const targetUrl = new URL(next.startsWith("/") ? next : "/chat", request.url);
    targetUrl.search = "";
    return NextResponse.redirect(targetUrl);
  }

  // User session exists but email is still unconfirmed
  const verifyUrl = new URL("/verify-email", request.url);
  if (user?.email) {
    verifyUrl.searchParams.set("email", user.email);
  }
  return NextResponse.redirect(verifyUrl);
}
