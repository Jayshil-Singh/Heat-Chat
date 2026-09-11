import fs from "node:fs";
import path from "node:path";
import assert from "node:assert";
import ts from "typescript";

console.log("================================================================================");
console.log(" CHAT MESSAGE DATE FORMATTING & TIMESTAMP NORMALIZATION REGRESSION SUITE");
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

// ── Dynamically load lib/utils/date.ts using TypeScript transpileModule ────────
const rootDir = process.cwd();
const dateUtilsTsPath = path.join(rootDir, "lib/utils/date.ts");
const dateUtilsTsCode = fs.readFileSync(dateUtilsTsPath, "utf-8");

const transpiled = ts.transpileModule(dateUtilsTsCode, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});

const dateUtils = await import("data:text/javascript," + encodeURIComponent(transpiled.outputText));
const {
  parseMessageDate,
  formatMessageTime,
  formatDateSeparator,
  formatRelativeTime,
  extractMessageTimestamp,
  normalizeMessageTimestamps,
} = dateUtils;

// ── SECTION 1: CORE UNIT REGRESSION TESTS (ALL 12 REQUIRED SCENARIOS) ─────────
console.log("--- SECTION 1: REQUIRED REGRESSION SCENARIOS (1 to 12) ---");

// 1. ISO timestamp: 2026-09-10T08:14:52.160Z
test("1. ISO timestamp (2026-09-10T08:14:52.160Z) parses correctly and formats without 'Invalid Date'", () => {
  const iso = "2026-09-10T08:14:52.160Z";
  const date = parseMessageDate(iso);
  assert(date instanceof Date, "Must return a Date object");
  assert(!Number.isNaN(date.getTime()), "Must have valid timestamp");
  assert.strictEqual(date.toISOString(), iso);

  const formattedTime = formatMessageTime(iso);
  assert(formattedTime !== "Invalid Date", "Must not format as Invalid Date");
  assert(formattedTime.length > 0, "Must format non-empty time");

  const separator = formatDateSeparator(iso);
  assert(separator !== "Invalid Date", "Must not format separator as Invalid Date");
  assert(separator.length > 0, "Must format non-empty separator");
});

// 2. created_at database field (snake_case object input)
test("2. created_at database field extracts correctly and formats time without 'Invalid Date'", () => {
  const dbMsg = {
    id: "msg-123",
    content: "Hello from DB",
    created_at: "2026-09-10T08:14:52.160Z",
  };
  const extracted = extractMessageTimestamp(dbMsg);
  assert.strictEqual(extracted, "2026-09-10T08:14:52.160Z");

  const formattedTime = formatMessageTime(dbMsg.created_at);
  assert(formattedTime !== "Invalid Date", "Must not return Invalid Date");
  assert(!formattedTime.includes("Invalid"), "No substring of Invalid allowed");
});

// 3. createdAt frontend field (camelCase object input)
test("3. createdAt frontend field extracts correctly and formats time without 'Invalid Date'", () => {
  const frontMsg = {
    id: "msg-456",
    content: "Hello from Frontend",
    createdAt: "2026-09-10T08:14:52.160Z",
  };
  const extracted = extractMessageTimestamp(frontMsg);
  assert.strictEqual(extracted, "2026-09-10T08:14:52.160Z");

  const formattedTime = formatMessageTime(frontMsg.createdAt);
  assert(formattedTime !== "Invalid Date", "Must not return Invalid Date");
  assert(formattedTime.length > 0, "Time must not be empty");
});

// 4. Unix seconds (< 1e12, e.g. 1789086755)
test("4. Unix seconds (< 1e12) converts to milliseconds and formats valid time", () => {
  const unixSec = 1789086755; // seconds
  const date = parseMessageDate(unixSec);
  assert(date instanceof Date, "Must return Date object");
  assert.strictEqual(date.getTime(), unixSec * 1000);

  const formattedTime = formatMessageTime(unixSec);
  assert(formattedTime !== "Invalid Date", "Must not return Invalid Date for unix seconds");
  assert(formattedTime !== "Just now", "Should format actual time for valid unix timestamp");
});

