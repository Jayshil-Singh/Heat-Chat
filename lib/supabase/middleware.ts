import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { getSafeRedirectUrl } from "@/lib/validation/redirect";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If environment variables are missing during initial setup, allow public routes to pass without crashing
  if (!supabaseUrl || !supabasePublishableKey || supabaseUrl.includes("placeholder.supabase.co")) {
    console.error(
      "[Heat Chat Middleware] Missing or invalid NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY environment variables."
    );
    return supabaseResponse;
  }

  const supabase = createServerClient<Database>(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Fetch current user without trusting local token alone
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // 0. Explicit bypass for auth callback, update-password recovery, and API routes
  if (
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/update-password") ||
    pathname.startsWith("/api/")
  ) {
    return supabaseResponse;
  }

  const isEmailVerified = Boolean(user?.email_confirmed_at);

  // Normal user protected paths
  const isNormalProtectedRoute =
    pathname.startsWith("/chat") ||
    pathname.startsWith("/friends") ||
    pathname.startsWith("/saved") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/profile");

  // Normal user auth paths
  const isNormalAuthRoute =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/reset-password";

  // Dedicated admin auth paths
  const isAdminAuthRoute =
    pathname === "/admin/login" ||
    pathname === "/admin/setup" ||
    pathname === "/admin/verify-email" ||
    pathname === "/admin/mfa/setup" ||
    pathname === "/admin/mfa/verify" ||
    pathname.startsWith("/admin/invite") ||
    pathname === "/admin/forgot-password";

  // Protected Admin Portal paths (excluding auth routes)
  const isAdminPortalRoute = pathname.startsWith("/admin") && !isAdminAuthRoute;

  // 1. Unauthenticated user accessing normal protected route
  if (!user && isNormalProtectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  // 2. Unauthenticated user accessing admin portal route
  if (!user && isAdminPortalRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  // 3. Authenticated user with UNVERIFIED email
  if (user && !isEmailVerified) {
    if (isNormalProtectedRoute || isNormalAuthRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/verify-email";
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (isAdminPortalRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/verify-email";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // 4. Admin Portal Route Authorization
  if (user && isEmailVerified && isAdminPortalRoute) {
    const { data: adminRole } = await supabase
      .from("admin_user_roles")
      .select("id, mfa_enrolled_at, mfa_last_verified_at, account_state")
      .eq("user_id", user.id)
      .limit(1);

    if (!adminRole || adminRole.length === 0) {
      // Non-admin trying to access /admin -> redirect to /chat
      const url = request.nextUrl.clone();
      url.pathname = "/chat";
      url.search = "";
      return NextResponse.redirect(url);
    }

    const role = adminRole[0];
    if (role.account_state !== "ACTIVE") {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      url.searchParams.set("error", "ACCOUNT_INACTIVE");
      return NextResponse.redirect(url);
    }

    // Check MFA
    if (!role.mfa_enrolled_at) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/mfa/setup";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // 5. Verified normal user visiting normal auth routes -> redirect to /chat
  if (user && isEmailVerified && isNormalAuthRoute) {
    const rawRedirect = request.nextUrl.searchParams.get("redirectTo");
    const safeRedirect = getSafeRedirectUrl(rawRedirect, "/chat");
    const url = request.nextUrl.clone();
    url.pathname = safeRedirect;
    url.search = "";
    return NextResponse.redirect(url);
  }

  // 6. Verified normal user visiting normal verify-email -> redirect to /chat
  if (user && isEmailVerified && pathname === "/verify-email") {
    const url = request.nextUrl.clone();
    url.pathname = "/chat";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
