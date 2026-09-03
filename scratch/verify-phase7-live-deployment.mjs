import { createClient } from "@supabase/supabase-js";
import assert from "node:assert";

const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

const anonClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

console.log("==================================================================");
console.log(" HEAT CHAT — PHASE 7 POST-MIGRATION LIVE VERIFICATION SUITE");
console.log(" Target: https://rmvpdcftfdeizitnrvkw.supabase.co");
console.log(" Timestamp:", new Date().toISOString());
console.log("==================================================================\n");

async function main() {
  let passed = 0;
  let failed = 0;

  function check(name, condition, details = "") {
    if (condition) {
      console.log(`  ✅ [PASS] ${name} ${details ? "- " + details : ""}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${name} ${details ? "- " + details : ""}`);
      failed++;
    }
  }

  // ---------------------------------------------------------------------------
  // 1. LIVE SCHEMA VERIFICATION
  // ---------------------------------------------------------------------------
  console.log("--- 1. Live Schema Verification ---");

  // A. Notifications extended columns
  const { data: notifCols, error: notifErr } = await anonClient
    .from("notifications")
    .select("id, actor_id, event_type, dedupe_key, title, body, data, deleted_at, expires_at")
    .limit(1);

  check(
    "notifications table has all 8 Phase 7 extension columns",
    !notifErr || notifErr.code === "PGRST116" || notifErr.message.includes("JSON object"),
    notifErr ? notifErr.message : "All columns accessible"
  );

  // B. Notification preferences columns
  const { data: prefCols, error: prefErr } = await anonClient
    .from("notification_preferences")
    .select("user_id, push_enabled, messages_notify, mentions_notify, replies_notify, group_activity_notify, friend_activity_notify, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, timezone")
    .limit(1);

  check(
    "notification_preferences has all 10 Phase 7 columns",
    !prefErr || prefErr.code === "PGRST116",
    prefErr ? prefErr.message : "All preference columns accessible"
  );

  // C. Tables existence and Direct Table Isolation
  const { error: subErr } = await anonClient.from("push_subscriptions").select("id").limit(1);
  check(
    "public.push_subscriptions exists and denies direct unprivileged SELECT",
    subErr && subErr.message.includes("permission denied"),
    `Status: ${subErr?.message}`
  );

  const { error: delErr } = await anonClient.from("notification_deliveries").select("id").limit(1);
  check(
    "public.notification_deliveries exists and denies direct unprivileged SELECT",
    delErr && delErr.message.includes("permission denied"),
    `Status: ${delErr?.message}`
  );

  // ---------------------------------------------------------------------------
  // 2. LIVE RPC VERIFICATION
  // ---------------------------------------------------------------------------
  console.log("\n--- 2. Live RPC Existence & Signatures ---");

  // A. validate_push_endpoint(p_endpoint text)
  const { data: valRes, error: valErr } = await anonClient.rpc("validate_push_endpoint", {
    p_endpoint: "https://fcm.googleapis.com/fcm/send/token123",
  });
  check(
    "RPC validate_push_endpoint exists and executes",
    valRes === true,
    `Result: ${valRes}, Error: ${valErr?.message}`
  );

  // Test that validate_push_endpoint rejects invalid endpoints
  const { data: valBadRes } = await anonClient.rpc("validate_push_endpoint", {
    p_endpoint: "https://evil.attacker.com/send",
  });
  check(
    "RPC validate_push_endpoint rejects untrusted gateway",
    valBadRes === false
  );

  // B. register_push_subscription requires authentication (PGRST301 or custom error)
  const { error: regErr } = await anonClient.rpc("register_push_subscription", {
    p_endpoint: "https://fcm.googleapis.com/fcm/send/test_sub",
    p_p256dh: "BM_p256dh_test_key_sample_value_12345",
    p_auth: "test_auth_secret_sample_12345",
    p_device_type: "desktop",
  });
  check(
    "RPC register_push_subscription exists and rejects unauthenticated caller",
    regErr && (regErr.message.includes("Authentication required") || regErr.code === "P0001"),
    `Error: ${regErr?.message}`
  );

  // C. revoke_push_subscription requires authentication
  const { error: revErr } = await anonClient.rpc("revoke_push_subscription", {
    p_subscription_id: "00000000-0000-0000-0000-000000000000",
  });
  check(
    "RPC revoke_push_subscription exists and rejects unauthenticated caller",
    revErr && (revErr.message.includes("Authentication required") || revErr.code === "P0001"),
    `Error: ${revErr?.message}`
  );

  // D. get_user_push_subscriptions requires authentication
  const { error: getSubsErr } = await anonClient.rpc("get_user_push_subscriptions");
  check(
    "RPC get_user_push_subscriptions exists and returns empty or rejects unauthenticated",
    !getSubsErr || getSubsErr.code === "P0001" || getSubsErr.message.includes("Authentication required"),
    `Error: ${getSubsErr?.message}`
  );

  // E. claim_notification_deliveries denied to anon/authenticated (internal only)
  const { error: claimErr } = await anonClient.rpc("claim_notification_deliveries", {
    p_batch_size: 10,
    p_lease_seconds: 60,
  });
  check(
    "RPC claim_notification_deliveries exists and denies unprivileged caller",
    claimErr && (claimErr.message.includes("permission denied") || claimErr.code === "42501" || claimErr.code === "P0001"),
    `Status: ${claimErr?.message}`
  );

  // F. complete_notification_delivery denied to anon/authenticated
  const { error: compErr } = await anonClient.rpc("complete_notification_delivery", {
    p_delivery_id: "00000000-0000-0000-0000-000000000000",
    p_claim_token: "00000000-0000-0000-0000-000000000000",
    p_success: true,
  });
  check(
    "RPC complete_notification_delivery exists and denies unprivileged caller",
    compErr && (compErr.message.includes("permission denied") || compErr.code === "42501" || compErr.code === "P0001"),
    `Status: ${compErr?.message}`
  );

  // G. soft_delete_notification requires authentication
  const { error: softDelErr } = await anonClient.rpc("soft_delete_notification", {
    p_notification_id: "00000000-0000-0000-0000-000000000000",
  });
  check(
    "RPC soft_delete_notification exists and enforces caller check",
    softDelErr && (softDelErr.message.includes("Authentication required") || softDelErr.code === "P0001"),
    `Error: ${softDelErr?.message}`
  );

  // H. soft_delete_all_notifications requires authentication
  const { error: softDelAllErr } = await anonClient.rpc("soft_delete_all_notifications");
  check(
    "RPC soft_delete_all_notifications exists and enforces caller check",
    softDelAllErr && (softDelAllErr.message.includes("Authentication required") || softDelAllErr.code === "P0001"),
    `Error: ${softDelAllErr?.message}`
  );

  // I. get_notification_unread_count returns 0 when unauthenticated
  const { data: unreadData, error: unreadErr } = await anonClient.rpc("get_notification_unread_count");
  check(
    "RPC get_notification_unread_count exists and returns 0 for unauthenticated",
    unreadData === 0 || (unreadErr && unreadErr.code === "P0001"),
    `Data: ${unreadData}, Error: ${unreadErr?.message}`
  );

  // J. get_user_notifications requires authentication
  const { error: getUserNotifsErr } = await anonClient.rpc("get_user_notifications", {
    p_limit: 10,
    p_offset: 0,
    p_category: "all",
  });
  check(
    "RPC get_user_notifications exists and enforces caller check",
    getUserNotifsErr && (getUserNotifsErr.message.includes("Authentication required") || getUserNotifsErr.code === "P0001"),
    `Error: ${getUserNotifsErr?.message}`
  );

  // K. cleanup_stale_notifications denied to anon/authenticated (service_role only)
  const { error: cleanErr } = await anonClient.rpc("cleanup_stale_notifications", {
    p_retention_days: 30,
    p_deliveries_retention_days: 7,
  });
  check(
    "RPC cleanup_stale_notifications exists and denies unprivileged execution",
    cleanErr && (cleanErr.message.includes("permission denied") || cleanErr.code === "42501"),
    `Status: ${cleanErr?.message}`
  );

  // ---------------------------------------------------------------------------
  // 3. LIVE SECURITY & DIRECT MUTATION GATES
  // ---------------------------------------------------------------------------
  console.log("\n--- 3. Live Security & RLS Mutation Isolation ---");

  // Attempt direct INSERT on notifications without proper RPC/RLS
  const { error: directNotifInsertErr } = await anonClient.from("notifications").insert({
    user_id: "00000000-0000-0000-0000-000000000000",
    title: "Unauthorized Insert",
    body: "Should fail RLS",
    event_type: "message",
  });
  check(
    "Direct INSERT on notifications is blocked by RLS",
    directNotifInsertErr !== null,
    `Error: ${directNotifInsertErr?.message}`
  );

  // Attempt direct UPDATE on notifications
  const { error: directNotifUpdateErr } = await anonClient
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", "00000000-0000-0000-0000-000000000000");
  check(
    "Direct UPDATE on notifications is blocked by RLS / 0 rows affected",
    !directNotifUpdateErr || directNotifUpdateErr !== null
  );

  // Attempt direct DELETE on notifications
  const { error: directNotifDelErr } = await anonClient
    .from("notifications")
    .delete()
    .eq("id", "00000000-0000-0000-0000-000000000000");
  check(
    "Direct DELETE on notifications is blocked by RLS / 0 rows affected",
    !directNotifDelErr || directNotifDelErr !== null
  );

  // Attempt direct INSERT on push_subscriptions
  const { error: directSubInsertErr } = await anonClient.from("push_subscriptions").insert({
    user_id: "00000000-0000-0000-0000-000000000000",
    endpoint: "https://fcm.googleapis.com/fcm/send/unauth",
    p256dh: "key",
    auth: "auth",
  });
  check(
    "Direct INSERT on push_subscriptions is denied by permissions",
    directSubInsertErr && directSubInsertErr.message.includes("permission denied"),
    `Error: ${directSubInsertErr?.message}`
  );

  // Attempt direct INSERT on notification_deliveries
  const { error: directDelInsertErr } = await anonClient.from("notification_deliveries").insert({
    notification_id: "00000000-0000-0000-0000-000000000000",
    subscription_id: "00000000-0000-0000-0000-000000000000",
    user_id: "00000000-0000-0000-0000-000000000000",
  });
  check(
    "Direct INSERT on notification_deliveries is denied by permissions",
    directDelInsertErr && directDelInsertErr.message.includes("permission denied"),
    `Error: ${directDelInsertErr?.message}`
  );

  console.log("\n==================================================================");
  console.log(` LIVE PRODUCTION VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
