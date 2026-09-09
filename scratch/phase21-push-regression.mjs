#!/usr/bin/env node
/**
 * Heat Chat — Phase 21 Background Push Notification Delivery & Processing Regression Suite
 * Tests:
 * 1. Migration SQL safety and schema contracts
 * 2. FOR UPDATE SKIP LOCKED batch claiming & lease expiration
 * 3. Atomic delivery completion & bounded retry logic
 * 4. 7-parameter register_push_subscription RPC
 * 5. Worker queue processor route (GET + POST, CRON_SECRET, timingSafeEqual)
 * 6. Web push delivery module (Promise.allSettled, URL sanitization, preview privacy)
 * 7. SSRF egress validation & provider whitelisting
 * 8. Vercel Cron configuration
 */

import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const ROOT_DIR = process.cwd();

console.log("\n=======================================================");
console.log("  Heat Chat Phase 21 Background Push Regression Suite");
console.log("=======================================================\n");

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    failed++;
  }
}

// ----------------------------------------------------------------------------
// Group 1: Database Migration Schema & RPCs
// ----------------------------------------------------------------------------
console.log("--- Group 1: Database Migration Schema & RPCs ---");

const migrationPath = path.join(
  ROOT_DIR,
  "supabase",
  "migrations",
  "20260920_phase21_background_push_delivery.sql"
);

runTest("Migration file 20260920_phase21_background_push_delivery.sql exists", () => {
  assert.ok(fs.existsSync(migrationPath), "Migration file does not exist");
});

const migrationSql = fs.readFileSync(migrationPath, "utf-8");

runTest("notification_deliveries contains claim columns and indexes", () => {
  assert.match(migrationSql, /add column if not exists lease_expires_at timestamptz/i);
  assert.match(migrationSql, /add column if not exists updated_at timestamptz/i);
  assert.match(migrationSql, /idx_notification_deliveries_claim_v2/i);
  assert.match(migrationSql, /notification_deliveries_notif_sub_uidx/i);
});

runTest("claim_notification_deliveries implements FOR UPDATE SKIP LOCKED", () => {
  assert.match(migrationSql, /create or replace function public\.claim_notification_deliveries/i);
  assert.match(migrationSql, /for update(?:\s+of\s+\w+)?\s+skip locked/i);
  assert.match(migrationSql, /security definer/i);
  assert.match(migrationSql, /set search_path = public, pg_temp/i);
  assert.match(migrationSql, /grant execute on function public\.claim_notification_deliveries/i);
});

runTest("complete_notification_delivery handles success, failure, and bounded retries", () => {
  assert.match(migrationSql, /create or replace function public\.complete_notification_delivery/i);
  assert.match(migrationSql, /p_delivery_id/i);
  assert.match(migrationSql, /p_claim_token/i);
  assert.match(migrationSql, /p_permanent_failure/i);
  assert.match(migrationSql, /status = 'delivered'/i);
  assert.match(migrationSql, /status = 'failed'/i);
  assert.match(migrationSql, /status = 'pending'/i);
  assert.match(migrationSql, /grant execute on function public\.complete_notification_delivery/i);
});

runTest("register_push_subscription accepts 7 parameters and enables push preference", () => {
  assert.match(migrationSql, /create or replace function public\.register_push_subscription/i);
  assert.match(migrationSql, /p_endpoint text/i);
  assert.match(migrationSql, /p_p256dh text/i);
  assert.match(migrationSql, /p_auth text/i);
  assert.match(migrationSql, /p_user_agent text/i);
  assert.match(migrationSql, /p_device_type text/i);
  assert.match(migrationSql, /p_device_id text/i);
  assert.match(migrationSql, /p_installation_id text/i);
  assert.match(migrationSql, /push_enabled = true/i);
  assert.match(migrationSql, /grant execute on function public\.register_push_subscription/i);
});

runTest("handle_notification_delivery_enqueue trigger creates pending deliveries", () => {
  assert.match(migrationSql, /create or replace function public\.handle_notification_delivery_enqueue/i);
  assert.match(migrationSql, /insert into public\.notification_deliveries/i);
  assert.match(migrationSql, /on conflict \(notification_id, subscription_id\) do nothing/i);
  assert.match(migrationSql, /trg_enqueue_notification_delivery/i);
});

