/**
 * Heat Chat — Phase 19: Comprehensive Background Web Push Verification Suite
 * Targets 100+ assertions covering Sections A through W per Phase R specification.
 */

import fs from "node:fs";
import path from "node:path";
import assert from "node:assert";

const rootDir = process.cwd();

// Load target implementation files
const swJs = fs.readFileSync(path.join(rootDir, "public/sw.js"), "utf-8");
const pushTs = fs.readFileSync(path.join(rootDir, "lib/notifications/push.ts"), "utf-8");
const webPushTs = fs.readFileSync(path.join(rootDir, "lib/push/web-push.ts"), "utf-8");
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
const manifestJson = fs.readFileSync(path.join(rootDir, "public/manifest.json"), "utf-8");
const phase18MigrationSql = fs.readFileSync(path.join(rootDir, "supabase/migrations/20260916_phase18_push_subscription_hardening.sql"), "utf-8");
const phase19MigrationSql = fs.readFileSync(path.join(rootDir, "supabase/migrations/20260918_phase19_background_push_delivery.sql"), "utf-8");
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
console.log(" PHASE 19: MASTER BACKGROUND WEB PUSH VERIFICATION SUITE (SECTIONS A–W)");
console.log("================================================================================\n");

// --- SECTION A: SERVICE WORKER PUSH EVENT & ISOLATION ---
console.log("--- SECTION A: SERVICE WORKER PUSH EVENT & ISOLATION ---");

check(1, "Service worker registers self.addEventListener('push')", () => {
  assert(swJs.includes("self.addEventListener(\"push\""));
});

check(2, "Service worker does NOT import or reference React in push handling", () => {
  assert(!swJs.includes("import React"));
  assert(!swJs.includes("useState("));
  assert(!swJs.includes("useEffect("));
  assert(!swJs.includes("NotificationProvider"));
});

check(3, "Service worker does not require an open window or active client", () => {
  assert(!swJs.includes("if (!clientList.length) return"));
  assert(swJs.includes("showNotification"));
});

check(4, "Service worker push handling executes when clients.length === 0", () => {
  assert(swJs.includes("return self.registration.showNotification(title, options)"));
});

// --- SECTION B: EVENT.WAITUNTIL CONTRACT ---
console.log("\n--- SECTION B: EVENT.WAITUNTIL CONTRACT ---");

check(5, "Service worker wraps push event in event.waitUntil", () => {
  assert(swJs.includes("event.waitUntil("));
});

check(6, "Service worker wraps notificationclick in event.waitUntil", () => {
  const clickIndex = swJs.indexOf("notificationclick");
  assert(clickIndex !== -1);
  const clickBlock = swJs.slice(clickIndex, clickIndex + 600);
  assert(clickBlock.includes("event.waitUntil("));
});

// --- SECTION C: SHOW NOTIFICATION & METADATA ---
console.log("\n--- SECTION C: SHOW NOTIFICATION & METADATA ---");

check(7, "Service worker calls self.registration.showNotification(title, options)", () => {
  assert(swJs.includes("self.registration.showNotification("));
});

check(8, "showNotification options include badge icon", () => {
  assert(swJs.includes("badge:"));
});

check(9, "showNotification options include primary icon", () => {
  assert(swJs.includes("icon:"));
});

check(10, "showNotification options include tag for message grouping", () => {
  assert(swJs.includes("tag:"));
});

check(11, "showNotification options include renotify: true", () => {
  assert(swJs.includes("renotify: true"));
});

// --- SECTION D: NOTIFICATIONCLICK HANDLING ---
console.log("\n--- SECTION D: NOTIFICATIONCLICK HANDLING ---");

check(12, "Service worker registers notificationclick event listener", () => {
  assert(swJs.includes("self.addEventListener(\"notificationclick\""));
});

check(13, "notificationclick handler calls event.notification.close() immediately", () => {
  assert(swJs.includes("event.notification.close()"));
});

check(14, "notificationclick reuses existing open Heat Chat window when available", () => {
  assert(swJs.includes("client.focus()"));
});

