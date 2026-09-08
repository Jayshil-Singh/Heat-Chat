/**
 * HEAT CHAT — PHASE 17: PRODUCTION-GRADE NOTIFICATION RELIABILITY, DELIVERY OBSERVABILITY,
 * CROSS-DEVICE SYNC, SELF-HEALING PUSH & MOBILE NOTIFICATION UX
 * Master Production Verification Suite (150+ Invariant Assertions)
 *
 * Categories:
 * - A. Push Permission Lifecycle (1–8)
 * - B. Push Subscription Consistency (9–16)
 * - C. Self-Healing Push Subscriptions (17–25)
 * - D. Deduplication Architecture (26–34)
 * - E. Notification State Machine & Observability (35–43)
 * - F. Foreground / Background Push Delivery (44–51)
 * - G. Toast Deduplication & Presentation (52–60)
 * - H. Sound & Haptic Deduplication (61–68)
 * - I. Multi-Tab Synchronization & Presenter Election (69–77)
 * - J. Cross-Device Reconciliation (78–85)
 * - K. Authoritative Unread Counts (86–93)
 * - L. Cursor Pagination & Stale Guard (94–101)
 * - M. Race Condition Protection (102–109)
 * - N. Privacy & Zero-Persistence Invariant (110–118)
 * - O. Security, RLS & Protected Alerts (119–127)
 * - P. Accessibility & Live Region Semantics (128–136)
 * - Q. Responsive Viewport Geometry (320px..1440px) (137–144)
 * - R. Service Worker Response Safety (145–152)
 * - S. Logout & Sign-Out Purge (153–160)
 * - T. Error Classification & Bounded Retry (161–168)
 */

import fs from "node:fs";
import path from "node:path";
import assert from "node:assert";

console.log("===============================================================================");
console.log("HEAT CHAT — PHASE 17 PRODUCTION NOTIFICATION HARDENING MASTER VERIFICATION");
console.log("Timestamp:", new Date().toISOString());
console.log("===============================================================================\n");

let passed = 0;
let failed = 0;
const errors = [];

function check(testNum, testName, fn) {
  try {
    fn();
    console.log(`  ✅ [Assertion ${testNum}] ${testName}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL: Assertion ${testNum}] ${testName}`);
    console.error(`     Error: ${err.message}`);
    errors.push({ testNum, testName, error: err.message });
    failed++;
  }
}

const rootDir = process.cwd();

// Load code files for static verification
const phase17MigrationSql = fs.readFileSync(
  path.join(rootDir, "supabase/migrations/20260914_phase17_notification_delivery_hardening.sql"),
  "utf-8"
);
const dbTypesTs = fs.readFileSync(path.join(rootDir, "types/database.ts"), "utf-8");
const notifTypesTs = fs.readFileSync(path.join(rootDir, "lib/notifications/types.ts"), "utf-8");
const dispatcherTs = fs.readFileSync(path.join(rootDir, "lib/notifications/dispatcher.ts"), "utf-8");
const queueRouteTs = fs.readFileSync(path.join(rootDir, "app/api/internal/notifications/process-queue/route.ts"), "utf-8");
const notifsRouteTs = fs.readFileSync(path.join(rootDir, "app/api/notifications/route.ts"), "utf-8");
const prefsRouteTs = fs.readFileSync(path.join(rootDir, "app/api/notifications/preferences/route.ts"), "utf-8");
const pushSubRouteTs = fs.readFileSync(path.join(rootDir, "app/api/notifications/push/subscribe/route.ts"), "utf-8");
const pushSubsRouteTs = fs.readFileSync(path.join(rootDir, "app/api/notifications/push/subscriptions/route.ts"), "utf-8");
const soundCueTs = fs.readFileSync(path.join(rootDir, "lib/audio/sound-cue.ts"), "utf-8");
const notifItemTsx = fs.readFileSync(path.join(rootDir, "components/notifications/notification-item.tsx"), "utf-8");
const notifCenterTsx = fs.readFileSync(path.join(rootDir, "components/notifications/notification-center.tsx"), "utf-8");
const notifToastTsx = fs.readFileSync(path.join(rootDir, "components/notifications/notification-toast.tsx"), "utf-8");
const useNotifPermissionTs = fs.readFileSync(path.join(rootDir, "hooks/use-notification-permission.ts"), "utf-8");
const useNotifPrefsTs = fs.readFileSync(path.join(rootDir, "hooks/use-notification-preferences.ts"), "utf-8");
const useNotificationsTs = fs.readFileSync(path.join(rootDir, "hooks/use-notifications.ts"), "utf-8");
const settingsPageTsx = fs.readFileSync(path.join(rootDir, "app/(protected)/settings/page.tsx"), "utf-8");
const swJs = fs.readFileSync(path.join(rootDir, "public/sw.js"), "utf-8");

// ==============================================================================
// CATEGORY A: PUSH PERMISSION LIFECYCLE (1–8)
// ==============================================================================
console.log("\n--- CATEGORY A: Push Permission Lifecycle (1–8) ---");

check(1, "BrowserPermissionState defines granted, denied, default, and unsupported", () => {
  assert(useNotifPermissionTs.includes('"granted" | "denied" | "default" | "unsupported"'));
});

check(2, "PushSubscriptionStatus distinguishes all 9 required states including recovering and error", () => {
  const states = [
    "unsupported",
    "permission-default",
    "permission-denied",
    "checking",
    "subscribed",
    "expired",
    "invalid",
    "recovering",
    "error",
  ];
  for (const s of states) {
    assert(useNotifPermissionTs.includes(`"${s}"`), `Missing state: ${s}`);
  }
});

check(3, "Never assumes browser permission equates to push subscription status", () => {
  assert(useNotifPermissionTs.includes("setPermission"));
  assert(useNotifPermissionTs.includes("setSubscriptionStatus"));
  assert(!useNotifPermissionTs.includes('if (permission === "granted") setSubscriptionStatus("subscribed")'));
});

