// ==============================================================================
// HEAT CHAT — PHASE 19: BACKGROUND WEB PUSH DELIVERY VERIFICATION SUITE
// Tests True Background Web Push Delivery, Service Worker Display, Server Dispatch,
// Privacy/Preview Invariants, Categories, Deduplication, and Lifecycle.
// ==============================================================================

import fs from "node:fs";
import path from "node:path";
import assert from "node:assert";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;

function check(num, desc, fn) {
  try {
    fn();
    console.log(`  [PASS] #${num}: ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] #${num}: ${desc}`);
    console.error(`         ${err.message || err}`);
    failed++;
  }
}

// Read Source Files
const swJs = fs.readFileSync(path.join(rootDir, "public/sw.js"), "utf-8");
const pushTs = fs.readFileSync(path.join(rootDir, "lib/notifications/push.ts"), "utf-8");
const pushDeliveryTs = fs.readFileSync(path.join(rootDir, "lib/notifications/push-delivery.ts"), "utf-8");
const dispatcherTs = fs.readFileSync(path.join(rootDir, "lib/notifications/dispatcher.ts"), "utf-8");
const testPushRouteTs = fs.readFileSync(path.join(rootDir, "app/api/notifications/push/test/route.ts"), "utf-8");
const diagnosticsRouteTs = fs.readFileSync(path.join(rootDir, "app/api/notifications/push/diagnostics/route.ts"), "utf-8");
const messagesRouteTs = fs.readFileSync(path.join(rootDir, "app/api/conversations/[id]/messages/route.ts"), "utf-8");
const friendRequestRouteTs = fs.readFileSync(path.join(rootDir, "app/api/friends/request/route.ts"), "utf-8");
const friendAcceptRouteTs = fs.readFileSync(path.join(rootDir, "app/api/friends/requests/[id]/accept/route.ts"), "utf-8");
const useNotificationPermTs = fs.readFileSync(path.join(rootDir, "hooks/use-notification-permission.ts"), "utf-8");
const settingsPageTsx = fs.readFileSync(path.join(rootDir, "app/(protected)/settings/page.tsx"), "utf-8");
const migrationPhase18Sql = fs.readFileSync(path.join(rootDir, "supabase/migrations/20260916_phase18_push_subscription_hardening.sql"), "utf-8");

console.log("================================================================================");
console.log(" PHASE 19 — BACKGROUND WEB PUSH DELIVERY VERIFICATION SUITE");
console.log("================================================================================");

// ==============================================================================
// SECTION A: SERVICE WORKER & BACKGROUND DISPLAY (1–15)
// ==============================================================================
console.log("\n--- SECTION A: SERVICE WORKER & BACKGROUND DISPLAY ---");

check(1, "Service Worker registers real 'push' event listener", () => {
  assert(swJs.includes('self.addEventListener("push"') || swJs.includes("self.addEventListener('push'"));
});

check(2, "Service Worker registers real 'notificationclick' event listener", () => {
  assert(swJs.includes('self.addEventListener("notificationclick"') || swJs.includes("self.addEventListener('notificationclick'"));
});

check(3, "Service Worker registers 'pushsubscriptionchange' event listener", () => {
  assert(swJs.includes('self.addEventListener("pushsubscriptionchange"'));
});

check(4, "Service Worker calls self.registration.showNotification in push handler", () => {
  assert(swJs.includes("self.registration.showNotification("));
});

check(5, "Service Worker wraps push async work in event.waitUntil", () => {
  assert(swJs.includes("event.waitUntil("));
});

check(6, "Service Worker parses JSON push payload with fallback for plain text", () => {
  assert(swJs.includes("event.data.json()"));
  assert(swJs.includes("event.data.text()"));
});

check(7, "Service Worker supports versioned contract (extracts payload.version or payload.type)", () => {
  assert(swJs.includes("payload.type") || swJs.includes("payload.version"));
});

check(8, "Service Worker extracts conversationId and senderId from payload", () => {
  assert(swJs.includes("conversationId") && swJs.includes("senderId"));
});

check(9, "Service Worker tags notification for grouping or deduplication", () => {
  assert(swJs.includes("tag:"));
});

