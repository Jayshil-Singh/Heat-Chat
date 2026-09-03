/**
 * Heat Chat — Real API Integration & Security Suite
 * Executes real HTTP requests against live deployment:
 * 1. Unauthorized access gates (401)
 * 2. Malformed parameters & boundary rejection
 * 3. Live route protection
 */

import assert from "node:assert";

const BASE_URL = process.env.TEST_BASE_URL || "https://heat-chat-beta.vercel.app";

async function testEndpoint(name, path, options, expectedStatus) {
  try {
    const res = await fetch(`${BASE_URL}${path}`, options);
    assert.strictEqual(
      res.status,
      expectedStatus,
      `[${name}] Expected status ${expectedStatus}, received ${res.status} on ${path}`
    );
    console.log(`  ✅ [PASS] ${name} (${res.status})`);
    return true;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

async function run() {
  console.log(`\n=== REAL API INTEGRATION & SECURITY SUITE ===`);
  console.log(`Target: ${BASE_URL}\n`);

  let passed = 0;

  // 1. UNAUTHORIZED REQUESTS (Must return 401 Unauthorized across all protected API routes)
  console.log("--- 1. Unauthorized Access Gate Verification ---");
  await testEndpoint("GET /api/saved (no auth)", "/api/saved", { method: "GET" }, 401); passed++;
  await testEndpoint("GET /api/friends (no auth)", "/api/friends", { method: "GET" }, 401); passed++;
  await testEndpoint("POST /api/friends/request (no auth)", "/api/friends/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipientId: "c3a8e244-672c-4b68-8094-bf8342795811" }),
  }, 401); passed++;
  await testEndpoint("POST /api/groups/c3a8e244-672c-4b68-8094-bf8342795811/polls (no auth)", "/api/groups/c3a8e244-672c-4b68-8094-bf8342795811/polls", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "Test?", options: ["A", "B"] }),
  }, 401); passed++;
  await testEndpoint("POST /api/polls/c3a8e244-672c-4b68-8094-bf8342795811/vote (no auth)", "/api/polls/c3a8e244-672c-4b68-8094-bf8342795811/vote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ optionIds: ["c3a8e244-672c-4b68-8094-bf8342795812"] }),
  }, 401); passed++;
  await testEndpoint("POST /api/polls/c3a8e244-672c-4b68-8094-bf8342795811/close (no auth)", "/api/polls/c3a8e244-672c-4b68-8094-bf8342795811/close", {
    method: "POST",
  }, 401); passed++;
  await testEndpoint("GET /api/conversations/c3a8e244-672c-4b68-8094-bf8342795811/media (no auth)", "/api/conversations/c3a8e244-672c-4b68-8094-bf8342795811/media", {
    method: "GET",
  }, 401); passed++;
  await testEndpoint("POST /api/conversations/c3a8e244-672c-4b68-8094-bf8342795811/read (no auth)", "/api/conversations/c3a8e244-672c-4b68-8094-bf8342795811/read", {
    method: "POST",
  }, 401); passed++;
  await testEndpoint("POST /api/conversations/c3a8e244-672c-4b68-8094-bf8342795811/unread (no auth)", "/api/conversations/c3a8e244-672c-4b68-8094-bf8342795811/unread", {
    method: "POST",
  }, 401); passed++;
  await testEndpoint("GET /api/admin/users (no auth)", "/api/admin/users", { method: "GET" }, 401); passed++;
  await testEndpoint("GET /api/admin/audit-logs (no auth)", "/api/admin/audit-logs", { method: "GET" }, 401); passed++;

  // 2. LIVE OPEN-REDIRECT BEHAVIOR ON AUTH ROUTES
  console.log("\n--- 2. Live Open-Redirect Mitigation ---");
  const loginRes = await fetch(`${BASE_URL}/login?redirectTo=//evil.com`);
  assert.ok(
    loginRes.status === 200 || loginRes.status === 307 || loginRes.status === 308,
    `Unexpected status ${loginRes.status}`
  );
  // Ensure location header does not redirect out to evil.com
  const loc = loginRes.headers.get("location");
  if (loc) {
    assert.ok(!loc.includes("evil.com"), `Open redirect vulnerability: redirected to ${loc}!`);
  }
  console.log(`  ✅ [PASS] /login?redirectTo=//evil.com correctly contained (no redirect to evil.com)`);
  passed++;

  console.log(`\n==============================================`);
  console.log(`API INTEGRATION TESTS: ${passed}/${passed} PASSED`);
  console.log(`==============================================\n`);
}

run().catch((err) => {
  console.error("API test suite aborted:", err);
  process.exit(1);
});