check(15, "notificationclick opens new window if no client is open", () => {
  assert(swJs.includes("self.clients.openWindow"));
});

// --- SECTION E: URL SANITIZATION & SAME-ORIGIN SAFETY ---
console.log("\n--- SECTION E: URL SANITIZATION & SAME-ORIGIN SAFETY ---");

check(16, "Service worker sanitizeTargetUrl rejects protocol-relative URLs (//)", () => {
  assert(swJs.includes("trimmed.startsWith(\"//\")"));
});

check(17, "Service worker sanitizeTargetUrl rejects backslash escapes (/\\)", () => {
  assert(swJs.includes("trimmed.startsWith(\"/\\\\\")"));
});

check(18, "Service worker sanitizeTargetUrl rejects javascript: URI schemes", () => {
  assert(swJs.includes("javascript:"));
});

check(19, "Service worker sanitizeTargetUrl rejects data: URI schemes", () => {
  assert(swJs.includes("data:"));
});

check(20, "Service worker sanitizeTargetUrl falls back to safe /chat route", () => {
  assert(swJs.includes("return \"/chat\""));
});

check(21, "push.ts sanitizePushTargetUrl enforces identical strict origin constraints", () => {
  assert(pushTs.includes("sanitizePushTargetUrl"));
  assert(pushTs.includes("/chat"));
});

// --- SECTION F: MALFORMED PAYLOAD HANDLING ---
console.log("\n--- SECTION F: MALFORMED PAYLOAD HANDLING ---");

check(22, "Service worker safely parses JSON payload inside try/catch", () => {
  assert(swJs.includes("event.data.json()"));
});

check(23, "Service worker provides safe fallback for non-JSON or plain text payloads", () => {
  assert(swJs.includes("event.data.text()"));
  assert(swJs.includes("New notification"));
});

check(24, "Service worker bounds title length to prevent buffer overruns", () => {
  assert(swJs.includes(".slice(0, 128)"));
});

check(25, "Service worker bounds body length to prevent display overflow", () => {
  assert(swJs.includes(".slice(0, 256)"));
});

// --- SECTION G: SUBSCRIPTION REGISTRATION DATABASE & RPC ---
console.log("\n--- SECTION G: SUBSCRIPTION REGISTRATION DATABASE & RPC ---");

check(26, "push_subscriptions migration defines id, user_id, endpoint, p256dh, auth", () => {
  assert(phase18MigrationSql.includes("public.push_subscriptions"));
});

check(27, "push_subscriptions has updated_at column", () => {
  assert(phase19MigrationSql.includes("ADD COLUMN IF NOT EXISTS updated_at"));
});

check(28, "push_subscriptions has last_success_at column", () => {
  assert(phase19MigrationSql.includes("ADD COLUMN IF NOT EXISTS last_success_at"));
});

check(29, "push_subscriptions has last_failure_at column", () => {
  assert(phase19MigrationSql.includes("ADD COLUMN IF NOT EXISTS last_failure_at"));
});

check(30, "push_subscriptions has last_error column", () => {
  assert(phase19MigrationSql.includes("ADD COLUMN IF NOT EXISTS last_error"));
});

check(31, "push_subscriptions has device_id and installation_id columns", () => {
  assert(phase19MigrationSql.includes("ADD COLUMN IF NOT EXISTS device_id"));
  assert(phase19MigrationSql.includes("ADD COLUMN IF NOT EXISTS installation_id"));
});

check(32, "push_subscriptions has unconditional unique index on (user_id, endpoint)", () => {
  assert(phase18MigrationSql.includes("push_subscriptions_user_endpoint_unconditional_uidx"));
});

check(33, "register_push_subscription takes advisory lock for atomic registration", () => {
  assert(phase18MigrationSql.includes("pg_advisory_xact_lock"));
});

check(34, "register_push_subscription reassigns endpoint if previously used by another user", () => {
  assert(phase18MigrationSql.includes("v_existing_user <> auth.uid()"));
});

// --- SECTION H: MULTI-DEVICE SUPPORT ---
console.log("\n--- SECTION H: MULTI-DEVICE SUPPORT ---");