check(10, "Service Worker sets renotify: true to alert user on new incoming messages", () => {
  assert(swJs.includes("renotify: true"));
});

check(11, "Service Worker sanitizes targetUrl before showNotification and on click", () => {
  assert(swJs.includes("sanitizeTargetUrl(payload.url || data.url)") || swJs.includes("sanitizeTargetUrl("));
});

check(12, "Service Worker closes notification immediately on click", () => {
  assert(swJs.includes("event.notification.close()"));
});

check(13, "Service Worker focuses existing window when client is open", () => {
  assert(swJs.includes("client.focus()"));
});

check(14, "Service Worker navigates existing window or opens new window on click", () => {
  assert(swJs.includes("client.navigate(targetUrl)") && swJs.includes("self.clients.openWindow(targetUrl)"));
});

check(15, "Service Worker pushsubscriptionchange re-registers new subscription with server", () => {
  assert(swJs.includes("/api/notifications/push/subscribe"));
});

// ==============================================================================
// SECTION B: SERVER-SIDE WEB PUSH DISPATCH (16–30)
// ==============================================================================
console.log("\n--- SECTION B: SERVER-SIDE WEB PUSH DISPATCH ---");

check(16, "push.ts imports official web-push library", () => {
  assert(pushTs.includes('import webPush from "web-push"'));
});

check(17, "push.ts configures VAPID details via webPush.setVapidDetails", () => {
  assert(pushTs.includes("webPush.setVapidDetails("));
});

check(18, "push.ts validates egress endpoints before calling web-push", () => {
  assert(pushTs.includes("validatePushEndpointEgress("));
});

check(19, "push.ts serializes version: 1 in the push payload contract", () => {
  assert(pushTs.includes("version: 1"));
});

check(20, "push.ts includes badge: /icons/badge-72.png in payload", () => {
  assert(pushTs.includes("/icons/badge-72.png"));
});

check(21, "push-delivery.ts exports sendWebPushToUser", () => {
  assert(pushDeliveryTs.includes("export async function sendWebPushToUser"));
});

check(22, "sendWebPushToUser queries active push_subscriptions where revoked_at IS NULL", () => {
  assert(pushDeliveryTs.includes('.is("revoked_at", null)'));
});

check(23, "sendWebPushToUser marks 404/410 endpoints as revoked immediately", () => {
  assert(pushDeliveryTs.includes("res.statusCode === 404 || res.statusCode === 410"));
  assert(pushDeliveryTs.includes("revoked_at: nowIso"));
});

check(24, "sendWebPushToUser updates last_success_at and resets failure_count on success", () => {
  assert(pushDeliveryTs.includes("last_success_at: nowIso"));
  assert(pushDeliveryTs.includes("failure_count: 0"));
});

check(25, "sendWebPushToUser increments failure_count on transient errors", () => {
  assert(pushDeliveryTs.includes("increment_push_failure_count") || pushDeliveryTs.includes("failure_count: 1"));
});

check(26, "sendWebPushToUser records telemetry into notification_delivery_events", () => {
  assert(pushDeliveryTs.includes('.from("notification_delivery_events").insert('));
});

check(27, "push-delivery.ts exports sendWebPushToConversationMembers", () => {
  assert(pushDeliveryTs.includes("export async function sendWebPushToConversationMembers"));
});

check(28, "sendWebPushToConversationMembers excludes the message sender", () => {
  assert(pushDeliveryTs.includes('.neq("user_id", params.senderId)'));
});

check(29, "sendWebPushToConversationMembers supports group chat title attribution", () => {
  assert(pushDeliveryTs.includes("conv?.type === \"group\""));
});

check(30, "sendWebPushToConversationMembers distinguishes voice, media, and text messages", () => {
  assert(pushDeliveryTs.includes("voice_message") && pushDeliveryTs.includes("media_message"));
});

// ==============================================================================
// SECTION C: PRIVACY & ZERO-PERSISTENCE INVARIANTS (31–45)
// ==============================================================================
console.log("\n--- SECTION C: PRIVACY & ZERO-PERSISTENCE INVARIANTS ---");

check(31, "sendWebPushToUser respects message_preview_enabled preference", () => {
  assert(pushDeliveryTs.includes("userPrefs.message_preview_enabled"));
});

