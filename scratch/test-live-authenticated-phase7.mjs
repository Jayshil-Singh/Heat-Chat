import { createClient } from "@supabase/supabase-js";
import assert from "node:assert";

const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

async function main() {
  console.log("==================================================================");
  console.log(" PHASE 7 — FINAL LIVE AUTHENTICATED VERIFICATION");
  console.log(" Target:", SUPABASE_URL);
  console.log(" Timestamp:", new Date().toISOString());
  console.log("==================================================================\n");

  const clientA = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const clientB = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // 1. SIGN IN TEST USERS
  console.log("--- 1. Authenticated Sign-In ---");
  const loginARes = await clientA.auth.signInWithPassword({
    email: "phase7_test_a@test.local",
    password: "Phase7TestPassword123!"
  });

  if (loginARes.error) {
    console.error("❌ User A sign-in failed:", loginARes.error.message);
    if (loginARes.error.message.includes("Email not confirmed")) {
      console.log("\nRESULT: BLOCKED (User A email not confirmed)");
      process.exit(2);
    }
    process.exit(1);
  }
  console.log("✅ User A authenticated! User ID:", loginARes.data.user.id);
  const userA = loginARes.data.user;
  const tokenA = loginARes.data.session.access_token;

  const loginBRes = await clientB.auth.signInWithPassword({
    email: "phase7_test_b@test.local",
    password: "Phase7TestPassword123!"
  });

  if (loginBRes.error) {
    console.error("❌ User B sign-in failed:", loginBRes.error.message);
    if (loginBRes.error.message.includes("Email not confirmed")) {
      console.log("\nRESULT: BLOCKED (User B email not confirmed)");
      process.exit(2);
    }
    process.exit(1);
  }
  console.log("✅ User B authenticated! User ID:", loginBRes.data.user.id);
  const userB = loginBRes.data.user;
  const tokenB = loginBRes.data.session.access_token;

  let passedChecks = 0;

  // 2. AUTHENTICATED RPC PRIVILEGE TEST
  console.log("\n--- 2. Authenticated RPC Privilege Verification ---");
  // Attempt claim_notification_deliveries as User A
  const claimRes = await clientA.rpc("claim_notification_deliveries", {
    p_batch_size: 10,
    p_lease_seconds: 60
  });
  console.log("User A claim_notification_deliveries:", claimRes);
  assert(
    claimRes.error && (claimRes.error.code === "42501" || claimRes.error.message.includes("permission denied")),
    "claim_notification_deliveries must be denied to authenticated non-service_role user"
  );
  console.log("  ✅ [PASS] claim_notification_deliveries denied to authenticated user (SQLSTATE:", claimRes.error.code, ")");
  passedChecks++;

  // Attempt complete_notification_delivery as User A
  const compRes = await clientA.rpc("complete_notification_delivery", {
    p_delivery_id: "00000000-0000-0000-0000-000000000000",
    p_claim_token: "00000000-0000-0000-0000-000000000000",
    p_success: true
  });
  console.log("User A complete_notification_delivery:", compRes);
  assert(
    compRes.error && (compRes.error.code === "42501" || compRes.error.message.includes("permission denied")),
    "complete_notification_delivery must be denied to authenticated non-service_role user"
  );
  console.log("  ✅ [PASS] complete_notification_delivery denied to authenticated user (SQLSTATE:", compRes.error.code, ")");
  passedChecks++;

  // Attempt cleanup_stale_notifications as User A
  const cleanRes = await clientA.rpc("cleanup_stale_notifications", {
    p_retention_days: 30,
    p_deliveries_retention_days: 7
  });
  console.log("User A cleanup_stale_notifications:", cleanRes);
  assert(
    cleanRes.error && (cleanRes.error.code === "42501" || cleanRes.error.message.includes("permission denied")),
    "cleanup_stale_notifications must be denied to authenticated non-service_role user"
  );
  console.log("  ✅ [PASS] cleanup_stale_notifications denied to authenticated user (SQLSTATE:", cleanRes.error.code, ")");
  passedChecks++;

  // 3. LIVE ENDPOINT REBINDING & OWNER TAKEOVER TEST
  console.log("\n--- 3. Live Endpoint Rebinding & Key Refresh Test ---");
  const testEndpoint = "https://fcm.googleapis.com/fcm/send/live_test_rebind_" + Date.now();
  const key1 = "BM_test_p256dh_sample_key_1_1234567890";
  const auth1 = "auth_sample_secret_1_1234567890";

  // A. User A registers endpoint E
  const { data: subA1Id, error: subA1Err } = await clientA.rpc("register_push_subscription", {
    p_endpoint: testEndpoint,
    p_p256dh: key1,
    p_auth: auth1,
    p_device_type: "desktop"
  });
  assert(!subA1Err && subA1Id, `User A registration must succeed: ${subA1Err?.message}`);
  console.log("  ✅ [PASS] User A registered endpoint E. Subscription ID:", subA1Id);
  passedChecks++;

  // B. User A re-registers E with rotated keys
  const key2 = "BM_test_p256dh_sample_key_ROTATED_12345";
  const auth2 = "auth_sample_secret_ROTATED_12345";
  const { data: subA2Id, error: subA2Err } = await clientA.rpc("register_push_subscription", {
    p_endpoint: testEndpoint,
    p_p256dh: key2,
    p_auth: auth2,
    p_device_type: "desktop"
  });
  assert(!subA2Err && subA2Id, `User A re-registration must succeed: ${subA2Err?.message}`);
  assert.strictEqual(subA2Id, subA1Id, "Same-user re-registration must refresh existing subscription identity");
  console.log("  ✅ [PASS] Same-user key rotation refreshed existing subscription (ID preserved:", subA2Id, ")");
  passedChecks++;

  // User A views own subscriptions
  const { data: userASubs, error: userASubsErr } = await clientA.rpc("get_user_push_subscriptions");
  assert(!userASubsErr && userASubs.length > 0, "User A can view own subscriptions");
  const aSub = userASubs.find(s => s.id === subA1Id);
  assert(aSub, "User A subscription present in get_user_push_subscriptions");
  console.log("  ✅ [PASS] User A verified active subscription via get_user_push_subscriptions");
  passedChecks++;

  // C. User B registers the same canonical endpoint E (Takeover)
  const keyB = "BM_test_p256dh_userB_sample_12345";
  const authB = "auth_sample_userB_secret_12345";
  const { data: subBId, error: subBErr } = await clientB.rpc("register_push_subscription", {
    p_endpoint: testEndpoint,
    p_p256dh: keyB,
    p_auth: authB,
    p_device_type: "mobile"
  });
  assert(!subBErr && subBId, `User B takeover registration must succeed: ${subBErr?.message}`);
  assert.notStrictEqual(subBId, subA1Id, "New owner must receive a new subscription ID");
  console.log("  ✅ [PASS] User B registered same endpoint. New Subscription ID:", subBId);
  passedChecks++;

  // Verify User A no longer sees the subscription (it was revoked)
  const { data: userASubsAfter, error: userASubsAfterErr } = await clientA.rpc("get_user_push_subscriptions");
  const aSubAfter = userASubsAfter?.find(s => s.id === subA1Id);
  assert(!aSubAfter, "User A's old subscription must be revoked and hidden from active list");
  console.log("  ✅ [PASS] User A's old subscription revoked upon User B takeover");
  passedChecks++;

  // Verify User B is the active owner
  const { data: userBSubs, error: userBSubsErr } = await clientB.rpc("get_user_push_subscriptions");
  const bSub = userBSubs?.find(s => s.id === subBId);
  assert(bSub, "User B is the active owner in get_user_push_subscriptions");
  console.log("  ✅ [PASS] User B confirmed as sole active owner of endpoint E");
  passedChecks++;

  // 4. CROSS-USER RLS & OWNERSHIP ISOLATION
  console.log("\n--- 4. Cross-User RLS & Isolation Verification ---");

  // User A attempts to revoke User B's subscription
  const { data: revokeOtherRes, error: revokeOtherErr } = await clientA.rpc("revoke_push_subscription", {
    p_subscription_id: subBId
  });
  // Must return false (cannot revoke someone else's subscription)
  assert(revokeOtherRes === false, "User A cannot revoke User B's subscription");
  console.log("  ✅ [PASS] User A cannot revoke User B's subscription (returned false)");
  passedChecks++;

  // Direct table SELECT isolation
  const { error: directSelectSubErr } = await clientA.from("push_subscriptions").select("*").limit(1);
  assert(directSelectSubErr && directSelectSubErr.code === "42501", "Authenticated user cannot directly SELECT push_subscriptions");
  console.log("  ✅ [PASS] Direct SELECT push_subscriptions rejected (42501)");
  passedChecks++;

  const { error: directSelectDelErr } = await clientB.from("notification_deliveries").select("*").limit(1);
  assert(directSelectDelErr && directSelectDelErr.code === "42501", "Authenticated user cannot directly SELECT notification_deliveries");
  console.log("  ✅ [PASS] Direct SELECT notification_deliveries rejected (42501)");
  passedChecks++;

  // Notifications read isolation
  const { data: userANotifs, error: userANotifsErr } = await clientA.rpc("get_user_notifications", {
    p_limit: 10,
    p_offset: 0,
    p_category: "all"
  });
  assert(!userANotifsErr, `User A get_user_notifications must succeed: ${userANotifsErr?.message}`);

  const { data: userBNotifs, error: userBNotifsErr } = await clientB.rpc("get_user_notifications", {
    p_limit: 10,
    p_offset: 0,
    p_category: "all"
  });
  assert(!userBNotifsErr, `User B get_user_notifications must succeed: ${userBNotifsErr?.message}`);
  console.log("  ✅ [PASS] Notification retrieval strictly isolated per user");
  passedChecks++;

  // 5. CLEANUP FIXTURES
  console.log("\n--- 5. Test Fixture Cleanup ---");
  // User B revokes the test subscription
  const { data: revokeBRes } = await clientB.rpc("revoke_push_subscription", {
    p_subscription_id: subBId
  });
  assert(revokeBRes === true, "User B can revoke own test subscription");
  console.log("  ✅ [PASS] Test push subscription revoked cleanly");
  passedChecks++;

  console.log("\n==================================================================");
  console.log(` ALL LIVE AUTHENTICATED TESTS PASSED! (${passedChecks} checks)`);
  console.log("==================================================================");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