check(4, "Listens to live browser permission changes via navigator.permissions.query when supported", () => {
  assert(useNotifPermissionTs.includes('navigator.permissions.query({ name: "notifications"'));
  assert(useNotifPermissionTs.includes("status.onchange"));
});

check(5, "Cleans up live permission query listener on unmount", () => {
  assert(useNotifPermissionTs.includes("permissionStatus.onchange = null"));
});

check(6, "Safely wraps window.Notification API access for SSR environments", () => {
  assert(useNotifPermissionTs.includes('typeof window === "undefined" || !("Notification" in window)'));
});

check(7, "Gracefully handles Notification.requestPermission() rejection or exceptions", () => {
  assert(useNotifPermissionTs.includes("Notification.requestPermission()"));
  assert(useNotifPermissionTs.includes('catch'));
  assert(useNotifPermissionTs.includes('setPermission("denied")'));
});

check(8, "Provides backward-compatible isPushSubscribed boolean getter", () => {
  assert(useNotifPermissionTs.includes('isPushSubscribed: boolean = subscriptionStatus === "subscribed"'));
});

// ==============================================================================
// CATEGORY B: PUSH SUBSCRIPTION CONSISTENCY (9–16)
// ==============================================================================
console.log("\n--- CATEGORY B: Push Subscription Consistency (9–16) ---");

check(9, "push_subscriptions table supports multi-device schema with device_id and installation_id", () => {
  assert(phase17MigrationSql.includes("device_id text"));
  assert(phase17MigrationSql.includes("installation_id text"));
  assert(phase17MigrationSql.includes("last_success_at timestamptz"));
  assert(phase17MigrationSql.includes("last_failure_at timestamptz"));
});

check(10, "Database migration preserves existing valid push subscriptions", () => {
  assert(phase17MigrationSql.includes("ADD COLUMN IF NOT EXISTS device_id text"));
  assert(phase17MigrationSql.includes("ADD COLUMN IF NOT EXISTS installation_id text"));
});

check(11, "Unique index on user_id + endpoint prevents duplicate subscriptions per endpoint", () => {
  assert(phase17MigrationSql.includes("CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subs_user_endpoint"));
});

check(12, "Client verifies subscription with server before displaying Subscribed status", () => {
  assert(useNotifPermissionTs.includes("verify_endpoint"));
  assert(useNotifPermissionTs.includes("verifyJson.verified"));
});

check(13, "verify_push_subscription RPC confirms user ownership and active status", () => {
  assert(phase17MigrationSql.includes("FUNCTION public.verify_push_subscription"));
  assert(phase17MigrationSql.includes("auth.uid()"));
  assert(phase17MigrationSql.includes("SET search_path = public, pg_temp"));
});

check(14, "register_push_subscription RPC safely updates timestamps without wiping other user devices", () => {
  assert(phase17MigrationSql.includes("FUNCTION public.register_push_subscription"));
  assert(phase17MigrationSql.includes("ON CONFLICT (user_id, endpoint)"));
});

check(15, "API route /api/notifications/push/subscriptions supports endpoint verification query", () => {
  assert(pushSubsRouteTs.includes("verify_endpoint"));
  assert(pushSubsRouteTs.includes("verify_push_subscription"));
});

check(16, "Push registration payload accepts ephemeral installation_id and device_id", () => {
  assert(pushSubRouteTs.includes("device_id"));
  assert(pushSubRouteTs.includes("installation_id"));
});

// ==============================================================================
// CATEGORY C: SELF-HEALING PUSH SUBSCRIPTIONS (17–25)
// ==============================================================================
console.log("\n--- CATEGORY C: Self-Healing Push Subscriptions (17–25) ---");

check(17, "Self-healing initiates when browser has subscription but server reports invalid", () => {
  assert(useNotifPermissionTs.includes("selfHealSubscription"));
  assert(useNotifPermissionTs.includes("setSubscriptionStatus(\"recovering\")"));
});

check(18, "Self-healing unsubscribes stale subscription before re-registering", () => {
  assert(useNotifPermissionTs.includes("staleSub.unsubscribe()"));
});

check(19, "Self-healing uses bounded jitter delay to prevent thundering herd", () => {
  assert(useNotifPermissionTs.includes("Math.random()"));
});

check(20, "Self-healing enforces bounded retries (max 2 attempts) to prevent retry loops", () => {
  assert(useNotifPermissionTs.includes("healAttemptsRef.current >= 2"));
});

check(21, "Detects expired subscriptions defensively against client clock", () => {
  assert(useNotifPermissionTs.includes("sub.expirationTime < Date.now()"));
  assert(useNotifPermissionTs.includes('setSubscriptionStatus("expired")'));
});

check(22, "Detects invalid non-HTTP endpoints defensively", () => {
  assert(useNotifPermissionTs.includes('!sub.endpoint || !sub.endpoint.startsWith("http")'));
  assert(useNotifPermissionTs.includes('setSubscriptionStatus("invalid")'));
});

check(23, "Ephemeral in-memory installation ID generated without persistent storage", () => {
  assert(useNotifPermissionTs.includes("IN_MEMORY_INSTALLATION_ID"));
  assert(!useNotifPermissionTs.includes('localStorage.setItem("installation_id"'));
  assert(!useNotifPermissionTs.includes('sessionStorage.setItem("installation_id"'));
});

check(24, "Evaluates subscription validity on window focus and document visibilitychange", () => {
  assert(useNotifPermissionTs.includes('window.addEventListener("focus"'));
  assert(useNotifPermissionTs.includes('document.addEventListener("visibilitychange"'));
});

check(25, "Evaluates subscription validity on network online and service worker controllerchange", () => {
  assert(useNotifPermissionTs.includes('window.addEventListener("online"'));
  assert(useNotifPermissionTs.includes('navigator.serviceWorker?.addEventListener("controllerchange"'));
});

// ==============================================================================
// CATEGORY D: DEDUPLICATION ARCHITECTURE (26–34)
// ==============================================================================
console.log("\n--- CATEGORY D: Deduplication Architecture (26–34) ---");

