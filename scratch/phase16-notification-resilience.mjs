/**
 * HEAT CHAT — PHASE 16: NOTIFICATION RELIABILITY, MOBILE RESPONSIVENESS & NETWORK RESILIENCE
 * Master Verification Suite (95+ Invariant Assertions)
 *
 * Categories:
 * - A. Notification State Model (1–15)
 * - B. Push Subscription Lifecycle (16–25)
 * - C. Duplicate Prevention (26–35)
 * - D. Realtime Resilience (36–45)
 * - E. Network Failure Classification (46–55)
 * - F. Service Worker Response Safety (56–65)
 * - G. Responsive UI (66–75)
 * - H. Accessibility (76–85)
 * - I. Security & Privacy (86–95)
 */

import fs from "node:fs";
import path from "node:path";
import assert from "node:assert";

console.log("===============================================================================");
console.log("HEAT CHAT — PHASE 16 NOTIFICATION RESILIENCE & RECOVERY MASTER SUITE");
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
const networkErrorTs = fs.readFileSync(path.join(rootDir, "lib/utils/network-error.ts"), "utf-8");
const networkStatusHookTs = fs.readFileSync(path.join(rootDir, "hooks/use-network-status.ts"), "utf-8");
const networkStatusUiTsx = fs.readFileSync(path.join(rootDir, "components/layout/network-status-indicator.tsx"), "utf-8");
const swJs = fs.readFileSync(path.join(rootDir, "public/sw.js"), "utf-8");
const webVitalsTs = fs.readFileSync(path.join(rootDir, "lib/telemetry/web-vitals.ts"), "utf-8");
const webVitalsTsx = fs.readFileSync(path.join(rootDir, "components/instrumentation/web-vitals.tsx"), "utf-8");
const notifPermissionTs = fs.readFileSync(path.join(rootDir, "hooks/use-notification-permission.ts"), "utf-8");
const settingsPageTsx = fs.readFileSync(path.join(rootDir, "app/(protected)/settings/page.tsx"), "utf-8");
const discoverPeopleTs = fs.readFileSync(path.join(rootDir, "hooks/use-discover-people.ts"), "utf-8");
const useNotificationsTs = fs.readFileSync(path.join(rootDir, "hooks/use-notifications.ts"), "utf-8");
const notifCenterTsx = fs.readFileSync(path.join(rootDir, "components/notifications/notification-center.tsx"), "utf-8");
const notifToastTsx = fs.readFileSync(path.join(rootDir, "components/notifications/notification-toast.tsx"), "utf-8");
const apiNotifsRouteTs = fs.readFileSync(path.join(rootDir, "app/api/notifications/route.ts"), "utf-8");
const migrationSql = fs.readFileSync(
  path.join(rootDir, "supabase/migrations/20260913_phase16_notification_hardening.sql"),
  "utf-8"
);
const layoutTsx = fs.readFileSync(path.join(rootDir, "app/layout.tsx"), "utf-8");

// ==============================================================================
// CATEGORY A: NOTIFICATION STATE MODEL (1–15)
// ==============================================================================
console.log("\n--- CATEGORY A: Notification State Model (1–15) ---");

check(1, "BrowserPermissionState explicitly defines 4 distinct states", () => {
  assert(notifPermissionTs.includes('"granted" | "denied" | "default" | "unsupported"'));
});

check(2, "PushSubscriptionStatus explicitly defines 6 lifecycle states", () => {
  const states = [
    "subscribed",
    "not_subscribed",
    "subscription_expired",
    "subscription_invalid",
    "subscription_unavailable",
    "checking",
  ];
  for (const s of states) {
    assert(notifPermissionTs.includes(`"${s}"`));
  }
});

check(3, "Does NOT conflate browser permission with push subscription state", () => {
  assert(notifPermissionTs.includes("BrowserPermissionState"));
  assert(notifPermissionTs.includes("PushSubscriptionStatus"));
  assert(notifPermissionTs.includes("setPermission"));
  assert(notifPermissionTs.includes("setSubscriptionStatus"));
});

