/**
 * Centralized site URL helper.
 * Resolves the single authoritative origin for email redirects, auth callbacks, and link generation.
 *
 * Priority order (first non-empty value wins):
 *  1. NEXT_PUBLIC_SITE_URL   — set in .env.production (committed) or Vercel env vars
 *  2. NEXT_PUBLIC_APP_URL    — legacy alias
 *  3. window.location.origin — client-side fallback (browser only)
 *  4. http://localhost:3000  — local development fallback
 *
 * NOTE: VERCEL_URL (without NEXT_PUBLIC_ prefix) is server-only and NOT accessible in browser.
 * NEXT_PUBLIC_VERCEL_URL must be explicitly set — it is NOT auto-injected by Vercel.
 * The .env.production file sets NEXT_PUBLIC_SITE_URL explicitly to avoid all ambiguity.
 */

export function getSiteUrl(): string {
  // 1. Explicit env var — guaranteed by .env.production for production builds
  let url = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "";

  // 2. Client-side fallback — window.location.origin (available in browser only)
  if (!url && typeof window !== "undefined" && window.location.origin) {
    url = window.location.origin;
  }

  // 3. Local dev fallback
  if (!url) {
    url = "http://localhost:3000";
  }

  url = url.trim();

  // Ensure protocol is present
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }

  // Strip trailing slash to avoid double-slash when appending paths
  return url.replace(/\/+$/, "");
}

export function getCallbackUrl(path = "/auth/callback"): string {
  const base = getSiteUrl();
  // Ensure path starts with exactly one slash
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
}
