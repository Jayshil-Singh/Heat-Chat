/**
 * Centralized site URL helper.
 * Resolves the single authoritative origin for email redirects, auth callbacks, and link generation.
 *
 * Priority order (first non-empty value wins):
 *  1. NEXT_PUBLIC_SITE_URL   — explicit production URL (set this in Vercel env vars!)
 *  2. NEXT_PUBLIC_APP_URL    — legacy alias
 *  3. NEXT_PUBLIC_VERCEL_URL — automatically injected by Vercel (hostname only, no protocol)
 *  4. window.location.origin — client-side fallback
 *  5. http://localhost:3000  — local development fallback
 */

export function getSiteUrl(): string {
  // 1. Explicit env var (highest priority — set NEXT_PUBLIC_SITE_URL in Vercel dashboard)
  let url = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "";

  // 2. Vercel auto-inject (NEXT_PUBLIC_VERCEL_URL is hostname only, e.g. "heat-chat.vercel.app")
  if (!url && process.env.NEXT_PUBLIC_VERCEL_URL) {
    url = `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;
  }

  // 3. Client-side: use window.location.origin (available in browser only)
  if (!url && typeof window !== "undefined" && window.location.origin) {
    url = window.location.origin;
  }

  // 4. Local dev fallback
  if (!url) {
    url = "http://localhost:3000";
  }

  url = url.trim();

  // Ensure protocol is present
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }

  // Strip trailing slash
  return url.replace(/\/+$/, "");
}

export function getCallbackUrl(path = "/auth/callback"): string {
  const base = getSiteUrl();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
}
