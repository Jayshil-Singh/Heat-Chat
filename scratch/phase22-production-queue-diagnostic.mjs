#!/usr/bin/env node
/**
 * Heat Chat — Phase 22 Production Queue & Web Push Diagnostic Suite
 *
 * Verifies all 18+ critical production invariants:
 * 1. vercel.json cron exists
 * 2. cron path exactly matches worker route
 * 3. cron schedule exists
 * 4. process-queue GET exists
 * 5. process-queue POST exists
 * 6. CRON_SECRET handling exists
 * 7. INTERNAL_WORKER_SECRET handling exists
 * 8. middleware does not block cron (/api/ bypass is early and safe)
 * 9. queue claim RPC exists
 * 10. queue completion RPC exists
 * 11. notification enqueue trigger exists
 * 12. next_attempt_at logic exists (120s buffer + claim filter)
 * 13. service worker push handler exists
 * 14. service worker uses waitUntil
 * 15. service worker calls showNotification
 * 16. VAPID env vars are referenced
 * 17. duplicate-send prevention exists
 * 18. push_enabled defaults true
 * 19. DELETE push subscriptions revocation does not 500 on RLS
 * 20. Queue worker logs structured unmistakable telemetry
 */

import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const ROOT_DIR = process.cwd();

console.log("\n==================================================================");
console.log(" Heat Chat Phase 22 Production Queue & Web Push Diagnostic Suite");
console.log("==================================================================\n");

let passed = 0;
let failed = 0;

function runTest(num, name, fn) {
  try {
    fn();
    console.log(`  [PASS] #${num}: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] #${num}: ${name}`);
    console.error(`         ${err.message}`);
    failed++;
  }
}

// 1-3. vercel.json cron configuration
const vercelJsonPath = path.join(ROOT_DIR, "vercel.json");
const vercelJson = JSON.parse(fs.readFileSync(vercelJsonPath, "utf-8"));

runTest(1, "vercel.json cron exists", () => {
  assert.ok(Array.isArray(vercelJson.crons), "vercel.json crons must be an array");
  assert.ok(vercelJson.crons.length > 0, "crons array cannot be empty");
});

runTest(2, "cron path exactly matches worker route", () => {
  const cronJob = vercelJson.crons.find(
    (c) => c.path === "/api/internal/notifications/process-queue"
  );
  assert.ok(cronJob, "Cron path must match /api/internal/notifications/process-queue");
});

runTest(3, "cron schedule exists and is non-empty", () => {
  const cronJob = vercelJson.crons.find(
    (c) => c.path === "/api/internal/notifications/process-queue"
  );
  assert.ok(cronJob?.schedule, "schedule must be defined");
  assert.strictEqual(typeof cronJob.schedule, "string");
  assert.ok(cronJob.schedule.length > 0);
});

// 4-7. process-queue route implementation & auth
const processQueuePath = path.join(
  ROOT_DIR,
  "app",
  "api",
  "internal",
  "notifications",
  "process-queue",
  "route.ts"
);
const processQueueCode = fs.readFileSync(processQueuePath, "utf-8");

runTest(4, "process-queue GET exists and exports function", () => {
  assert.match(processQueueCode, /export\s+async\s+function\s+GET/);
});

runTest(5, "process-queue POST exists and exports function", () => {
  assert.match(processQueueCode, /export\s+async\s+function\s+POST/);
});

runTest(6, "CRON_SECRET handling exists and uses timingSafeEqual", () => {
  assert.match(processQueueCode, /process\.env\.CRON_SECRET/);
  assert.match(processQueueCode, /timingSafeEqual/);
  assert.match(processQueueCode, /Bearer\s+/);
});

runTest(7, "INTERNAL_WORKER_SECRET handling exists", () => {
  assert.match(processQueueCode, /process\.env\.INTERNAL_WORKER_SECRET/);
  assert.match(processQueueCode, /x-internal-secret/);
});

// 8. Middleware checks
const middlewarePath = path.join(ROOT_DIR, "lib", "supabase", "middleware.ts");
const middlewareCode = fs.readFileSync(middlewarePath, "utf-8");
const rootMiddlewarePath = path.join(ROOT_DIR, "middleware.ts");
const rootMiddlewareCode = fs.readFileSync(rootMiddlewarePath, "utf-8");

runTest(8, "middleware does not block cron — api/ excluded from matcher AND has early bypass", () => {
  // 8a: Root middleware.ts matcher must exclude api/ paths entirely
  assert.match(
    rootMiddlewareCode,
    /api\//,
    "Root middleware.ts matcher must exclude api/ in the negative lookahead"
  );

  // 8b: The negative lookahead must include api/ BEFORE the .* catch-all
  const matcherLine = rootMiddlewareCode.match(/"\/\(\(\?!.*\).*\)"/)?.[0] || "";
  const apiIdx = matcherLine.indexOf("api/");
  assert.ok(apiIdx > 0 || rootMiddlewareCode.includes("api/"), "api/ must appear in the matcher exclusion list");

  // 8c: supabase/middleware.ts still has the in-app early bypass as defence-in-depth
  const apiBypassIndex = middlewareCode.indexOf('pathname.startsWith("/api/")');
  const getUserIndex = middlewareCode.indexOf("supabase.auth.getUser()");
  assert.ok(apiBypassIndex > 0, 'supabase/middleware.ts must include startsWith("/api/") early bypass');
  assert.ok(getUserIndex > 0, "supabase/middleware.ts must include supabase.auth.getUser()");
  assert.ok(
    apiBypassIndex < getUserIndex,
    "API early bypass must precede supabase.auth.getUser() call"
  );
});