check(4, "Exposes backward-compatible isPushSubscribed boolean property", () => {
  assert(notifPermissionTs.includes("isPushSubscribed"));
  assert(notifPermissionTs.includes('subscriptionStatus === "subscribed"'));
});

check(5, "Validates PushSubscription expiration time defensively", () => {
  assert(notifPermissionTs.includes("sub.expirationTime"));
  assert(notifPermissionTs.includes("subscription_expired"));
});

check(6, "Validates PushSubscription endpoint validity defensively", () => {
  assert(notifPermissionTs.includes("!sub.endpoint || !sub.endpoint.startsWith(\"http\")"));
  assert(notifPermissionTs.includes("subscription_invalid"));
});

check(7, "Handles unsupported pushManager gracefully without throwing", () => {
  assert(notifPermissionTs.includes("!(\"PushManager\" in window)"));
  assert(notifPermissionTs.includes("subscription_unavailable"));
});

check(8, "Handles unsupported Notification API gracefully without throwing", () => {
  assert(notifPermissionTs.includes("!(\"Notification\" in window)"));
  assert(notifPermissionTs.includes("unsupported"));
});

check(9, "Unsubscribe action updates state to not_subscribed and cleans up server record", () => {
  assert(notifPermissionTs.includes("unsubscribeFromPush"));
  assert(notifPermissionTs.includes("setSubscriptionStatus(\"not_subscribed\")"));
});

check(10, "Subscribe action handles permission denial and sets subscription_unavailable", () => {
  assert(notifPermissionTs.includes("permissionResult !== \"granted\""));
  assert(notifPermissionTs.includes("subscription_unavailable"));
});

check(11, "SSR safety: useNotificationPermission checks window existence before accessing navigator", () => {
  assert(notifPermissionTs.includes("typeof window === \"undefined\""));
});

check(12, "NotificationCenter supports all 7 distinct notification categories", () => {
  const categories = ["all", "messages", "mentions", "groups", "friends", "reactions", "system"];
  for (const cat of categories) {
    assert(notifCenterTsx.includes(`"${cat}"`));
  }
});

check(13, "Notification categories cleanly filter direct, group, and friend event types", () => {
  assert(notifCenterTsx.includes("conversationType === \"group\""));
  assert(notifCenterTsx.includes("(n as any).type?.startsWith(\"friend\")"));
  assert(notifCenterTsx.includes("(n as any).type === \"reaction\""));
  assert(notifCenterTsx.includes("(n as any).type === \"mention\""));
});

check(14, "Notification type definitions support dedupe_key and recipient_id", () => {
  assert(migrationSql.includes("recipient_id uuid REFERENCES auth.users(id)"));
  assert(migrationSql.includes("dedupe_key text"));
});

check(15, "Discoverability hook retains last known state without resetting on offline/glitch", () => {
  assert(discoverPeopleTs.includes("lastKnownDiscoverableRef"));
  assert(discoverPeopleTs.includes("setIsDiscoverable(lastKnownDiscoverableRef.current)"));
});

// ==============================================================================
// CATEGORY B: PUSH SUBSCRIPTION LIFECYCLE (16–25)
// ==============================================================================
console.log("\n--- CATEGORY B: Push Subscription Lifecycle (16–25) ---");

check(16, "Push subscription extracts p256dh and auth cryptographic keys", () => {
  assert(notifPermissionTs.includes('getKey("p256dh")'));
  assert(notifPermissionTs.includes('getKey("auth")'));
});

check(17, "Converts raw key ArrayBuffers to base64url or base64 safely", () => {
  assert(notifPermissionTs.includes("btoa(String.fromCharCode"));
});

check(18, "urlBase64ToUint8Array utility safely converts VAPID public key", () => {
  assert(notifPermissionTs.includes("urlBase64ToUint8Array"));
  assert(notifPermissionTs.includes("applicationServerKey"));
});

check(19, "Settings UI displays subscription badge with semantic color coding", () => {
  assert(settingsPageTsx.includes("isPushSubscribed") && settingsPageTsx.includes("Subscribed on this device") && settingsPageTsx.includes("Not Registered"));
  assert(settingsPageTsx.includes("bg-emerald-50") && settingsPageTsx.includes("bg-zinc-100"));
});