// 5. Unix milliseconds (>= 1e12, e.g. 1789086755000)
test("5. Unix milliseconds (>= 1e12) parses directly and formats valid time", () => {
  const unixMs = 1789086755000; // milliseconds
  const date = parseMessageDate(unixMs);
  assert(date instanceof Date, "Must return Date object");
  assert.strictEqual(date.getTime(), unixMs);

  const formattedTime = formatMessageTime(unixMs);
  assert(formattedTime !== "Invalid Date", "Must not return Invalid Date for unix ms");
});

// 6. null input
test("6. null input returns null Date and safely falls back to 'Just now' / 'Today'", () => {
  assert.strictEqual(parseMessageDate(null), null, "parseMessageDate(null) must return null");
  assert.strictEqual(formatMessageTime(null), "Just now", "formatMessageTime(null) must return 'Just now'");
  assert.strictEqual(formatDateSeparator(null), "Today", "formatDateSeparator(null) must return 'Today'");
  assert.strictEqual(formatRelativeTime(null), "", "formatRelativeTime(null) must return ''");
});

// 7. undefined input
test("7. undefined input returns null Date and safely falls back to 'Just now' / 'Today'", () => {
  assert.strictEqual(parseMessageDate(undefined), null, "parseMessageDate(undefined) must return null");
  assert.strictEqual(formatMessageTime(undefined), "Just now", "formatMessageTime(undefined) must return 'Just now'");
  assert.strictEqual(formatDateSeparator(undefined), "Today", "formatDateSeparator(undefined) must return 'Today'");
  assert.strictEqual(formatRelativeTime(undefined), "", "formatRelativeTime(undefined) must return ''");
});

// 8. Malformed timestamps (invalid strings, NaN, non-date values)
test("8. Malformed timestamps never throw and never return 'Invalid Date'", () => {
  const malformedInputs = [
    "invalid-date-string",
    "",
    "   ",
    "undefined",
    "null",
    NaN,
    Infinity,
    -Infinity,
    {},
    [],
    "2026-99-99T99:99:99Z",
  ];

  for (const input of malformedInputs) {
    const parsed = parseMessageDate(input);
    assert.strictEqual(parsed, null, `parseMessageDate(${JSON.stringify(input)}) must return null`);

    const time = formatMessageTime(input);
    assert.strictEqual(time, "Just now", `formatMessageTime(${JSON.stringify(input)}) must return 'Just now'`);
    assert(time !== "Invalid Date", "Must NEVER return 'Invalid Date'");

    const sep = formatDateSeparator(input);
    assert.strictEqual(sep, "Today", `formatDateSeparator(${JSON.stringify(input)}) must return 'Today'`);
    assert(sep !== "Invalid Date", "Must NEVER return 'Invalid Date'");

    const rel = formatRelativeTime(input);
    assert.strictEqual(rel, "", `formatRelativeTime(${JSON.stringify(input)}) must return ''`);
  }
});

// 9. Date separator formatting (Today, Yesterday, and Calendar Dates)
test("9. Date separator formatting distinguishes Today, Yesterday, and past dates", () => {
  const today = new Date();
  assert.strictEqual(formatDateSeparator(today), "Today", "Current date must be 'Today'");
  assert.strictEqual(formatDateSeparator(today.toISOString()), "Today", "Current ISO must be 'Today'");

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  assert.strictEqual(formatDateSeparator(yesterday), "Yesterday", "Yesterday's date must be 'Yesterday'");
  assert.strictEqual(formatDateSeparator(yesterday.toISOString()), "Yesterday", "Yesterday ISO must be 'Yesterday'");

  const olderDate = new Date(2025, 0, 15, 12, 0, 0);
  const olderSep = formatDateSeparator(olderDate);
  assert(olderSep.includes("Jan") && olderSep.includes("15"), "Older date must format with Month and Day");
  assert(olderSep !== "Invalid Date", "Must not return 'Invalid Date'");
});

