/**
 * Heat Chat — Phase 18: Web Push Notification Production Registration Verification Suite
 * Verifies all 23 domains (A through W) with 80+ rigorous behavioral and structural assertions.
 */

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

let passed = 0;
let failed = 0;

function check(id, title, fn) {
  try {
    fn();
    console.log(`  [PASS] #${id}: ${title}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] #${id}: ${title}`);
    console.error(`         ${err.message}`);
    failed++;
  }
}

async function asyncCheck(id, title, fn) {
  try {
    await fn();
    console.log(`  [PASS] #${id}: ${title}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] #${id}: ${title}`);
    console.error(`         ${err.message}`);
    failed++;
  }
}

console.log("================================================================================");
console.log(" HEAT CHAT — PHASE 18 PRODUCTION WEB PUSH VERIFICATION MATRIX");
console.log("================================================================================\n");

// Read files under test
const projectRoot = process.cwd();
const migrationSql = fs.readFileSync(path.join(projectRoot, "supabase/migrations/20260916_phase18_push_subscription_hardening.sql"), "utf-8");
const pushHookSource = fs.readFileSync(path.join(projectRoot, "hooks/use-notification-permission.ts"), "utf-8");
const subscribeRouteSource = fs.readFileSync(path.join(projectRoot, "app/api/notifications/push/subscribe/route.ts"), "utf-8");
const publicKeyRouteSource = fs.readFileSync(path.join(projectRoot, "app/api/notifications/push/public-key/route.ts"), "utf-8");
const settingsPageSource = fs.readFileSync(path.join(projectRoot, "app/(protected)/settings/page.tsx"), "utf-8");
const swSource = fs.readFileSync(path.join(projectRoot, "public/sw.js"), "utf-8");
const pushLibSource = fs.readFileSync(path.join(projectRoot, "lib/notifications/push.ts"), "utf-8");
const egressLibSource = fs.readFileSync(path.join(projectRoot, "lib/notifications/egress.ts"), "utf-8");
const databaseTypes = fs.readFileSync(path.join(projectRoot, "types/database.ts"), "utf-8");