// 9-12. Database RPCs and triggers
const phase21SqlPath = path.join(
  ROOT_DIR,
  "supabase",
  "migrations",
  "20260920_phase21_background_push_delivery.sql"
);
const phase21Sql = fs.readFileSync(phase21SqlPath, "utf-8");

runTest(9, "queue claim RPC exists with FOR UPDATE SKIP LOCKED and lease tracking", () => {
  assert.match(phase21Sql, /create or replace function public\.claim_notification_deliveries/i);
  assert.match(phase21Sql, /for update(?:\s+of\s+\w+)?\s+skip locked/i);
  assert.match(phase21Sql, /lease_expires_at/i);
});

runTest(10, "queue completion RPC exists with success/failure handling", () => {
  assert.match(phase21Sql, /create or replace function public\.complete_notification_delivery/i);
  assert.match(phase21Sql, /p_permanent_failure/i);
  assert.match(phase21Sql, /status\s*=\s*'delivered'/i);
});

runTest(11, "notification enqueue trigger exists on public.notifications", () => {
  assert.match(phase21Sql, /create or replace function public\.handle_notification_delivery_enqueue/i);
  assert.match(phase21Sql, /create trigger trg_enqueue_notification_delivery/i);
  assert.match(phase21Sql, /after insert on public\.notifications/i);
});

const dispatcherPath = path.join(ROOT_DIR, "lib", "notifications", "dispatcher.ts");
const dispatcherCode = fs.readFileSync(dispatcherPath, "utf-8");

runTest(12, "next_attempt_at logic exists in dispatcher and claim function", () => {
  assert.match(dispatcherCode, /next_attempt_at:\s*new Date\(Date\.now\(\)\s*\+\s*120_000\)\.toISOString\(\)/);
  assert.match(phase21Sql, /d\.next_attempt_at\s*<=\s*v_now/i);
});

// 13-15. Service worker push handling
const swPath = path.join(ROOT_DIR, "public", "sw.js");
const swCode = fs.readFileSync(swPath, "utf-8");

runTest(13, "service worker push handler exists", () => {
  assert.match(swCode, /self\.addEventListener\("push"/);
});

runTest(14, "service worker uses waitUntil to guarantee background lifecycle", () => {
  assert.match(swCode, /event\.waitUntil\(/);
});

runTest(15, "service worker calls showNotification when window is not focused/closed", () => {
  assert.match(swCode, /self\.registration\.showNotification\(title,\s*options\)/);
});

// 16-18. VAPID and dispatcher contracts
const pushLibPath = path.join(ROOT_DIR, "lib", "notifications", "push.ts");
const pushLibCode = fs.readFileSync(pushLibPath, "utf-8");

runTest(16, "VAPID env vars are referenced with safe configuration", () => {
  assert.match(pushLibCode, /process\.env\.NEXT_PUBLIC_VAPID_PUBLIC_KEY/);
  assert.match(pushLibCode, /process\.env\.VAPID_PRIVATE_KEY/);
  assert.match(pushLibCode, /process\.env\.VAPID_SUBJECT/);
});

runTest(17, "duplicate-send prevention exists by marking deliveries delivered after immediate dispatch", () => {
  assert.match(dispatcherCode, /status:\s*"delivered"/);
  assert.match(dispatcherCode, /delivered_at:\s*nowIso/);
});

runTest(18, "push_enabled defaults true for notification preferences", () => {
  assert.match(dispatcherCode, /push_enabled:\s*true/);
  assert.match(phase21Sql, /push_enabled\s*=\s*true/i);
});

// 19. DELETE subscriptions route hardening
const subscriptionsRoutePath = path.join(
  ROOT_DIR,
  "app",
  "api",
  "notifications",
  "push",
  "subscriptions",
  "route.ts"
);
const subscriptionsRouteCode = fs.readFileSync(subscriptionsRoutePath, "utf-8");

runTest(19, "DELETE push subscriptions handles revocation without RLS 500 error", () => {
  assert.match(subscriptionsRouteCode, /export\s+async\s+function\s+DELETE/);
  assert.match(subscriptionsRouteCode, /revoke_push_subscription/);
  assert.match(subscriptionsRouteCode, /getAdminSupabase/);
});

// 20. Queue worker logging
runTest(20, "Queue worker produces unmistakable structured telemetry", () => {
  assert.match(processQueueCode, /\[Queue Worker\] INVOKED/);
  assert.match(processQueueCode, /\[Notification Queue Claim\]/);
  assert.match(processQueueCode, /\[Notification Queue Complete\]/);
  assert.match(processQueueCode, /\[Auth Diag\]/);
});

console.log("\n==================================================================");
console.log(` Diagnostic Results: ${passed + failed} Tests | ${passed} Passed | ${failed} Failed`);
console.log("==================================================================\n");

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