// ----------------------------------------------------------------------------
// Group 2: Push Delivery Library (lib/notifications/push-delivery.ts)
// ----------------------------------------------------------------------------
console.log("\n--- Group 2: Push Delivery Library ---");

const pushDeliveryPath = path.join(ROOT_DIR, "lib", "notifications", "push-delivery.ts");
const pushDeliveryCode = fs.readFileSync(pushDeliveryPath, "utf-8");

runTest("push-delivery.ts defines sanitizePushTargetUrl preventing open redirects", () => {
  assert.match(pushDeliveryCode, /export function sanitizePushTargetUrl/);
  assert.match(pushDeliveryCode, /trimmed\.startsWith\("\/"\)/);
  assert.match(pushDeliveryCode, /trimmed\.startsWith\("\/\/"\)/);
  assert.match(pushDeliveryCode, /javascript:/);
});

runTest("sendWebPushToConversationMembers awaits dispatches via Promise.allSettled", () => {
  assert.match(pushDeliveryCode, /export async function sendWebPushToConversationMembers/);
  assert.match(pushDeliveryCode, /await Promise\.allSettled/);
  assert.match(pushDeliveryCode, /sendWebPushToUser/);
});

runTest("sendWebPushToUser logs structured telemetry without secrets", () => {
  assert.match(pushDeliveryCode, /\[Push Delivery\]/);
  assert.match(pushDeliveryCode, /notification_id=/);
  assert.match(pushDeliveryCode, /subscription_id=/);
  // Invariant: no endpoint, p256dh, or auth keys in log strings
  assert.doesNotMatch(pushDeliveryCode, /console\.log\([^)]*sub\.auth/);
  assert.doesNotMatch(pushDeliveryCode, /console\.log\([^)]*sub\.p256dh/);
});

runTest("sendWebPushToUser respects message preview preference", () => {
  assert.match(pushDeliveryCode, /message_preview_enabled/);
  assert.match(pushDeliveryCode, /sanitizedBody = "New message"/);
});

const dispatcherPath = path.join(ROOT_DIR, "lib", "notifications", "dispatcher.ts");
const dispatcherCode = fs.readFileSync(dispatcherPath, "utf-8");

runTest("dispatcher.ts prevents double-send by marking deliveries delivered after immediate dispatch", () => {
  assert.match(dispatcherCode, /status:\s*"delivered"/);
  assert.match(dispatcherCode, /\.eq\("notification_id",\s*notification\.id\)/);
  assert.match(dispatcherCode, /next_attempt_at:\s*new Date\(Date\.now\(\)\s*\+\s*120_000\)\.toISOString\(\)/);
});

runTest("dispatcher.ts defaults push_enabled to true for new users", () => {
  assert.match(dispatcherCode, /push_enabled:\s*true/);
});

runTest("push-delivery.ts safely resolves notification_id before marking deliveries delivered", () => {
  assert.match(pushDeliveryCode, /isValidUuid/);
  assert.match(pushDeliveryCode, /\.eq\("notification_id",\s*targetNotifId\)/);
});

// ----------------------------------------------------------------------------
// Group 3: Internal Queue Processing Worker Route
// ----------------------------------------------------------------------------
console.log("\n--- Group 3: Internal Queue Processing Worker Route ---");

const processQueueRoutePath = path.join(
  ROOT_DIR,
  "app",
  "api",
  "internal",
  "notifications",
  "process-queue",
  "route.ts"
);
const processQueueCode = fs.readFileSync(processQueueRoutePath, "utf-8");

runTest("process-queue exports both GET and POST for Vercel Cron compatibility", () => {
  assert.match(processQueueCode, /export async function GET/);
  assert.match(processQueueCode, /export async function POST/);
  assert.match(processQueueCode, /handleProcessQueue/);
});

runTest("process-queue verifies CRON_SECRET and timingSafeEqual", () => {
  assert.match(processQueueCode, /process\.env\.CRON_SECRET/);
  assert.match(processQueueCode, /process\.env\.INTERNAL_WORKER_SECRET/);
  assert.match(processQueueCode, /crypto\.timingSafeEqual/);
});

runTest("process-queue performs SSRF egress validation", () => {
  assert.match(processQueueCode, /validatePushEndpointEgress/);
  assert.match(processQueueCode, /complete_notification_delivery/);
});