// 10. Existing persisted messages (simulating DB query with only created_at)
test("10. Existing persisted messages with only created_at normalize and format correctly", () => {
  const dbPersistedMsg = {
    id: "d48c4fa7-e342-45ae-9bfc-bd028149eba0",
    conversation_id: "conv-1",
    sender_id: "user-1",
    content: "Persisted message from database",
    created_at: "2026-09-10T08:14:52.160Z",
    updated_at: "2026-09-10T08:14:52.160Z",
    deleted_at: null,
  };

  const normalized = normalizeMessageTimestamps(dbPersistedMsg);
  assert.strictEqual(normalized.createdAt, "2026-09-10T08:14:52.160Z", "Must populate createdAt");
  assert.strictEqual(normalized.created_at, "2026-09-10T08:14:52.160Z", "Must preserve created_at");

  const formattedTime = formatMessageTime(normalized.createdAt ?? normalized.created_at);
  assert(formattedTime !== "Invalid Date", "Persisted message must format valid time");
  assert(formattedTime.length > 0);

  const formattedSep = formatDateSeparator(normalized.createdAt ?? normalized.created_at);
  assert(formattedSep !== "Invalid Date", "Persisted message separator must be valid");
});

// 11. Newly sent messages (simulating RPC return with only createdAt camelCase)
test("11. Newly sent messages with only createdAt normalize and format correctly", () => {
  const rpcReturnMsg = {
    id: "new-msg-uuid",
    messageId: "new-msg-uuid",
    conversationId: "conv-1",
    senderId: "user-me",
    content: "Newly sent message via RPC",
    createdAt: "2026-09-11T00:45:00.000Z",
  };

  const normalized = normalizeMessageTimestamps(rpcReturnMsg);
  assert.strictEqual(normalized.createdAt, "2026-09-11T00:45:00.000Z", "Must preserve createdAt");
  assert.strictEqual(normalized.created_at, "2026-09-11T00:45:00.000Z", "Must populate created_at");

  const formattedTime = formatMessageTime(normalized.createdAt ?? normalized.created_at);
  assert(formattedTime !== "Invalid Date", "Newly sent message must format valid time");
  assert(formattedTime.length > 0);
});

// 12. Optimistic messages before server reconciliation
test("12. Optimistic messages before server reconciliation render immediate valid time", () => {
  const nowIso = new Date().toISOString();
  const optimisticMsg = {
    id: "temp-1789086755000",
    tempId: "temp-1789086755000",
    conversation_id: "conv-1",
    sender_id: "user-me",
    content: "Sending this now...",
    status: "sending",
    created_at: nowIso,
    createdAt: nowIso,
    updated_at: nowIso,
    deleted_at: null,
  };

  const formattedTime = formatMessageTime(optimisticMsg.createdAt ?? optimisticMsg.created_at);
  assert(formattedTime !== "Invalid Date", "Optimistic message must show valid time immediately");
  assert(formattedTime.length > 0);

  const formattedSep = formatDateSeparator(optimisticMsg.createdAt ?? optimisticMsg.created_at);
  assert.strictEqual(formattedSep, "Today", "Optimistic message created today must show 'Today'");

  // Simulate reconciliation merge in state
  const serverResponse = {
    id: "reconciled-uuid-999",
    createdAt: nowIso,
    // Database returns camelCase or snake_case
  };

  const reconciled = {
    ...optimisticMsg,
    ...serverResponse,
    createdAt: serverResponse.createdAt || optimisticMsg.createdAt,
    created_at: serverResponse.created_at || optimisticMsg.created_at,
  };

  assert.strictEqual(reconciled.createdAt, nowIso);
  assert.strictEqual(reconciled.created_at, nowIso);
  assert(formatMessageTime(reconciled.createdAt) !== "Invalid Date");
});

// ── SECTION 2: CODEBASE ARCHITECTURAL & DEFENSIVE INVARIANTS ─────────────────
console.log("\n--- SECTION 2: CODEBASE CONTRACTS & DEFENSIVE RENDERING INVARIANTS ---");

