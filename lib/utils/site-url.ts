/**
 * Centralized site URL helper.
 * Resolves the single authoritative origin for email redirects, auth callbacks, and link generation.
 */

export function getSiteUrl(): string {
  let url =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "http://localhost:3000");

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