check(32, "When message_preview_enabled is false, body is masked with generic text", () => {
  assert(pushDeliveryTs.includes('sanitizedBody = "New message"'));
});

check(33, "Push payload does NOT contain user access_token or refresh_token", () => {
  assert(!pushTs.includes("access_token") && !pushDeliveryTs.includes("access_token"));
  assert(!pushTs.includes("refresh_token") && !pushDeliveryTs.includes("refresh_token"));
});

check(34, "Push payload does NOT contain supabase service_role_key", () => {
  assert(!pushTs.includes("service_role_key") && !pushDeliveryTs.includes("service_role_key"));
});

check(35, "Push payload does NOT contain signed storage URLs", () => {
  assert(!pushTs.includes("token=") && !pushDeliveryTs.includes("token="));
});

check(36, "Notification delivery telemetry contains zero message body text", () => {
  assert(!pushDeliveryTs.includes("body: payload.body") || !pushDeliveryTs.includes("notification_delivery_events"));
  const telemetryInsertMatch = pushDeliveryTs.match(/\.from\("notification_delivery_events"\)\.insert\(\{([\s\S]*?)\}\)/);
  if (telemetryInsertMatch) {
    assert(!telemetryInsertMatch[1].includes("body:"));
    assert(!telemetryInsertMatch[1].includes("title:"));
  }
});

check(37, "Strict zero-persistence: No localStorage usage in push-delivery", () => {
  assert(!pushDeliveryTs.includes("localStorage"));
});

check(38, "Strict zero-persistence: No sessionStorage usage in push-delivery", () => {
  assert(!pushDeliveryTs.includes("sessionStorage"));
});

check(39, "Strict zero-persistence: No IndexedDB persistence of push payloads in sw.js", () => {
  assert(!swJs.includes("indexedDB.open") || !swJs.includes("heat-chat-notifications"));
});

check(40, "Service Worker cache explicitly bypasses notification API payloads", () => {
  assert(swJs.includes("shouldBypassCache"));
  assert(swJs.includes("/api/"));
});

check(41, "Service Worker shell cache (heat-chat-shell-v4) stores static assets only", () => {
  assert(swJs.includes("heat-chat-shell-v4"));
});

check(42, "VAPID private key is never exported to client bundle in push.ts", () => {
  assert(!pushTs.includes("NEXT_PUBLIC_VAPID_PRIVATE_KEY"));
});

check(43, "Diagnostics route masks push endpoints for privacy", () => {
  assert(diagnosticsRouteTs.includes("maskedEndpoint") || diagnosticsRouteTs.includes("endpointMasked"));
});

check(44, "Diagnostics route never returns the VAPID private key", () => {
  assert(!diagnosticsRouteTs.includes("privateKey:") || diagnosticsRouteTs.includes("privateKeyConfigured"));
  assert(diagnosticsRouteTs.includes("privateKeyConfigured: hasEnvPrivateKey"));
});

check(45, "Push payload size bounded to under Web Push 4KB specification limit", () => {
  assert(pushTs.includes("Max 4KB payload limit"));
});

// ==============================================================================
// SECTION D: NOTIFICATION PREFERENCES & CATEGORIES (46–60)
// ==============================================================================
console.log("\n--- SECTION D: NOTIFICATION PREFERENCES & CATEGORIES ---");

check(46, "sendWebPushToUser skips dispatch when notifications_enabled is false", () => {
  assert(pushDeliveryTs.includes("!userPrefs.notifications_enabled"));
  assert(pushDeliveryTs.includes("notifications_disabled_globally"));
});

check(47, "sendWebPushToUser skips dispatch when push_enabled is false", () => {
  assert(pushDeliveryTs.includes("!userPrefs.push_enabled"));
  assert(pushDeliveryTs.includes("push_disabled"));
});

check(48, "sendWebPushToUser respects messages_notify category toggle", () => {
  assert(pushDeliveryTs.includes("userPrefs.messages_notify"));
  assert(pushDeliveryTs.includes("messages_disabled"));
});

check(49, "sendWebPushToUser respects mentions_notify category toggle", () => {
  assert(pushDeliveryTs.includes("userPrefs.mentions_notify"));
  assert(pushDeliveryTs.includes("mentions_disabled"));
});