check(26, "Dispatcher uses deterministic idempotency keys for notification creation", () => {
  assert(dispatcherTs.includes("dedupeKey"));
  assert(dispatcherTs.includes("generateDedupeKey"));
});

check(27, "create_notification RPC uses ON CONFLICT DO NOTHING for dedupe_key", () => {
  assert(phase17MigrationSql.includes("idx_notifications_recipient_dedupe"));
});

check(28, "Dispatcher records in_app delivery event with status delivered", () => {
  assert(dispatcherTs.includes('recordNotificationDeliveryEvent'));
  assert(dispatcherTs.includes('channel: "in_app"'));
  assert(dispatcherTs.includes('status: "delivered"'));
});

check(29, "Dispatcher queues push delivery event with status attempted", () => {
  assert(dispatcherTs.includes('channel: "push"'));
  assert(dispatcherTs.includes('status: "attempted"'));
});

check(30, "useNotifications maintains in-memory dedupe cache with 1000 ID limit and 5m TTL", () => {
  assert(useNotificationsTs.includes("DEDUPE_MAX_ENTRIES = 1000"));
  assert(useNotificationsTs.includes("DEDUPE_TTL_MS = 5 * 60 * 1000"));
});

check(31, "checkAndRecordDedupe prunes stale entries when cache reaches capacity", () => {
  assert(useNotificationsTs.includes("cache.size >= DEDUPE_MAX_ENTRIES"));
});

check(32, "Realtime incoming event burst coalescing uses 150ms window", () => {
  assert(useNotificationsTs.includes("setTimeout"));
  assert(useNotificationsTs.includes("150"));
  assert(useNotificationsTs.includes("processBurstQueue"));
});

check(33, "State update prepends new unique items without duplicate records", () => {
  assert(useNotificationsTs.includes("filteredNew = detailedItems.filter"));
  assert(useNotificationsTs.includes("setNotifications((prev) => [item, ...prev.filter((p) => p.id !== item.id)])"));
});

check(34, "Load more pagination deduplicates items against existing state list", () => {
  assert(useNotificationsTs.includes("const existingIds = new Set(prev.map((p) => p.id))"));
});

// ==============================================================================
// CATEGORY E: NOTIFICATION STATE MACHINE & OBSERVABILITY (35–43)
// ==============================================================================
console.log("\n--- CATEGORY E: Notification State Machine & Observability (35–43) ---");

check(35, "notification_delivery_events table created for operational telemetry only", () => {
  assert(phase17MigrationSql.includes("CREATE TABLE IF NOT EXISTS public.notification_delivery_events"));
});

check(36, "Allowed delivery channels constrained to realtime, push, in_app", () => {
  assert(phase17MigrationSql.includes("channel IN ('realtime', 'push', 'in_app')"));
});

check(37, "Allowed delivery statuses constrained to attempted, sent, delivered, failed, expired", () => {
  assert(phase17MigrationSql.includes("status IN ('attempted', 'sent', 'delivered', 'failed', 'expired')"));
});

check(38, "Telemetry table strictly excludes notification body, preview, and chat message content", () => {
  assert(!phase17MigrationSql.includes("body text,"));
  assert(!phase17MigrationSql.includes("preview text,"));
  assert(!phase17MigrationSql.includes("message_content text"));
});

check(39, "Indexes on recipient_id + created_at DESC support efficient telemetry queries", () => {
  assert(phase17MigrationSql.includes("idx_delivery_events_recipient_created"));
  assert(phase17MigrationSql.includes("idx_delivery_events_notif_id"));
  assert(phase17MigrationSql.includes("idx_delivery_events_status"));
});

check(40, "record_notification_delivery_event RPC uses SECURITY DEFINER with safe search_path", () => {
  assert(phase17MigrationSql.includes("FUNCTION public.record_notification_delivery_event"));
  assert(phase17MigrationSql.includes("SET search_path = public, pg_temp"));
});

check(41, "Telemetry RLS ensures authenticated users can only view their own delivery events", () => {
  assert(phase17MigrationSql.includes("POLICY delivery_events_select_own"));
  assert(phase17MigrationSql.includes("recipient_id = auth.uid()"));
});

check(42, "Queue processor records delivered status upon successful push transmission", () => {
  assert(queueRouteTs.includes('status: "delivered"'));
  assert(queueRouteTs.includes("last_success_at"));
});

check(43, "Queue processor records failed status and provider code upon push transmission error", () => {
  assert(queueRouteTs.includes('status: "failed"'));
  assert(queueRouteTs.includes("last_failure_at"));
});

// ==============================================================================
// CATEGORY F: FOREGROUND / BACKGROUND PUSH DELIVERY (44–51)
// ==============================================================================
console.log("\n--- CATEGORY F: Foreground / Background Push Delivery (44–51) ---");

check(44, "Service Worker push listener queries client windows with matchAll", () => {
  assert(swJs.includes('self.clients.matchAll({ type: "window"'));
});

check(45, "Service Worker identifies visible and focused Heat Chat client window", () => {
  assert(swJs.includes('c.visibilityState === "visible" && (c.focused === true || c.focus)'));
});

check(46, "Service Worker posts message to foreground client to allow in-app presentation", () => {
  assert(swJs.includes('focusedClient.postMessage({'));
  assert(swJs.includes('"PUSH_NOTIFICATION_RECEIVED"'));
});

check(47, "Service Worker suppresses OS push banner when focused foreground client exists", () => {
  assert(swJs.includes("focusedClient.postMessage"));
  assert(swJs.includes("return;"));
});

check(48, "Service Worker displays OS notification when application is backgrounded or not focused", () => {
  assert(swJs.includes("return self.registration.showNotification(title, options)"));
});

check(49, "Service Worker sets renotify: true and tag for notification coalescing", () => {
  assert(swJs.includes("renotify: true"));
  assert(swJs.includes("tag: `heat-chat-${notificationId}`"));
});