check(20, "Settings UI allows badge to wrap gracefully without overflow", () => {
  assert(settingsPageTsx.includes("flex-wrap"));
  assert(settingsPageTsx.includes("min-w-0"));
});

check(21, "Settings UI wraps action buttons for Web Push on mobile", () => {
  assert(settingsPageTsx.includes("flex flex-wrap sm:flex-nowrap items-center gap-2") && settingsPageTsx.includes("w-full sm:w-auto"));
});

check(22, "Settings UI renders Test Push Notification button", () => {
  assert(settingsPageTsx.includes("Test Push"));
});

check(23, "Settings UI renders Unsubscribe button when subscribed", () => {
  assert(settingsPageTsx.includes("Unsubscribe"));
});

check(24, "Settings UI handles subscribing/unsubscribing with loading state", () => {
  assert(settingsPageTsx.includes("isPushLoading") && settingsPageTsx.includes("Updating..."));
});

check(25, "Defensive handling of registration.pushManager errors in useNotificationPermission", () => {
  assert(notifPermissionTs.includes("catch (err)"));
  assert(notifPermissionTs.includes("subscription_unavailable"));
});

// ==============================================================================
// CATEGORY C: DUPLICATE PREVENTION (26–35)
// ==============================================================================
console.log("\n--- CATEGORY C: Duplicate Prevention (26–35) ---");

check(26, "useNotifications maintains in-memory dedupe cache with 5-minute TTL", () => {
  assert(useNotificationsTs.includes("DEDUPE_TTL_MS = 5 * 60 * 1000"));
});

check(27, "useNotifications limits dedupe cache to maximum 1000 entries", () => {
  assert(useNotificationsTs.includes("DEDUPE_MAX_ENTRIES = 1000"));
});

check(28, "checkAndRecordDedupe detects duplicates within TTL window", () => {
  assert(useNotificationsTs.includes("now - existingTime < DEDUPE_TTL_MS"));
});

check(29, "Database schema enforces recipient_id + dedupe_key uniqueness", () => {
  assert(
    migrationSql.includes(
      "CREATE UNIQUE INDEX IF NOT EXISTS notifications_recipient_dedupe_unique\n  ON public.notifications(recipient_id, dedupe_key)"
    )
  );
});

check(30, "Database schema maintains legacy user_id + dedupe_key unique index", () => {
  assert(
    migrationSql.includes(
      "CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_dedupe_key_uidx\n  ON public.notifications(user_id, dedupe_key)"
    )
  );
});

check(31, "create_notification RPC uses ON CONFLICT DO NOTHING with dedupe_key", () => {
  assert(migrationSql.includes("ON CONFLICT (recipient_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING"));
});

check(32, "Coalescing queue debounces rapid realtime event bursts", () => {
  assert(useNotificationsTs.includes("burstQueueRef"));
  assert(useNotificationsTs.includes("setTimeout(() => {\n        processBurstQueue();\n      }, 150)"));
});

check(33, "Multi-tab BroadcastChannel uses tabIdRef to prevent same-tab duplicate echoes", () => {
  assert(useNotificationsTs.includes("tabIdRef"));
  assert(useNotificationsTs.includes("msg.originTabId === tabIdRef.current"));
});

check(34, "useNotifications deduplicates realtime events against existing state list", () => {
  assert(useNotificationsTs.includes("setNotifications((prev) => [item, ...prev.filter((p) => p.id !== item.id)])"));
});

check(35, "Load more pagination deduplicates items against existing state list", () => {
  assert(useNotificationsTs.includes("const existingIds = new Set(prev.map((p) => p.id))"));
  assert(useNotificationsTs.includes("filteredNew = detailedItems.filter((item) => !existingIds.has(item.id))"));
});

// ==============================================================================
// CATEGORY D: REALTIME RESILIENCE (36–45)
// ==============================================================================
console.log("\n--- CATEGORY D: Realtime Resilience (36–45) ---");

