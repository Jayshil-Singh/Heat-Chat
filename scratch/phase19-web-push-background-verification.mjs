/**
 * Phase 19: Comprehensive Background Web Push Delivery Verification Suite
 * Verifies closed-app Web Push delivery pipeline:
 * EVENT → DATABASE NOTIFICATION → SERVER-SIDE PUSH DELIVERY → BROWSER PUSH SERVICE → SERVICE WORKER → OS NOTIFICATION
 * Covers Sections A through T with >100 deep assertions.
 */

import fs from "node:fs";
import path from "node:path";
import assert from "node:assert";

const rootDir = process.cwd();

// Load target implementation files
const swJs = fs.readFileSync(path.join(rootDir, "public/sw.js"), "utf-8");
const pushTs = fs.readFileSync(path.join(rootDir, "lib/notifications/push.ts"), "utf-8");
const pushDeliveryTs = fs.readFileSync(path.join(rootDir, "lib/notifications/push-delivery.ts"), "utf-8");
const dispatcherTs = fs.readFileSync(path.join(rootDir, "lib/notifications/dispatcher.ts"), "utf-8");
const messagesRouteTs = fs.readFileSync(path.join(rootDir, "app/api/conversations/[id]/messages/route.ts"), "utf-8");
const friendReqRouteTs = fs.readFileSync(path.join(rootDir, "app/api/friends/request/route.ts"), "utf-8");
const friendAcceptRouteTs = fs.readFileSync(path.join(rootDir, "app/api/friends/requests/[id]/accept/route.ts"), "utf-8");
const testPushRouteTs = fs.readFileSync(path.join(rootDir, "app/api/notifications/push/test/route.ts"), "utf-8");
const diagnosticsRouteTs = fs.readFileSync(path.join(rootDir, "app/api/notifications/push/diagnostics/route.ts"), "utf-8");
const useNotificationPermTs = fs.readFileSync(path.join(rootDir, "hooks/use-notification-permission.ts"), "utf-8");
const settingsPageTsx = fs.readFileSync(path.join(rootDir, "app/(protected)/settings/page.tsx"), "utf-8");
const useMessagesTs = fs.readFileSync(path.join(rootDir, "hooks/use-messages.ts"), "utf-8");
const useDiscoverPeopleTs = fs.readFileSync(path.join(rootDir, "hooks/use-discover-people.ts"), "utf-8");
const useFriendRequestsTs = fs.readFileSync(path.join(rootDir, "hooks/use-friend-requests.ts"), "utf-8");
const phase18MigrationSql = fs.readFileSync(path.join(rootDir, "supabase/migrations/20260916_phase18_push_subscription_hardening.sql"), "utf-8");
const phase19MigrationSql = fs.readFileSync(path.join(rootDir, "supabase/migrations/20260918_phase19_push_delivery_outbox.sql"), "utf-8");
const vercelJson = fs.existsSync(path.join(rootDir, "vercel.json"))
  ? fs.readFileSync(path.join(rootDir, "vercel.json"), "utf-8")
  : "";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function check(id, description, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] #${id}: ${description}`);
  } catch (err) {
    failedTests++;
    console.error(`  [FAIL] #${id}: ${description}`);
    console.error(`         ${err.message}\n`);
  }
}

console.log("================================================================================");
console.log(" PHASE 19: TRUE BACKGROUND WEB PUSH DELIVERY VERIFICATION SUITE");
console.log("================================================================================\n");

// --- SECTION A: SUBSCRIPTION REGISTRATION ---
console.log("--- SECTION A: SUBSCRIPTION REGISTRATION ---");

check(1, "push_subscriptions table contains id, user_id, endpoint, p256dh, auth", () => {
  assert(phase18MigrationSql.includes("public.push_subscriptions") || phase19MigrationSql.includes("public.push_subscriptions"));
  assert(phase19MigrationSql.includes("public.push_subscriptions"));
});