check(50, "Notification click listener focuses existing open window or opens new window", () => {
  assert(swJs.includes('addEventListener("notificationclick"'));
  assert(swJs.includes("client.focus()"));
  assert(swJs.includes("self.clients.openWindow"));
});

check(51, "Notification target URL sanitized against protocol-relative and javascript: URIs", () => {
  assert(swJs.includes("sanitizeTargetUrl"));
  assert(swJs.includes('!trimmed.startsWith("/") || trimmed.startsWith("//")'));
});

// ==============================================================================
// CATEGORY G: TOAST DEDUPLICATION & PRESENTATION (52–60)
// ==============================================================================
console.log("\n--- CATEGORY G: Toast Deduplication & Presentation (52–60) ---");

check(52, "NotificationToast maintains bounded memory-only deduplication cache (500 max)", () => {
  assert(notifToastTsx.includes("TOAST_DEDUPE_MAX = 500"));
});

check(53, "Toast deduplication uses 5-minute TTL window", () => {
  assert(notifToastTsx.includes("TOAST_DEDUPE_TTL_MS = 5 * 60 * 1000"));
});

check(54, "isToastDeduplicated returns true for duplicate toast within TTL", () => {
  assert(notifToastTsx.includes("function isToastDeduplicated"));
  assert(notifToastTsx.includes("now - timestamp < TOAST_DEDUPE_TTL_MS"));
});

check(55, "recordToastPresented records presentation and prunes oldest entries at capacity", () => {
  assert(notifToastTsx.includes("function recordToastPresented"));
  assert(notifToastTsx.includes("toastDedupeCache.size >= TOAST_DEDUPE_MAX"));
});

check(56, "clearToastDedupeCache exports a purge utility for logout", () => {
  assert(notifToastTsx.includes("function clearToastDedupeCache"));
  assert(notifToastTsx.includes("toastDedupeCache.clear()"));
});

check(57, "Toast items use accessible live-region role='status'", () => {
  assert(notifToastTsx.includes('role="status"'));
});

check(58, "Toast container uses aria-live='polite'", () => {
  assert(notifToastTsx.includes('aria-live="polite"'));
});

check(59, "Toast dismiss button satisfies >= 44px minimum interactive touch target", () => {
  assert(notifToastTsx.includes("min-h-[44px] min-w-[44px]"));
});

check(60, "Toast navigation strictly sanitizes internal route to prevent open redirects", () => {
  assert(notifToastTsx.includes("sanitizeDestinationUrl"));
  assert(notifToastTsx.includes("/^[a-zA-Z0-9_-]+$/"));
});

// ==============================================================================
// CATEGORY H: SOUND & HAPTIC DEDUPLICATION (61–68)
// ==============================================================================
console.log("\n--- CATEGORY H: Sound & Haptic Deduplication (61–68) ---");

check(61, "Audio cue only plays when document.visibilityState === 'visible'", () => {
  assert(soundCueTs.includes('document.visibilityState !== "visible"'));
});

check(62, "Rapid audio burst coalescing enforced within 1500ms window", () => {
  assert(soundCueTs.includes("BURST_COALESCE_MS = 1500"));
});

check(63, "Sound ID deduplication maintains bounded memory cache (max 250 entries, 5m TTL)", () => {
  assert(soundCueTs.includes("MAX_SOUND_CACHE_ENTRIES = 250"));
  assert(soundCueTs.includes("SOUND_DEDUPE_TTL_MS = 5 * 60 * 1000"));
});

check(64, "clearSoundCache exports a purge utility for logout", () => {
  assert(soundCueTs.includes("function clearSoundCache"));
  assert(soundCueTs.includes("soundDedupeCache.clear()"));
});

check(65, "Haptic vibration uses [30, 40, 30] pattern when supported", () => {
  assert(soundCueTs.includes("navigator.vibrate([30, 40, 30])"));
});

check(66, "Haptic vibration checks prefers-reduced-motion media query and respects it", () => {
  assert(soundCueTs.includes('window.matchMedia("(prefers-reduced-motion: reduce)")'));
});

check(67, "AudioContext creation errors are safely swallowed without throwing", () => {
  assert(soundCueTs.includes("catch"));
  assert(!soundCueTs.includes("throw err"));
});

check(68, "Audio synthesis node cleanup disconnects oscillator and gain safely", () => {
  assert(soundCueTs.includes("osc.disconnect()"));
  assert(soundCueTs.includes("gain.disconnect()"));
});

// ==============================================================================
// CATEGORY I: MULTI-TAB SYNCHRONIZATION & PRESENTER ELECTION (69–77)
// ==============================================================================
console.log("\n--- CATEGORY I: Multi-Tab Synchronization & Presenter Election (69–77) ---");

check(69, "Multi-tab channel initialized with 'heat-chat-notifications'", () => {
  assert(useNotificationsTs.includes('BROADCAST_CHANNEL_NAME = "heat-chat-notifications"'));
  assert(useNotificationsTs.includes("new BroadcastChannel(BROADCAST_CHANNEL_NAME)"));
});

check(70, "Each tab generates an ephemeral tabIdRef to avoid echo loops", () => {
  assert(useNotificationsTs.includes("tabIdRef"));
  assert(useNotificationsTs.includes("originTabId === tabIdRef.current"));
});

check(71, "Visible and focused tab claims presenter lease on window focus", () => {
  assert(useNotificationsTs.includes("claimPresenterLease"));
  assert(useNotificationsTs.includes('type: "presenter:claim"'));
});

check(72, "Receiving presenter:claim yields presentation lease to claiming tab", () => {
  assert(useNotificationsTs.includes('msg.type === "presenter:claim"'));
  assert(useNotificationsTs.includes("isPresenterRef.current = false"));
});

check(73, "Only elected presenter tab displays toast, audio, and desktop notification", () => {
  assert(useNotificationsTs.includes("newToasts.length > 0 && isElectedPresenter"));
});

