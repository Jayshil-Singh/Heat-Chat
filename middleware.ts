import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - icons (public icons)
     * - sounds (public sound files)
     * - manifest.json
     * - api/ (all API routes handle their own auth; edge middleware must not interfere)
     */
    "/((?!_next/static|_next/image|favicon.ico|icons|sounds|manifest.json|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