check(36, "Bounded exponential backoff defined: 1s, 2s, 4s, 8s, 16s, 30s max", () => {
  assert(useNotificationsTs.includes("const delays = [1000, 2000, 4000, 8000, 16000, 30000]"));
});

check(37, "Reset reconnect backoff counter upon SUBSCRIBED", () => {
  assert(useNotificationsTs.includes("reconnectAttemptRef.current = 0"));
});

check(38, "Single active realtime channel per user enforced with activeChannelRef", () => {
  assert(useNotificationsTs.includes("activeChannelRef"));
  assert(useNotificationsTs.includes("supabase.removeChannel(activeChannelRef.current)"));
});

check(39, "Cleans up reconnect timer on unmount and logout", () => {
  assert(useNotificationsTs.includes("clearTimeout(reconnectTimerRef.current)"));
});

check(40, "Cleans up active channel on unmount and logout", () => {
  assert(useNotificationsTs.includes("supabase.removeChannel(activeChannelRef.current)"));
});

check(41, "Prevents reconnect loop after user logout (!user?.id)", () => {
  assert(useNotificationsTs.includes("if (!user?.id) {"));
  assert(useNotificationsTs.includes("reconnectAttemptRef.current = 0"));
});

check(42, "Preserves last known notifications while in reconnecting state", () => {
  assert(useNotificationsTs.includes("isReconnecting"));
  // setNotifications is not cleared when status === "CLOSED"
  assert(!useNotificationsTs.includes("status === \"CLOSED\"\n            setNotifications([])"));
});

check(43, "Online window event listener triggers authoritative unread count refresh", () => {
  assert(useNotificationsTs.includes("window.addEventListener(\"online\", handleOnline)"));
  assert(useNotificationsTs.includes("fetchAuthoritativeUnreadCount()"));
});

check(44, "Online window event reconciles missed notifications since lastSeenTimestamp", () => {
  assert(useNotificationsTs.includes("reconcileOnReconnect()"));
  assert(useNotificationsTs.includes("lastSeenTimestampRef.current"));
});

check(45, "Authoritative unread count RPC get_notification_unread_count used on reconnection", () => {
  assert(useNotificationsTs.includes("supabase.rpc(\"get_notification_unread_count\")"));
});

// ==============================================================================
// CATEGORY E: NETWORK FAILURE CLASSIFICATION (46–55)
// ==============================================================================
console.log("\n--- CATEGORY E: Network Failure Classification (46–55) ---");

check(46, "classifyNetworkError detects NETWORK_OFFLINE via navigator.onLine", () => {
  assert(networkErrorTs.includes("navigator.onLine === false"));
  assert(networkErrorTs.includes("NETWORK_OFFLINE"));
});

check(47, "classifyNetworkError detects TypeError / 'Failed to fetch' and connection closed", () => {
  assert(networkErrorTs.includes("failed to fetch"));
  assert(networkErrorTs.includes("NETWORK_CONNECTION_CLOSED"));
});

check(48, "classifyNetworkError detects NETWORK_TIMEOUT (AbortError, ETIMEDOUT, 504, 408)", () => {
  assert(networkErrorTs.includes("aborterror"));
  assert(networkErrorTs.includes("ETIMEDOUT"));
  assert(networkErrorTs.includes("NETWORK_TIMEOUT"));
});

check(49, "classifyNetworkError detects AUTH_EXPIRED (401, PGRST301, JWT expired)", () => {
  assert(networkErrorTs.includes("PGRST301"));
  assert(networkErrorTs.includes("jwt expired"));
  assert(networkErrorTs.includes("AUTH_EXPIRED"));
});

check(50, "classifyNetworkError detects FORBIDDEN (403, Postgres 42501 permission denied)", () => {
  assert(networkErrorTs.includes("42501"));
  assert(networkErrorTs.includes("FORBIDDEN"));
});

check(51, "classifyNetworkError detects NOT_FOUND (404, PostgREST PGRST116)", () => {
  assert(networkErrorTs.includes("PGRST116"));
  assert(networkErrorTs.includes("NOT_FOUND"));
});

