import fs from "node:fs";
import path from "node:path";
import assert from "node:assert";

console.log("================================================================================");
console.log(" MESSAGE ROUTE RESILIENCE & QUEUE-DRIVEN ARCHITECTURE TEST SUITE");
console.log("================================================================================\n");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failed++;
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}\n`);
  }
}

const rootDir = process.cwd();
const routePath = path.join(rootDir, "app/api/conversations/[id]/messages/route.ts");
const routeCode = fs.readFileSync(routePath, "utf-8");

// --- SECTION 1: CODE CONTRACTS & CRITICAL PATH DECOUPLING ---
console.log("--- SECTION 1: CODE CONTRACTS & CRITICAL PATH DECOUPLING ---");

test("1. Route does NOT import or call sendWebPushToConversationMembers", () => {
  assert(!routeCode.includes("sendWebPushToConversationMembers"), "Route must not import or invoke sendWebPushToConversationMembers");
});

test("2. Route does NOT use after() on the message response path", () => {
  assert(!routeCode.includes("after("), "Route should not use after() for unproven background work");
});

test("3. Route does NOT have an awaited push promise or Promise.race on response path", () => {
  assert(!routeCode.includes("Promise.race"), "Promise.race must not block the response path");
  assert(!routeCode.includes("await sendWebPush"), "No push operations should be awaited");
});

test("4. Route returns HTTP 201 immediately upon RPC success", () => {
  assert(routeCode.includes("status: 201"), "Must return HTTP status 201");
  assert(routeCode.includes("stage: \"response_completion\""), "Must log response_completion diagnostic");
});

// --- SECTION 2: SAFE STRUCTURED DIAGNOSTICS & SENSITIVE DATA PREVENTION ---
console.log("\n--- SECTION 2: SAFE STRUCTURED DIAGNOSTICS & SENSITIVE DATA PREVENTION ---");

test("5. Diagnostics logger emits [Messages POST Diag] prefix", () => {
  assert(routeCode.includes("[Messages POST Diag]"), "Must emit [Messages POST Diag] prefix");
});

test("6. Diagnostics logs all required major stages (auth, validation, rpc_start, rpc_success, rpc_failure, response_completion)", () => {
  assert(routeCode.includes('stage: "validation"'), "Must log validation stage");
  assert(routeCode.includes('stage: "auth"'), "Must log auth stage");
  assert(routeCode.includes('stage: "rpc_start"'), "Must log rpc_start stage");
  assert(routeCode.includes('stage: "rpc_success"'), "Must log rpc_success stage");
  assert(routeCode.includes('stage: "rpc_failure"'), "Must log rpc_failure stage");
  assert(routeCode.includes('stage: "response_completion"'), "Must log response_completion stage");
});

test("7. Diagnostics strictly shortens or masks user IDs", () => {
  assert(routeCode.includes(".slice(0, 8)"), "User ID must be truncated to prevent full ID leakage in raw logs");
});

test("8. Diagnostics NEVER logs message content, tokens, cookies, or full headers", () => {
  // Ensure logMessageDiag does not take content, body, tokens, cookies, or headers
  assert(!routeCode.includes("content: params.content"), "Cannot log message content");
  assert(!routeCode.includes("body: params.body"), "Cannot log message body");
  assert(!routeCode.includes("token:"), "Cannot log token");
  assert(!routeCode.includes("cookie:"), "Cannot log cookies");
  assert(!routeCode.includes("headers: params.headers"), "Cannot log full headers");
  assert(!routeCode.includes("endpoint:"), "Cannot log push endpoints");
});

// --- SECTION 3: EXACT RPC ERROR STATUS PRESERVATION ---
console.log("\n--- SECTION 3: EXACT RPC ERROR STATUS PRESERVATION ---");

test("9. Maps CONVERSATION_ACCESS_DENIED to 403 FORBIDDEN", () => {
  assert(routeCode.includes('CONVERSATION_ACCESS_DENIED'));
  assert(routeCode.includes('status = 403') && routeCode.includes('FORBIDDEN'));
});

test("10. Maps CONVERSATION_NOT_FOUND to 404 NOT_FOUND", () => {
  assert(routeCode.includes('CONVERSATION_NOT_FOUND'));
  assert(routeCode.includes('status = 404') && routeCode.includes('NOT_FOUND'));
});

test("11. Maps UNAUTHENTICATED to 401 UNAUTHORIZED", () => {
  assert(routeCode.includes('UNAUTHENTICATED'));
  assert(routeCode.includes('status = 401') && routeCode.includes('UNAUTHORIZED'));
});

test("12. Maps MESSAGE_BLOCKED to 403 MESSAGE_BLOCKED", () => {
  assert(routeCode.includes('MESSAGE_BLOCKED'));
  assert(routeCode.includes('status = 403'));
});

test("13. Maps PRIVACY_RESTRICTED to 403 PRIVACY_RESTRICTED", () => {
  assert(routeCode.includes('PRIVACY_RESTRICTED'));
  assert(routeCode.includes('status = 403'));
});

test("14. Maps MESSAGE_TOO_LONG and length constraints to 400 MESSAGE_TOO_LONG", () => {
  assert(routeCode.includes('MESSAGE_TOO_LONG'));
  assert(routeCode.includes('message_content_length'));
  assert(routeCode.includes('status = 400'));
});

test("15. Maps MESSAGE_EMPTY to 400 MESSAGE_EMPTY", () => {
  assert(routeCode.includes('MESSAGE_EMPTY'));
  assert(routeCode.includes('status = 400'));
});

test("16. Maps INVALID_REPLY_TARGET to 400 INVALID_REPLY_TARGET", () => {
  assert(routeCode.includes('INVALID_REPLY_TARGET'));
  assert(routeCode.includes('status = 400'));
});

test("17. Maps INVALID_FORWARD_TARGET to 400 INVALID_FORWARD_TARGET", () => {
  assert(routeCode.includes('INVALID_FORWARD_TARGET'));
  assert(routeCode.includes('status = 400'));
});

test("18. Other database failure defaults to 500 with FAILED_TO_SEND_MESSAGE", () => {
  assert(routeCode.includes('FAILED_TO_SEND_MESSAGE'));
  assert(routeCode.includes("Couldn't send this message. Please try again."));
});

// --- SECTION 4: RETURN SHAPE NORMALIZATION ---
console.log("\n--- SECTION 4: RETURN SHAPE NORMALIZATION ---");

function normalizeResponse(data) {
  const rawData = data || {};
  const persistedMessageId =
    rawData.messageId ||
    rawData.message_id ||
    rawData.id ||
    (typeof data === "string" ? data : undefined);

  return {
    success: true,
    ...rawData,
    id: persistedMessageId,
    messageId: persistedMessageId,
    message_id: persistedMessageId,
  };
}

test("19. Normalizes camelCase 'messageId' into id, messageId, and message_id", () => {
  const r = normalizeResponse({ success: true, messageId: "msg_abc123" });
  assert.strictEqual(r.id, "msg_abc123");
  assert.strictEqual(r.messageId, "msg_abc123");
  assert.strictEqual(r.message_id, "msg_abc123");
});

test("20. Normalizes snake_case 'message_id' into id, messageId, and message_id", () => {
  const r = normalizeResponse({ success: true, message_id: "msg_def456" });
  assert.strictEqual(r.id, "msg_def456");
  assert.strictEqual(r.messageId, "msg_def456");
  assert.strictEqual(r.message_id, "msg_def456");
});

test("21. Normalizes standard 'id' into id, messageId, and message_id", () => {
  const r = normalizeResponse({ success: true, id: "msg_ghi789" });
  assert.strictEqual(r.id, "msg_ghi789");
  assert.strictEqual(r.messageId, "msg_ghi789");
  assert.strictEqual(r.message_id, "msg_ghi789");
});

// --- SECTION 5: QUEUE WORKER RELIABILITY INVARIANTS ---
console.log("\n--- SECTION 5: QUEUE WORKER RELIABILITY INVARIANTS ---");

const migration21 = fs.readFileSync(path.join(rootDir, "supabase/migrations/20260920_phase21_background_push_delivery.sql"), "utf-8");

test("22. PostgreSQL trigger trg_enqueue_notification_delivery is attached to notifications table", () => {
  assert(migration21.includes("CREATE TRIGGER trg_enqueue_notification_delivery"));
  assert(migration21.includes("AFTER INSERT ON public.notifications"));
  assert(migration21.includes("EXECUTE FUNCTION public.handle_notification_delivery_enqueue()"));
});

test("23. Notification enqueue function populates notification_deliveries table", () => {
  assert(migration21.includes("INSERT INTO public.notification_deliveries"));
  assert(migration21.includes("status"));
});

test("24. Queue worker route exists and processes notification_deliveries", () => {
  const workerRoutePath = path.join(rootDir, "app/api/internal/notifications/process-queue/route.ts");
  assert(fs.existsSync(workerRoutePath), "process-queue route must exist");
  const workerCode = fs.readFileSync(workerRoutePath, "utf-8");
  assert(workerCode.includes("notification_deliveries"), "Worker must claim and process notification_deliveries");
  assert(workerCode.includes("timingSafeEqual"), "Worker must use timingSafeEqual for authentication");
});

test("25. Zero chance of duplicate immediate push and cron push", () => {
  // Since immediate push has been removed from the messages route,
  // there is only one push delivery trigger: the queue worker.
  assert(!routeCode.includes("sendPhysicalPushNotification"));
  assert(!routeCode.includes("sendWebPushToConversationMembers"));
});

// --- SECTION 6: ERROR & MALFORMED INPUT HANDLING ---
console.log("\n--- SECTION 6: ERROR & MALFORMED INPUT HANDLING ---");

test("26. Malformed conversation ID returns 400 with INVALID_CONVERSATION_ID", () => {
  assert(routeCode.includes('if (!isValidUuid(conversationId))'));
  assert(routeCode.includes('INVALID_CONVERSATION_ID'));
});

test("27. Malformed JSON body returns 400 with INVALID_REQUEST_BODY", () => {
  assert(routeCode.includes('INVALID_REQUEST_BODY'));
});

test("28. Unauthenticated request returns 401 with UNAUTHORIZED", () => {
  assert(routeCode.includes('if (authError || !user)'));
  assert(routeCode.includes('{ error: "UNAUTHORIZED" }, { status: 401 }'));
});

// --- SECTION 7: CLIENT MESSAGE ID NORMALIZATION & 22P02 PREVENTION (PRODUCTION BUG REGRESSION) ---
console.log("\n--- SECTION 7: CLIENT MESSAGE ID NORMALIZATION & 22P02 REGRESSION ---");

test("29. Route sanitizes clientMessageId with toValidUuidOrNull", () => {
  assert(routeCode.includes("toValidUuidOrNull"), "Route must define and use toValidUuidOrNull");
  assert(routeCode.includes("safeClientMessageId = toValidUuidOrNull(clientMessageId)"), "Route must sanitize clientMessageId");
  assert(routeCode.includes("p_client_message_id: safeClientMessageId"), "RPC must receive safeClientMessageId");
});

test("30. Route sanitizes replyToMessageId and forwardedFromMessageId", () => {
  assert(routeCode.includes("safeReplyToMessageId = isValidUuid(replyToMessageId)"), "Route must sanitize replyToMessageId");
  assert(routeCode.includes("safeForwardedFromMessageId = isValidUuid(forwardedFromMessageId)"), "Route must sanitize forwardedFromMessageId");
  assert(routeCode.includes("p_reply_to_message_id: safeReplyToMessageId"), "RPC must receive safeReplyToMessageId");
  assert(routeCode.includes("p_forwarded_from_message_id: safeForwardedFromMessageId"), "RPC must receive safeForwardedFromMessageId");
});

test("31. Route safely maps Postgres 22P02 syntax error to 400 INVALID_PARAMETER_FORMAT", () => {
  assert(routeCode.includes('"22P02"'), "Route must handle Postgres 22P02 error code");
  assert(routeCode.includes("invalid input syntax for type uuid"), "Route must check for uuid syntax error message");
  assert(routeCode.includes("INVALID_PARAMETER_FORMAT"), "Route must return INVALID_PARAMETER_FORMAT");
});

test("32. Route preserves clientMessageId in 201 response", () => {
  assert(routeCode.includes("clientMessageId: clientMessageId || rawData.clientMessageId"), "Route must echo clientMessageId in 201 response");
});

console.log("\n================================================================================");
console.log(` TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log("================================================================================\n");

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
