/**
 * Heat Chat — Phase 5 Search & Saved Messages Test Suite
 */

import fs from "node:fs";

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${message}`);
  }
}

console.log("==================================================================");
console.log(" Heat Chat — Phase 5 Search & Saved Regression Test Suite");
console.log("==================================================================\n");

// ── 1. Schema & Column Reference Verification ─────────────────────────────────
console.log("--- 1. SQL Column Reference Invariant Check ---");
const searchSql = fs.readFileSync("supabase/migrations/20260904_search_saved_mentions.sql", "utf-8");
const fixSql = fs.readFileSync("supabase/migrations/20260905_fix_search_saved_column_references.sql", "utf-8");

assert(
  !searchSql.includes("c.conversation_type"),
  "20260904_search_saved_mentions.sql does NOT contain invalid c.conversation_type"
);
assert(
  searchSql.includes("c.type::text as conversation_type"),
  "20260904_search_saved_mentions.sql correctly selects c.type::text as conversation_type"
);
assert(
  fixSql.includes("c.type::text as conversation_type"),
  "20260905_fix_search_saved_column_references.sql defines c.type::text as conversation_type"
);

const blockSql = fs.readFileSync("supabase/migrations/20260831_messaging_block_enforcement.sql", "utf-8");
assert(
  !blockSql.includes("c.conversation_type = 'direct'"),
  "20260831_messaging_block_enforcement.sql does NOT contain invalid c.conversation_type"
);
assert(
  blockSql.includes("c.type = 'direct'"),
  "20260831_messaging_block_enforcement.sql correctly checks c.type = 'direct'"
);

// ── 2. use-search.ts Architecture Verification ────────────────────────────────
console.log("\n--- 2. use-search Hook Stability & Guard Check ---");
const useSearchContent = fs.readFileSync("hooks/use-search.ts", "utf-8");

assert(
  useSearchContent.includes("const handleSetActiveCategory = React.useCallback"),
  "use-search defines handleSetActiveCategory with stable useCallback reference"
);
assert(
  useSearchContent.includes("const handleSetFilters = React.useCallback"),
  "use-search defines handleSetFilters with stable useCallback reference"
);
assert(
  useSearchContent.includes("trimmed.length >= 2"),
  "use-search prevents firing short query searches (<2 chars) to /api/search/messages and /api/search/people"
);
assert(
  useSearchContent.includes("searchTimeoutRef.current = setTimeout"),
  "use-search debounces user input with searchTimeoutRef"
);

// ── 3. API Route Query Validation ─────────────────────────────────────────────
console.log("\n--- 3. Search API Route Validation ---");
const searchMessagesRoute = fs.readFileSync("app/api/search/messages/route.ts", "utf-8");
assert(
  searchMessagesRoute.includes("SEARCH_QUERY_TOO_SHORT"),
  "app/api/search/messages/route.ts defines SEARCH_QUERY_TOO_SHORT error code for short standalone queries"
);

const searchMediaRoute = fs.readFileSync("app/api/search/media/route.ts", "utf-8");
assert(
  searchMediaRoute.includes("INVALID_CATEGORY"),
  "app/api/search/media/route.ts validates category against allowed enum values"
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log("\n==================================================================");
console.log(` Results: ${passed} Passed, ${failed} Failed`);
console.log("==================================================================");

if (failed > 0) {
  process.exit(1);
} else {
  console.log("🎉 ALL SEARCH & SAVED REGRESSION TESTS PASSED!\n");
}