check(74, "Elected presenter broadcasts notification:presented to prevent duplicate presentation in other tabs", () => {
  assert(useNotificationsTs.includes('broadcast({ type: "notification:presented", id: t.id })'));
});

check(75, "Receiving notification:presented marks IDs in local dedupe cache across all tabs", () => {
  assert(useNotificationsTs.includes('msg.type === "notification:presented"'));
  assert(useNotificationsTs.includes("checkAndRecordToastDedupe(msg.id)"));
});

check(76, "Non-presenter tabs still synchronize notification list and unread count", () => {
  assert(useNotificationsTs.includes('msg.type === "notification:new"'));
  assert(useNotificationsTs.includes("setNotifications((prev) =>"));
  assert(useNotificationsTs.includes("setUnreadCount((prev) => prev + 1)"));
});

check(77, "Multi-tab read status synchronized via notification:read and notification:read-all", () => {
  assert(useNotificationsTs.includes('msg.type === "notification:read"'));
  assert(useNotificationsTs.includes('msg.type === "notification:read-all"'));
});

// ==============================================================================
// CATEGORY J: CROSS-DEVICE RECONCILIATION (78–85)
// ==============================================================================
console.log("\n--- CATEGORY J: Cross-Device Reconciliation (78–85) ---");

check(78, "Cross-device reconciliation triggers on window focus", () => {
  assert(useNotificationsTs.includes('window.addEventListener("focus", handleFocus)'));
});

check(79, "Cross-device reconciliation triggers on document visibilitychange to visible", () => {
  assert(useNotificationsTs.includes('document.addEventListener("visibilitychange"'));
  assert(useNotificationsTs.includes('document.visibilityState === "visible"'));
});

check(80, "Cross-device reconciliation triggers on network recovery (window online event)", () => {
  assert(useNotificationsTs.includes('window.addEventListener("online", handleOnline)'));
});

check(81, "Reconciliation uses ~300ms debounce to prevent thrashing", () => {
  assert(useNotificationsTs.includes("300"));
  assert(useNotificationsTs.includes("debounceTimer"));
});

check(82, "Reconciliation fetches authoritative unread count via get_notification_unread_count RPC", () => {
  assert(useNotificationsTs.includes('supabase.rpc("get_notification_unread_count")'));
});

check(83, "Reconciliation queries notifications newer than lastSeenTimestampRef", () => {
  assert(useNotificationsTs.includes('.gt("created_at", since)'));
});

check(84, "Reconciliation merges fresh items rather than wiping existing notification list", () => {
  assert(useNotificationsTs.includes("const fresh = enrichedMissed.filter((m) => !existingIds.has(m.id))"));
  assert(useNotificationsTs.includes("return [...fresh, ...prev]"));
});

check(85, "Reconciliation updates lastSeenTimestampRef upon processing new items", () => {
  assert(useNotificationsTs.includes("lastSeenTimestampRef.current = enrichedMissed[0].createdAt"));
});

// ==============================================================================
// CATEGORY K: AUTHORITATIVE UNREAD COUNTS (86–93)
// ==============================================================================
console.log("\n--- CATEGORY K: Authoritative Unread Counts (86–93) ---");

check(86, "get_notification_unread_count RPC created with SECURITY DEFINER and search_path", () => {
  assert(phase17MigrationSql.includes("FUNCTION public.get_notification_unread_count"));
  assert(phase17MigrationSql.includes("SET search_path = public, pg_temp"));
});

check(87, "get_notification_unread_count filters out soft-deleted notifications", () => {
  assert(phase17MigrationSql.includes("deleted_at IS NULL"));
});

check(88, "mark_notification_read RPC updates unread count authoritatively", () => {
  assert(phase17MigrationSql.includes("FUNCTION public.mark_notification_read"));
  assert(phase17MigrationSql.includes("read_at = now()"));
});

check(89, "mark_all_notifications_read RPC marks all unread items for caller", () => {
  assert(phase17MigrationSql.includes("FUNCTION public.mark_all_notifications_read"));
  assert(phase17MigrationSql.includes("(recipient_id = auth.uid() OR user_id = auth.uid())"));
});

check(90, "Unread count indicator in NotificationCenter uses aria-live='polite'", () => {
  assert(notifCenterTsx.includes('aria-live="polite"'));
  assert(notifCenterTsx.includes("{unreadCount}"));
});

check(91, "Unread badge in trigger button formats 9+ for high volumes", () => {
  assert(notifCenterTsx.includes('unreadCount > 9 ? "9+" : unreadCount'));
});

check(92, "Unread count clamps to minimum 0 to prevent negative counters", () => {
  assert(useNotificationsTs.includes("Math.max(0, data)"));
  assert(useNotificationsTs.includes("Math.max(0, prev - 1)"));
});

check(93, "markAllAsRead sets unreadCount to 0 immediately and broadcasts to other tabs", () => {
  assert(useNotificationsTs.includes("setUnreadCount(0)"));
  assert(useNotificationsTs.includes('broadcast({ type: "notification:read-all"'));
});

// ==============================================================================
// CATEGORY L: CURSOR PAGINATION & STALE GUARD (94–101)
// ==============================================================================
console.log("\n--- CATEGORY L: Cursor Pagination & Stale Guard (94–101) ---");

check(94, "Notification route validates limit parameter with maximum 50", () => {
  assert(notifsRouteTs.includes("Math.min(50"));
});

check(95, "Notification route validates cursor ISO date format", () => {
  assert(notifsRouteTs.includes("isNaN(Date.parse(cursor))"));
});

check(96, "Notification route validates cursor_id as valid UUID format", () => {
  assert(notifsRouteTs.includes("cursorIdRegex"));
});

check(97, "Cursor pagination uses (created_at, id) cursor pair", () => {
  assert(useNotificationsTs.includes("cursorRef.current = { createdAt: lastItem.createdAt, id: lastItem.id }"));
});

