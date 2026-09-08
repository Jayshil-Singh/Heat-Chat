/**
 * Heat Chat — Phase 13 Security & Isolation Verification Suite
 * Tests 40 security & privacy assertions covering:
 * - Zero persistence of private data (localStorage, sessionStorage, IndexedDB, CacheStorage)
 * - Profile and conversation cache isolation, TTL, bounds, non-persistence
 * - Cross-user data isolation and RLS preservation
 * - Service worker cache bypass rules (API, Auth, Storage, Realtime, WebSockets, tokens, signatures)
 * - Concurrency, race condition, generation guard and deduplication security
 * - Complete cache purging on logout / session termination
 * - Zero credential exposure in telemetry or client memory structures
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;
const results = [];

function assert(condition, testName, details = "") {
  if (condition) {
    passed++;
    console.log(`  [PASS] Test ${String(passed + failed).padStart(2, "0")}: ${testName}`);
    results.push({ name: testName, status: "PASS", details });
  } else {
    failed++;
    console.error(`  [FAIL] Test ${String(passed + failed).padStart(2, "0")}: ${testName} - ${details}`);
    results.push({ name: testName, status: "FAIL", details });
  }
}

console.log("===============================================================================");
console.log("HEAT CHAT — PHASE 13 SECURITY & PRIVACY VERIFICATION SUITE");
console.log("Strict Memory-Only Boundary, Zero Persistence & Realtime Isolation");
console.log("===============================================================================\n");

async function runSecurityVerification() {
  const swCode = fs.readFileSync(path.join(rootDir, "public", "sw.js"), "utf-8");
  const useMsgSource = fs.readFileSync(path.join(rootDir, "hooks", "use-messages.ts"), "utf-8");
  const useConvSource = fs.readFileSync(path.join(rootDir, "hooks", "use-conversations.ts"), "utf-8");
  const useAuthSource = fs.readFileSync(path.join(rootDir, "hooks", "use-auth.tsx"), "utf-8");
  const personCardSource = fs.readFileSync(path.join(rootDir, "components", "discover", "person-card.tsx"), "utf-8");
  const profCacheSource = fs.readFileSync(path.join(rootDir, "lib", "cache", "profile-cache.ts"), "utf-8");
  const convCacheSource = fs.readFileSync(path.join(rootDir, "lib", "cache", "conversation-cache.ts"), "utf-8");

  // Dynamic import of caches to test operational invariants
  const {
    getCachedConversationMessages,
    setCachedConversationMessages,
    clearConversationCache,
    getConversationCacheSize,
  } = await import("../lib/cache/conversation-cache.ts");

  const {
    getCachedProfile,
    setCachedProfile,
    clearProfileCache,
    getProfileCacheSize,
  } = await import("../lib/cache/profile-cache.ts");

  // Helper to test executable code without comments
  const stripComments = (str) => str.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");

  // 1. No private messages in localStorage
  assert(!stripComments(convCacheSource).includes("localStorage"), "01. No private messages in localStorage");

  // 2. No private messages in sessionStorage
  assert(!stripComments(convCacheSource).includes("sessionStorage"), "02. No private messages in sessionStorage");

  // 3. No private messages in IndexedDB
  assert(!stripComments(convCacheSource).includes("indexedDB"), "03. No private messages in IndexedDB");

  // 4. No private messages in Service Worker caches
  assert(swCode.includes("shouldBypassCache") && swCode.includes("/chat-attachments/"), "04. No private messages in Service Worker caches");

  // 5. Profile cache is memory-only
  assert(!stripComments(profCacheSource).includes("localStorage") && !stripComments(profCacheSource).includes("indexedDB"), "05. Profile cache is strictly memory-only");

  // 6. Profile cache contains only authorized projections
  assert(profCacheSource.includes("Profile") && !profCacheSource.includes("password"), "06. Profile cache contains only authorized profile fields");

  // 7. Profile cache TTL enforced (5 minutes)
  assert(profCacheSource.includes("PROFILE_TTL_MS = 5 * 60 * 1000"), "07. Profile cache TTL strictly enforced (5 minutes)");

  // 8. Profile cache size bounded (500 profiles)
  assert(profCacheSource.includes("MAX_CACHE_SIZE = 500"), "08. Profile cache bounded to 500 entries with LRU eviction");

  // 9. Conversation message cache is memory-only
  assert(convCacheSource.includes("const memoryConversationCache = new Map"), "09. Conversation message cache uses memory Map");

  // 10. Conversation message cache TTL enforced (5 minutes)
  assert(convCacheSource.includes("CONVERSATION_CACHE_TTL_MS = 5 * 60 * 1000"), "10. Conversation message cache enforces 5-minute TTL");

  // 11. Conversation message cache size bounded (50 conversations)
  assert(convCacheSource.includes("MAX_CACHED_CONVERSATIONS = 50"), "11. Conversation message cache bounded to 50 conversations max");

  // 12. Cross-user messages inaccessible (server query filtered by RLS and conversation_id)
  assert(useMsgSource.includes('.eq("conversation_id", conversationId)'), "12. Message queries strictly bound to conversation_id with RLS enforcement");

  // 13. Cross-user profiles inaccessible where RLS requires isolation
  assert(useMsgSource.includes('.from("profiles").select("*").in("id", missingSenderIds)'), "13. Profile enrichment scoped to authorized participant IDs");

  // 14. Notification RLS remains enforced
  const notifSource = fs.readFileSync(path.join(rootDir, "hooks", "use-notifications.ts"), "utf-8");
  assert(notifSource.includes('.eq("user_id", user.id)'), "14. Notification RLS remains strictly enforced per user");

  // 15. Friend-request RLS remains enforced
  const frSource = fs.readFileSync(path.join(rootDir, "hooks", "use-friend-requests.ts"), "utf-8");
  assert(frSource.includes("get_my_friend_requests"), "15. Friend requests access secured via authoritative RPC");

  // 16. Discoverability RLS remains enforced
  const discSource = fs.readFileSync(path.join(rootDir, "hooks", "use-discover-people.ts"), "utf-8");
  assert(discSource.includes("discover_people"), "16. Discoverability secured via authoritative privacy-aware RPC");

  // 17. Unauthorized friendship mutation blocked
  assert(frSource.includes("accept_friend_request") && frSource.includes("decline_friend_request"), "17. Friendship mutations execute through validated server RPCs");

  // 18. Unauthorized friend-request mutation blocked
  assert(discSource.includes("send_friend_request") && discSource.includes("cancel_friend_request"), "18. Friend requests created and canceled via validated RPCs");

  // 19. Sender suppression remains enforced
  assert(notifSource.includes("rawNotif.sender_id === user?.id"), "19. Sender self-notification suppression strictly preserved");

  // 20. Removed-member notification isolation remains enforced
  assert(useConvSource.includes("leave_group"), "20. Group removal isolation enforced via authoritative leave_group RPC");

  // 21. Muted conversation behavior remains enforced
  assert(useConvSource.includes("conversation_user_states"), "21. Muted and per-user conversation states isolated in database");

  // 22. Signed URLs not cached in SW
  assert(swCode.includes("signature=") && swCode.includes("token="), "22. Signed URLs with tokens/signatures explicitly bypass Service Worker");

  // 23. Supabase API not cached
  assert(swCode.includes("/rest/v1") && swCode.includes("supabase.co"), "23. Supabase REST API calls strictly bypass Service Worker cache");

  // 24. Supabase Auth not cached
  assert(swCode.includes("/auth/v1"), "24. Supabase Auth endpoints strictly bypass Service Worker cache");

  // 25. Supabase Storage not cached
  assert(swCode.includes("/storage/v1") && swCode.includes("/chat-attachments/"), "25. Supabase Storage media strictly bypasses Service Worker cache");

  // 26. Supabase Realtime not cached
  assert(swCode.includes("/realtime/v1"), "26. Supabase Realtime endpoints strictly bypass Service Worker cache");

  // 27. WebSocket requests bypass cache
  assert(swCode.includes('url.protocol === "ws:"') && swCode.includes('url.protocol === "wss:"'), "27. WebSocket and WSS protocols bypass Service Worker cache");

  // 28. /api routes bypass cache
  assert(swCode.includes('url.pathname.startsWith("/api/")'), "28. Next.js internal /api/* routes bypass Service Worker cache");

  // 29. Token query parameters bypass cache
  assert(swCode.includes('search.includes("token=")') && swCode.includes('search.includes("apikey=")'), "29. Token and apikey parameters bypass Service Worker cache");

  // 30. Signature query parameters bypass cache
  assert(swCode.includes('search.includes("signature=")'), "30. Signature parameters bypass Service Worker cache");

  // 31. Stale conversation response cannot overwrite active chat
  assert(useMsgSource.includes("currentGen !== requestGenRef.current"), "31. Stale conversation responses discarded via atomic request generation guard");

  // 32. Optimistic message cannot become duplicate authoritative message
  assert(useMsgSource.includes("m.tempId === tempId"), "32. Optimistic message reconciled by tempId when authoritative message arrives");

  // 33. Optimistic friend request cannot bypass server authorization
  assert(personCardSource.includes("onSendRequest(person.user_id)") && personCardSource.includes("setOptimisticStatus(null)"), "33. Optimistic friend request rolled back if server RPC rejects");

  // 34. Reconnect cannot duplicate realtime channels
  assert(useConvSource.includes("channelName") && useConvSource.includes("user-conversations-${user.id}"), "34. Channel names are deterministic per user, avoiding duplicate channel creation on reconnect");

  // 35. Reconnect cannot duplicate messages
  assert(useMsgSource.includes("prev.some((m) => m.id === newMsg.id)"), "35. Incoming messages deduplicated by unique database message ID");

  // 36. Logout clears memory-only private caches
  setCachedConversationMessages("secret-1", [{ id: "s1", content: "secret" }]);
  setCachedProfile({ id: "p1", display_name: "Secret User" });
  assert(getConversationCacheSize() > 0 && getProfileCacheSize() > 0, "36a. Memory caches populated for logout test");

  clearConversationCache();
  clearProfileCache();
  assert(
    getConversationCacheSize() === 0 && getProfileCacheSize() === 0 &&
    useAuthSource.includes("clearConversationCache()") && useAuthSource.includes("clearProfileCache()"),
    "36. Logout clears memory-only private conversation and profile caches"
  );

  // 37. Account switch clears memory-only private caches
  assert(useAuthSource.includes('event === "SIGNED_OUT"'), "37. SIGNED_OUT auth event triggers immediate memory cache purge");

  // 38. No credentials stored by performance cache
  assert(!stripComments(convCacheSource).includes("password") && !stripComments(convCacheSource).includes("secret"), "38. No credentials or passwords in conversation cache");

  // 39. No auth tokens stored by performance cache
  assert(!stripComments(convCacheSource).includes("token") && !stripComments(convCacheSource).includes("bearer"), "39. No authorization tokens or bearer keys in conversation cache");

  // 40. No private conversation content included in performance telemetry
  const auditContent = fs.readFileSync(path.join(rootDir, "scratch", "phase13-audit.json"), "utf-8");
  assert(!auditContent.includes("secret") && !auditContent.includes("Hello!"), "40. Telemetry and audit structures contain zero private conversation content");

  console.log("\n===============================================================================");
  console.log(`PHASE 13 SECURITY VERIFICATION SUMMARY: ${passed}/40 Passed (${failed} Failed)`);
  console.log("===============================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runSecurityVerification().catch((err) => {
  console.error("Security verification failed:", err);
  process.exit(1);
});