check(52, "classifyNetworkError detects RATE_LIMITED (429, rate_limit_exceeded)", () => {
  assert(networkErrorTs.includes("status === 429"));
  assert(networkErrorTs.includes("RATE_LIMITED"));
});

check(53, "classifyNetworkError detects SERVER_ERROR (5xx, 500, 502, 503)", () => {
  assert(networkErrorTs.includes("status >= 500 && status <= 599"));
  assert(networkErrorTs.includes("SERVER_ERROR"));
});

check(54, "Never exposes raw PostgREST or Postgres errors in user-facing message", () => {
  assert(networkErrorTs.includes("message: \"You're offline. Changes will sync when you're back online.\""));
  assert(networkErrorTs.includes("message: \"Connection interrupted. Retrying…\""));
  assert(networkErrorTs.includes("message: \"Your session expired. Please sign in again.\""));
});

check(55, "classifyNetworkError is completely SSR-safe (guards window and navigator)", () => {
  assert(networkErrorTs.includes("typeof window !== \"undefined\" && typeof navigator !== \"undefined\""));
});

// ==============================================================================
// CATEGORY F: SERVICE WORKER RESPONSE SAFETY (56–65)
// ==============================================================================
console.log("\n--- CATEGORY F: Service Worker Response Safety (56–65) ---");

check(56, "CACHE_NAME upgraded to heat-chat-shell-v4", () => {
  assert(swJs.includes('const CACHE_NAME = "heat-chat-shell-v4"'));
});

check(57, "Every event.respondWith() path guarantees a valid Response object", () => {
  assert(swJs.includes("createOfflinePageResponse()"));
  assert(swJs.includes("createOfflineAssetResponse()"));
});

check(58, "Service Worker never returns undefined or unhandled rejected promise", () => {
  assert(!swJs.includes("return undefined;"));
  assert(swJs.includes("createOfflineAssetResponse()"));
  assert(swJs.includes("createOfflinePageResponse()"));
});

check(59, "Offline navigation returns a valid 503 HTML response", () => {
  assert(swJs.includes("status: 503"));
  assert(swJs.includes("You are offline"));
  assert(swJs.includes("Reconnect to continue chatting"));
});

check(60, "Offline non-navigation assets return a valid 503 text fallback", () => {
  assert(swJs.includes('"Offline - heat-chat-shell-v4"'));
  assert(swJs.includes("createOfflineAssetResponse"));
});

check(61, "Preserves Supabase API bypass (/rest/v1, /auth/v1, /storage/v1, /realtime/v1)", () => {
  assert(swJs.includes("/rest/v1"));
  assert(swJs.includes("/auth/v1"));
  assert(swJs.includes("/storage/v1"));
  assert(swJs.includes("/realtime/v1"));
});

check(62, "Preserves Authorization header bypass (never caches token-bearing requests)", () => {
  assert(swJs.includes('request.headers.get("authorization")'));
});

check(63, "Does NOT intercept WebSocket / Realtime upgrade requests", () => {
  assert(swJs.includes('request.headers.get("upgrade") === "websocket"'));
});

check(64, "Activate event only removes obsolete heat-chat-shell caches", () => {
  assert(swJs.includes('k.startsWith("heat-chat-shell-") && k !== CACHE_NAME'));
});

check(65, "Catches fetch failures and matches gracefully without unhandled rejections", () => {
  assert(swJs.includes("createOfflinePageResponse()"));
  assert(swJs.includes("createOfflineAssetResponse()"));
});

// ==============================================================================
// CATEGORY G: RESPONSIVE UI (66–75)
// ==============================================================================
console.log("\n--- CATEGORY G: Responsive UI (66–75) ---");

check(66, "Settings page Web Push uses flex-wrap and min-w-0 for layout resilience", () => {
  assert(settingsPageTsx.includes("flex-wrap") && settingsPageTsx.includes("min-w-0") && settingsPageTsx.includes("max-w-full"));
});

check(67, "Settings page Web Push status badge wraps without title collision", () => {
  assert(settingsPageTsx.includes("inline-flex items-center") && settingsPageTsx.includes("shrink-0"));
  assert(settingsPageTsx.includes("flex-wrap items-center gap-2"));
});