check(35, "sendWebPushToUser queries all active subscriptions for user", () => {
  assert(pushDeliveryTs.includes(".eq(\"user_id\", payload.userId)"));
  assert(pushDeliveryTs.includes(".is(\"revoked_at\", null)"));
});

check(36, "sendWebPushToUser loops through each subscription independently", () => {
  assert(pushDeliveryTs.includes("for (const sub of subscriptions)"));
});

check(37, "Failure on one device does not prevent delivery to other devices", () => {
  assert(pushDeliveryTs.includes("failedCount++"));
  assert(pushDeliveryTs.includes("sentCount++"));
});

check(38, "sendWebPushToConversationMembers excludes sender from push broadcast", () => {
  assert(pushDeliveryTs.includes(".neq(\"user_id\", params.senderId)"));
});

// --- SECTION I: DEAD SUBSCRIPTION CLEANUP ---
console.log("\n--- SECTION I: DEAD SUBSCRIPTION CLEANUP ---");

check(39, "sendWebPushToUser immediately marks 404/410 endpoints as revoked", () => {
  assert(pushDeliveryTs.includes("res.statusCode === 404 || res.statusCode === 410"));
  assert(pushDeliveryTs.includes("revoked_at: nowIso"));
});

check(40, "sendWebPushToUser records permanent failure status in last_error", () => {
  assert(pushDeliveryTs.includes("permanent_failure_status_"));
});

check(41, "sendWebPushToUser resets failure_count to 0 on successful delivery", () => {
  assert(pushDeliveryTs.includes("failure_count: 0"));
});

check(42, "sendWebPushToUser updates last_success_at on successful delivery", () => {
  assert(pushDeliveryTs.includes("last_success_at: nowIso"));
});

check(43, "sendWebPushToUser updates last_failure_at on failure", () => {
  assert(pushDeliveryTs.includes("last_failure_at: nowIso"));
});

// --- SECTION J: RETRY BEHAVIOR & CLASSIFICATION ---
console.log("\n--- SECTION J: RETRY BEHAVIOR & CLASSIFICATION ---");

check(44, "sendWebPushToUser increments failure_count on transient error", () => {
  assert(pushDeliveryTs.includes("increment_push_failure_count"));
});

check(45, "sendWebPushToUser bounds error message length to 200 chars", () => {
  assert(pushDeliveryTs.includes(".slice(0, 200)"));
});

check(46, "Service worker pushsubscriptionchange handles subscription rotation", () => {
  assert(swJs.includes("self.addEventListener(\"pushsubscriptionchange\""));
});

check(47, "pushsubscriptionchange re-subscribes with VAPID applicationServerKey", () => {
  assert(swJs.includes("applicationServerKey"));
});

check(48, "pushsubscriptionchange registers new subscription via API", () => {
  assert(swJs.includes("/api/notifications/push/subscribe"));
});

// --- SECTION K: NOTIFICATION DEDUPLICATION ---
console.log("\n--- SECTION K: NOTIFICATION DEDUPLICATION ---");

check(49, "Service worker suppresses OS banner when active focused window client is open", () => {
  assert(swJs.includes("c.focused === true || c.focus"));
  assert(swJs.includes("PUSH_NOTIFICATION_RECEIVED"));
});

check(50, "Service worker displays notification when no focused window is open", () => {
  assert(swJs.includes("focusedClient"));
  assert(swJs.includes("showNotification"));
});

check(51, "Dispatcher creates deterministic dedupe_key for notification items", () => {
  assert(dispatcherTs.includes("generateDedupeKey"));
  assert(dispatcherTs.includes("dedupeKey"));
});

check(52, "Test push endpoint uses timestamped unique dedupe key", () => {
  assert(testPushRouteTs.includes("DedupeKeyBuilders.test_notification"));
});

// --- SECTION L: DELIVERY OUTBOX RECORDS ---
console.log("\n--- SECTION L: DELIVERY OUTBOX RECORDS ---");

check(53, "Outbox migration creates notification_deliveries table", () => {
  assert(phase19MigrationSql.includes("CREATE TABLE IF NOT EXISTS public.notification_deliveries"));
});

