/**
 * Heat Chat — Genuine Unit Test Suite
 * Tests pure business logic and security validators in isolation.
 */
import assert from "node:assert";
import { isValidUuid } from "../lib/validation/uuid.ts";
import { isSafeRedirectUrl, getSafeRedirectUrl } from "../lib/validation/redirect.ts";

let passed = 0;
let total = 0;

function it(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

console.log("\n=== UNIT TEST SUITE: SECURITY & VALIDATORS ===");

// 1. UUID VALIDATION
console.log("\n--- UUID Validation (isValidUuid) ---");
it("accepts valid v4 UUID (lowercase)", () => {
  assert.strictEqual(isValidUuid("c3a8e244-672c-4b68-8094-bf8342795811"), true);
});

it("accepts valid v4 UUID (uppercase)", () => {
  assert.strictEqual(isValidUuid("C3A8E244-672C-4B68-8094-BF8342795811"), true);
});

it("accepts valid v1/v5 UUID", () => {
  assert.strictEqual(isValidUuid("6ba7b810-9dad-11d1-80b4-00c04fd430c8"), true);
});

it("rejects nil UUID (all zeros)", () => {
  assert.strictEqual(isValidUuid("00000000-0000-0000-0000-000000000000"), false);
});

it("rejects malformed string with wrong length", () => {
  assert.strictEqual(isValidUuid("c3a8e244-672c-4b68-8094-bf834279581"), false);
});

it("rejects SQL injection attempt in UUID position", () => {
  assert.strictEqual(isValidUuid("' OR 1=1 --"), false);
});

it("rejects non-hex characters in UUID", () => {
  assert.strictEqual(isValidUuid("g3a8e244-672c-4b68-8094-bf8342795811"), false);
});

it("rejects UUID with surrounding whitespace", () => {
  assert.strictEqual(isValidUuid(" c3a8e244-672c-4b68-8094-bf8342795811 "), false);
});

it("rejects non-string inputs (null, undefined, number, object)", () => {
  assert.strictEqual(isValidUuid(null), false);
  assert.strictEqual(isValidUuid(undefined), false);
  assert.strictEqual(isValidUuid(12345), false);
  assert.strictEqual(isValidUuid({}), false);
});

// 2. REDIRECT VALIDATION
console.log("\n--- Open-Redirect Validation (isSafeRedirectUrl) ---");
it("accepts valid relative internal paths", () => {
  assert.strictEqual(isSafeRedirectUrl("/chat"), true);
  assert.strictEqual(isSafeRedirectUrl("/chat/c3a8e244-672c-4b68-8094-bf8342795811"), true);
  assert.strictEqual(isSafeRedirectUrl("/friends"), true);
  assert.strictEqual(isSafeRedirectUrl("/admin/dashboard"), true);
});

it("rejects protocol-relative URL (//evil.com)", () => {
  assert.strictEqual(isSafeRedirectUrl("//evil.com"), false);
  assert.strictEqual(isSafeRedirectUrl("///evil.com"), false);
});

it("rejects absolute scheme URLs (http, https, javascript, data)", () => {
  assert.strictEqual(isSafeRedirectUrl("https://evil.com"), false);
  assert.strictEqual(isSafeRedirectUrl("http://evil.com"), false);
  assert.strictEqual(isSafeRedirectUrl("javascript:alert(1)"), false);
  assert.strictEqual(isSafeRedirectUrl("data:text/html,evil"), false);
});

it("rejects backslash domain confusion (/\\evil.com, \\evil.com)", () => {
  assert.strictEqual(isSafeRedirectUrl("/\\evil.com"), false);
  assert.strictEqual(isSafeRedirectUrl("\\evil.com"), false);
  assert.strictEqual(isSafeRedirectUrl("/path\\evil.com"), false);
});

it("rejects URL-encoded slash bypasses (/%2F%2Fevil.com)", () => {
  assert.strictEqual(isSafeRedirectUrl("/%2F%2Fevil.com"), false);
  assert.strictEqual(isSafeRedirectUrl("//evil.com/%2F"), false);
  assert.strictEqual(isSafeRedirectUrl("/%5C%5Cevil.com"), false);
});

it("rejects double-encoded bypasses (/%252F%252Fevil.com)", () => {
  assert.strictEqual(isSafeRedirectUrl("/%252F%252Fevil.com"), false);
});

it("getSafeRedirectUrl returns target when safe, fallback when malicious", () => {
  assert.strictEqual(getSafeRedirectUrl("/chat", "/default"), "/chat");
  assert.strictEqual(getSafeRedirectUrl("//evil.com", "/default"), "/default");
  assert.strictEqual(getSafeRedirectUrl(null, "/default"), "/default");
});

console.log(`\n==============================================`);
console.log(`UNIT TESTS COMPLETED: ${passed}/${total} PASSED`);
console.log(`==============================================\n`);
