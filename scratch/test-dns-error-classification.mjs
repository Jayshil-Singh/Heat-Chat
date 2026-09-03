import assert from "node:assert";
import { validatePushEndpointEgress } from "../lib/notifications/egress.ts";

console.log("=== TESTING DNS & EGRESS ERROR CLASSIFICATION ===");

async function run() {
  // 1. Non-existent domain (ENOTFOUND) -> permanent failure
  const badDomain = "https://nonexistent-subdomain-12345.fcm.googleapis.com/fcm/send/xyz";
  const resBad = await validatePushEndpointEgress(badDomain);
  console.log("Nonexistent host lookup result:", resBad);
  assert.strictEqual(resBad.ok, false, "Should fail egress check");
  assert.strictEqual(resBad.isTransient, false, "ENOTFOUND must NOT be transient (permanent)");

  // 2. Canonicalization failure (e.g. naked %) -> permanent failure
  const malformed = "https://fcm.googleapis.com/fcm%/send/xyz";
  const resMalformed = await validatePushEndpointEgress(malformed);
  console.log("Malformed percent lookup result:", resMalformed);
  assert.strictEqual(resMalformed.ok, false, "Should fail egress check");
  assert.strictEqual(resMalformed.isTransient, false, "Canonicalization error must NOT be transient");

  // 3. Valid host (fcm.googleapis.com) -> ok: true
  const valid = "https://fcm.googleapis.com/fcm/send/token123";
  const resValid = await validatePushEndpointEgress(valid);
  console.log("Valid host lookup result:", resValid);
  assert.strictEqual(resValid.ok, true, "Valid host should pass egress check");

  console.log("✅ All DNS & egress error classification checks PASSED!\n");
}

run().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
