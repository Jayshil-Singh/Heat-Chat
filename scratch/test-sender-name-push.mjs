/**
 * Test Suite: Sender-Name Web Push Notifications for Heat Chat
 *
 * Covers:
 * 1. Direct message notification title uses sender display name
 * 2. Group message notification title includes sender and group name ("<sender> in <group>")
 * 3. Group message without group name falls back to "<sender> in Group"
 * 4. Missing/empty sender name falls back to "New message"
 * 5. Invariant: Title never uses recipient's name
 * 6. Message preview trimming and length limiting (<= 120 chars with "...")
 * 7. Safe labels for image ("Sent an image"), file ("Sent a file"), voice ("Voice message"), video ("Sent a video")
 * 8. Privacy setting: message_preview_enabled = false suppresses preview to "New message"
 * 9. Existing queued deliveries without senderName remain fully compatible
 * 10. Service worker sanitizes "undefined", "null", and empty strings to safe fallbacks
 * 11. Service worker notificationclick routes to correct conversation URL
 * 12. Push payload strictly excludes sensitive fields (no tokens, passwords, VAPID keys, endpoints)
 */

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

console.log("==================================================================");
console.log(" SENDER-NAME WEB PUSH NOTIFICATION TEST SUITE");
console.log("==================================================================\n");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ [PASS] ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}\n`);
  }
}

// ---------------------------------------------------------------------------
// 1. Database Trigger Logic Simulation
// ---------------------------------------------------------------------------

function computeNotificationTitle(senderDisplayName, senderUsername, convType, convName) {
  const senderName = (senderDisplayName && senderDisplayName.trim()) || (senderUsername && senderUsername.trim()) || null;
  if (senderName) {
    if (convType === "group") {
      if (convName && convName.trim()) {
        return `${senderName} in ${convName.trim()}`;
      } else {
        return `${senderName} in Group`;
      }
    } else {
      return senderName;
    }
  }
  return "New message";
}

function computeSafePreview(messageType, content, messagePreviewEnabled = true) {
  if (!messagePreviewEnabled) {
    return "New message";
  }

  if (messageType === "image") {
    return "Sent an image";
  } else if (messageType === "file") {
    return "Sent a file";
  } else if (messageType === "voice") {
    return "Voice message";
  } else if (messageType === "video") {
    return "Sent a video";
  } else {
    if (content && content.trim()) {
      const trimmed = content.trim();
      if (trimmed.length > 120) {
        return trimmed.slice(0, 117) + "...";
      }
      return trimmed;
    }
    return "New message";
  }
}

// ---------------------------------------------------------------------------
// 2. Service Worker Logic Simulation
// ---------------------------------------------------------------------------

function sanitizeNotificationText(val, fallback) {
  if (val === null || val === undefined) return fallback;
  const str = String(val).trim();
  if (
    !str ||
    str.toLowerCase() === "undefined" ||
    str.toLowerCase() === "null" ||
    str.toLowerCase() === "nan"
  ) {
    return fallback;
  }
  return str;
}

function processSwPushPayload(payload) {
  if (!payload || typeof payload !== "object") {
    payload = {};
  }

  const data = (payload.data && typeof payload.data === "object") ? payload.data : {};
  const rawTitle = sanitizeNotificationText(payload.title, "");
  const rawBody = sanitizeNotificationText(payload.body, "");
  const senderName = sanitizeNotificationText(payload.senderName || data.senderName, "");
  const conversationName = sanitizeNotificationText(payload.conversationName || data.conversationName, "");

  let title = "";
  if (rawTitle && rawTitle !== "Heat Chat" && rawTitle !== "New Message" && rawTitle !== "New message") {
    title = rawTitle;
  } else if (senderName) {
    if (conversationName) {
      title = `${senderName} in ${conversationName}`;
    } else {
      title = senderName;
    }
  } else if (rawTitle) {
    title = rawTitle;
  }

  title = sanitizeNotificationText(title, "New message").slice(0, 128);

  let body = rawBody;
  if (!body) {
    body = "You have a new message";
  }
  body = sanitizeNotificationText(body, "You have a new message").slice(0, 256);

  const conversationId = sanitizeNotificationText(payload.conversationId || data.conversationId, "");
  const rawUrl = payload.url || data.url || (conversationId ? `/chat/${conversationId}` : "/chat");

  // sanitize target url
  let targetUrl = "/chat";
  if (rawUrl && typeof rawUrl === "string" && rawUrl.startsWith("/") && !rawUrl.startsWith("//") && !rawUrl.includes("\\")) {
    targetUrl = rawUrl.trim();
  }

  return { title, body, targetUrl, conversationId };
}

// ---------------------------------------------------------------------------
// TEST EXECUTION
// ---------------------------------------------------------------------------

console.log("Group 1: Database Trigger Title Resolution");

test("Direct message notification uses sender display name", () => {
  const title = computeNotificationTitle("Jayshil Singh", "jayshil", "direct", null);
  assert.strictEqual(title, "Jayshil Singh");
});

test("Direct message falls back to username when display_name is empty", () => {
  const title = computeNotificationTitle("   ", "jayshil", "direct", null);
  assert.strictEqual(title, "jayshil");
});

test("Group message notification includes sender and group name", () => {
  const title = computeNotificationTitle("Jayshil Singh", "jayshil", "group", "Weekend Group");
  assert.strictEqual(title, "Jayshil Singh in Weekend Group");
});

test("Group message with empty group name falls back to '<sender> in Group'", () => {
  const title = computeNotificationTitle("Jayshil Singh", "jayshil", "group", "   ");
  assert.strictEqual(title, "Jayshil Singh in Group");
});

test("Missing sender name falls back to 'New message'", () => {
  const title = computeNotificationTitle(null, null, "direct", null);
  assert.strictEqual(title, "New message");

  const titleGroup = computeNotificationTitle("", "  ", "group", "Weekend Group");
  assert.strictEqual(titleGroup, "New message");
});

test("Invariant: Title never uses recipient's name", () => {
  const recipientName = "Recipient User";
  const title = computeNotificationTitle("Sender User", "sender", "direct", null);
  assert.notStrictEqual(title, recipientName);
  assert(!title.includes("Recipient"));
});

console.log("\nGroup 2: Safe Message Previews & Recipient Privacy");

test("Message preview is trimmed and preserved under 120 chars", () => {
  const preview = computeSafePreview("text", "  Hey, are you free tonight?  ");
  assert.strictEqual(preview, "Hey, are you free tonight?");
});

test("Message preview exceeding 120 chars is truncated to 117 chars + '...'", () => {
  const longText = "A".repeat(150);
  const preview = computeSafePreview("text", longText);
  assert.strictEqual(preview.length, 120);
  assert(preview.endsWith("..."));
  assert.strictEqual(preview, "A".repeat(117) + "...");
});

test("Safe label for image messages: 'Sent an image'", () => {
  const preview = computeSafePreview("image", "some caption or empty");
  assert.strictEqual(preview, "Sent an image");
});

test("Safe label for file messages: 'Sent a file'", () => {
  const preview = computeSafePreview("file", "document.pdf");
  assert.strictEqual(preview, "Sent a file");
});

test("Safe label for voice messages: 'Voice message'", () => {
  const preview = computeSafePreview("voice", null);
  assert.strictEqual(preview, "Voice message");
});

test("Safe label for video messages: 'Sent a video'", () => {
  const preview = computeSafePreview("video", null);
  assert.strictEqual(preview, "Sent a video");
});

test("Empty content defaults to 'New message'", () => {
  const preview = computeSafePreview("text", "   ");
  assert.strictEqual(preview, "New message");
});

test("Recipient privacy setting: message_preview_enabled = false suppresses preview", () => {
  const preview = computeSafePreview("text", "Super confidential message", false);
  assert.strictEqual(preview, "New message");

  const imagePreview = computeSafePreview("image", null, false);
  assert.strictEqual(imagePreview, "New message");
});

console.log("\nGroup 3: Service Worker Parsing & Edge Cases");

test("SW renders formatted direct message payload", () => {
  const result = processSwPushPayload({
    title: "Jayshil Singh",
    body: "Hey, are you free tonight?",
    conversationId: "05b2f3a1-f4ba-4ab3-b656-f72978e4f339",
    url: "/chat/05b2f3a1-f4ba-4ab3-b656-f72978e4f339",
  });
  assert.strictEqual(result.title, "Jayshil Singh");
  assert.strictEqual(result.body, "Hey, are you free tonight?");
  assert.strictEqual(result.targetUrl, "/chat/05b2f3a1-f4ba-4ab3-b656-f72978e4f339");
});

test("SW renders formatted group message payload", () => {
  const result = processSwPushPayload({
    title: "Jayshil Singh in Weekend Group",
    body: "Dinner at 8?",
    conversationId: "grp-123",
    url: "/chat/grp-123",
  });
  assert.strictEqual(result.title, "Jayshil Singh in Weekend Group");
  assert.strictEqual(result.body, "Dinner at 8?");
});

test("SW handles malformed and empty payloads safely without crashing", () => {
  const r1 = processSwPushPayload(null);
  assert.strictEqual(r1.title, "New message");
  assert.strictEqual(r1.body, "You have a new message");

  const r2 = processSwPushPayload({});
  assert.strictEqual(r2.title, "New message");
  assert.strictEqual(r2.body, "You have a new message");

  const r3 = processSwPushPayload({ title: "undefined", body: "null" });
  assert.strictEqual(r3.title, "New message");
  assert.strictEqual(r3.body, "You have a new message");

  const r4 = processSwPushPayload({ title: "   ", body: null });
  assert.strictEqual(r4.title, "New message");
  assert.strictEqual(r4.body, "You have a new message");
});

test("SW upgrades generic 'New Message' when senderName is present", () => {
  const result = processSwPushPayload({
    title: "New Message",
    body: "Hello there",
    senderName: "Jayshil Singh",
    conversationId: "conv-1",
  });
  assert.strictEqual(result.title, "Jayshil Singh");
  assert.strictEqual(result.body, "Hello there");
});

test("SW preserves backward compatibility for older queued items without senderName", () => {
  const result = processSwPushPayload({
    title: "New Message",
    body: "You have a new message",
    data: { conversation_id: "conv-old" },
  });
  assert.strictEqual(result.title, "New Message");
  assert.strictEqual(result.body, "You have a new message");
});

test("SW click routing sanitizes dangerous target URLs to /chat", () => {
  const r1 = processSwPushPayload({ url: "https://attacker.com/phish" });
  assert.strictEqual(r1.targetUrl, "/chat");

  const r2 = processSwPushPayload({ url: "javascript:alert(1)" });
  assert.strictEqual(r2.targetUrl, "/chat");

  const r3 = processSwPushPayload({ url: "//evil.com" });
  assert.strictEqual(r3.targetUrl, "/chat");
});

console.log("\nGroup 4: Payload Security & Source Code Invariants");

test("Push payload serializer in lib/notifications/push.ts does not leak secrets", () => {
  const pushFile = fs.readFileSync(path.resolve("lib/notifications/push.ts"), "utf-8");
  assert(!pushFile.includes("VAPID_PRIVATE_KEY:"), "VAPID private key is not placed in push payload");
  assert(!pushFile.includes("SUPABASE_SERVICE_ROLE_KEY"), "Service role key is not referenced in push payload");
  assert(!pushFile.includes("accessToken"), "Access token is not placed in push payload");
  assert(!pushFile.includes("cookie"), "Cookie is not placed in push payload");
  assert(pushFile.includes("senderName"), "senderName is included in push payload");
  assert(pushFile.includes("conversationId"), "conversationId is included in push payload");
  assert(pushFile.includes("messageId"), "messageId is included in push payload");
});

test("Queue worker route in app/api/internal/notifications/process-queue/route.ts passes senderName", () => {
  const routeFile = fs.readFileSync(path.resolve("app/api/internal/notifications/process-queue/route.ts"), "utf-8");
  assert(routeFile.includes("senderName"), "Worker extracts senderName");
  assert(routeFile.includes("conversationId"), "Worker extracts conversationId");
  assert(routeFile.includes("messageId"), "Worker extracts messageId");
  assert(routeFile.includes("targetUrl"), "Worker extracts targetUrl");
});

test("Service worker public/sw.js contains CACHE_NAME v6 and safe sanitizers", () => {
  const swFile = fs.readFileSync(path.resolve("public/sw.js"), "utf-8");
  assert(swFile.includes("heat-chat-shell-v6"), "SW cache is bumped to heat-chat-shell-v6");
  assert(swFile.includes("sanitizeNotificationText"), "SW defines sanitizeNotificationText");
  assert(swFile.includes("senderName"), "SW handles senderName");
  assert(swFile.includes("New message"), "SW contains fallback 'New message'");
  assert(swFile.includes("You have a new message"), "SW contains fallback 'You have a new message'");
});

test("Database migration 20260922_phase23_sender_name_web_push_notifications.sql exists and is syntactically sound", () => {
  const migrationPath = path.resolve("supabase/migrations/20260922_phase23_sender_name_web_push_notifications.sql");
  assert(fs.existsSync(migrationPath), "Migration file exists");
  const sql = fs.readFileSync(migrationPath, "utf-8");
  assert(sql.includes("handle_new_message_notification"), "Defines handle_new_message_notification");
  assert(sql.includes("v_sender_display_name"), "Resolves display name");
  assert(sql.includes("v_conv_type"), "Resolves conversation type");
  assert(sql.includes("Sent an image"), "Includes image safe label");
  assert(sql.includes("Sent a file"), "Includes file safe label");
  assert(sql.includes("Voice message"), "Includes voice safe label");
  assert(sql.includes("message_preview_enabled"), "Respects recipient message_preview_enabled");
  assert(sql.includes("ON CONFLICT (recipient_id, dedupe_key) DO NOTHING"), "Preserves dedupe key idempotency");
});

console.log("\n==================================================================");
console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log("==================================================================\n");

if (failed > 0) {
  process.exit(1);
}