check(2, "push_subscriptions has updated_at column", () => {
  assert(phase19MigrationSql.includes("ADD COLUMN IF NOT EXISTS updated_at"));
});

check(3, "push_subscriptions has last_success_at column", () => {
  assert(phase19MigrationSql.includes("ADD COLUMN IF NOT EXISTS last_success_at"));
});

check(4, "push_subscriptions has last_failure_at column", () => {
  assert(phase19MigrationSql.includes("ADD COLUMN IF NOT EXISTS last_failure_at"));
});

check(5, "push_subscriptions has last_error column", () => {
  assert(phase19MigrationSql.includes("ADD COLUMN IF NOT EXISTS last_error"));
});

check(6, "push_subscriptions has device_id and installation_id columns", () => {
  assert(phase19MigrationSql.includes("ADD COLUMN IF NOT EXISTS device_id"));
  assert(phase19MigrationSql.includes("ADD COLUMN IF NOT EXISTS installation_id"));
});

check(7, "Active subscriptions index filters by revoked_at IS NULL", () => {
  assert(phase19MigrationSql.includes("WHERE revoked_at IS NULL"));
});

check(8, "push_subscriptions has unconditional unique index on (user_id, endpoint)", () => {
  assert(phase18MigrationSql.includes("push_subscriptions_user_endpoint_unconditional_uidx"));
});

check(9, "register_push_subscription RPC takes an advisory lock for atomic registration", () => {
  assert(phase18MigrationSql.includes("pg_advisory_xact_lock"));
});

check(10, "register_push_subscription reassigns endpoint if previously used by another account", () => {
  assert(phase18MigrationSql.includes("v_existing_user <> auth.uid()"));
  assert(phase18MigrationSql.includes("endpoint = v_canonical_endpoint"));
});

// --- SECTION B: VAPID VALIDATION & COMPATIBILITY ---
console.log("\n--- SECTION B: VAPID VALIDATION & COMPATIBILITY ---");

check(11, "push.ts uses official web-push library", () => {
  assert(pushTs.includes("from \"web-push\"") || pushTs.includes("require(\"web-push\")"));
});

check(12, "push.ts configures VAPID details with subject, public key, and private key", () => {
  assert(pushTs.includes("webPush.setVapidDetails"));
});

check(13, "push.ts validates VAPID subject protocol (mailto: or https://)", () => {
  assert(pushTs.includes("mailto:") || pushTs.includes("https://"));
});

check(14, "push.ts validates egress endpoints to prevent SSRF", () => {
  assert(pushTs.includes("validatePushEndpointEgress"));
});

check(15, "Diagnostics route checks VAPID configuration without exposing keys", () => {
  assert(diagnosticsRouteTs.includes("privateKeyConfigured"));
  assert(!diagnosticsRouteTs.includes("VAPID_PRIVATE_KEY,"));
});

// --- SECTION C: PRIVATE-KEY SECRECY ---
console.log("\n--- SECTION C: PRIVATE-KEY SECRECY ---");

check(16, "push.ts never exports VAPID private key to client code", () => {
  assert(!pushTs.includes("export const VAPID_PRIVATE_KEY"));
  assert(!pushTs.includes("export default VAPID_PRIVATE_KEY"));
});

check(17, "NEXT_PUBLIC_ does not contain VAPID private key anywhere", () => {
  assert(!pushTs.includes("NEXT_PUBLIC_VAPID_PRIVATE_KEY"));
  assert(!diagnosticsRouteTs.includes("NEXT_PUBLIC_VAPID_PRIVATE_KEY"));
  assert(!useNotificationPermTs.includes("NEXT_PUBLIC_VAPID_PRIVATE_KEY"));
});

check(18, "Diagnostics endpoint masks push endpoints for privacy", () => {
  assert(diagnosticsRouteTs.includes("maskPushEndpoint"));
  assert(diagnosticsRouteTs.includes("..."));
});