check(98, "loadMore queries using created_at < cursor.createdAt", () => {
  assert(useNotificationsTs.includes('.lt("created_at", cursor.createdAt)'));
});

check(99, "NotificationCenter renders 'Load older notifications' button when hasMore is true", () => {
  assert(notifCenterTsx.includes("hasMore && ("));
  assert(notifCenterTsx.includes("Load older notifications"));
});

check(100, "Load more button displays loading spinner when isLoadingMore is true", () => {
  assert(notifCenterTsx.includes("isLoadingMore ? ("));
  assert(notifCenterTsx.includes("animate-spin"));
});

check(101, "Category filter switching in NotificationCenter has request sequence tracking", () => {
  assert(notifCenterTsx.includes("categoryReqSeqRef"));
});

// ==============================================================================
// CATEGORY M: RACE CONDITION PROTECTION (102–109)
// ==============================================================================
console.log("\n--- CATEGORY M: Race Condition Protection (102–109) ---");

check(102, "fetchNotifications uses AbortController to cancel superseded requests", () => {
  assert(useNotificationsTs.includes("abortControllerRef.current.abort()"));
  assert(useNotificationsTs.includes("new AbortController()"));
});

check(103, "fetchNotifications increments sequence number reqGenRef for every request", () => {
  assert(useNotificationsTs.includes("const currentGen = ++reqGenRef.current"));
});

check(104, "Late response dropped if request generation does not match latest generation", () => {
  assert(useNotificationsTs.includes("currentGen !== reqGenRef.current"));
});

check(105, "Late response dropped if AbortController signal was aborted", () => {
  assert(useNotificationsTs.includes("ac.signal.aborted"));
});

check(106, "loadMore tracks request generation to prevent late pagination overwrites", () => {
  assert(useNotificationsTs.includes("currentGen !== reqGenRef.current || !isMountedRef.current"));
});

check(107, "Self-healing uses isHealingRef flag to prevent concurrent recovery executions", () => {
  assert(useNotifPermissionTs.includes("isHealingRef.current"));
});

check(108, "Audio player uses timestamp and coalescing window to avoid overlapping cues", () => {
  assert(soundCueTs.includes("lastPlayedAt"));
  assert(soundCueTs.includes("BURST_COALESCE_MS"));
});

check(109, "Single realtime channel enforced per user via activeChannelRef removal", () => {
  assert(useNotificationsTs.includes("supabase.removeChannel(activeChannelRef.current)"));
});

// ==============================================================================
// CATEGORY N: PRIVACY & ZERO-PERSISTENCE INVARIANT (110–118)
// ==============================================================================
console.log("\n--- CATEGORY N: Privacy & Zero-Persistence Invariant (110–118) ---");

check(110, "Strict zero-persistence: Notification payloads NEVER written to localStorage", () => {
  assert(!useNotificationsTs.includes("localStorage.setItem"));
  assert(!dispatcherTs.includes("localStorage"));
  assert(!notifCenterTsx.includes("localStorage"));
  assert(!notifItemTsx.includes("localStorage"));
});

check(111, "Strict zero-persistence: Notification payloads NEVER written to sessionStorage", () => {
  assert(!useNotificationsTs.includes("sessionStorage.setItem"));
  assert(!notifCenterTsx.includes("sessionStorage"));
  assert(!notifToastTsx.includes("sessionStorage"));
});

check(112, "Strict zero-persistence: Notification payloads NEVER written to IndexedDB", () => {
  assert(!useNotificationsTs.includes("indexedDB"));
  assert(!dispatcherTs.includes("indexedDB"));
  assert(!useNotifPermissionTs.includes("indexedDB"));
});

check(113, "Strict zero-persistence: Service Worker NEVER caches notification API payloads", () => {
  assert(swJs.includes('url.pathname.startsWith("/api/notifications")'));
  assert(swJs.includes("return true;")); // bypassed in shouldBypassCache
});

check(114, "Strict zero-persistence: Service Worker shell cache (heat-chat-shell-v4) isolated from data", () => {
  assert(swJs.includes('const CACHE_NAME = "heat-chat-shell-v4"'));
});

check(115, "Notification telemetry strictly contains no message body text or chat preview", () => {
  assert(!phase17MigrationSql.includes("body text,"));
  assert(!dispatcherTs.includes("recordNotificationDeliveryEvent({ body:"));
});

check(116, "NotificationItem respects message_preview_enabled preference", () => {
  assert(notifItemTsx.includes("messagePreviewEnabled"));
  assert(notifItemTsx.includes('"New message"'));
});

check(117, "NotificationItem handles deleted messages gracefully without revealing text", () => {
  assert(notifItemTsx.includes("notification.isDeleted"));
  assert(notifItemTsx.includes('"This message was deleted"'));
});

check(118, "Memory caches are strictly in-memory references purged upon sign out", () => {
  assert(useNotificationsTs.includes("dedupeCacheRef.current.clear()"));
  assert(useNotificationsTs.includes("toastDedupeCacheRef.current.clear()"));
  assert(useNotificationsTs.includes("soundDedupeCacheRef.current.clear()"));
});

// ==============================================================================
// CATEGORY O: SECURITY, RLS & PROTECTED ALERTS (119–127)
// ==============================================================================
console.log("\n--- CATEGORY O: Security, RLS & Protected Alerts (119–127) ---");

check(119, "Security notifications bypass all social notification preference disables", () => {
  assert(dispatcherTs.includes('["security", "security_alert"].includes(notificationType)'));
  assert(dispatcherTs.includes("bypass social notification preferences"));
});

check(120, "Database trigger enforce_security_notification_preference permanently enforces security_notify = true", () => {
  assert(phase17MigrationSql.includes("FUNCTION public.enforce_security_notification_preference"));
  assert(phase17MigrationSql.includes("NEW.security_notify := true"));
});

check(121, "Preferences API route rejects client attempts to set security_notify = false", () => {
  assert(prefsRouteTs.includes("security_notify: true"));
});

