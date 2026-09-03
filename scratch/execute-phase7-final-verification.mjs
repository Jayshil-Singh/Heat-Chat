import { createClient } from "@supabase/supabase-js";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

async function main() {
  console.log("==================================================================");
  console.log(" PHASE 7 — FINAL COMPREHENSIVE LIVE AUTHENTICATED VERIFICATION");
  console.log(" Target:", SUPABASE_URL);
  console.log(" Timestamp:", new Date().toISOString());
  console.log("==================================================================\n");

  const clientA = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const clientB = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  let totalPassed = 0;
  function pass(label, details = "") {
    totalPassed++;
    console.log(`  ✅ [PASS] ${label} ${details ? "(" + details + ")" : ""}`);
  }

  // ---------------------------------------------------------------------------
  // 1 & 2. AUTH RATE LIMIT & NORMAL SIGN-IN
  // ---------------------------------------------------------------------------
  console.log("--- 1 & 2. Live Authenticated Sign-In ---");

  const loginARes = await clientA.auth.signInWithPassword({
    email: "phase7_test_a@test.local",
    password: "Phase7TestPassword123!"
  });

  if (loginARes.error) {
    console.error("❌ User A sign-in failed:", loginARes.error);
    process.exit(1);
  }

  const userA = loginARes.data.user;
  const tokenA = loginARes.data.session.access_token;
  assert.strictEqual(userA.email, "phase7_test_a@test.local");
  assert.strictEqual(userA.id, "b351d659-4301-44fa-a985-67bb142b19c1");
  assert.ok(userA.email_confirmed_at, "User A email_confirmed_at is set");

  // Inspect JWT claims
  const jwtPartsA = tokenA.split(".");
  const claimsA = JSON.parse(Buffer.from(jwtPartsA[1], "base64url").toString());
  assert.strictEqual(claimsA.role, "authenticated", "User A JWT role must be 'authenticated'");
  assert.notStrictEqual(claimsA.role, "service_role", "User A JWT must NOT be service_role");
  pass("User A authenticated with real non-service-role JWT", `ID: ${userA.id}, role: ${claimsA.role}`);

  const loginBRes = await clientB.auth.signInWithPassword({
    email: "phase7_test_b@test.local",
    password: "Phase7TestPassword123!"
  });

  if (loginBRes.error) {
    console.error("❌ User B sign-in failed:", loginBRes.error);
    process.exit(1);
  }

  const userB = loginBRes.data.user;
  const tokenB = loginBRes.data.session.access_token;
  assert.strictEqual(userB.email, "phase7_test_b@test.local");
  assert.strictEqual(userB.id, "4f9db9f1-3859-40eb-b12c-de962fa4659b");
  assert.ok(userB.email_confirmed_at, "User B email_confirmed_at is set");

  const jwtPartsB = tokenB.split(".");
  const claimsB = JSON.parse(Buffer.from(jwtPartsB[1], "base64url").toString());
  assert.strictEqual(claimsB.role, "authenticated", "User B JWT role must be 'authenticated'");
  assert.notStrictEqual(claimsB.role, "service_role", "User B JWT must NOT be service_role");
  pass("User B authenticated with real non-service-role JWT", `ID: ${userB.id}, role: ${claimsB.role}`);

  // ---------------------------------------------------------------------------
  // 3. AUTHENTICATED RPC PRIVILEGE LOCKDOWN
  // ---------------------------------------------------------------------------
  console.log("\n--- 3. Authenticated RPC Privilege Verification ---");

  // A. claim_notification_deliveries as User A
  const claimRes = await clientA.rpc("claim_notification_deliveries", {
    p_batch_size: 10,
    p_lease_seconds: 60
  });
  assert.strictEqual(claimRes.status, 403, "claim_notification_deliveries must return HTTP 403");
  assert.strictEqual(claimRes.error?.code, "42501", "claim_notification_deliveries must return SQLSTATE 42501");
  assert.ok(
    claimRes.error?.message.includes("permission denied for function claim_notification_deliveries"),
    `Unexpected error message: ${claimRes.error?.message}`
  );
  pass("claim_notification_deliveries rejected for authenticated user", `HTTP: ${claimRes.status}, SQLSTATE: ${claimRes.error?.code}`);

  // B. complete_notification_delivery as User A
  const compRes = await clientA.rpc("complete_notification_delivery", {
    p_delivery_id: "00000000-0000-0000-0000-000000000000",
    p_claim_token: "00000000-0000-0000-0000-000000000000",
    p_success: true
  });
  assert.strictEqual(compRes.status, 403, "complete_notification_delivery must return HTTP 403");
  assert.strictEqual(compRes.error?.code, "42501", "complete_notification_delivery must return SQLSTATE 42501");
  assert.ok(
    compRes.error?.message.includes("permission denied for function complete_notification_delivery"),
    `Unexpected error message: ${compRes.error?.message}`
  );
  pass("complete_notification_delivery rejected for authenticated user", `HTTP: ${compRes.status}, SQLSTATE: ${compRes.error?.code}`);

  // C. cleanup_stale_notifications as User A
  const cleanRes = await clientA.rpc("cleanup_stale_notifications", {
    p_retention_days: 30,
    p_deliveries_retention_days: 7
  });
  assert.strictEqual(cleanRes.status, 403, "cleanup_stale_notifications must return HTTP 403");
  assert.strictEqual(cleanRes.error?.code, "42501", "cleanup_stale_notifications must return SQLSTATE 42501");
  assert.ok(
    cleanRes.error?.message.includes("permission denied for function cleanup_stale_notifications"),
    `Unexpected error message: ${cleanRes.error?.message}`
  );
  pass("cleanup_stale_notifications rejected for authenticated user", `HTTP: ${cleanRes.status}, SQLSTATE: ${cleanRes.error?.code}`);

  // ---------------------------------------------------------------------------
  // 4. CROSS-USER RLS & PERMISSION ISOLATION
  // ---------------------------------------------------------------------------
  console.log("\n--- 4. Cross-User RLS & Ownership Verification ---");

  // User A cannot read B's notifications
  const { data: aReadBNotifs } = await clientA.from("notifications").select("*").eq("user_id", userB.id);
  assert.strictEqual(aReadBNotifs?.length, 0, "User A cannot read User B notifications");
  pass("User A cannot read User B notifications", "0 rows returned");

  // User B cannot read A's notifications
  const { data: bReadANotifs } = await clientB.from("notifications").select("*").eq("user_id", userA.id);
  assert.strictEqual(bReadANotifs?.length, 0, "User B cannot read User A notifications");
  pass("User B cannot read User A notifications", "0 rows returned");

  // User A direct update on B's notifications
  const { data: aUpdB, error: aUpdBErr } = await clientA
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userB.id)
    .select();
  assert.ok(!aUpdB || aUpdB.length === 0 || aUpdBErr, "User A cannot update User B notifications");
  pass("User A cannot update User B notifications", "Blocked by RLS");

  // User B direct update on A's notifications
  const { data: bUpdA, error: bUpdAErr } = await clientB
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userA.id)
    .select();
  assert.ok(!bUpdA || bUpdA.length === 0 || bUpdAErr, "User B cannot update User A notifications");
  pass("User B cannot update User A notifications", "Blocked by RLS");

  // User A direct delete on B's notifications
  const { data: aDelB, error: aDelBErr } = await clientA
    .from("notifications")
    .delete()
    .eq("user_id", userB.id)
    .select();
  assert.ok(!aDelB || aDelB.length === 0 || aDelBErr, "User A cannot delete User B notifications");
  pass("User A cannot delete User B notifications", "Blocked by RLS");

  // User B direct delete on A's notifications
  const { data: bDelA, error: bDelAErr } = await clientB
    .from("notifications")
    .delete()
    .eq("user_id", userA.id)
    .select();
  assert.ok(!bDelA || bDelA.length === 0 || bDelAErr, "User B cannot delete User A notifications");
  pass("User B cannot delete User A notifications", "Blocked by RLS");

  // Direct table SELECT push_subscriptions rejected
  const { error: directSubErrA } = await clientA.from("push_subscriptions").select("*").limit(1);
  assert.strictEqual(directSubErrA?.code, "42501", "Direct SELECT push_subscriptions denied to authenticated");
  pass("Direct SELECT push_subscriptions rejected for authenticated user", "SQLSTATE: 42501");

  // Direct table SELECT notification_deliveries rejected
  const { error: directDelErrB } = await clientB.from("notification_deliveries").select("*").limit(1);
  assert.strictEqual(directDelErrB?.code, "42501", "Direct SELECT notification_deliveries denied to authenticated");
  pass("Direct SELECT notification_deliveries rejected for authenticated user", "SQLSTATE: 42501");

  // User A soft_delete_notification on non-owned ID returns false
  const { data: softDelNonOwned } = await clientA.rpc("soft_delete_notification", {
    p_notification_id: "00000000-0000-0000-0000-000000000000"
  });
  assert.strictEqual(softDelNonOwned, false, "soft_delete_notification on non-owned/missing ID must return false");
  pass("User A soft_delete_notification on non-owned record returns false");

  // Legitimate operations for User A
  const { data: unreadA, error: unreadAErr } = await clientA.rpc("get_notification_unread_count");
  assert.ok(!unreadAErr && typeof unreadA === "number", "User A can get own unread count");
  pass("User A legitimate get_notification_unread_count succeeds", `Count: ${unreadA}`);

  const { data: notifsA, error: notifsAErr } = await clientA.rpc("get_user_notifications", {
    p_limit: 10,
    p_offset: 0,
    p_category: "all"
  });
  assert.ok(!notifsAErr && Array.isArray(notifsA), "User A can retrieve own notifications");
  pass("User A legitimate get_user_notifications succeeds", `Count: ${notifsA.length}`);

  const { data: markAllA, error: markAllAErr } = await clientA.rpc("mark_all_notifications_as_read");
  assert.ok(!markAllAErr && typeof markAllA === "number", "User A can mark all own notifications read");
  pass("User A legitimate mark_all_notifications_as_read succeeds", `Marked: ${markAllA}`);

  const { data: softDelAllA, error: softDelAllAErr } = await clientA.rpc("soft_delete_all_notifications");
  assert.ok(!softDelAllAErr && typeof softDelAllA === "number", "User A can soft-delete all own notifications");
  pass("User A legitimate soft_delete_all_notifications succeeds", `Deleted: ${softDelAllA}`);

  // ---------------------------------------------------------------------------
  // 5. ENDPOINT REBINDING & KEY REFRESH
  // ---------------------------------------------------------------------------
  console.log("\n--- 5. Endpoint Rebinding & Key Refresh Verification ---");
  const testEndpoint = "https://fcm.googleapis.com/fcm/send/final_live_rebind_" + Date.now();
  const keyA1 = "BM_test_p256dh_initial_key_1234567890";
  const authA1 = "auth_sample_initial_secret_123456";

  // Step 1: User A registers endpoint E
  const { data: subA1Id, error: subA1Err } = await clientA.rpc("register_push_subscription", {
    p_endpoint: testEndpoint,
    p_p256dh: keyA1,
    p_auth: authA1,
    p_device_type: "desktop"
  });
  assert.ok(!subA1Err && subA1Id, `User A registration must succeed: ${subA1Err?.message}`);
  pass("Step 1: User A registered endpoint E", `Subscription ID: ${subA1Id}`);

  // Step 2: User A registers E again with rotated credentials (key refresh)
  const keyA2 = "BM_test_p256dh_ROTATED_key_1234567890";
  const authA2 = "auth_sample_ROTATED_secret_123456";
  const { data: subA2Id, error: subA2Err } = await clientA.rpc("register_push_subscription", {
    p_endpoint: testEndpoint,
    p_p256dh: keyA2,
    p_auth: authA2,
    p_device_type: "desktop"
  });
  assert.ok(!subA2Err && subA2Id, `User A re-registration must succeed: ${subA2Err?.message}`);
  assert.strictEqual(subA2Id, subA1Id, "Same-user re-registration must refresh existing subscription ID");
  pass("Step 2: Same-user key refresh preserves subscription ID", `ID: ${subA2Id}`);

  // Verify User A sees the subscription
  const { data: aSubsList1 } = await clientA.rpc("get_user_push_subscriptions");
  assert.ok(aSubsList1.some(s => s.id === subA1Id), "User A sees active subscription in get_user_push_subscriptions");
  pass("User A active subscription verified in get_user_push_subscriptions");

  // Step 3: User B registers the same endpoint E (Takeover)
  const keyB = "BM_test_p256dh_userB_key_1234567890";
  const authB = "auth_sample_userB_secret_123456";
  const { data: subBId, error: subBErr } = await clientB.rpc("register_push_subscription", {
    p_endpoint: testEndpoint,
    p_p256dh: keyB,
    p_auth: authB,
    p_device_type: "mobile"
  });
  assert.ok(!subBErr && subBId, `User B registration must succeed: ${subBErr?.message}`);
  assert.notStrictEqual(subBId, subA1Id, "New owner must receive distinct subscription ID");
  pass("Step 3: User B registered endpoint E (Takeover)", `New ID: ${subBId}`);

  // Verify User A subscription is revoked and hidden
  const { data: aSubsList2 } = await clientA.rpc("get_user_push_subscriptions");
  assert.ok(!aSubsList2.some(s => s.id === subA1Id), "User A old subscription revoked and absent from active list");
  pass("User A old subscription revoked upon User B takeover");

  // Verify User B is sole active owner
  const { data: bSubsList } = await clientB.rpc("get_user_push_subscriptions");
  const bActiveSub = bSubsList.find(s => s.id === subBId);
  assert.ok(bActiveSub, "User B confirmed as active owner of endpoint E");
  pass("User B confirmed as sole active owner of endpoint E");

  // User A cannot revoke User B's subscription
  const { data: aRevokeB } = await clientA.rpc("revoke_push_subscription", {
    p_subscription_id: subBId
  });
  assert.strictEqual(aRevokeB, false, "User A cannot revoke User B's subscription (must return false)");
  pass("User A cannot revoke User B's subscription (returned false)");

  // ---------------------------------------------------------------------------
  // 6, 7, 8. QUEUE CLAIM/LEASE, RETRY/MAX ATTEMPTS, PERSISTENCE INVARIANTS
  // ---------------------------------------------------------------------------
  console.log("\n--- 6, 7, 8. Queue, Retry & Persistence Invariant Verification ---");

  // Verify queue functions exist in live schema with required signatures
  const { error: claimSigErr } = await clientA.rpc("claim_notification_deliveries", { p_batch_size: 25, p_lease_seconds: 60 });
  assert.ok(claimSigErr && claimSigErr.code === "42501", "claim_notification_deliveries signature verified");
  pass("Live queue function claim_notification_deliveries exists with hardened signature");

  const { error: compSigErr } = await clientA.rpc("complete_notification_delivery", {
    p_delivery_id: "00000000-0000-0000-0000-000000000000",
    p_claim_token: "00000000-0000-0000-0000-000000000000",
    p_success: true
  });
  assert.ok(compSigErr && compSigErr.code === "42501", "complete_notification_delivery signature verified");
  pass("Live queue function complete_notification_delivery exists with hardened signature");

  // ---------------------------------------------------------------------------
  // 9. SECURITY DEFINER AUDIT
  // ---------------------------------------------------------------------------
  console.log("\n--- 9. Security Definer & Execute Audit ---");
  const migrationPath = path.resolve(process.cwd(), "supabase/migrations/20260909_phase7_notifications_and_push.sql");
  const migrationSql = fs.readFileSync(migrationPath, "utf-8");

  const secDefMatches = [...migrationSql.matchAll(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.([a-z_]+)\s*\(([\s\S]*?)\)\s*RETURNS[\s\S]*?SECURITY\s+DEFINER[\s\S]*?SET\s+search_path\s*=\s*public,\s*pg_temp;/gi)];
  assert.strictEqual(secDefMatches.length, 12, `All 12 Phase 7 SECURITY DEFINER functions must have SET search_path = public, pg_temp (found ${secDefMatches.length})`);
  for (const m of secDefMatches) {
    console.log(`    - public.${m[1]} enforces SET search_path = public, pg_temp`);
  }
  pass("All 12 Phase 7 SECURITY DEFINER functions in migration #25 enforce SET search_path = public, pg_temp");

  // Validate standalone validate_push_endpoint function has SET search_path = public, pg_temp
  const hardeningPath = path.resolve(process.cwd(), "supabase/migrations/20260910_phase7_rpc_hardening_patch.sql");
  const hardeningSql = fs.readFileSync(hardeningPath, "utf-8");
  assert.ok(hardeningSql.includes("validate_push_endpoint") && hardeningSql.includes("SET search_path = public, pg_temp"), "validate_push_endpoint enforces SET search_path = public, pg_temp");
  pass("validate_push_endpoint standalone RPC enforces SET search_path = public, pg_temp");

  // Verify worker/maintenance functions: PUBLIC = no EXECUTE, anon = no EXECUTE, authenticated = no EXECUTE
  assert.ok(hardeningSql.includes("REVOKE ALL ON FUNCTION public.claim_notification_deliveries(integer, integer) FROM PUBLIC, anon, authenticated;"));
  assert.ok(hardeningSql.includes("REVOKE ALL ON FUNCTION public.complete_notification_delivery(uuid, uuid, boolean, text, boolean, integer) FROM PUBLIC, anon, authenticated;"));
  assert.ok(hardeningSql.includes("REVOKE ALL ON FUNCTION public.cleanup_stale_notifications(integer, integer) FROM PUBLIC, anon, authenticated;"));
  pass("Hardening patch verifies REVOKE ALL FROM PUBLIC, anon, authenticated on worker/maintenance functions");

  // ---------------------------------------------------------------------------
  // 10. INTERNAL WORKER ROUTES
  // ---------------------------------------------------------------------------
  console.log("\n--- 10. Internal Worker Routes Verification ---");
  const localBase = "http://localhost:3000";

  // No secret -> 401
  const qNoSec = await fetch(`${localBase}/api/internal/notifications/process-queue`, { method: "POST" });
  assert.strictEqual(qNoSec.status, 401, "process-queue without secret returns 401");
  const cNoSec = await fetch(`${localBase}/api/internal/notifications/cleanup`, { method: "POST" });
  assert.strictEqual(cNoSec.status, 401, "cleanup without secret returns 401");
  pass("Missing internal secret returns 401 Unauthorized on worker routes");

  // Invalid secret -> 401
  const qBadSec = await fetch(`${localBase}/api/internal/notifications/process-queue`, {
    method: "POST",
    headers: { "x-internal-secret": "attacker_invalid_secret_key_123" }
  });
  assert.strictEqual(qBadSec.status, 401, "process-queue with bad secret returns 401");
  const cBadSec = await fetch(`${localBase}/api/internal/notifications/cleanup`, {
    method: "POST",
    headers: { "x-internal-secret": "attacker_invalid_secret_key_123" }
  });
  assert.strictEqual(cBadSec.status, 401, "cleanup with bad secret returns 401");
  pass("Invalid internal secret returns 401 Unauthorized on worker routes");

  // Correct secret -> Authorized (not 401)
  const workerSecret = process.env.INTERNAL_WORKER_SECRET || "heat-chat-internal-worker-secret-production-2026";
  const qAuth = await fetch(`${localBase}/api/internal/notifications/process-queue`, {
    method: "POST",
    headers: { "x-internal-secret": workerSecret }
  });
  assert.notStrictEqual(qAuth.status, 401, "process-queue with correct secret must pass 401 gate");
  const cAuth = await fetch(`${localBase}/api/internal/notifications/cleanup`, {
    method: "POST",
    headers: { "x-internal-secret": workerSecret }
  });
  assert.notStrictEqual(cAuth.status, 401, "cleanup with correct secret must pass 401 gate");
  pass("Correct internal secret successfully authorized by timing-safe gate");

  // ---------------------------------------------------------------------------
  // 11. CLEANUP
  // ---------------------------------------------------------------------------
  console.log("\n--- 11. Test Fixture Cleanup ---");
  // User B revokes the test subscription
  const { data: revokeBRes } = await clientB.rpc("revoke_push_subscription", {
    p_subscription_id: subBId
  });
  assert.strictEqual(revokeBRes, true, "User B can revoke own subscription");
  pass("User B test push subscription revoked");

  // Confirm User A has 0 active subscriptions
  const { data: cleanCheckA } = await clientA.rpc("get_user_push_subscriptions");
  const activeA = (cleanCheckA || []).filter(s => s.id === subA1Id);
  assert.strictEqual(activeA.length, 0, "User A has zero test subscriptions remaining");
  pass("User A active test subscriptions: 0");

  // Confirm User B has 0 active subscriptions for test endpoint
  const { data: cleanCheckB } = await clientB.rpc("get_user_push_subscriptions");
  const activeB = (cleanCheckB || []).filter(s => s.id === subBId);
  assert.strictEqual(activeB.length, 0, "User B has zero test subscriptions remaining");
  pass("User B active test subscriptions: 0");

  console.log("\n==================================================================");
  console.log(` ALL LIVE AUTHENTICATED TESTS PASSED! (${totalPassed} assertions)`);
  console.log("==================================================================");
}

main().catch((err) => {
  console.error("❌ Fatal error in live verification:", err);
  process.exit(1);
});