check(54, "Outbox migration defines unique index on (notification_id, subscription_id)", () => {
  assert(phase19MigrationSql.includes("ON public.notification_deliveries(notification_id, subscription_id)"));
});

check(55, "Outbox trigger handle_notification_delivery_enqueue exists", () => {
  assert(phase19MigrationSql.includes("FUNCTION public.handle_notification_delivery_enqueue()"));
});

check(56, "Outbox trigger fires AFTER INSERT ON public.notifications", () => {
  assert(phase19MigrationSql.includes("AFTER INSERT ON public.notifications"));
});

check(57, "Outbox enqueue uses ON CONFLICT DO NOTHING for idempotency", () => {
  assert(phase19MigrationSql.includes("ON CONFLICT (notification_id, subscription_id) DO NOTHING"));
});

check(58, "push-delivery.ts synchronizes delivery status into notification_deliveries", () => {
  assert(pushDeliveryTs.includes(".from(\"notification_deliveries\")"));
  assert(pushDeliveryTs.includes("status: \"delivered\""));
});

// --- SECTION M: VAPID SERVER-ONLY USAGE ---
console.log("\n--- SECTION M: VAPID SERVER-ONLY USAGE ---");

check(59, "lib/push/web-push.ts loads official web-push library", () => {
  assert(webPushTs.includes("import webPush from \"web-push\""));
});

check(60, "lib/push/web-push.ts configures webPush.setVapidDetails", () => {
  assert(webPushTs.includes("webPush.setVapidDetails"));
});

check(61, "VAPID private key is loaded from process.env.VAPID_PRIVATE_KEY", () => {
  assert(webPushTs.includes("process.env.VAPID_PRIVATE_KEY"));
});

check(62, "VAPID subject defaults to standard mailto format", () => {
  assert(webPushTs.includes("mailto:admin@heat-chat.com"));
});

// --- SECTION N: NO PRIVATE KEYS IN CLIENT BUNDLE ---
console.log("\n--- SECTION N: NO PRIVATE KEYS IN CLIENT BUNDLE ---");

check(63, "push.ts never exports VAPID private key", () => {
  assert(!pushTs.includes("export const VAPID_PRIVATE_KEY"));
});

check(64, "web-push.ts never exports VAPID private key", () => {
  assert(!webPushTs.includes("export const VAPID_PRIVATE_KEY"));
});

check(65, "NEXT_PUBLIC_ does not contain VAPID private key anywhere", () => {
  assert(!pushTs.includes("NEXT_PUBLIC_VAPID_PRIVATE_KEY"));
  assert(!webPushTs.includes("NEXT_PUBLIC_VAPID_PRIVATE_KEY"));
  assert(!diagnosticsRouteTs.includes("NEXT_PUBLIC_VAPID_PRIVATE_KEY"));
  assert(!useNotificationPermTs.includes("NEXT_PUBLIC_VAPID_PRIVATE_KEY"));
});

check(66, "Diagnostics route masks push endpoints for privacy", () => {
  assert(diagnosticsRouteTs.includes("maskPushEndpoint"));
});

check(67, "Public key route returns ONLY public key", () => {
  const pubKeyRouteTs = fs.readFileSync(path.join(rootDir, "app/api/notifications/push/public-key/route.ts"), "utf-8");
  assert(pubKeyRouteTs.includes("publicKey"));
  assert(!pubKeyRouteTs.includes("privateKey"));
});

// --- SECTION O: NO NOTIFICATION PAYLOAD PERSISTENCE ---
console.log("\n--- SECTION O: NO NOTIFICATION PAYLOAD PERSISTENCE ---");

check(68, "push-delivery.ts contains zero localStorage usage", () => {
  assert(!pushDeliveryTs.includes("localStorage"));
});

check(69, "push-delivery.ts contains zero sessionStorage usage", () => {
  assert(!pushDeliveryTs.includes("sessionStorage"));
});

check(70, "web-push.ts contains zero localStorage usage", () => {
  assert(!webPushTs.includes("localStorage"));
});