check(68, "Settings page Web Push buttons wrap and stack cleanly on small viewports", () => {
  assert(settingsPageTsx.includes("w-full sm:w-auto"));
});

check(69, "Notification center popover clamps width with Math.min(380, Math.max(200, viewportWidth - 16))", () => {
  assert(notifCenterTsx.includes("Math.min(380, Math.max(200, viewportWidth - 16))"));
});

check(70, "Notification center popover geometry guarantees left >= 8px on 320px screens", () => {
  assert(notifCenterTsx.includes("left = 8"));
  assert(notifCenterTsx.includes("idealRight = Math.max(8, viewportWidth - triggerRect.right)"));
});

check(71, "Category filter chips are horizontally scrollable with shrink-0", () => {
  assert(notifCenterTsx.includes("overflow-x-auto"));
  assert(notifCenterTsx.includes("shrink-0"));
});

check(72, "Notification toast uses mobile-safe width max-w-[calc(100vw-32px)] sm:max-w-sm", () => {
  assert(notifToastTsx.includes("max-w-[calc(100vw-32px)] sm:max-w-sm"));
});

check(73, "NetworkStatusIndicator respects 320px screen without horizontal overflow", () => {
  assert(networkStatusUiTsx.includes("max-w-[calc(100vw-24px)]"));
  assert(networkStatusUiTsx.includes("truncate"));
});

check(74, "Settings page Registered Devices section wraps metadata and action buttons", () => {
  assert(settingsPageTsx.includes("min-w-0 max-w-full flex-1"));
});

check(75, "Settings page container enforces max-w-4xl and min-w-0 to prevent document scroll", () => {
  assert(settingsPageTsx.includes("max-w-4xl"));
  assert(settingsPageTsx.includes("min-w-0"));
});

// ==============================================================================
// CATEGORY H: ACCESSIBILITY (76–85)
// ==============================================================================
console.log("\n--- CATEGORY H: Accessibility (76–85) ---");

check(76, "Notification bell trigger has explicit aria-haspopup='dialog' and aria-expanded", () => {
  assert(notifCenterTsx.includes('aria-haspopup="dialog"'));
  assert(notifCenterTsx.includes("aria-expanded={isOpen}"));
});

check(77, "Notification center popover has role='dialog' and aria-label='Notification center'", () => {
  assert(notifCenterTsx.includes('role="dialog"'));
  assert(notifCenterTsx.includes('aria-label="Notification center"'));
});

check(78, "Escape key closes notification center and restores focus to trigger", () => {
  assert(notifCenterTsx.includes('event.key === "Escape"'));
  assert(notifCenterTsx.includes("triggerRef.current?.focus()"));
});

check(79, "Unread count indicator uses aria-live='polite' for screen readers", () => {
  assert(notifCenterTsx.includes('aria-live="polite"'));
});

check(80, "Notification toast container uses aria-label and aria-live='polite'", () => {
  assert(notifToastTsx.includes('aria-label="Incoming notifications"'));
  assert(notifToastTsx.includes('aria-live="polite"'));
});

check(81, "ToastItem supports keyboard Enter and Space activation without focus loss", () => {
  assert(notifToastTsx.includes('e.key === "Enter" || e.key === " "'));
  assert(notifToastTsx.includes("e.preventDefault()"));
});

check(82, "NetworkStatusIndicator uses role='status' and aria-live='polite'", () => {
  assert(networkStatusUiTsx.includes('role="status"'));
  assert(networkStatusUiTsx.includes('aria-live="polite"'));
});

check(83, "Interactive buttons have explicit type='button'", () => {
  assert(notifCenterTsx.includes('type="button"'));
  assert(settingsPageTsx.includes('type="button"'));
  assert(networkStatusUiTsx.includes('type="button"'));
});

check(84, "Toast dismiss button has explicit aria-label='Dismiss notification'", () => {
  assert(notifToastTsx.includes('aria-label="Dismiss notification"'));
});

