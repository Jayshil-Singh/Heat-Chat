const PROD_URL = "https://heat-chat-beta.vercel.app";

async function runSmokeTests() {
  console.log("==================================================================");
  console.log(" LIVE PRODUCTION SMOKE TESTS: " + PROD_URL);
  console.log("==================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(cond, msg) {
    if (cond) {
      console.log(`  ✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${msg}`);
      failed++;
    }
  }

  // ── 1. SAVED MESSAGES TESTS ────────────────────────────────────────────────
  console.log("--- 1. Live Saved Messages Tests (/api/saved) ---");

  // Unauthenticated /api/saved
  const resSavedUnauth = await fetch(`${PROD_URL}/api/saved`);
  const jsonSavedUnauth = await resSavedUnauth.json().catch(() => null);
  assert(resSavedUnauth.status === 401, `GET /api/saved (unauthenticated) returns 401 (got ${resSavedUnauth.status})`);
  assert(jsonSavedUnauth?.error?.code === "UNAUTHORIZED", "Error code is UNAUTHORIZED");
  assert(resSavedUnauth.status !== 500, "Zero HTTP 500 on /api/saved");

  // Malformed UUID /api/saved
  const resSavedBadUuid = await fetch(`${PROD_URL}/api/saved?conversationId=invalid-uuid-123`);
  assert(resSavedBadUuid.status !== 500, "GET /api/saved with malformed UUID does NOT return 500");

  // ── 2. GROUP MEMBER REMOVAL TESTS ──────────────────────────────────────────
  console.log("\n--- 2. Live Group Member Removal Tests (/api/groups/[id]/members/[memberId]) ---");

  // Unauthorized removal
  const testConvId = "451ed7e8-1f8e-40d0-8575-470720acf809";
  const testMemberId = "00000000-0000-0000-0000-000000000000";
  const resDelUnauth = await fetch(`${PROD_URL}/api/groups/${testConvId}/members/${testMemberId}`, {
    method: "DELETE",
  });
  const jsonDelUnauth = await resDelUnauth.json().catch(() => null);
  assert(resDelUnauth.status === 401, `DELETE /api/groups/... (unauthenticated) returns 401 (got ${resDelUnauth.status})`);
  assert(jsonDelUnauth?.error?.code === "UNAUTHORIZED", "Error code is UNAUTHORIZED");
  assert(resDelUnauth.status !== 404, "Route is active and mounted on production Vercel (not 404)");

  // ── 3. LIVE SUPABASE RPC TEST ──────────────────────────────────────────────
  console.log("\n--- 3. Live Supabase RPC Audit (rmvpdcftfdeizitnrvkw.supabase.co) ---");
  const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
  const SUPABASE_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

  const resRpcRemove = await fetch(`${SUPABASE_URL}/rest/v1/rpc/remove_group_member`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      conv_id: testConvId,
      target_user_id: testMemberId,
    }),
  });
  const jsonRpcRemove = await resRpcRemove.json().catch(() => null);
  assert(resRpcRemove.status === 200, `POST /rest/v1/rpc/remove_group_member returns 200 OK (got ${resRpcRemove.status})`);
  assert(jsonRpcRemove?.success === false, "Returns jsonb success: false for unauthenticated call");
  assert(jsonRpcRemove?.code === "UNAUTHORIZED", "Returns deterministic jsonb code: UNAUTHORIZED");
  assert(resRpcRemove.status !== 400, "Zero unhandled PL/pgSQL 400 Bad Request exceptions!");

  console.log("\n==================================================================");
  console.log(` RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log("==================================================================");

  return failed === 0;
}

runSmokeTests().then((ok) => process.exit(ok ? 0 : 1)).catch(console.error);