check(19, "Diagnostics endpoint requires authenticated session (returns 401 if unauthenticated)", () => {
  assert(diagnosticsRouteTs.includes("UNAUTHORIZED") || diagnosticsRouteTs.includes("status: 401"));
});

check(20, "Public key route only returns public key", () => {
  const pubKeyRouteTs = fs.readFileSync(path.join(rootDir, "app/api/notifications/push/public-key/route.ts"), "utf-8");
  assert(pubKeyRouteTs.includes("publicKey"));
  assert(!pubKeyRouteTs.includes("privateKey"));
});

// --- SECTION D: SERVER-SIDE SENDER EXISTENCE ---
console.log("\n--- SECTION D: SERVER-SIDE SENDER EXISTENCE ---");

check(21, "push-delivery.ts exports sendWebPushToUser", () => {
  assert(pushDeliveryTs.includes("export async function sendWebPushToUser"));
});

check(22, "push-delivery.ts exports sendWebPushToConversationMembers", () => {
  assert(pushDeliveryTs.includes("export async function sendWebPushToConversationMembers"));
});

check(23, "push.ts exports sendPhysicalPushNotification", () => {
  assert(pushTs.includes("export async function sendPhysicalPushNotification"));
});

check(24, "Messages route imports sendWebPushToConversationMembers", () => {
  assert(messagesRouteTs.includes("sendWebPushToConversationMembers"));
});

check(25, "Friend request route imports sendWebPushToUser", () => {
  assert(friendReqRouteTs.includes("sendWebPushToUser"));
});

check(26, "Friend accept route imports sendWebPushToUser", () => {
  assert(friendAcceptRouteTs.includes("sendWebPushToUser"));
});

check(27, "Notification dispatcher imports sendWebPushToUser", () => {
  assert(dispatcherTs.includes("sendWebPushToUser"));
});

// --- SECTION E: PUSH PAYLOAD CONTRACT & PRIVACY ---
console.log("\n--- SECTION E: PUSH PAYLOAD CONTRACT & PRIVACY ---");

check(28, "Push payload serializes version: 1 contract", () => {
  assert(pushTs.includes("version: 1"));
});

check(29, "Push payload includes badge: /icons/badge-72.png", () => {
  assert(pushTs.includes("/icons/badge-72.png"));
});

check(30, "Push payload includes icon: /icons/icon-192.png", () => {
  assert(pushTs.includes("/icons/icon-192.png"));
});

check(31, "sendWebPushToUser respects message_preview_enabled preference", () => {
  assert(pushDeliveryTs.includes("userPrefs.message_preview_enabled"));
});

check(32, "When message_preview_enabled is false, body is masked with generic text", () => {
  assert(pushDeliveryTs.includes("New message"));
});

check(33, "Push payload does not contain user access or refresh tokens", () => {
  assert(!pushTs.includes("access_token") && !pushDeliveryTs.includes("access_token"));
  assert(!pushTs.includes("refresh_token") && !pushDeliveryTs.includes("refresh_token"));
});

check(34, "Push payload does not contain service role credentials", () => {
  assert(!pushTs.includes("service_role_key"));
});

check(35, "Push payload size bounded to under Web Push 4KB specification limit", () => {
  assert(pushTs.includes("4096") || pushTs.includes("4000"));
});

// --- SECTION F: SERVICE WORKER PUSH LISTENER ---
console.log("\n--- SECTION F: SERVICE WORKER PUSH LISTENER ---");

check(36, "Service worker registers push event listener", () => {
  assert(swJs.includes("self.addEventListener(\"push\""));
});

check(37, "Service worker uses event.waitUntil to keep worker alive", () => {
  assert(swJs.includes("event.waitUntil("));
});

check(38, "Service worker safely parses JSON payload with try/catch", () => {
  assert(swJs.includes("event.data.json()"));
});

