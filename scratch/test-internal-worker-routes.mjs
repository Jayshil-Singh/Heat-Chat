import assert from "node:assert";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

async function testInternalRoutes() {
  console.log("=== TESTING INTERNAL WORKER ROUTES ===");
  console.log("Target:", BASE_URL);

  // 1. Missing secret on process-queue -> 401
  const resNoSecret = await fetch(`${BASE_URL}/api/internal/notifications/process-queue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });
  console.log("process-queue without secret status:", resNoSecret.status);
  assert.strictEqual(resNoSecret.status, 401, "process-queue without secret must return 401");

  // 2. Bad secret on process-queue -> 401
  const resBadSecret = await fetch(`${BASE_URL}/api/internal/notifications/process-queue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": "wrong_secret_12345"
    }
  });
  console.log("process-queue with bad secret status:", resBadSecret.status);
  assert.strictEqual(resBadSecret.status, 401, "process-queue with bad secret must return 401");

  // 3. Missing secret on cleanup -> 401
  const resCleanNoSecret = await fetch(`${BASE_URL}/api/internal/notifications/cleanup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });
  console.log("cleanup without secret status:", resCleanNoSecret.status);
  assert.strictEqual(resCleanNoSecret.status, 401, "cleanup without secret must return 401");

  // 4. Bad secret on cleanup -> 401
  const resCleanBadSecret = await fetch(`${BASE_URL}/api/internal/notifications/cleanup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": "wrong_secret_12345"
    }
  });
  console.log("cleanup with bad secret status:", resCleanBadSecret.status);
  assert.strictEqual(resCleanBadSecret.status, 401, "cleanup with bad secret must return 401");

  console.log("✅ Internal worker routes authentication gates PASSED!\n");
}

testInternalRoutes().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