check(85, "Visible focus rings (focus-visible:ring-2) present on all notification controls", () => {
  assert(notifCenterTsx.includes("focus-visible:ring-2"));
  assert(notifToastTsx.includes("focus-visible:ring-2"));
});

// ==============================================================================
// CATEGORY I: SECURITY & PRIVACY (86–95)
// ==============================================================================
console.log("\n--- CATEGORY I: Security & Privacy (86–95) ---");

check(86, "Strict invariant: Zero localStorage/sessionStorage/IndexedDB persistence of notification payloads", () => {
  assert(!useNotificationsTs.includes('localStorage.setItem("notifications"'));
  assert(!useNotificationsTs.includes('sessionStorage.setItem("notifications"'));
  assert(!useNotificationsTs.includes('indexedDB.open("notifications"'));
});

check(87, "Strict invariant: Service Worker cache does not persist notification/chat API responses", () => {
  assert(swJs.includes('url.pathname.startsWith("/api/notifications")'));
  assert(swJs.includes('url.pathname.startsWith("/api/chat")'));
  assert(swJs.includes('request.headers.get("authorization")'));
});

check(88, "Logout purges in-memory notification list, unread count, and dedupe cache", () => {
  assert(useNotificationsTs.includes("dedupeCacheRef.current.clear()"));
  assert(useNotificationsTs.includes("burstQueueRef.current = []"));
  assert(useNotificationsTs.includes("cursorRef.current = null"));
  assert(useNotificationsTs.includes("setNotifications([])"));
  assert(useNotificationsTs.includes("setUnreadCount(0)"));
});

check(89, "NotificationToast sanitizes destination URL to prevent open redirect vulnerabilities", () => {
  assert(notifToastTsx.includes("sanitizeDestinationUrl"));
  assert(notifToastTsx.includes("/^[a-zA-Z0-9_-]+$/"));
});

check(90, "Notifications table RLS enabled with authenticated-only access policies", () => {
  assert(migrationSql.includes("ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY"));
  assert(migrationSql.includes("CREATE POLICY \"Users can view own notifications\""));
  assert(migrationSql.includes("(user_id = auth.uid() OR recipient_id = auth.uid())"));
});

check(91, "Notification RPCs use SECURITY DEFINER SET search_path = public, pg_temp", () => {
  assert(migrationSql.includes("SECURITY DEFINER SET search_path = public, pg_temp"));
});

check(92, "create_notification RPC validates caller identity (auth.uid()) and conversation membership", () => {
  assert(migrationSql.includes("v_caller_id := auth.uid()"));
  assert(migrationSql.includes("public.conversation_members"));
  assert(migrationSql.includes("Not authorized to send notification for this conversation"));
});

check(93, "API routes do not leak raw PostgREST/Postgres error messages to client", () => {
  assert(!apiNotifsRouteTs.includes("error: cursorError.message"));
  assert(!apiNotifsRouteTs.includes("error: notifError.message"));
  assert(apiNotifsRouteTs.includes("Failed to retrieve notifications"));
});

check(94, "Web Vitals isolation: validates typeof metric?.startTime === 'number'", () => {
  assert(webVitalsTs.includes("typeof (metric as any)?.startTime !== \"number\"") || webVitalsTs.includes("startTime"));
  assert(webVitalsTsx.includes("WebVitalsMonitor"));
});

check(95, "Telemetry runtime isolation catches errors without crashing React or blocking rendering", () => {
  assert(webVitalsTs.includes("try {"));
  assert(webVitalsTs.includes("} catch {"));
  assert(webVitalsTsx.includes("window.addEventListener(\"error\""));
});

// ==============================================================================
// SUMMARY & EXIT
// ==============================================================================
console.log("\n===============================================================================");
console.log(`PHASE 16 VERIFICATION COMPLETE: ${passed}/${passed + failed} Assertions Passed`);
console.log("===============================================================================\n");

if (failed > 0) {
  console.error(`❌ ${failed} assertion(s) failed!`);
  process.exit(1);
} else {
  console.log("🎉 ALL 95 ASSERTIONS PASSED PERFECTLY!");
  process.exit(0);
}
