/**
 * HEAT CHAT — PHASE 16 & 17 NOTIFICATION MIGRATION SYNTAX & INTEGRITY VERIFICATION SUITE
 *
 * Verifies 15+ critical database migration invariants:
 * 1. No invalid GET DIAGNOSTICS ... FOUND usage in any migration.
 * 2. All required Phase 16 RPC names exist in the migration.
 * 3. Required notification indexes exist in the migration.
 * 4. Required dedupe behavior exists (ON CONFLICT ... DO NOTHING).
 * 5. SECURITY DEFINER is present on all functions.
 * 6. search_path hardening (SET search_path = public, pg_temp) is present on all functions.
 * 7. No public notification payload persistence is introduced (localStorage/sessionStorage/IndexedDB).
 * 8. Cursor pagination exists with deterministic tie-breaking (created_at DESC, id DESC).
 * 9. Authoritative notification unread-count RPC exists.
 * 10. Migration contains safe function replacement logic where signatures conflict (DROP FUNCTION IF EXISTS with argument types).
 * 11. No COMMIT appears inside the migration.
 * 12. No accidental destructive DROP TABLE statements exist.
 * 13. No DROP FUNCTION without explicit argument types.
 * 14. No unbounded notification query is introduced (clamped pagination limits).
 * 15. Required compatibility columns are handled (user_id/recipient_id, data/metadata, read_at/is_read, type/event_type, sender_id/actor_id).
 */

import fs from "node:fs";
import path from "node:path";
import assert from "node:assert";

console.log("===============================================================================");
console.log("HEAT CHAT — PHASE 16 MIGRATION SYNTAX & INVARIANT VERIFICATION SUITE");
console.log("Timestamp:", new Date().toISOString());
console.log("===============================================================================\n");

let passed = 0;
let failed = 0;
const errors = [];

function check(testNum, testName, fn) {
  try {
    fn();
    console.log(`  ✅ [Assertion ${String(testNum).padStart(2, "0")}] ${testName}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL: Assertion ${String(testNum).padStart(2, "0")}] ${testName}`);
    console.error(`     Error: ${err.message}`);
    errors.push({ testNum, testName, error: err.message });
    failed++;
  }
}

const rootDir = process.cwd();

const phase16MigrationPath = path.join(rootDir, "supabase/migrations/20260913_phase16_notification_hardening.sql");
const phase17MigrationPath = path.join(rootDir, "supabase/migrations/20260914_phase17_notification_delivery_hardening.sql");