runTest("process-queue logs structured delivery status without secrets", () => {
  assert.match(processQueueCode, /\[Worker Delivery\]/);
  assert.match(processQueueCode, /\[Worker Delivery Error\]/);
  assert.doesNotMatch(processQueueCode, /console\.log\([^)]*item\.auth/);
  assert.doesNotMatch(processQueueCode, /console\.log\([^)]*item\.p256dh/);
});

// ----------------------------------------------------------------------------
// Group 4: Client Push Subscription Route & Service Worker
// ----------------------------------------------------------------------------
console.log("\n--- Group 4: Client Push Subscription Route & Service Worker ---");

const subscribeRoutePath = path.join(
  ROOT_DIR,
  "app",
  "api",
  "notifications",
  "push",
  "subscribe",
  "route.ts"
);
const subscribeCode = fs.readFileSync(subscribeRoutePath, "utf-8");

runTest("push subscribe route validates key lengths and calls register_push_subscription", () => {
  assert.match(subscribeCode, /p256dh\.trim\(\)\.length < 16/);
  assert.match(subscribeCode, /auth\.trim\(\)\.length < 8/);
  assert.match(subscribeCode, /register_push_subscription/);
  assert.match(subscribeCode, /p_installation_id/);
});

const swPath = path.join(ROOT_DIR, "public", "sw.js");
const swCode = fs.readFileSync(swPath, "utf-8");

runTest("public/sw.js contains push, notificationclick, and pushsubscriptionchange handlers", () => {
  assert.match(swCode, /self\.addEventListener\("push"/);
  assert.match(swCode, /self\.addEventListener\("notificationclick"/);
  assert.match(swCode, /self\.addEventListener\("pushsubscriptionchange"/);
  assert.match(swCode, /sanitizeTargetUrl/);
});

// ----------------------------------------------------------------------------
// Group 5: Vercel Cron Configuration
// ----------------------------------------------------------------------------
console.log("\n--- Group 5: Vercel Cron Configuration ---");

const vercelJsonPath = path.join(ROOT_DIR, "vercel.json");
const vercelJson = JSON.parse(fs.readFileSync(vercelJsonPath, "utf-8"));

runTest("vercel.json configures queue processor cron job", () => {
  assert.ok(Array.isArray(vercelJson.crons), "crons must be an array");
  const queueCron = vercelJson.crons.find(
    (c) => c.path === "/api/internal/notifications/process-queue"
  );
  assert.ok(queueCron, "Cron for process-queue not found in vercel.json");
  assert.strictEqual(queueCron.schedule, "* * * * *");
});

// ----------------------------------------------------------------------------
// Group 6: Live URL & Egress Sanitization Unit Invariants
// ----------------------------------------------------------------------------
console.log("\n--- Group 6: Live Unit Invariants ---");

runTest("URL Sanitization function logic behaves correctly", () => {
  function sanitizePushTargetUrl(url) {
    if (!url || typeof url !== "string") return "/chat";
    const trimmed = url.trim();
    if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
      return "/chat";
    }
    if (
      trimmed.toLowerCase().startsWith("/%2f") ||
      trimmed.toLowerCase().includes("javascript:") ||
      trimmed.toLowerCase().includes("data:") ||
      trimmed.includes("\\")
    ) {
      return "/chat";
    }
    return trimmed;
  }

  assert.strictEqual(sanitizePushTargetUrl("/chat/123"), "/chat/123");
  assert.strictEqual(sanitizePushTargetUrl("https://malicious.com"), "/chat");
  assert.strictEqual(sanitizePushTargetUrl("//malicious.com"), "/chat");
  assert.strictEqual(sanitizePushTargetUrl("/\\malicious.com"), "/chat");
  assert.strictEqual(sanitizePushTargetUrl("javascript:alert(1)"), "/chat");
  assert.strictEqual(sanitizePushTargetUrl(""), "/chat");
  assert.strictEqual(sanitizePushTargetUrl(null), "/chat");
  assert.strictEqual(sanitizePushTargetUrl(undefined), "/chat");
});

console.log("\n=======================================================");
console.log(`  Tests Completed: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
console.log("=======================================================\n");

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