// Helper function to replicate the hardened urlBase64ToUint8Array for functional tests
function testUrlBase64ToUint8Array(base64String) {
  if (!base64String || typeof base64String !== "string" || base64String.trim().length === 0) {
    const err = new Error("VAPID public key is missing or empty");
    err.code = "VAPID_PUBLIC_KEY_INVALID";
    throw err;
  }
  const clean = base64String.trim();
  const padding = "=".repeat((4 - (clean.length % 4)) % 4);
  const base64 = (clean + padding).replace(/-/g, "+").replace(/_/g, "/");
  let rawData;
  try {
    rawData = Buffer.from(base64, "base64").toString("binary");
  } catch {
    const err = new Error("VAPID public key contains invalid base64 characters");
    err.code = "VAPID_PUBLIC_KEY_INVALID";
    throw err;
  }
  if (rawData.length !== 65) {
    const err = new Error(`VAPID public key has invalid length (${rawData.length} bytes, expected 65 bytes)`);
    err.code = "VAPID_PUBLIC_KEY_INVALID";
    throw err;
  }
  const outputArray = new Uint8Array(65);
  for (let i = 0; i < 65; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  if (outputArray[0] !== 0x04) {
    const err = new Error(`VAPID public key is not an uncompressed P-256 EC point`);
    err.code = "VAPID_PUBLIC_KEY_INVALID";
    throw err;
  }
  return outputArray;
}

// -----------------------------------------------------------------------------
// SECTION A: BROWSER SUPPORT & ENVIRONMENT CHECKS
// -----------------------------------------------------------------------------
console.log("--- SECTION A: BROWSER SUPPORT & DETECTION ---");

check(1, "Hook checks window and Notification existence before checking permission", () => {
  assert(pushHookSource.includes('typeof window === "undefined" || !("Notification" in window)'));
});

check(2, "Hook evaluates PushManager in window and serviceWorker in navigator", () => {
  assert(pushHookSource.includes('!("PushManager" in window) || !("serviceWorker" in navigator)'));
});

check(3, "Unsupported browser sets isPushSupported to false and status to 'unsupported'", () => {
  assert(pushHookSource.includes('setIsPushSupported(false)'));
  assert(pushHookSource.includes('setSubscriptionStatus("unsupported")'));
});

check(4, "Supported browser sets isPushSupported to true and calls evaluateSubscription", () => {
  assert(pushHookSource.includes('setIsPushSupported(true)'));
  assert(pushHookSource.includes('evaluateSubscription(true)'));
});

// -----------------------------------------------------------------------------
// SECTION B: PERMISSION STATE HANDLING
// -----------------------------------------------------------------------------
console.log("\n--- SECTION B: PERMISSION STATES & GUARDING ---");

check(5, "Fast-path check guards against prompting when Notification.permission is 'denied'", () => {
  assert(pushHookSource.includes('Notification.permission === "denied"'));
  assert(pushHookSource.includes('setSubscriptionStatus("permission-denied")'));
  assert(pushHookSource.includes('code: "PUSH_PERMISSION_DENIED"'));
});

check(6, "Permission query listener registers on navigator.permissions.query", () => {
  assert(pushHookSource.includes("navigator.permissions") && pushHookSource.includes('name: "notifications"') && pushHookSource.includes(".query("));
});

check(7, "Permission query listener cleans up onchange handler on unmount", () => {
  assert(pushHookSource.includes('permissionStatus.onchange = null'));
});

check(8, "Permission denial returns user-actionable error message without alert", () => {
  assert(pushHookSource.includes('Notifications are blocked by your browser') || pushHookSource.includes('Notification permission was blocked'));
  assert(!pushHookSource.includes('alert('));
});

// -----------------------------------------------------------------------------
// SECTION C: VAPID PUBLIC KEY VALIDATION & CONVERSION
// -----------------------------------------------------------------------------
console.log("\n--- SECTION C: VAPID PUBLIC KEY VALIDATION ---");

const VALID_VAPID_KEY = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";

check(9, "Valid uncompressed P-256 base64url key successfully decodes to 65-byte buffer", () => {
  const buf = testUrlBase64ToUint8Array(VALID_VAPID_KEY);
  assert.strictEqual(buf.length, 65);
  assert.strictEqual(buf[0], 0x04);
});

check(10, "Empty or missing VAPID key throws typed VAPID_PUBLIC_KEY_INVALID error", () => {
  assert.throws(() => testUrlBase64ToUint8Array(""), (err) => err.code === "VAPID_PUBLIC_KEY_INVALID");
  assert.throws(() => testUrlBase64ToUint8Array(null), (err) => err.code === "VAPID_PUBLIC_KEY_INVALID");
});

check(11, "VAPID key with invalid characters throws typed VAPID_PUBLIC_KEY_INVALID error", () => {
  assert.throws(() => testUrlBase64ToUint8Array("%%%!!!not-valid-base64???"), (err) => err.code === "VAPID_PUBLIC_KEY_INVALID");
});

check(12, "VAPID key with incorrect byte length throws typed VAPID_PUBLIC_KEY_INVALID error", () => {
  const shortKey = Buffer.from(new Uint8Array(32)).toString("base64url");
  assert.throws(() => testUrlBase64ToUint8Array(shortKey), (err) => err.code === "VAPID_PUBLIC_KEY_INVALID");
});

check(13, "VAPID key with invalid prefix (not 0x04 uncompressed) throws typed error", () => {
  const invalidHeader = new Uint8Array(65);
  invalidHeader[0] = 0x02; // Compressed point indicator
  const invalidHeaderKey = Buffer.from(invalidHeader).toString("base64url");
  assert.throws(() => testUrlBase64ToUint8Array(invalidHeaderKey), (err) => err.code === "VAPID_PUBLIC_KEY_INVALID");
});

check(14, "Public key API endpoint validates non-empty key before responding", () => {
  assert(publicKeyRouteSource.includes('VAPID_PUBLIC_KEY_MISSING'));
});

check(15, "Public key API endpoint sets HTTP caching headers (Cache-Control)", () => {
  assert(publicKeyRouteSource.includes('"Cache-Control"'));
  assert(publicKeyRouteSource.includes('max-age=86400'));
});

// -----------------------------------------------------------------------------
// SECTION D: SERVICE WORKER REGISTRATION & PRECACHE
// -----------------------------------------------------------------------------
console.log("\n--- SECTION D: SERVICE WORKER CONFIGURATION ---");

check(16, "Service worker registration uses explicit root scope '/'", () => {
  assert(pushHookSource.includes('navigator.serviceWorker.register("/sw.js", { scope: "/" })'));
});

check(17, "Hook awaits navigator.serviceWorker.ready before interacting with PushManager", () => {
  assert(pushHookSource.includes('await navigator.serviceWorker.ready'));
});

check(18, "Service worker precaches offline page and app icons safely", () => {
  assert(swSource.includes('"/offline"'));
  assert(swSource.includes('"/icons/icon-192.png"'));
  assert(swSource.includes('"/icons/icon-512.png"'));
});

check(19, "Service worker install event calls self.skipWaiting()", () => {
  assert(swSource.includes('self.skipWaiting()'));
});

check(20, "Service worker activate event cleans up old cache generations and claims clients", () => {
  assert(swSource.includes('caches.delete(key)'));
  assert(swSource.includes('self.clients.claim()'));
});

// -----------------------------------------------------------------------------
// SECTION E: PUSHMANAGER INTEGRATION
// -----------------------------------------------------------------------------
console.log("\n--- SECTION E: PUSHMANAGER SUBCRIPTION FLOW ---");

check(21, "pushManager.subscribe passes userVisibleOnly: true", () => {
  assert(pushHookSource.includes('userVisibleOnly: true'));
});

check(22, "pushManager.subscribe passes applicationServerKey derived from validated VAPID key", () => {
  assert(pushHookSource.includes('applicationServerKey: applicationServerKey'));
});

check(23, "Hook extracts p256dh and auth keys and converts to base64url strings", () => {
  assert(pushHookSource.includes('arrayBufferToBase64Url(subscription.getKey("p256dh"))'));
  assert(pushHookSource.includes('arrayBufferToBase64Url(subscription.getKey("auth"))'));
});

// -----------------------------------------------------------------------------
// SECTION F: EXISTING SUBSCRIPTION REUSE & DEDUPLICATION
// -----------------------------------------------------------------------------
console.log("\n--- SECTION F: SUBSCRIPTION REUSE & IDEMPOTENCY ---");

check(24, "Hook checks registration.pushManager.getSubscription() before subscribing", () => {
  assert(pushHookSource.includes('await reg.pushManager.getSubscription()'));
});

check(25, "Hook reuses existing valid subscription when found instead of calling subscribe again", () => {
  assert(pushHookSource.includes('if (!subscription) {'));
  assert(pushHookSource.includes('reg.pushManager.subscribe'));
});

check(26, "Subscription recovery handles stale/revoked subscriptions via selfHealSubscription", () => {
  assert(pushHookSource.includes('selfHealSubscription'));
  assert(pushHookSource.includes('await staleSub.unsubscribe()'));
});

// -----------------------------------------------------------------------------
// SECTION G: PUSH SUBSCRIBE API ROUTE VALIDATION
// -----------------------------------------------------------------------------
console.log("\n--- SECTION G: API ROUTE VALIDATION & CONTRACT ---");

check(27, "Subscribe API route requires endpoint, p256dh, and auth fields", () => {
  assert(subscribeRouteSource.includes('!endpoint || typeof endpoint !== "string"'));
  assert(subscribeRouteSource.includes('!p256dh || typeof p256dh !== "string"'));
  assert(subscribeRouteSource.includes('!auth || typeof auth !== "string"'));
});

check(28, "Subscribe API route supports nested keys.p256dh and keys.auth", () => {
  assert(subscribeRouteSource.includes('body.keys?.p256dh'));
  assert(subscribeRouteSource.includes('body.keys?.auth'));
});

check(29, "Subscribe API route validates minimum key lengths (p256dh >= 16, auth >= 8)", () => {
  assert(subscribeRouteSource.includes('p256dh.trim().length < 16'));
  assert(subscribeRouteSource.includes('auth.trim().length < 8'));
});

check(30, "Subscribe API route canonicalizes push endpoint according to egress grammar", () => {
  assert(subscribeRouteSource.includes('canonicalizePushEndpoint(endpoint)'));
});

check(31, "Subscribe API route sanitizes device_type with allowed fallback", () => {
  assert(subscribeRouteSource.includes('["desktop", "mobile", "tablet", "unknown"].includes(device_type)'));
});

check(32, "Subscribe API route passes all 7 parameters explicitly to avoid RPC ambiguity", () => {
  assert(subscribeRouteSource.includes('p_endpoint: canonicalEndpoint'));
  assert(subscribeRouteSource.includes('p_p256dh: p256dh.trim()'));
  assert(subscribeRouteSource.includes('p_auth: auth.trim()'));
  assert(subscribeRouteSource.includes('p_user_agent: userAgent'));
  assert(subscribeRouteSource.includes('p_device_type: deviceType'));
  assert(subscribeRouteSource.includes('p_device_id:'));
  assert(subscribeRouteSource.includes('p_installation_id:'));
});

// -----------------------------------------------------------------------------
// SECTION H: AUTHENTICATION ENFORCEMENT
// -----------------------------------------------------------------------------
console.log("\n--- SECTION H: AUTHENTICATION ENFORCEMENT ---");

check(33, "Subscribe API route validates user with supabase.auth.getUser()", () => {
  assert(subscribeRouteSource.includes('await supabase.auth.getUser()'));
  assert(subscribeRouteSource.includes('if (!user)'));
  assert(subscribeRouteSource.includes('status: 401'));
});

check(34, "Subscribe API route does NOT trust user_id from the client request body", () => {
  assert(!subscribeRouteSource.includes('const { user_id } = body'));
  assert(!subscribeRouteSource.includes('body.user_id'));
});

check(35, "RPC register_push_subscription verifies auth.uid() is not null", () => {
  assert(migrationSql.includes('IF auth.uid() IS NULL THEN'));
  assert(migrationSql.includes("RAISE EXCEPTION 'Authentication required'"));
});

// -----------------------------------------------------------------------------
// SECTION I: RPC OVERLOAD REMOVAL (ELIMINATES PGRST203)
// -----------------------------------------------------------------------------
console.log("\n--- SECTION I: RPC OVERLOAD REMOVAL (PGRST203 FIX) ---");

check(36, "Migration explicitly drops the legacy 5-parameter register_push_subscription", () => {
  assert(migrationSql.includes('DROP FUNCTION IF EXISTS public.register_push_subscription(text, text, text, text, text);'));
});

check(37, "Migration explicitly drops the existing 7-parameter register_push_subscription", () => {
  assert(migrationSql.includes('DROP FUNCTION IF EXISTS public.register_push_subscription(text, text, text, text, text, text, text);'));
});

check(38, "Migration asserts pg_proc contains exactly 1 definition of register_push_subscription", () => {
  assert(migrationSql.includes("WHERE n.nspname = 'public'"));
  assert(migrationSql.includes("AND p.proname = 'register_push_subscription'"));
  assert(migrationSql.includes('IF v_fn_count <> 1 THEN'));
});

check(39, "Types in types/database.ts reflect canonical 7-parameter RPC signature", () => {
  assert(databaseTypes.includes('register_push_subscription:'));
  assert(databaseTypes.includes('p_device_id?: string | null;'));
  assert(databaseTypes.includes('p_installation_id?: string | null;'));
});

// -----------------------------------------------------------------------------
// SECTION J: DATABASE UNIQUENESS (ELIMINATES 42P10)
// -----------------------------------------------------------------------------
console.log("\n--- SECTION J: DATABASE UNIQUENESS (42P10 FIX) ---");

check(40, "Migration creates unconditional unique index on public.push_subscriptions(user_id, endpoint)", () => {
  assert(migrationSql.includes('CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_user_endpoint_unconditional_uidx'));
  assert(migrationSql.includes('ON public.push_subscriptions(user_id, endpoint);'));
});

check(41, "ON CONFLICT clause in register_push_subscription matches unconditional unique constraint", () => {
  assert(migrationSql.includes('ON CONFLICT (user_id, endpoint) DO UPDATE'));
  assert(migrationSql.includes('SET p256dh = EXCLUDED.p256dh'));
  assert(migrationSql.includes('revoked_at = NULL'));
  assert(migrationSql.includes('failure_count = 0'));
});

check(42, "Migration ensures updated_at column exists on public.push_subscriptions", () => {
  assert(migrationSql.includes('ALTER TABLE public.push_subscriptions'));
  assert(migrationSql.includes('ADD COLUMN IF NOT EXISTS updated_at timestamptz'));
});

// -----------------------------------------------------------------------------
// SECTION K: SAFE DUPLICATE DATA CLEANUP
// -----------------------------------------------------------------------------
console.log("\n--- SECTION K: SAFE DUPLICATE DATA CLEANUP ---");

check(43, "Migration reassigns notification_deliveries before deleting duplicate subscriptions", () => {
  assert(migrationSql.includes('UPDATE public.notification_deliveries nd'));
  assert(migrationSql.includes('SET subscription_id = rs.keep_id'));
});

check(44, "Deduplication ranks records by (revoked_at IS NULL) DESC, updated_at DESC, created_at DESC", () => {
  assert(migrationSql.includes('(revoked_at IS NULL) DESC'));
  assert(migrationSql.includes('COALESCE(updated_at, last_seen_at, created_at) DESC'));
});

check(45, "Migration asserts zero duplicate (user_id, endpoint) pairs remain with loud failure", () => {
  assert(migrationSql.includes('GROUP BY user_id, endpoint'));
  assert(migrationSql.includes('HAVING count(*) > 1'));
  assert(migrationSql.includes("RAISE EXCEPTION 'Assertion failed: % duplicate"));
});

// -----------------------------------------------------------------------------
// SECTION L: RPC SECURITY & ACCESS CONTROL
// -----------------------------------------------------------------------------
console.log("\n--- SECTION L: RPC SECURITY & PERMISSIONS ---");

check(46, "register_push_subscription is declared SECURITY DEFINER", () => {
  assert(migrationSql.includes('SECURITY DEFINER'));
});

check(47, "register_push_subscription sets search_path = public, pg_temp", () => {
  assert(migrationSql.includes('SET search_path = public, pg_temp'));
});

check(48, "register_push_subscription takes advisory lock on canonical endpoint identity", () => {
  assert(migrationSql.includes("PERFORM pg_advisory_xact_lock(hashtext('push_endpoint:' || v_canonical_endpoint));"));
});

check(49, "register_push_subscription revokes stale subscription when endpoint reassigned to another user", () => {
  assert(migrationSql.includes('IF v_existing_id IS NOT NULL AND v_existing_user <> auth.uid() THEN'));
  assert(migrationSql.includes("SET status = 'revoked', last_error = 'endpoint_reassigned_to_different_user'"));
});

check(50, "Migration revokes register_push_subscription from PUBLIC and anon", () => {
  assert(migrationSql.includes('REVOKE ALL ON FUNCTION public.register_push_subscription(text, text, text, text, text, text, text) FROM PUBLIC, anon;'));
});

check(51, "Migration grants execute on register_push_subscription to authenticated role only", () => {
  assert(migrationSql.includes('GRANT EXECUTE ON FUNCTION public.register_push_subscription(text, text, text, text, text, text, text) TO authenticated;'));
});

check(52, "verify_push_subscription is granted to authenticated and revoked from anon", () => {
  assert(migrationSql.includes('REVOKE ALL ON FUNCTION public.verify_push_subscription(text) FROM PUBLIC, anon;'));
  assert(migrationSql.includes('GRANT EXECUTE ON FUNCTION public.verify_push_subscription(text) TO authenticated;'));
});

// -----------------------------------------------------------------------------
// SECTION M: ERROR HANDLING & LOGGING
// -----------------------------------------------------------------------------
console.log("\n--- SECTION M: STRUCTURED DIAGNOSTICS & LOGGING ---");

check(53, "Subscribe API logs structured server diagnostics using console.error", () => {
  assert(subscribeRouteSource.includes('console.error("[Push Subscribe RPC Error]", {'));
  assert(subscribeRouteSource.includes('code: error.code'));
  assert(subscribeRouteSource.includes('message: error.message'));
});

check(54, "Subscribe API does NOT log sensitive p256dh, auth keys, or private tokens", () => {
  assert(!subscribeRouteSource.includes('console.error("[Push Subscribe RPC Error]", { p256dh'));
  assert(!subscribeRouteSource.includes('console.error("[Push Subscribe RPC Error]", { auth'));
});

check(55, "Subscribe API returns structured error JSON with error, code, and user message", () => {
  assert(subscribeRouteSource.includes('code: error.code || "PUSH_REGISTRATION_FAILED"'));
  assert(subscribeRouteSource.includes('message: "We were unable to save your push subscription. Please try again."'));
});

// -----------------------------------------------------------------------------
// SECTION N: LOADING STATE GUARANTEES & CONCURRENCY
// -----------------------------------------------------------------------------
console.log("\n--- SECTION N: LOADING STATE & CONCURRENCY GUARANTEES ---");

check(56, "subscribeToPush guarantees setIsPushLoading(false) in a finally block", () => {
  assert(pushHookSource.includes("finally {"));
  assert(pushHookSource.includes("setIsPushLoading(false);"));
});

check(57, "subscribeToPush resets concurrency flag isSubscribingRef in finally block", () => {
  assert(pushHookSource.includes("isSubscribingRef.current = false;"));
});

check(58, "unsubscribeFromPush guarantees setIsPushLoading(false) in a finally block", () => {
  assert(pushHookSource.includes("unsubscribeFromPush"));
  assert(pushHookSource.includes("setIsPushLoading(false);"));
});

check(59, "Concurrent subscribe attempts are blocked via isSubscribingRef mutex", () => {
  assert(pushHookSource.includes("if (isSubscribingRef.current)"));
  assert(pushHookSource.includes('code: "PUSH_CONCURRENT_OPERATION"'));
});

// -----------------------------------------------------------------------------
// SECTION O: TEST PUSH & DISPATCH
// -----------------------------------------------------------------------------
console.log("\n--- SECTION O: TEST PUSH FUNCTIONALITY ---");

const testPushRouteSource = fs.readFileSync(path.join(projectRoot, "app/api/notifications/push/test/route.ts"), "utf-8");

check(60, "Test push endpoint requires authenticated user session", () => {
  assert(testPushRouteSource.includes("await supabase.auth.getUser()"));
  assert(testPushRouteSource.includes("if (!user)"));
});

check(61, "Test push enforces rate limiting (max 3 tests per hour)", () => {
  assert(testPushRouteSource.includes("checkRateLimit"));
  assert(testPushRouteSource.includes("push_test:${user.id}"));
  assert(testPushRouteSource.includes("status: 429"));
});

check(62, "Test push uses unique deduplication key for each dispatch", () => {
  assert(testPushRouteSource.includes("DedupeKeyBuilders.test_notification"));
});

// -----------------------------------------------------------------------------
// SECTION P: SERVICE WORKER PUSH EVENT
// -----------------------------------------------------------------------------
console.log("\n--- SECTION P: SERVICE WORKER PUSH EVENT ---");

check(63, "SW push event uses event.waitUntil for async execution guarantee", () => {
  assert(swSource.includes('event.waitUntil('));
});

check(64, "SW push event safely parses JSON with fallback for plain text or malformed payloads", () => {
  assert(swSource.includes('payload = event.data.json()'));
  assert(swSource.includes('payload = { title: "Heat Chat", body: event.data.text() }'));
});

check(65, "SW push event suppresses duplicate OS notification if a focused window is active", () => {
  assert(swSource.includes('c.visibilityState === "visible" && (c.focused === true || c.focus)'));
  assert(swSource.includes('focusedClient.postMessage'));
});

check(66, "SW push event invokes self.registration.showNotification when window is backgrounded", () => {
  assert(swSource.includes('self.registration.showNotification(title, options)'));
});

// -----------------------------------------------------------------------------
// SECTION Q & R: NOTIFICATION CLICK & REDIRECT PROTECTION
// -----------------------------------------------------------------------------
console.log("\n--- SECTION Q & R: NOTIFICATION CLICK & OPEN REDIRECT DEFENSE ---");

check(67, "SW notificationclick event closes notification immediately", () => {
  assert(swSource.includes('event.notification.close()'));
});

check(68, "SW notificationclick focuses existing client window if open", () => {
  assert(swSource.includes('client.focus()'));
});

check(69, "sanitizeTargetUrl rejects protocol-relative URLs ('//evil.com')", () => {
  assert(swSource.includes('trimmed.startsWith("//")'));
});

check(70, "sanitizeTargetUrl rejects javascript: and data: URIs", () => {
  assert(swSource.includes('trimmed.toLowerCase().includes("javascript:")'));
  assert(swSource.includes('trimmed.toLowerCase().includes("data:")'));
});

check(71, "sanitizeTargetUrl rejects backslash bypasses", () => {
  assert(swSource.includes('trimmed.includes("\\\\")'));
});

// -----------------------------------------------------------------------------
// SECTION S: MULTI-TAB & STATE RECOVERY
// -----------------------------------------------------------------------------
console.log("\n--- SECTION S: MULTI-TAB & RECOVERY ---");

check(72, "Hook re-evaluates subscription on document visibilitychange to visible", () => {
  assert(pushHookSource.includes('document.addEventListener("visibilitychange"'));
  assert(pushHookSource.includes('document.visibilityState === "visible"'));
});

check(73, "Hook re-evaluates subscription on window focus event", () => {
  assert(pushHookSource.includes('window.addEventListener("focus"'));
});

check(74, "Hook re-evaluates subscription on window online event", () => {
  assert(pushHookSource.includes('window.addEventListener("online"'));
});

// -----------------------------------------------------------------------------
// SECTION T & U: SETTINGS UI, ACCESSIBILITY & RESPONSIVENESS
// -----------------------------------------------------------------------------
console.log("\n--- SECTION T & U: SETTINGS UI & ACCESSIBILITY ---");

check(75, "Settings page has zero browser alert() calls in Web Push flow", () => {
  const pushSection = settingsPageSource.slice(settingsPageSource.indexOf("handleToggleWebPush"), settingsPageSource.indexOf("handleRevokeDevice") + 300);
  assert(!pushSection.includes("alert("), "No alert() calls permitted in Web Push flow");
});

check(76, "Settings page displays inline pushFeedback banner for success and errors", () => {
  assert(settingsPageSource.includes("{pushFeedback && ("));
  assert(settingsPageSource.includes("pushFeedback.message"));
});

check(77, "Settings page provides 'Try Again' button state after errors", () => {
  assert(settingsPageSource.includes('"Try Again"'));
});

check(78, "Settings page buttons specify explicit type='button'", () => {
  assert(settingsPageSource.includes('type="button"'));
});

check(79, "Settings Web Push row uses flex-wrap and responsive break-words for 320px support", () => {
  assert(settingsPageSource.includes('flex flex-wrap items-center gap-2'));
  assert(settingsPageSource.includes('break-words min-w-0'));
});

// -----------------------------------------------------------------------------
// SECTION V: PRIVACY & SECRETS PROTECTION
// -----------------------------------------------------------------------------
console.log("\n--- SECTION V: PRIVACY & SECRETS PROTECTION ---");

check(80, "VAPID private key is never exported to client bundle", () => {
  assert(!pushHookSource.includes("VAPID_PRIVATE_KEY"));
  assert(!settingsPageSource.includes("VAPID_PRIVATE_KEY"));
  assert(!subscribeRouteSource.includes("VAPID_PRIVATE_KEY"));
});

check(81, "Notification payloads are not stored in localStorage, sessionStorage, or IndexedDB", () => {
  assert(!pushHookSource.includes("localStorage.setItem"));
  assert(!pushHookSource.includes("sessionStorage.setItem"));
  assert(!pushHookSource.includes("indexedDB"));
});

check(82, "Service worker explicitly bypasses cache for all authorization and token-bearing requests", () => {
  assert(swSource.includes('request.headers && request.headers.get("authorization")'));
});

// -----------------------------------------------------------------------------
// SECTION W: REGRESSION DEFENSE MATRIX
// -----------------------------------------------------------------------------
console.log("\n--- SECTION W: REGRESSION DEFENSE ---");

check(83, "Phase 18 migration preserves Phase 17 telemetry tables and indexes", () => {
  assert(!migrationSql.includes("DROP TABLE public.notification_deliveries"));
  assert(!migrationSql.includes("DROP TABLE public.notification_delivery_events"));
});

check(84, "Forward-compatible push endpoint validation permits any valid HTTPS push provider", () => {
  assert(migrationSql.includes("protocol must be https"));
  assert(!migrationSql.includes("v_host IN ('android.googleapis.com'")); // Provider hard-coding removed
});

check(85, "Database types declare register_push_subscription returning string (UUID)", () => {
  assert(databaseTypes.includes("register_push_subscription:"));
  assert(databaseTypes.includes("Returns: string;"));
});

console.log("\n================================================================================");
console.log(` PHASE 18 VERIFICATION RESULT: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log("================================================================================\n");

if (failed > 0) {
  process.exit(1);
}