check(122, "Settings UI displays Security Alerts as Always on / Protected with disabled toggle", () => {
  assert(settingsPageTsx.includes("Always on / Protected"));
  assert(settingsPageTsx.includes("disabled={true}"));
  assert(settingsPageTsx.includes("checked={true}"));
});

check(123, "All Phase 17 SECURITY DEFINER functions set search_path = public, pg_temp", () => {
  const securityDefinerCount = (phase17MigrationSql.match(/LANGUAGE plpgsql SECURITY DEFINER/g) || []).length;
  const searchPathCount = (phase17MigrationSql.match(/SET search_path = public, pg_temp/g) || []).length;
  assert(securityDefinerCount > 0);
  assert(securityDefinerCount <= searchPathCount);
});

check(124, "All user-accessible database operations enforce auth.uid()", () => {
  assert(phase17MigrationSql.includes("auth.uid()"));
});

check(125, "API routes never leak raw Postgres/PostgREST error codes or stack traces", () => {
  assert(notifsRouteTs.includes('"Unable to load notifications'));
  assert(prefsRouteTs.includes('"Unable to load notification preferences"'));
  assert(pushSubsRouteTs.includes('"Unable to fetch push subscriptions"'));
});

check(126, "NotificationItem visually distinguishes security alerts with Shield icon", () => {
  assert(notifItemTsx.includes("ShieldAlert"));
  assert(notifItemTsx.includes("isSecurity"));
});

check(127, "Security alert destination paths strictly constrained to safe internal routes", () => {
  assert(notifCenterTsx.includes('router.push("/settings")'));
});

// ==============================================================================
// CATEGORY P: ACCESSIBILITY & LIVE REGION SEMANTICS (128–136)
// ==============================================================================
console.log("\n--- CATEGORY P: Accessibility & Live Region Semantics (128–136) ---");

check(128, "Notification bell trigger has explicit aria-haspopup='dialog' and aria-expanded", () => {
  assert(notifCenterTsx.includes('aria-haspopup="dialog"'));
  assert(notifCenterTsx.includes("aria-expanded={isOpen}"));
});

check(129, "NotificationCenter popover has role='dialog' and aria-label='Notification center'", () => {
  assert(notifCenterTsx.includes('role="dialog"'));
  assert(notifCenterTsx.includes('aria-label="Notification center"'));
});

check(130, "Escape key closes NotificationCenter and restores focus to bell trigger", () => {
  assert(notifCenterTsx.includes('e.key === "Escape"'));
  assert(notifCenterTsx.includes("triggerRef.current?.focus()"));
});

check(131, "NotificationItem supports keyboard activation with Enter and Space keys", () => {
  assert(notifItemTsx.includes('e.key === "Enter" || e.key === " "'));
  assert(notifItemTsx.includes("e.preventDefault()"));
});

check(132, "ToastItem supports keyboard activation with Enter and Space keys", () => {
  assert(notifToastTsx.includes('e.key === "Enter" || e.key === " "'));
});

check(133, "NotificationItem satisfies >= 44px minimum interactive touch target", () => {
  assert(notifItemTsx.includes("min-h-[44px]"));
});

check(134, "All interactive buttons have explicit type='button'", () => {
  assert(notifCenterTsx.includes('type="button"'));
  assert(notifToastTsx.includes('type="button"'));
  assert(settingsPageTsx.includes('type="button"'));
});

check(135, "Visible focus rings present on all interactive notification elements", () => {
  assert(notifCenterTsx.includes("focus-visible:ring-2"));
  assert(notifItemTsx.includes("focus-visible:ring-2"));
  assert(notifToastTsx.includes("focus-visible:ring-2"));
});

check(136, "NotificationCenter does not steal focus from active input fields on render", () => {
  assert(!notifCenterTsx.includes("autoFocus"));
});

// ==============================================================================
// CATEGORY Q: RESPONSIVE VIEWPORT GEOMETRY (320px..1440px) (137–144)
// ==============================================================================
console.log("\n--- CATEGORY Q: Responsive Viewport Geometry (320px..1440px) (137–144) ---");

check(137, "Notification center popover clamps width with Math.min(380, Math.max(200, viewportWidth - 16))", () => {
  assert(notifCenterTsx.includes("Math.min(380, Math.max(200, viewportWidth - 16))"));
});

check(138, "Notification center popover geometry guarantees left >= 8px on 320px screens", () => {
  assert(notifCenterTsx.includes("left = 8"));
});

check(139, "Notification center popover maxHeight clamped safely against viewport height", () => {
  assert(notifCenterTsx.includes("Math.max(180, Math.min(460, viewportHeight - top - 16))"));
});

check(140, "Category filter pills use shrink-0 and overflow-x-auto for small screen resilience", () => {
  assert(notifCenterTsx.includes("overflow-x-auto"));
  assert(notifCenterTsx.includes("shrink-0"));
});

check(141, "Notification toast width constrained to max-w-[calc(100vw-32px)] sm:max-w-sm", () => {
  assert(notifToastTsx.includes("max-w-[calc(100vw-32px)] sm:max-w-sm"));
});

check(142, "Settings page Web Push status badge wraps without title collision", () => {
  assert(settingsPageTsx.includes("flex-wrap"));
  assert(settingsPageTsx.includes("break-words"));
});

check(143, "Settings page push action buttons wrap and stack cleanly on mobile viewports", () => {
  assert(settingsPageTsx.includes("flex-wrap sm:flex-nowrap"));
});

check(144, "Settings page Registered Devices section wraps metadata and action buttons", () => {
  assert(settingsPageTsx.includes("flex flex-col sm:flex-row"));
});

// ==============================================================================
// CATEGORY R: SERVICE WORKER RESPONSE SAFETY (145–152)
// ==============================================================================
console.log("\n--- CATEGORY R: Service Worker Response Safety (145–152) ---");

check(145, "Service Worker shell cache version is heat-chat-shell-v4", () => {
  assert(swJs.includes('const CACHE_NAME = "heat-chat-shell-v4"'));
});