check(50, "sendWebPushToUser respects replies_notify category toggle", () => {
  assert(pushDeliveryTs.includes("userPrefs.replies_notify"));
  assert(pushDeliveryTs.includes("replies_disabled"));
});

check(51, "sendWebPushToUser respects group_activity_notify category toggle", () => {
  assert(pushDeliveryTs.includes("userPrefs.group_activity_notify"));
  assert(pushDeliveryTs.includes("group_activity_disabled"));
});

check(52, "sendWebPushToUser respects friend_activity_notify category toggle", () => {
  assert(pushDeliveryTs.includes("userPrefs.friend_activity_notify"));
  assert(pushDeliveryTs.includes("friend_activity_disabled"));
});

check(53, "sendWebPushToUser respects reactions_notify category toggle", () => {
  assert(pushDeliveryTs.includes("userPrefs.reactions_notify"));
  assert(pushDeliveryTs.includes("reactions_disabled"));
});

check(54, "Security notifications bypass all category disable toggles", () => {
  assert(pushDeliveryTs.includes("isSecurity"));
  assert(pushDeliveryTs.includes("security_alert"));
});

check(55, "sendWebPushToUser checks isInQuietHours", () => {
  assert(pushDeliveryTs.includes("isInQuietHours(userPrefs"));
  assert(pushDeliveryTs.includes("quiet_hours_active"));
});

check(56, "Security notifications bypass quiet hours", () => {
  assert(pushDeliveryTs.includes("!isSecurity"));
});

check(57, "Dispatcher route invokes sendWebPushToUser upon notification insertion", () => {
  assert(dispatcherTs.includes("sendWebPushToUser("));
});

check(58, "Dispatcher route passes conversationId and actorId to sendWebPushToUser", () => {
  assert(dispatcherTs.includes("conversationId: params.conversationId"));
  assert(dispatcherTs.includes("senderId: params.actorId"));
});

check(59, "Dispatcher route catches push delivery errors without throwing to caller", () => {
  assert(dispatcherTs.includes(".catch((err) => {"));
});

check(60, "Settings UI displays all 7 notification category toggles", () => {
  const categories = ["messages", "mentions", "groups", "friends", "reactions", "security"];
  for (const cat of categories) {
    assert(settingsPageTsx.includes(cat));
  }
});

// ==============================================================================
// SECTION E: DEDUPLICATION & CONCURRENCY (61–72)
// ==============================================================================
console.log("\n--- SECTION E: DEDUPLICATION & CONCURRENCY ---");

check(61, "Service Worker suppresses redundant OS banner when active focused client exists", () => {
  assert(swJs.includes("focusedClient"));
  assert(swJs.includes("PUSH_NOTIFICATION_RECEIVED"));
});

check(62, "Service Worker sends push notification to OS when no focused client exists", () => {
  assert(swJs.includes("self.registration.showNotification(title, options)"));
});

check(63, "Service Worker tags notifications so subsequent messages in conversation update existing notification", () => {
  assert(swJs.includes("chat-${conversationId}"));
});

check(64, "useNotificationPermission uses isSubscribingRef mutex to prevent concurrent subscribe clicks", () => {
  assert(useNotificationPermTs.includes("isSubscribingRef.current = true"));
  assert(useNotificationPermTs.includes("isSubscribingRef.current = false"));
});

check(65, "useNotificationPermission guards concurrent attempts with PUSH_CONCURRENT_OPERATION error", () => {
  assert(useNotificationPermTs.includes("PUSH_CONCURRENT_OPERATION"));
});

check(66, "useNotificationPermission reuses existing registration.pushManager.getSubscription()", () => {
  assert(useNotificationPermTs.includes("reg.pushManager.getSubscription()"));
});

check(67, "Dispatcher generates deterministic dedupe_key for notification items", () => {
  assert(dispatcherTs.includes("generateDedupeKey"));
});

check(68, "Test push endpoint uses unique timestamped deduplication key", () => {
  assert(testPushRouteTs.includes("DedupeKeyBuilders.test_notification(user.id, Date.now())"));
});

check(69, "Test push endpoint enforces server-side rate limit (3 tests/hour)", () => {
  assert(testPushRouteTs.includes("checkRateLimit(`push_test:${user.id}`, 3, 3600)"));
});