const phase16Sql = fs.readFileSync(phase16MigrationPath, "utf-8");
const phase17Sql = fs.readFileSync(phase17MigrationPath, "utf-8");
const allMigrationFiles = fs.readdirSync(path.join(rootDir, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .map((f) => ({
    name: f,
    content: fs.readFileSync(path.join(rootDir, "supabase/migrations", f), "utf-8"),
  }));

// Client-side code files for privacy & persistence checks
const clientFiles = [
  path.join(rootDir, "hooks/use-notifications.ts"),
  path.join(rootDir, "components/notifications/notification-center.tsx"),
  path.join(rootDir, "components/notifications/notification-toast.tsx"),
  path.join(rootDir, "components/notifications/notification-provider.tsx"),
  path.join(rootDir, "lib/notifications/dispatcher.ts"),
  path.join(rootDir, "public/sw.js"),
].map((p) => fs.readFileSync(p, "utf-8"));

// -----------------------------------------------------------------------------
// ASSERTION 1: No invalid GET DIAGNOSTICS ... FOUND usage across any migration
// -----------------------------------------------------------------------------
check(1, "No invalid GET DIAGNOSTICS ... FOUND usage in any migration file", () => {
  const invalidRegex = /GET\s+DIAGNOSTICS\s+[^;]*=\s*FOUND/i;
  for (const file of allMigrationFiles) {
    assert(
      !invalidRegex.test(file.content),
      `Found invalid 'GET DIAGNOSTICS ... FOUND' in migration: ${file.name}`
    );
  }
  // Also verify Phase 16 and 17 specifically do not contain GET DIAGNOSTICS ... FOUND
  assert(!invalidRegex.test(phase16Sql), "Phase 16 migration contains GET DIAGNOSTICS ... FOUND");
  assert(!invalidRegex.test(phase17Sql), "Phase 17 migration contains GET DIAGNOSTICS ... FOUND");
  // Verify FOUND is handled via assignment or boolean logic (e.g. := FOUND or IF FOUND)
  assert(phase16Sql.includes("v_updated := FOUND;"), "Phase 16 should use v_updated := FOUND;");
  assert(phase17Sql.includes("v_found := FOUND;"), "Phase 17 should use v_found := FOUND;");
});

// -----------------------------------------------------------------------------
// ASSERTION 2: All required Phase 16 RPC names exist in the migration
// -----------------------------------------------------------------------------
check(2, "All required Phase 16 RPC names exist in the migration", () => {
  const requiredRpcs = [
    "create_notification",
    "mark_notification_read",
    "mark_all_notifications_read",
    "get_notification_unread_count",
    "get_user_notifications_cursor",
  ];
  for (const rpc of requiredRpcs) {
    assert(
      phase16Sql.includes(`public.${rpc}`) || phase16Sql.includes(`FUNCTION public.${rpc}`),
      `Missing required RPC: ${rpc} in Phase 16 migration`
    );
  }
  // Also check compatibility aliases
  assert(phase16Sql.includes("mark_notification_as_read"), "Missing compatibility RPC: mark_notification_as_read");
  assert(phase16Sql.includes("mark_all_notifications_as_read"), "Missing compatibility RPC: mark_all_notifications_as_read");
});

// -----------------------------------------------------------------------------
// ASSERTION 3: Required notification indexes exist in the migration
// -----------------------------------------------------------------------------
check(3, "Required notification indexes exist in the migration", () => {
  assert(
    phase16Sql.includes("public.notifications(recipient_id, dedupe_key)") &&
    phase16Sql.includes("WHERE dedupe_key IS NOT NULL"),
    "Missing unique index on (recipient_id, dedupe_key)"
  );
  assert(
    phase16Sql.includes("public.notifications(user_id, dedupe_key)") &&
    phase16Sql.includes("WHERE dedupe_key IS NOT NULL"),
    "Missing unique index on (user_id, dedupe_key)"
  );
  assert(
    phase16Sql.includes("public.notifications(recipient_id, created_at DESC)"),
    "Missing index on (recipient_id, created_at DESC)"
  );
});

// -----------------------------------------------------------------------------
// ASSERTION 4: Required dedupe behavior exists
// -----------------------------------------------------------------------------
check(4, "Required dedupe behavior exists (ON CONFLICT DO NOTHING with dedupe_key)", () => {
  assert(
    phase16Sql.includes("ON CONFLICT (recipient_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING"),
    "Missing ON CONFLICT (recipient_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING"
  );
  assert(
    phase16Sql.includes("v_dedupe_key"),
    "Missing deterministic dedupe_key generation in create_notification"
  );
});

// -----------------------------------------------------------------------------
// ASSERTION 5: SECURITY DEFINER is present on all RPCs
// -----------------------------------------------------------------------------
check(5, "SECURITY DEFINER is present on all functions", () => {
  const functionDefinitions = phase16Sql.match(/CREATE (?:OR REPLACE )?FUNCTION public\.\w+/g) || [];
  assert(functionDefinitions.length >= 8, `Expected at least 8 functions in Phase 16, found ${functionDefinitions.length}`);

  const securityDefinerCount = (phase16Sql.match(/SECURITY DEFINER/g) || []).length;
  assert(
    securityDefinerCount >= functionDefinitions.length,
    `SECURITY DEFINER count (${securityDefinerCount}) does not match function count (${functionDefinitions.length})`
  );
});

// -----------------------------------------------------------------------------
// ASSERTION 6: search_path hardening is present on all functions
// -----------------------------------------------------------------------------
check(6, "search_path hardening (SET search_path = public, pg_temp) is present on all functions", () => {
  const functionCount = (phase16Sql.match(/CREATE (?:OR REPLACE )?FUNCTION public\.\w+/g) || []).length;
  const searchPathCount = (phase16Sql.match(/SET search_path = public, pg_temp/g) || []).length;
  assert(
    searchPathCount >= functionCount,
    `search_path hardening count (${searchPathCount}) does not match function count (${functionCount})`
  );
});

// -----------------------------------------------------------------------------
// ASSERTION 7: No public notification payload persistence is introduced
// -----------------------------------------------------------------------------
check(7, "No public notification payload persistence in client code (zero localStorage/sessionStorage/IndexedDB caching)", () => {
  for (const content of clientFiles) {
    assert(
      !content.includes('localStorage.setItem("notifications"'),
      "Detected persistent notification payload caching in localStorage"
    );
    assert(
      !content.includes('sessionStorage.setItem("notifications"'),
      "Detected persistent notification payload caching in sessionStorage"
    );
    assert(
      !content.includes('indexedDB.open("notifications"'),
      "Detected persistent notification payload caching in IndexedDB"
    );
  }
});

// -----------------------------------------------------------------------------
// ASSERTION 8: Cursor pagination exists with deterministic ordering
// -----------------------------------------------------------------------------
check(8, "Cursor pagination exists with deterministic ordering (created_at DESC, id DESC)", () => {
  assert(
    phase16Sql.includes("ORDER BY n.created_at DESC, n.id DESC"),
    "Missing deterministic pagination order: ORDER BY n.created_at DESC, n.id DESC"
  );
  assert(
    phase16Sql.includes("(n.created_at, n.id) < (p_cursor_created_at, p_cursor_id)"),
    "Missing composite cursor comparison: (n.created_at, n.id) < (p_cursor_created_at, p_cursor_id)"
  );
  assert(
    phase16Sql.includes("next_cursor"),
    "Missing next_cursor object generation"
  );
});

// -----------------------------------------------------------------------------
// ASSERTION 9: Notification unread-count RPC exists
// -----------------------------------------------------------------------------
check(9, "Notification unread-count RPC exists with authoritative count", () => {
  assert(
    phase16Sql.includes("CREATE OR REPLACE FUNCTION public.get_notification_unread_count()"),
    "Missing get_notification_unread_count function definition"
  );
  assert(
    phase16Sql.includes("RETURNS integer"),
    "get_notification_unread_count must return integer"
  );
  assert(
    phase16Sql.includes("AND (read_at IS NULL OR is_read = false)"),
    "get_notification_unread_count must check both read_at IS NULL and is_read = false"
  );
});

// -----------------------------------------------------------------------------
// ASSERTION 10: Migration contains safe function replacement logic where signatures conflict
// -----------------------------------------------------------------------------
check(10, "Migration contains safe DROP FUNCTION IF EXISTS with explicit argument types before recreation", () => {
  const expectedDropFunctions = [
    "DROP FUNCTION IF EXISTS public.create_notification(uuid, text, text, text, uuid, uuid, uuid, jsonb, text);",
    "DROP FUNCTION IF EXISTS public.mark_notification_read(uuid);",
    "DROP FUNCTION IF EXISTS public.mark_notification_as_read(uuid);",
    "DROP FUNCTION IF EXISTS public.mark_all_notifications_read();",
    "DROP FUNCTION IF EXISTS public.mark_all_notifications_as_read();",
    "DROP FUNCTION IF EXISTS public.get_notification_unread_count();",
    "DROP FUNCTION IF EXISTS public.get_user_notifications_cursor(integer, timestamp with time zone, uuid, text);",
    "DROP FUNCTION IF EXISTS public.send_friend_request(uuid);",
    "DROP FUNCTION IF EXISTS public.accept_friend_request(uuid);",
    "DROP FUNCTION IF EXISTS public.toggle_message_reaction(uuid, text);",
  ];
  for (const dropStmt of expectedDropFunctions) {
    assert(
      phase16Sql.includes(dropStmt),
      `Missing safe replacement drop statement: ${dropStmt}`
    );
  }
});

// -----------------------------------------------------------------------------
// ASSERTION 11: No COMMIT appears inside the migration
// -----------------------------------------------------------------------------
check(11, "No COMMIT appears inside the migration", () => {
  const commitMatch = phase16Sql.match(/\bCOMMIT\b/i);
  assert(!commitMatch, "Phase 16 migration must not contain manual COMMIT statements");
  const commit17Match = phase17Sql.match(/\bCOMMIT\b/i);
  assert(!commit17Match, "Phase 17 migration must not contain manual COMMIT statements");
});

// -----------------------------------------------------------------------------
// ASSERTION 12: No accidental destructive DROP TABLE statements exist
// -----------------------------------------------------------------------------
check(12, "No accidental destructive DROP TABLE statements exist", () => {
  assert(!/\bDROP\s+TABLE\b/i.test(phase16Sql), "Destructive DROP TABLE statement found in Phase 16 migration");
  assert(!/\bDROP\s+TABLE\b/i.test(phase17Sql), "Destructive DROP TABLE statement found in Phase 17 migration");
});

// -----------------------------------------------------------------------------
// ASSERTION 13: No DROP FUNCTION without explicit argument types
// -----------------------------------------------------------------------------
check(13, "No DROP FUNCTION without explicit argument types", () => {
  const dropFunctionMatches = phase16Sql.match(/DROP\s+FUNCTION(?:\s+IF\s+EXISTS)?\s+[^(;]+;/gi) || [];
  assert.strictEqual(
    dropFunctionMatches.length,
    0,
    `Found unqualified DROP FUNCTION without argument types: ${dropFunctionMatches.join(", ")}`
  );
});

// -----------------------------------------------------------------------------
// ASSERTION 14: No unbounded notification query is introduced
// -----------------------------------------------------------------------------
check(14, "No unbounded notification query is introduced (clamped pagination limit)", () => {
  assert(
    phase16Sql.includes("v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 25), 50));"),
    "Missing limit clamping in get_user_notifications_cursor (must be bounded to max 50)"
  );
  assert(
    phase16Sql.includes("LIMIT v_limit + 1"),
    "Pagination must use bounded LIMIT v_limit + 1"
  );
});

// -----------------------------------------------------------------------------
// ASSERTION 15: Required compatibility columns are handled
// -----------------------------------------------------------------------------
check(15, "Required compatibility columns are handled and synchronized", () => {
  // Check column additions
  assert(phase16Sql.includes("ADD COLUMN IF NOT EXISTS recipient_id uuid"), "Missing recipient_id column addition");
  assert(phase16Sql.includes("ADD COLUMN IF NOT EXISTS is_read boolean"), "Missing is_read column addition");
  assert(phase16Sql.includes("ADD COLUMN IF NOT EXISTS metadata jsonb"), "Missing metadata column addition");

  // Check synchronization trigger
  assert(phase16Sql.includes("CREATE OR REPLACE FUNCTION public.sync_notifications_columns()"), "Missing sync trigger function");
  assert(phase16Sql.includes("NEW.user_id := NEW.recipient_id;"), "Missing user_id <-> recipient_id sync");
  assert(phase16Sql.includes("NEW.data := NEW.metadata;"), "Missing data <-> metadata sync");
  assert(phase16Sql.includes("NEW.is_read := true;"), "Missing read_at <-> is_read sync");
  assert(phase16Sql.includes("NEW.event_type := NEW.type;"), "Missing type <-> event_type sync");
  assert(phase16Sql.includes("NEW.actor_id := NEW.sender_id;"), "Missing sender_id <-> actor_id sync");
});

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log("\n===============================================================================");
console.log(`VERIFICATION COMPLETE: ${passed} Passed, ${failed} Failed`);
console.log("===============================================================================\n");

if (failed > 0) {
  console.error("Failure Summary:");
  errors.forEach((e) => console.error(`  - Assertion ${e.testNum}: ${e.testName} => ${e.error}`));
  process.exit(1);
} else {
  console.log("All Phase 16 migration syntax, RPC, security, and idempotency assertions passed!\n");
  process.exit(0);
}