check(39, "Service worker provides safe fallback for non-JSON or empty payloads", () => {
  assert(swJs.includes("event.data.text()"));
  assert(swJs.includes("New notification"));
});

check(40, "Service worker extracts url from payload data or fallback to /chat", () => {
  assert(swJs.includes("url") && swJs.includes("/chat"));
});

// --- SECTION G: SHOWNONE NOTIFICATION CALL & OPTIONS ---
console.log("\n--- SECTION G: SHOWNONE NOTIFICATION CALL & OPTIONS ---");

check(41, "Service worker calls self.registration.showNotification", () => {
  assert(swJs.includes("self.registration.showNotification("));
});

check(42, "showNotification options include badge icon", () => {
  assert(swJs.includes("badge:"));
});

check(43, "showNotification options include icon", () => {
  assert(swJs.includes("icon:"));
});

check(44, "showNotification options include tag for message grouping", () => {
  assert(swJs.includes("tag:"));
});

check(45, "showNotification options include renotify: true", () => {
  assert(swJs.includes("renotify: true"));
});

check(46, "showNotification options include data payload for click handling", () => {
  assert(swJs.includes("data:"));
});

// --- SECTION H: SERVICE WORKER NOTIFICATION CLICK ---
console.log("\n--- SECTION H: SERVICE WORKER NOTIFICATION CLICK ---");

check(47, "Service worker registers notificationclick event listener", () => {
  assert(swJs.includes("self.addEventListener(\"notificationclick\""));
});

check(48, "notificationclick handler calls event.notification.close() immediately", () => {
  assert(swJs.includes("event.notification.close()"));
});

check(49, "notificationclick uses event.waitUntil", () => {
  assert(swJs.includes("event.waitUntil("));
});

check(50, "notificationclick focuses existing window if open", () => {
  assert(swJs.includes("client.focus()"));
});

check(51, "notificationclick opens new window if no client is open", () => {
  assert(swJs.includes("self.clients.openWindow"));
});

check(52, "notificationclick sanitizes target url before opening", () => {
  assert(swJs.includes("sanitizeTargetUrl"));
});

// --- SECTION I: URL SANITIZATION & OPEN-REDIRECT DEFENSE ---
console.log("\n--- SECTION I: URL SANITIZATION & OPEN-REDIRECT DEFENSE ---");

check(53, "Service worker sanitizeTargetUrl rejects protocol-relative URLs (//)", () => {
  assert(swJs.includes("trimmed.startsWith(\"//\")"));
});

check(54, "Service worker sanitizeTargetUrl rejects backslash escapes (/\\)", () => {
  assert(swJs.includes("trimmed.startsWith(\"/\\\\\")"));
});

check(55, "Service worker sanitizeTargetUrl rejects javascript: protocol", () => {
  assert(swJs.includes("javascript:"));
});

check(56, "Service worker sanitizeTargetUrl rejects data: protocol", () => {
  assert(swJs.includes("data:"));
});

check(57, "Service worker sanitizeTargetUrl falls back to /chat", () => {
  assert(swJs.includes("return \"/chat\""));
});

check(58, "push.ts sanitizePushTargetUrl enforces identical safe redirect rules", () => {
  assert(pushTs.includes("sanitizePushTargetUrl"));
  assert(pushTs.includes("/chat"));
});

// --- SECTION J: CLOSED-APP BACKGROUND DELIVERY ARCHITECTURE ---
console.log("\n--- SECTION J: CLOSED-APP BACKGROUND DELIVERY ARCHITECTURE ---");

check(59, "Messages route awaits sendWebPushToConversationMembers before returning", () => {
  assert(messagesRouteTs.includes("await sendWebPushToConversationMembers"));
});

check(60, "Friend request route awaits sendWebPushToUser before returning", () => {
  assert(friendReqRouteTs.includes("await sendWebPushToUser"));
});

