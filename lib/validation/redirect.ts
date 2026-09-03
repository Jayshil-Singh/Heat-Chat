/**
 * Heat Chat — Strict Open Redirect Validation
 *
 * Enforces that redirect targets are strictly relative paths and prevents:
 * - Scheme / protocol injection (https:, http:, javascript:, data:)
 * - Protocol-relative domains (//evil.com)
 * - Backslash domain confusion (/\evil.com, \evil.com)
 * - URL encoded bypasses (/%2F%2Fevil.com, /%5C%5Cevil.com)
 */

export function isSafeRedirectUrl(raw: string | null | undefined): boolean {
  if (!raw || typeof raw !== "string") return false;

  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return false;
  }

  const candidates = [raw.trim(), decoded.trim()];
  for (const s of candidates) {
    if (!s.startsWith("/")) return false;
    if (s.startsWith("//")) return false;
    if (s.startsWith("/\\")) return false;
    if (s.includes("\\")) return false;
    if (s.includes(":")) return false;

    // Reject double-encoded slashes or backslashes
    if (/%2f|%5c/i.test(s)) {
      try {
        const doubleDecoded = decodeURIComponent(s);
        if (
          doubleDecoded.startsWith("//") ||
          doubleDecoded.startsWith("/\\") ||
          doubleDecoded.includes("\\") ||
          doubleDecoded.includes(":")
        ) {
          return false;
        }
      } catch {
        return false;
      }
    }
  }

  return true;
}

export function getSafeRedirectUrl(raw: string | null | undefined, fallback: string = "/chat"): string {
  return isSafeRedirectUrl(raw) ? (raw as string).trim() : fallback;
}
