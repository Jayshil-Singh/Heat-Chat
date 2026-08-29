import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "placeholder-key";

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

  const isEmailVerified = Boolean(user?.email_confirmed_at);
  const pathname = request.nextUrl.pathname;

  // Protected route paths
  const isProtectedRoute =
    pathname.startsWith("/chat") ||
    pathname.startsWith("/friends") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/profile");

  // Auth routes where authenticated users should be redirected away
  const isAuthRoute =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/reset-password";

  // Unauthenticated user attempting to access protected route
  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  // Authenticated user with UNVERIFIED email attempting to access protected route
  if (user && !isEmailVerified && isProtectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/verify-email";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Fully verified authenticated user visiting auth routes
  if (user && isEmailVerified && isAuthRoute) {
    const redirectTo = request.nextUrl.searchParams.get("redirectTo") || "/chat";
    const url = request.nextUrl.clone();
    url.pathname = redirectTo;
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Fully verified authenticated user visiting verify-email route
  if (user && isEmailVerified && pathname === "/verify-email") {
    const url = request.nextUrl.clone();
    url.pathname = "/chat";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Unverified user visiting login/register routes
  if (user && !isEmailVerified && (pathname === "/login" || pathname === "/register")) {
    const url = request.nextUrl.clone();
    url.pathname = "/verify-email";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