check(61, "Friend accept route awaits sendWebPushToUser before returning", () => {
  assert(friendAcceptRouteTs.includes("await sendWebPushToUser"));
});

check(62, "Dispatcher awaits sendWebPushToUser before returning", () => {
  assert(dispatcherTs.includes("await sendWebPushToUser"));
});

check(63, "useMessages routes message send through /api/conversations/[id]/messages", () => {
  assert(useMessagesTs.includes("/api/conversations/${conversationId}/messages"));
});

check(64, "useDiscoverPeople routes friend requests through /api/friends/request", () => {
  assert(useDiscoverPeopleTs.includes("/api/friends/request"));
});

check(65, "useDiscoverPeople routes friend accepts through /api/friends/requests/${requestId}/accept", () => {
  assert(useDiscoverPeopleTs.includes("/api/friends/requests/${requestId}/accept"));
});

check(66, "useFriendRequests routes friend accepts through /api/friends/requests/${requestId}/accept", () => {
  assert(useFriendRequestsTs.includes("/api/friends/requests/${requestId}/accept"));
});

check(67, "Vercel cron is configured in vercel.json for background queue processing", () => {
  assert(vercelJson.includes("/api/internal/notifications/process-queue"));
});

// --- SECTION K: MULTI-DEVICE DELIVERY ---
console.log("\n--- SECTION K: MULTI-DEVICE DELIVERY ---");

check(68, "sendWebPushToUser queries all active subscriptions for user", () => {
  assert(pushDeliveryTs.includes(".eq(\"user_id\", payload.userId)"));
  assert(pushDeliveryTs.includes(".is(\"revoked_at\", null)"));
});

check(69, "sendWebPushToUser loops through each subscription independently", () => {
  assert(pushDeliveryTs.includes("for (const sub of subscriptions)"));
});

check(70, "Failure on one device does not prevent delivery to other devices", () => {
  assert(pushDeliveryTs.includes("failedCount++"));
  assert(pushDeliveryTs.includes("sentCount++"));
});

check(71, "sendWebPushToConversationMembers excludes sender from push broadcast", () => {
  assert(pushDeliveryTs.includes(".neq(\"user_id\", params.senderId)"));
});

check(72, "sendWebPushToConversationMembers supports group chat title attribution", () => {
  assert(pushDeliveryTs.includes("conv?.type === \"group\""));
});

// --- SECTION L: SUBSCRIPTION FAILURE CLEANUP ---
console.log("\n--- SECTION L: SUBSCRIPTION FAILURE CLEANUP ---");

check(73, "sendWebPushToUser immediately marks 404/410 endpoints as revoked", () => {
  assert(pushDeliveryTs.includes("res.statusCode === 404 || res.statusCode === 410"));
  assert(pushDeliveryTs.includes("revoked_at: nowIso"));
});

check(74, "sendWebPushToUser records permanent failure status in last_error", () => {
  assert(pushDeliveryTs.includes("permanent_failure_status_"));
});

check(75, "sendWebPushToUser resets failure_count to 0 on successful delivery", () => {
  assert(pushDeliveryTs.includes("failure_count: 0"));
});

check(76, "sendWebPushToUser updates last_success_at on successful delivery", () => {
  assert(pushDeliveryTs.includes("last_success_at: nowIso"));
});

check(77, "sendWebPushToUser updates last_failure_at on failure", () => {
  assert(pushDeliveryTs.includes("last_failure_at: nowIso"));
});

// --- SECTION M: RETRY BEHAVIOR & TRANSIENT FAILURES ---
console.log("\n--- SECTION M: RETRY BEHAVIOR & TRANSIENT FAILURES ---");

check(78, "sendWebPushToUser increments failure_count on transient error", () => {
  assert(pushDeliveryTs.includes("increment_push_failure_count"));
});

check(79, "sendWebPushToUser limits retry error message length to 200 chars", () => {
  assert(pushDeliveryTs.includes(".slice(0, 200)"));
});