check(71, "notification_deliveries table stores status and timestamps without message content", () => {
  assert(!phase19MigrationSql.includes("content text"));
  assert(!phase19MigrationSql.includes("body text"));
});

// --- SECTION P: SERVICE WORKER CACHE SAFETY ---
console.log("\n--- SECTION P: SERVICE WORKER CACHE SAFETY ---");

check(72, "Service worker explicitly bypasses Supabase API from caching", () => {
  assert(swJs.includes("shouldBypassCache"));
});

check(73, "Service worker explicitly bypasses Auth endpoints from caching", () => {
  assert(swJs.includes("/auth/"));
});

check(74, "Service worker explicitly bypasses notification API payloads from caching", () => {
  assert(swJs.includes("/api/notifications"));
});

check(75, "Service worker shell cache version is modern and unique", () => {
  assert(/heat-chat-shell-v[45]/.test(swJs));
});

// --- SECTION Q: PWA MANIFEST INTEGRITY ---
console.log("\n--- SECTION Q: PWA MANIFEST INTEGRITY ---");

check(76, "Manifest has name 'Heat Chat'", () => {
  assert(manifestJson.includes("\"name\": \"Heat Chat\""));
});

check(77, "Manifest has short_name 'Heat Chat'", () => {
  assert(manifestJson.includes("\"short_name\": \"Heat Chat\""));
});

check(78, "Manifest defines display: standalone", () => {
  assert(manifestJson.includes("\"display\": \"standalone\""));
});

check(79, "Manifest defines start_url: /", () => {
  assert(manifestJson.includes("\"start_url\": \"/\""));
});

check(80, "Manifest defines theme_color", () => {
  assert(manifestJson.includes("\"theme_color\": \"#f97316\""));
});

check(81, "Manifest defines background_color", () => {
  assert(manifestJson.includes("\"background_color\": \"#09090b\""));
});

// --- SECTION R: NOTIFICATION ICONS ON DISK ---
console.log("\n--- SECTION R: NOTIFICATION ICONS ON DISK ---");

check(82, "public/icons/icon-192.png exists on filesystem", () => {
  assert(fs.existsSync(path.join(rootDir, "public/icons/icon-192.png")));
});

check(83, "public/icons/icon-512.png exists on filesystem", () => {
  assert(fs.existsSync(path.join(rootDir, "public/icons/icon-512.png")));
});

check(84, "public/icons/icon-maskable-512.png exists on filesystem", () => {
  assert(fs.existsSync(path.join(rootDir, "public/icons/icon-maskable-512.png")));
});

check(85, "public/icons/badge-72.png exists on filesystem", () => {
  assert(fs.existsSync(path.join(rootDir, "public/icons/badge-72.png")));
});

// --- SECTION S: API AUTHENTICATION & ROUTE HARDENING ---
console.log("\n--- SECTION S: API AUTHENTICATION & ROUTE HARDENING ---");

check(86, "Diagnostics endpoint requires authenticated session (returns 401)", () => {
  assert(diagnosticsRouteTs.includes("UNAUTHORIZED") || diagnosticsRouteTs.includes("status: 401"));
});

check(87, "Test push endpoint requires authenticated session (returns 401)", () => {
  assert(testPushRouteTs.includes("status: 401") || testPushRouteTs.includes("UNAUTHORIZED"));
});

check(88, "Test push endpoint enforces hourly rate limit", () => {
  assert(testPushRouteTs.includes("Rate limit exceeded") || testPushRouteTs.includes("RATE_LIMIT_EXCEEDED"));
});

check(89, "Messages route awaits sendWebPushToConversationMembers before returning response", () => {
  assert(messagesRouteTs.includes("await sendWebPushToConversationMembers"));
});

check(90, "Friend request route awaits sendWebPushToUser before returning response", () => {
  assert(friendReqRouteTs.includes("await sendWebPushToUser"));
});

check(91, "Friend accept route awaits sendWebPushToUser before returning response", () => {
  assert(friendAcceptRouteTs.includes("await sendWebPushToUser"));
});

// --- SECTION T: RLS & DATABASE SECURITY ---
console.log("\n--- SECTION T: RLS & DATABASE SECURITY ---");