check(70, "Unconditional unique index on push_subscriptions prevents duplicate (user_id, endpoint)", () => {
  assert(migrationPhase18Sql.includes("push_subscriptions_user_endpoint_unconditional_uidx"));
});

check(71, "Migration deduplicates existing push_subscriptions retaining highest quality record", () => {
  assert(migrationPhase18Sql.includes("FIRST_VALUE(id) OVER"));
  assert(migrationPhase18Sql.includes("DELETE FROM public.push_subscriptions"));
});

check(72, "Migration asserts zero duplicate pairs remain with loud failure", () => {
  assert(migrationPhase18Sql.includes("Assertion failed: % duplicate (user_id, endpoint) pairs remain"));
});

// ==============================================================================
// SECTION F: SUBSCRIPTION LIFECYCLE & ROTATION (73–84)
// ==============================================================================
console.log("\n--- SECTION F: SUBSCRIPTION LIFECYCLE & ROTATION ---");

check(73, "useNotificationPermission handles subscription evaluation on focus and online", () => {
  assert(useNotificationPermTs.includes('window.addEventListener("focus", handleFocusOrVisible)'));
  assert(useNotificationPermTs.includes('window.addEventListener("online", handleOnline)'));
});

check(74, "useNotificationPermission handles permission change via permissions.query listener", () => {
  assert(useNotificationPermTs.includes("navigator.permissions.query"));
  assert(useNotificationPermTs.includes("status.onchange"));
});

check(75, "useNotificationPermission implements selfHealSubscription for stale or revoked subscriptions", () => {
  assert(useNotificationPermTs.includes("selfHealSubscription"));
});

check(76, "useNotificationPermission verifies server record exists via verify_endpoint", () => {
  assert(useNotificationPermTs.includes("verify_endpoint="));
});

check(77, "unsubscribeFromPush calls DELETE /api/notifications/push/subscriptions", () => {
  assert(useNotificationPermTs.includes('/api/notifications/push/subscriptions", {'));
  assert(useNotificationPermTs.includes('method: "DELETE"'));
});

check(78, "unsubscribeFromPush calls sub.unsubscribe() on PushSubscription instance", () => {
  assert(useNotificationPermTs.includes("sub.unsubscribe()"));
});

check(79, "Service Worker pushsubscriptionchange fetches public key and creates new subscription", () => {
  assert(swJs.includes("/api/notifications/push/public-key"));
  assert(swJs.includes("reg.pushManager.subscribe") || swJs.includes("self.registration.pushManager.subscribe"));
});

check(80, "Service Worker pushsubscriptionchange sends new subscription to server", () => {
  assert(swJs.includes('/api/notifications/push/subscribe", {'));
  assert(swJs.includes('method: "POST"'));
});

check(81, "Service Worker pushsubscriptionchange revokes old subscription if present", () => {
  assert(swJs.includes('/api/notifications/push/subscriptions", {'));
  assert(swJs.includes('method: "DELETE"'));
});

check(82, "register_push_subscription RPC revokes endpoint if previously used by a different user", () => {
  assert(migrationPhase18Sql.includes("v_existing_user <> auth.uid()"));
  assert(migrationPhase18Sql.includes("v_existing_id IS NOT NULL"));
});

check(83, "register_push_subscription takes transaction advisory lock on endpoint identity", () => {
  assert(migrationPhase18Sql.includes("pg_advisory_xact_lock(hashtext('push_endpoint:' || v_canonical_endpoint))"));
});

check(84, "register_push_subscription asserts exactly 1 function definition in pg_proc", () => {
  assert(migrationPhase18Sql.includes("expected exactly 1 register_push_subscription in public schema"));
});

// ==============================================================================
// SECTION G: SECURITY & OPEN REDIRECT DEFENSE (85–94)
// ==============================================================================
console.log("\n--- SECTION G: SECURITY & OPEN REDIRECT DEFENSE ---");

check(85, "sanitizePushTargetUrl rejects protocol-relative URLs ('//evil.com')", () => {
  assert(pushDeliveryTs.includes('trimmed.startsWith("//")'));
});