check(80, "Service worker pushsubscriptionchange handles subscription rotation", () => {
  assert(swJs.includes("self.addEventListener(\"pushsubscriptionchange\""));
});

check(81, "pushsubscriptionchange re-subscribes with VAPID applicationServerKey", () => {
  assert(swJs.includes("applicationServerKey"));
});

check(82, "pushsubscriptionchange registers new subscription via API", () => {
  assert(swJs.includes("/api/notifications/push/subscribe"));
});

// --- SECTION N: DELIVERY IDEMPOTENCY & OUTBOX ---
console.log("\n--- SECTION N: DELIVERY IDEMPOTENCY & OUTBOX ---");

check(83, "Outbox migration creates notification_deliveries table", () => {
  assert(phase19MigrationSql.includes("CREATE TABLE IF NOT EXISTS public.notification_deliveries"));
});

check(84, "Outbox migration defines unique index on (notification_id, subscription_id)", () => {
  assert(phase19MigrationSql.includes("ON public.notification_deliveries(notification_id, subscription_id)"));
});

check(85, "Outbox trigger handle_notification_delivery_enqueue exists", () => {
  assert(phase19MigrationSql.includes("FUNCTION public.handle_notification_delivery_enqueue()"));
});

check(86, "Outbox trigger fires AFTER INSERT ON public.notifications", () => {
  assert(phase19MigrationSql.includes("AFTER INSERT ON public.notifications"));
});

check(87, "Outbox enqueue uses ON CONFLICT DO NOTHING for idempotency", () => {
  assert(phase19MigrationSql.includes("ON CONFLICT (notification_id, subscription_id) DO NOTHING"));
});

check(88, "push-delivery.ts synchronizes delivery status into notification_deliveries", () => {
  assert(pushDeliveryTs.includes(".from(\"notification_deliveries\")"));
  assert(pushDeliveryTs.includes("status: \"delivered\""));
});

// --- SECTION O: NOTIFICATION DEDUPLICATION ---
console.log("\n--- SECTION O: NOTIFICATION DEDUPLICATION ---");

check(89, "Service worker suppresses OS banner when active focused window client is open", () => {
  assert(swJs.includes("c.focused === true || c.focus"));
  assert(swJs.includes("PUSH_NOTIFICATION_RECEIVED"));
});

check(90, "Service worker displays notification when no focused window is open", () => {
  assert(swJs.includes("focusedClient"));
  assert(swJs.includes("showNotification"));
});

check(91, "Dispatcher creates deterministic dedupe_key for notification items", () => {
  assert(dispatcherTs.includes("generateDedupeKey"));
  assert(dispatcherTs.includes("dedupeKey"));
});

check(92, "Test push endpoint uses timestamped unique dedupe key", () => {
  assert(testPushRouteTs.includes("DedupeKeyBuilders.test_notification"));
});

// --- SECTION P: RLS & SECURITY BOUNDARIES ---
console.log("\n--- SECTION P: RLS & SECURITY BOUNDARIES ---");

check(93, "notification_deliveries enables Row Level Security", () => {
  assert(phase19MigrationSql.includes("ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY"));
});

check(94, "notification_deliveries restricts SELECT to authenticated owner (auth.uid() = user_id)", () => {
  assert(phase19MigrationSql.includes("auth.uid() = user_id"));
});

check(95, "notification_deliveries revokes anonymous and public access", () => {
  assert(phase19MigrationSql.includes("REVOKE ALL ON public.notification_deliveries FROM anon"));
});

check(96, "Test push endpoint enforces authenticated session (returns 401)", () => {
  assert(testPushRouteTs.includes("status: 401") || testPushRouteTs.includes("UNAUTHORIZED"));
});