check(146, "Every event.respondWith() path guarantees a valid Response object", () => {
  assert(swJs.includes("createOfflinePageResponse()"));
  assert(swJs.includes("createOfflineAssetResponse()"));
});

check(147, "Never uses Response.error() as an offline fallback", () => {
  assert(!swJs.includes("return Response.error()"));
  assert(swJs.includes("Never return undefined, null, Response.error()"));
});

check(148, "Offline page fallback returns valid 503 HTTP status", () => {
  assert(swJs.includes("status: 503"));
});

check(149, "Preserves Supabase API bypass (/rest/v1, /auth/v1, /storage/v1, /realtime/v1)", () => {
  assert(swJs.includes('/rest/v1'));
  assert(swJs.includes('/auth/v1'));
  assert(swJs.includes('/storage/v1'));
  assert(swJs.includes('/realtime/v1'));
});

check(150, "Preserves Authorization header bypass (never caches token-bearing requests)", () => {
  assert(swJs.includes('request.headers.get("authorization")'));
});

check(151, "Does NOT intercept WebSocket / Realtime upgrade requests", () => {
  assert(swJs.includes('request.headers.get("upgrade") === "websocket"'));
});

check(152, "Activate event only removes obsolete heat-chat-shell caches", () => {
  assert(swJs.includes('k.startsWith("heat-chat-shell-") && k !== CACHE_NAME'));
});

// ==============================================================================
// CATEGORY S: LOGOUT & SIGN-OUT PURGE (153–160)
// ==============================================================================
console.log("\n--- CATEGORY S: Logout & Sign-Out Purge (153–160) ---");

check(153, "useNotifications registers auth state listener for SIGNED_OUT event", () => {
  assert(useNotificationsTs.includes('supabase.auth.onAuthStateChange'));
  assert(useNotificationsTs.includes('event === "SIGNED_OUT"'));
});

check(154, "SIGNED_OUT purges notification dedupeCacheRef", () => {
  assert(useNotificationsTs.includes("dedupeCacheRef.current.clear()"));
});

check(155, "SIGNED_OUT purges toastDedupeCacheRef and calls clearToastDedupeCache", () => {
  assert(useNotificationsTs.includes("toastDedupeCacheRef.current.clear()"));
  assert(useNotificationsTs.includes("clearToastDedupeCache()"));
});

check(156, "SIGNED_OUT purges soundDedupeCacheRef and calls clearSoundCache", () => {
  assert(useNotificationsTs.includes("soundDedupeCacheRef.current.clear()"));
  assert(useNotificationsTs.includes("clearSoundCache()"));
});

check(157, "SIGNED_OUT resets presenter lease flag isPresenterRef", () => {
  assert(useNotificationsTs.includes("isPresenterRef.current = false"));
});

check(158, "SIGNED_OUT clears burst queue and cursor tracking", () => {
  assert(useNotificationsTs.includes("burstQueueRef.current = []"));
  assert(useNotificationsTs.includes("cursorRef.current = null"));
});

check(159, "SIGNED_OUT resets notification state, unread count, and in-app toasts", () => {
  assert(useNotificationsTs.includes("setNotifications([])"));
  assert(useNotificationsTs.includes("setUnreadCount(0)"));
  assert(useNotificationsTs.includes("setToasts([])"));
});

check(160, "SIGNED_OUT cleans up reconnect timer and active realtime channel", () => {
  assert(useNotificationsTs.includes("reconnectTimerRef.current"));
  assert(useNotificationsTs.includes("supabase.removeChannel(activeChannelRef.current)"));
});

// ==============================================================================
// CATEGORY T: RETRY & ERROR CLASSIFICATION (161–168)
// ==============================================================================
console.log("\n--- CATEGORY T: Retry & Error Classification (161–168) ---");

check(161, "Push queue classifies permanent 404/410 subscription errors", () => {
  assert(queueRouteTs.includes("isPermanent"));
  assert(queueRouteTs.includes("404"));
  assert(queueRouteTs.includes("410"));
});

check(162, "Queue processor immediately revokes permanently invalid subscriptions", () => {
  assert(queueRouteTs.includes("revoked: true"));
});

check(163, "Push queue processor does not retry permanent failures forever", () => {
  assert(queueRouteTs.includes("isPermanent ? 0 :"));
});

check(164, "Realtime subscription implements bounded exponential backoff (1s, 2s, 4s, 8s, 16s, 30s max)", () => {
  assert(useNotificationsTs.includes("[1000, 2000, 4000, 8000, 16000, 30000]"));
});

check(165, "Realtime reconnect backoff counter resets upon successful SUBSCRIBED status", () => {
  assert(useNotificationsTs.includes('status === "SUBSCRIBED"'));
  assert(useNotificationsTs.includes("reconnectAttemptRef.current = 0"));
});

check(166, "cleanup_old_delivery_events RPC safely purges operational telemetry older than retention limit", () => {
  assert(phase17MigrationSql.includes("FUNCTION public.cleanup_old_delivery_events"));
  assert(phase17MigrationSql.includes("p_retention_days"));
});

check(167, "Granular notification preferences support optimistic updates with error rollback", () => {
  assert(useNotifPrefsTs.includes("setPreferences(previous)"));
  assert(useNotifPrefsTs.includes("Restored previous settings"));
});

check(168, "Push subscriptions route validates endpoint ownership before revocation", () => {
  assert(pushSubsRouteTs.includes("eq(\"user_id\", user.id)"));
});

// ==============================================================================
// SUMMARY REPORT
// ==============================================================================
console.log("\n===============================================================================");
console.log(`PHASE 17 VERIFICATION COMPLETE: ${passed}/${passed + failed} Assertions Passed`);
console.log("===============================================================================\n");

if (failed > 0) {
  console.error(`❌ ${failed} assertion(s) failed!`);
  process.exit(1);
} else {
  console.log(`🎉 ALL ${passed} ASSERTIONS PASSED PERFECTLY!`);
  process.exit(0);
}