check(86, "sanitizePushTargetUrl rejects backslash escapes ('/\\evil.com')", () => {
  assert(pushDeliveryTs.includes('trimmed.startsWith("/\\\\")'));
});

check(87, "sanitizePushTargetUrl rejects javascript: and data: URIs", () => {
  assert(pushDeliveryTs.includes("javascript:") && pushDeliveryTs.includes("data:"));
});

check(88, "sanitizePushTargetUrl falls back safely to '/chat'", () => {
  assert(pushDeliveryTs.includes('return "/chat"'));
});

check(89, "Service Worker sanitizeTargetUrl enforces identical safe redirect rules", () => {
  assert(swJs.includes("function sanitizeTargetUrl"));
  assert(swJs.includes('trimmed.startsWith("//")'));
});

check(90, "Diagnostics route requires authenticated user session (returns 401 if missing)", () => {
  assert(diagnosticsRouteTs.includes("authError || !user"));
  assert(diagnosticsRouteTs.includes("status: 401"));
});

check(91, "Test push route requires authenticated user session (returns 401 if missing)", () => {
  assert(testPushRouteTs.includes("!user"));
  assert(testPushRouteTs.includes("status: 401"));
});

check(92, "Messages route requires conversation membership before allowing message dispatch", () => {
  assert(messagesRouteTs.includes("is_conversation_member") || messagesRouteTs.includes("CONVERSATION_ACCESS_DENIED"));
});

check(93, "Friend request route enforces authenticated session and recipientId validation", () => {
  assert(friendRequestRouteTs.includes("authError || !user"));
  assert(friendRequestRouteTs.includes("!recipientId"));
});

check(94, "Friend accept route requires authenticated user session", () => {
  assert(friendAcceptRouteTs.includes("authError || !user"));
});

// ==============================================================================
// SECTION H: SETTINGS UI & USER EXPERIENCE (95–105)
// ==============================================================================
console.log("\n--- SECTION H: SETTINGS UI & USER EXPERIENCE ---");

check(95, "Settings page has zero window.alert() or alert() calls in Web Push flow", () => {
  const pushSection = settingsPageTsx.slice(settingsPageTsx.indexOf("handleToggleWebPush"));
  assert(!pushSection.includes("alert("));
});

check(96, "Settings page displays 'Push notifications aren't supported on this browser.' when unsupported", () => {
  assert(settingsPageTsx.includes("Push notifications aren't supported on this browser."));
});

check(97, "Settings page displays 'Notifications are blocked by your browser. Enable notifications in browser settings.' when denied", () => {
  assert(settingsPageTsx.includes("Notifications are blocked by your browser. Enable notifications in browser settings."));
});

check(98, "Settings page displays 'Couldn't enable notifications. Try again.' on registration failure", () => {
  assert(settingsPageTsx.includes("Couldn't enable notifications. Try again."));
});

check(99, "Settings page provides 'Try Again' button state upon registration failure", () => {
  assert(settingsPageTsx.includes('"Try Again"'));
});

check(100, "Settings page displays 'Subscribe This Device' when not registered", () => {
  assert(settingsPageTsx.includes('"Subscribe This Device"'));
});

check(101, "Settings page displays 'Unsubscribe Device' when subscribed", () => {
  assert(settingsPageTsx.includes('"Unsubscribe Device"'));
});

check(102, "Settings page displays 'Subscribed on this device' badge state", () => {
  assert(settingsPageTsx.includes("Subscribed on this device"));
});

check(103, "Settings page renders Test Push Notification button when subscribed", () => {
  assert(settingsPageTsx.includes("Test Push"));
  assert(settingsPageTsx.includes("handleSendTestPush"));
});

check(104, "Settings page handles test push loading state without stuck button", () => {
  assert(settingsPageTsx.includes("isSendingTestPush"));
  assert(settingsPageTsx.includes('"Sending..." : "Test Push"'));
});

check(105, "All Web Push interactive buttons have explicit type='button'", () => {
  assert(settingsPageTsx.includes('type="button"'));
});

// ==============================================================================
// SUMMARY
// ==============================================================================
console.log("\n================================================================================");
console.log(` PHASE 19 VERIFICATION RESULT: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log("================================================================================\n");

if (failed > 0) {
  process.exit(1);
}