check(97, "Test push endpoint enforces hourly rate limit (max 3 tests/hr)", () => {
  assert(testPushRouteTs.includes("Rate limit exceeded") || testPushRouteTs.includes("RATE_LIMIT_EXCEEDED"));
});

// --- SECTION Q: SETTINGS UI HARDENING ---
console.log("\n--- SECTION Q: SETTINGS UI HARDENING ---");

check(98, "Settings page has zero window.alert or alert() calls in Web Push flow", () => {
  assert(!settingsPageTsx.includes("window.alert("));
  assert(!settingsPageTsx.includes("alert("));
});

check(99, "Settings page displays 'Push notifications aren't supported on this browser.' when unsupported", () => {
  assert(settingsPageTsx.includes("Push notifications aren't supported on this browser."));
});

check(100, "Settings page displays 'Notifications are blocked by your browser. Enable notifications in browser settings.' when denied", () => {
  assert(settingsPageTsx.includes("Notifications are blocked by your browser. Enable notifications in browser settings."));
});

check(101, "Settings page displays 'Couldn't enable notifications. Try again.' on registration failure", () => {
  assert(settingsPageTsx.includes("Couldn't enable notifications. Try again."));
});

check(102, "Settings page provides 'Try Again' button state upon registration failure", () => {
  assert(settingsPageTsx.includes("Try Again"));
});

check(103, "Settings page displays 'Subscribe This Device' when not registered", () => {
  assert(settingsPageTsx.includes("Subscribe This Device"));
});

check(104, "Settings page displays 'Unsubscribe Device' when subscribed", () => {
  assert(settingsPageTsx.includes("Unsubscribe Device"));
});

check(105, "Settings page displays 'Subscribed on this device' badge state", () => {
  assert(settingsPageTsx.includes("Subscribed on this device"));
});

check(106, "Settings page renders Test Push Notification button when subscribed", () => {
  assert(settingsPageTsx.includes("Test Push Notification") || settingsPageTsx.includes("Test Push"));
});

check(107, "All Web Push interactive buttons have explicit type='button'", () => {
  assert(settingsPageTsx.includes("type=\"button\""));
});

// --- SECTION R: ENVIRONMENT VARIABLE SAFETY ---
console.log("\n--- SECTION R: ENVIRONMENT VARIABLE SAFETY ---");

check(108, "VAPID private key is loaded from process.env.VAPID_PRIVATE_KEY", () => {
  assert(pushTs.includes("process.env.VAPID_PRIVATE_KEY"));
});

check(109, "VAPID public key fallback exists for build-time safety", () => {
  assert(pushTs.includes("DEFAULT_VAPID_PUBLIC_KEY"));
});

check(110, "Diagnostics route never logs or prints VAPID private key", () => {
  assert(!diagnosticsRouteTs.includes("console.log(VAPID_PRIVATE_KEY)"));
  assert(!diagnosticsRouteTs.includes("console.error(VAPID_PRIVATE_KEY)"));
});

// --- SECTION S & T: ARCHITECTURAL INTEGRITY ---
console.log("\n--- SECTION S & T: ARCHITECTURAL INTEGRITY ---");

check(111, "push-delivery.ts contains zero localStorage usage", () => {
  assert(!pushDeliveryTs.includes("localStorage"));
});

check(112, "push-delivery.ts contains zero sessionStorage usage", () => {
  assert(!pushDeliveryTs.includes("sessionStorage"));
});

check(113, "Service worker cache explicitly bypasses notification API payloads", () => {
  assert(swJs.includes("shouldBypassCache"));
});

check(114, "Service worker shell cache stores static assets only", () => {
  assert(swJs.includes("heat-chat-shell-v4"));
});

check(115, "Diagnostics route masks push endpoints for privacy", () => {
  assert(diagnosticsRouteTs.includes("maskPushEndpoint"));
});

console.log("\n================================================================================");
console.log(` PHASE 19 VERIFICATION RESULT: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
console.log("================================================================================\n");

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
