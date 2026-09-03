/**
 * Open Redirect Adversarial Test Suite
 */
import assert from "node:assert";

export function isSafeRedirectUrl(raw) {
  if (!raw || typeof raw !== "string") return false;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return false;
  }
  // Check both raw and decoded strings
  const candidates = [raw.trim(), decoded.trim()];
  for (const s of candidates) {
    if (!s.startsWith("/")) return false;
    if (s.startsWith("//")) return false;
    if (s.startsWith("/\\")) return false;
    if (s.includes("\\")) return false;
    if (s.includes(":")) return false;
    // Check for double-encoded slashes e.g. %2f or %5c
    if (/%2f|%5c/i.test(s)) {
      try {
        const doubleDecoded = decodeURIComponent(s);
        if (doubleDecoded.startsWith("//") || doubleDecoded.startsWith("/\\") || doubleDecoded.includes("\\") || doubleDecoded.includes(":")) {
          return false;
        }
      } catch {
        return false;
      }
    }
  }
  return true;
}

const attackVectors = [
  "//evil.com",
  "https://evil.com",
  "http://evil.com",
  "javascript:alert(1)",
  "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
  "/\\evil.com",
  "\\evil.com",
  "/%2F%2Fevil.com",
  "//evil.com/%2F",
  "http://localhost:3000@evil.com",
  "///evil.com",
  "//google.com",
  "/%5C%5Cevil.com",
  "/%252F%252Fevil.com",
];

const validVectors = [
  "/chat",
  "/chat/123e4567-e89b-12d3-a456-426614174000",
  "/friends",
  "/settings",
  "/admin/dashboard",
  "/admin/users",
  "/admin/reports/123",
];

let failedAttacksBlocked = 0;
for (const vector of attackVectors) {
  const result = isSafeRedirectUrl(vector);
  assert.strictEqual(result, false, `Failed to block redirect attack vector: ${vector}`);
  failedAttacksBlocked++;
}

let validPathsAllowed = 0;
for (const vector of validVectors) {
  const result = isSafeRedirectUrl(vector);
  assert.strictEqual(result, true, `Legitimate path was falsely rejected: ${vector}`);
  validPathsAllowed++;
}

console.log(`Open Redirect Test Suite Results:`);
console.log(`- Malicious attack vectors blocked: ${failedAttacksBlocked}/${attackVectors.length} (100%)`);
console.log(`- Legitimate relative paths allowed: ${validPathsAllowed}/${validVectors.length} (100%)`);
console.log(`PASSED: All open redirect attack vectors successfully neutralized.`);