const routePath = path.join(rootDir, "app/api/conversations/[id]/messages/route.ts");
const routeCode = fs.readFileSync(routePath, "utf-8");

test("13. Route GET handler populates both createdAt and created_at on all returned messages", () => {
  assert(routeCode.includes("createdAt: canonicalCreatedAt"), "GET must attach createdAt");
  assert(routeCode.includes("created_at: canonicalCreatedAt"), "GET must attach created_at");
});

test("14. Route POST handler populates both createdAt and created_at on success response", () => {
  assert(routeCode.includes("createdAt: canonicalCreatedAt,"), "POST must return createdAt");
  assert(routeCode.includes("created_at: canonicalCreatedAt,"), "POST must return created_at");
});

const useMessagesPath = path.join(rootDir, "hooks/use-messages.ts");
const useMessagesCode = fs.readFileSync(useMessagesPath, "utf-8");

test("15. useMessages enrichMessages attaches both createdAt and created_at", () => {
  assert(useMessagesCode.includes("createdAt: canonicalCreatedAt"), "enrichMessages must attach createdAt");
  assert(useMessagesCode.includes("created_at: canonicalCreatedAt"), "enrichMessages must attach created_at");
});

test("16. useMessages optimisticMessage initializes both createdAt and created_at", () => {
  assert(useMessagesCode.includes("createdAt: nowIso"), "optimisticMessage must set createdAt");
  assert(useMessagesCode.includes("created_at: nowIso"), "optimisticMessage must set created_at");
});

test("17. useMessages state reconciliation preserves both createdAt and created_at", () => {
  assert(
    useMessagesCode.includes("createdAt: insertedMsg.createdAt || m.createdAt || m.created_at"),
    "State reconciliation must preserve createdAt"
  );
  assert(
    useMessagesCode.includes("created_at: insertedMsg.created_at || m.created_at || m.createdAt"),
    "State reconciliation must preserve created_at"
  );
});

const feedPath = path.join(rootDir, "components/chat/message-feed.tsx");
const feedCode = fs.readFileSync(feedPath, "utf-8");

test("18. message-feed.tsx imports formatDateSeparator from @/lib/utils/date", () => {
  assert(feedCode.includes('import { formatDateSeparator'), "message-feed must import formatDateSeparator from date.ts");
});

test("19. message-feed.tsx uses canonical timestamp fallback (createdAt ?? created_at)", () => {
  assert(
    feedCode.includes("group.items[0]?.createdAt ?? group.items[0]?.created_at"),
    "message-feed must check createdAt ?? created_at for separator"
  );
  assert(
    feedCode.includes("msg.createdAt ?? msg.created_at"),
    "message-feed must check msg.createdAt ?? msg.created_at for grouping"
  );
});

const itemPath = path.join(rootDir, "components/chat/message-item.tsx");
const itemCode = fs.readFileSync(itemPath, "utf-8");

test("20. message-item.tsx imports formatMessageTime from @/lib/utils/date", () => {
  assert(itemCode.includes('import { formatMessageTime'), "message-item must import formatMessageTime from date.ts");
});

test("21. message-item.tsx formats time using message.createdAt ?? message.created_at", () => {
  assert(
    itemCode.includes("formatMessageTime(message.createdAt ?? message.created_at)"),
    "message-item must pass canonical timestamp to formatMessageTime"
  );
});

const convListPath = path.join(rootDir, "components/chat/conversation-list.tsx");
const convListCode = fs.readFileSync(convListPath, "utf-8");

test("22. conversation-list.tsx uses safe formatRelativeTime from @/lib/utils/date", () => {
  assert(
    convListCode.includes('import { formatRelativeTime } from "@/lib/utils/date"'),
    "conversation-list must import shared safe formatRelativeTime"
  );
  assert(!convListCode.includes("function formatRelativeTime("), "Local unsafe formatRelativeTime must be removed");
});

// ── FINAL SUMMARY ─────────────────────────────────────────────────────────────
console.log("\n================================================================================");
console.log(` RESULTS: ${passed} passed, ${failed} failed (${passed + failed} total)`);
console.log("================================================================================");

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