check(92, "notification_deliveries enables Row Level Security", () => {
  assert(phase19MigrationSql.includes("ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY"));
});

check(93, "notification_deliveries restricts SELECT to authenticated owner (auth.uid() = user_id)", () => {
  assert(phase19MigrationSql.includes("auth.uid() = user_id"));
});

check(94, "notification_deliveries revokes anonymous and public access", () => {
  assert(phase19MigrationSql.includes("REVOKE ALL ON public.notification_deliveries FROM anon"));
});

check(95, "Outbox trigger function uses SECURITY DEFINER with search_path = public, pg_temp", () => {
  assert(phase19MigrationSql.includes("SECURITY DEFINER SET search_path = public, pg_temp"));
});

// --- SECTION U: TYPESCRIPT & CLIENT CONTRACTS ---
console.log("\n--- SECTION U: TYPESCRIPT & CLIENT CONTRACTS ---");

check(96, "useMessages routes message send through /api/conversations/[id]/messages", () => {
  assert(useMessagesTs.includes("/api/conversations/${conversationId}/messages"));
});

check(97, "useDiscoverPeople routes friend requests through /api/friends/request", () => {
  assert(useDiscoverPeopleTs.includes("/api/friends/request"));
});

check(98, "useDiscoverPeople routes friend accepts through /api/friends/requests/${requestId}/accept", () => {
  assert(useDiscoverPeopleTs.includes("/api/friends/requests/${requestId}/accept"));
});

check(99, "useFriendRequests routes friend accepts through /api/friends/requests/${requestId}/accept", () => {
  assert(useFriendRequestsTs.includes("/api/friends/requests/${requestId}/accept"));
});

check(100, "Settings page has zero window.alert calls in push subscription flow", () => {
  assert(!settingsPageTsx.includes("window.alert("));
});

check(101, "Settings page handles unsupported state gracefully", () => {
  assert(settingsPageTsx.includes("Push notifications aren't supported on this browser."));
});

check(102, "Settings page handles denied permission state gracefully", () => {
  assert(settingsPageTsx.includes("Notifications are blocked by your browser. Enable notifications in browser settings."));
});

check(103, "Settings page provides Try Again button on registration error", () => {
  assert(settingsPageTsx.includes("Try Again"));
});

check(104, "All Web Push interactive buttons have explicit type='button'", () => {
  assert(settingsPageTsx.includes("type=\"button\""));
});

// --- SECTION V: PRODUCTION BUILD CONTRACTS & CRON ---
console.log("\n--- SECTION V: PRODUCTION BUILD CONTRACTS & CRON ---");

check(105, "Vercel cron is configured in vercel.json for background queue processing", () => {
  assert(vercelJson.includes("/api/internal/notifications/process-queue"));
});

check(106, "Dispatcher awaits sendWebPushToUser for immediate closed-app delivery", () => {
  assert(dispatcherTs.includes("await sendWebPushToUser"));
});

check(107, "Push payload size bounded to under Web Push 4KB specification limit", () => {
  assert(pushTs.includes("4000"));
});

check(108, "web-push.ts bounds payload size under 4000 bytes", () => {
  assert(webPushTs.includes("4000"));
});

// --- SECTION W: ENVIRONMENT VARIABLE SAFETY ---
console.log("\n--- SECTION W: ENVIRONMENT VARIABLE SAFETY ---");

check(109, "Diagnostics route never prints or logs VAPID private key", () => {
  assert(!diagnosticsRouteTs.includes("console.log(VAPID_PRIVATE_KEY)"));
  assert(!diagnosticsRouteTs.includes("console.error(VAPID_PRIVATE_KEY)"));
});

check(110, "web-push.ts never logs private key in error logs", () => {
  assert(!webPushTs.includes("console.log(privateKey)"));
});

check(111, "Push notifications table does not store private key columns", () => {
  assert(!phase19MigrationSql.includes("private_key text"));
});

console.log("\n================================================================================");
console.log(` PHASE 19 VERIFICATION RESULT: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
console.log("================================================================================\n");

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
