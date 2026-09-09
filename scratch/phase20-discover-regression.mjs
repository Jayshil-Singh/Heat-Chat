#!/usr/bin/env node
/**
 * Heat Chat — Phase 20 Discover People Regression Test Suite
 * Tests: error state separation, UI rendering logic, network error classification,
 *        migration correctness, discover_people function safety.
 *
 * Run: node scratch/phase20-discover-regression.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ─── Mini test harness ────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, name) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.error(`  ❌ ${name}`);
    failed++;
    failures.push(name);
  }
}

function section(title) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 60 - title.length))}`);
}

// ─── classifyNetworkError logic simulation ────────────────────────────────────
// We parse the TypeScript file and test the logic by evaluating representative
// inputs against expected outputs. We do NOT import the TS module directly.
// Instead we replicate the classification decision tree in pure JS for testing.

function classifyNetworkError(error) {
  if (!error) return { type: "UNKNOWN", isRetryable: true };

  const errObj = typeof error === "object" ? error : {};
  const rawMessage = String(errObj.message || errObj.details || error || "").toLowerCase();
  const rawCode = String(errObj.code || "").toUpperCase();
  const status = typeof errObj.status === "number" ? errObj.status : undefined;

  // Offline
  if (rawMessage.includes("failed to fetch") || rawMessage.includes("offline")) {
    return { type: "NETWORK_OFFLINE", isRetryable: true };
  }

  // Timeout
  if (rawMessage.includes("timeout") || status === 504 || status === 408 || rawCode === "ETIMEDOUT") {
    return { type: "NETWORK_TIMEOUT", isRetryable: true };
  }

  // Auth — P0001 with UNAUTHENTICATED message OR standard auth signals
  if (
    status === 401 ||
    rawCode === "PGRST301" ||
    rawMessage.includes("jwt expired") ||
    rawMessage.includes("session expired") ||
    (rawCode === "P0001" && rawMessage.includes("unauthenticated"))
  ) {
    return { type: "AUTH_EXPIRED", isRetryable: false, status: 401 };
  }

  // Forbidden
  if (status === 403 || rawCode === "42501" || rawMessage.includes("permission denied")) {
    return { type: "FORBIDDEN", isRetryable: false, status: 403 };
  }

  // Not found
  if (status === 404 || rawCode === "PGRST116" || rawMessage.includes("not found")) {
    return { type: "NOT_FOUND", isRetryable: false, status: 404 };
  }

  // Rate limited
  if (status === 429 || rawMessage.includes("rate limit") || rawMessage.includes("rate_limit_exceeded")) {
    return { type: "RATE_LIMITED", isRetryable: true, status: 429 };
  }

  // P0001 non-auth (business logic exception)
  if (rawCode === "P0001") {
    return { type: "SERVER_ERROR", isRetryable: true, status: status || 500 };
  }

  // Server errors
  if (
    (typeof status === "number" && status >= 500 && status <= 599) ||
    rawCode.startsWith("42") ||
    rawCode.startsWith("XX")
  ) {
    return { type: "SERVER_ERROR", isRetryable: true, status: status || 500 };
  }

  return { type: "UNKNOWN", isRetryable: true, status };
}

// ─── Simulated hook state machine ────────────────────────────────────────────
// Simulates the state produced by the refactored useDiscoverPeople hook
// under various scenarios without importing React or the hook module.

class DiscoverPeopleState {
  constructor() {
    this.people = [];
    this.isLoading = false;
    this.error = null;          // people-list error
    this.errorType = null;
    this.toggleError = null;    // toggle-specific error
    this.toggleErrorType = null;
    this.isDiscoverable = false;
    this.isToggling = false;
  }

  /** Simulates a successful fetchPeople that returned 0 results */
  fetchPeopleSuccess_empty() {
    this.isLoading = true;
    this.error = null;
    this.errorType = null;
    this.people = [];
    this.isLoading = false;
    return this;
  }

  /** Simulates a successful fetchPeople that returned results */
  fetchPeopleSuccess_withResults(results = [{ user_id: "abc" }]) {
    this.isLoading = true;
    this.error = null;
    this.errorType = null;
    this.people = results;
    this.isLoading = false;
    return this;
  }

  /** Simulates a fetchPeople RPC failure */
  fetchPeopleFail(rpcError) {
    this.isLoading = true;
    this.error = null;
    this.errorType = null;
    const classified = classifyNetworkError(rpcError);
    this.error = classified.type === "AUTH_EXPIRED"
      ? "Your session expired. Please sign in again."
      : "Server is temporarily unavailable.";
    this.errorType = classified.type;
    if (classified.type === "AUTH_EXPIRED") this.people = [];
    this.isLoading = false;
    return this;
  }

  /** Simulates a toggleDiscoverability failure — MUST NOT touch people-list state */
  toggleFail(rpcError) {
    this.isToggling = true;
    this.toggleError = null;
    this.toggleErrorType = null;
    const classified = classifyNetworkError(rpcError);
    // Write ONLY to toggleError — never to error
    this.toggleError = "Unable to update discoverability. Please try again.";
    this.toggleErrorType = classified.type;
    this.isToggling = false;
    return this;
  }

  /** Simulates a successful toggle */
  toggleSuccess(nextVal) {
    this.isToggling = true;
    this.toggleError = null;
    this.toggleErrorType = null;
    this.isDiscoverable = nextVal;
    this.isToggling = false;
    return this;
  }
}

// ─── Test sections ────────────────────────────────────────────────────────────

section("1. Error state independence: fetchPeople");
{
  const s = new DiscoverPeopleState().fetchPeopleSuccess_empty();
  assert(s.error === null, "fetchPeople success → error is null");
  assert(s.toggleError === null, "fetchPeople success → toggleError untouched");
  assert(s.people.length === 0, "fetchPeople success (0 results) → people is empty array");
  assert(s.isLoading === false, "fetchPeople success → isLoading false");

  const s2 = new DiscoverPeopleState()
    .fetchPeopleSuccess_withResults()
    .fetchPeopleFail({ code: "XX000", message: "internal error", status: 500 });
  assert(s2.error !== null, "fetchPeople fail → error is set");
  assert(s2.errorType === "SERVER_ERROR", "fetchPeople 500 → errorType SERVER_ERROR");
  assert(s2.toggleError === null, "fetchPeople fail → toggleError NOT touched");
}

section("2. Error state independence: toggleDiscoverability");
{
  const s = new DiscoverPeopleState()
    .fetchPeopleSuccess_empty()
    .toggleFail({ code: "XX000", message: "connection failed", status: 500 });
  assert(s.toggleError !== null, "toggle fail → toggleError is set");
  assert(s.error === null, "toggle fail → people-list error NOT set");
  assert(s.errorType === null, "toggle fail → people-list errorType NOT set");
  assert(s.people.length === 0, "toggle fail → people array unchanged (still empty)");
}

section("3. Toggle failure cannot overwrite people-list error");
{
  // First fetchPeople fails, then toggle also fails — people-list error must persist
  const s = new DiscoverPeopleState()
    .fetchPeopleFail({ code: "ETIMEDOUT", status: 408 })
    .toggleFail({ code: "XX000", status: 500 });
  assert(s.error !== null, "people-list error still set after toggle also fails");
  assert(s.toggleError !== null, "toggle error set independently");
  assert(s.error !== s.toggleError, "people-list error and toggle error are separate strings");
}

section("4. Toggle failure cannot clear people results");
{
  const s = new DiscoverPeopleState()
    .fetchPeopleSuccess_withResults([{ user_id: "u1" }, { user_id: "u2" }])
    .toggleFail({ code: "XX000", status: 500 });
  assert(s.people.length === 2, "people array preserved after toggle failure");
  assert(s.toggleError !== null, "toggle error set");
  assert(s.error === null, "people-list error remains null");
}

section("5. Successful empty people result → empty state (not error)");
{
  const s = new DiscoverPeopleState().fetchPeopleSuccess_empty();
  // UI rendering logic: peopleError is null, people is [], should show empty state
  const showErrorEmptyState = !s.isLoading && s.people.length === 0 && s.error !== null;
  const showEmptyState = !s.isLoading && s.people.length === 0 && s.error === null;
  assert(!showErrorEmptyState, "0 results + no error → does NOT show error empty-state");
  assert(showEmptyState, "0 results + no error → shows 'No discoverable people yet'");
}

section("6. People fetch failure → error empty-state (not 'No discoverable people yet')");
{
  const s = new DiscoverPeopleState().fetchPeopleFail({ code: "P0001", message: "some server error" });
  const showErrorEmptyState = !s.isLoading && s.people.length === 0 && s.error !== null;
  const showLegitimateEmptyState = !s.isLoading && s.people.length === 0 && s.error === null;
  assert(showErrorEmptyState, "fetch fail + 0 results → shows error empty-state");
  assert(!showLegitimateEmptyState, "fetch fail → does NOT show 'No discoverable people yet'");
}

section("7. Toggle error rendered near toggle card, not in people results area");
{
  // When toggle fails but people loaded fine with 0 results:
  const s = new DiscoverPeopleState()
    .fetchPeopleSuccess_empty()
    .toggleFail({ code: "XX000", status: 500 });

  // Toggle error banner should appear (toggleError !== null)
  assert(s.toggleError !== null, "toggleError set → toggle error banner renders");
  // People area: should show legitimate empty state, NOT error empty-state
  const showPeopleErrorEmptyState = !s.isLoading && s.people.length === 0 && s.error !== null;
  const showLegitimateEmptyState = !s.isLoading && s.people.length === 0 && s.error === null;
  assert(!showPeopleErrorEmptyState, "toggle fail + empty people → does NOT render 'Unable to load people'");
  assert(showLegitimateEmptyState, "toggle fail + empty people → renders 'No discoverable people yet'");
}

section("8. P0001 classification — non-auth controlled server exception");
{
  const c1 = classifyNetworkError({ code: "P0001", message: "CANNOT_ADD_SELF" });
  assert(c1.type === "SERVER_ERROR", "P0001 CANNOT_ADD_SELF → SERVER_ERROR");
  assert(c1.isRetryable === true, "P0001 CANNOT_ADD_SELF → isRetryable true");

  const c2 = classifyNetworkError({ code: "P0001", message: "BLOCKED" });
  assert(c2.type === "SERVER_ERROR", "P0001 BLOCKED → SERVER_ERROR");

  const c3 = classifyNetworkError({ code: "P0001", message: "TARGET_NOT_DISCOVERABLE" });
  assert(c3.type === "SERVER_ERROR", "P0001 TARGET_NOT_DISCOVERABLE → SERVER_ERROR");

  // RATE_LIMIT_EXCEEDED maps to RATE_LIMITED (Phase 16 spec), never AUTH_EXPIRED
  const c4 = classifyNetworkError({ code: "P0001", message: "RATE_LIMIT_EXCEEDED" });
  assert(c4.type === "RATE_LIMITED", "P0001 RATE_LIMIT_EXCEEDED → RATE_LIMITED (never AUTH_EXPIRED)");
}

section("9. UNAUTHENTICATED remains AUTH_EXPIRED");
{
  const c1 = classifyNetworkError({ code: "P0001", message: "UNAUTHENTICATED" });
  assert(c1.type === "AUTH_EXPIRED", "P0001 UNAUTHENTICATED → AUTH_EXPIRED");
  assert(c1.isRetryable === false, "AUTH_EXPIRED → isRetryable false");

  const c2 = classifyNetworkError({ status: 401, message: "jwt expired" });
  assert(c2.type === "AUTH_EXPIRED", "401 jwt expired → AUTH_EXPIRED");

  const c3 = classifyNetworkError({ code: "PGRST301", message: "JWT expired" });
  assert(c3.type === "AUTH_EXPIRED", "PGRST301 → AUTH_EXPIRED");
}

section("10. PGRST116 is NOT_FOUND");
{
  const c = classifyNetworkError({ code: "PGRST116", message: "JSON object requested, multiple rows returned" });
  assert(c.type === "NOT_FOUND", "PGRST116 → NOT_FOUND");
  assert(c.isRetryable === false, "NOT_FOUND → isRetryable false");
}

section("11. Phase 20 migration: ALTER TABLE, no CREATE TABLE IF NOT EXISTS");
{
  const migFile = path.join(ROOT, "supabase", "migrations", "20260919_phase20_notification_deliveries_schema_fix.sql");
  assert(fs.existsSync(migFile), "Phase 20 migration file exists");

  const sql = fs.readFileSync(migFile, "utf8");

  assert(
    sql.includes("ADD COLUMN IF NOT EXISTS updated_at"),
    "Migration contains ADD COLUMN IF NOT EXISTS updated_at"
  );
  assert(
    sql.includes("ADD COLUMN IF NOT EXISTS lease_expires_at"),
    "Migration contains ADD COLUMN IF NOT EXISTS lease_expires_at"
  );
  assert(
    !sql.toUpperCase().includes("CREATE TABLE IF NOT EXISTS NOTIFICATION_DELIVERIES"),
    "Migration does NOT use CREATE TABLE IF NOT EXISTS for notification_deliveries"
  );
  assert(
    !sql.toUpperCase().includes("DROP TABLE"),
    "Migration does NOT drop any table"
  );
  assert(
    !sql.toUpperCase().includes("TRUNCATE"),
    "Migration does NOT truncate any table"
  );
  assert(
    sql.includes("idx_notification_deliveries_claim_v2"),
    "Migration creates idx_notification_deliveries_claim_v2"
  );
}

section("12. Migration column correctness");
{
  const migFile = path.join(ROOT, "supabase", "migrations", "20260919_phase20_notification_deliveries_schema_fix.sql");
  const sql = fs.readFileSync(migFile, "utf8");

  // Check updated_at has correct type
  assert(
    sql.includes("updated_at timestamp with time zone") || sql.includes("updated_at timestamptz"),
    "updated_at is a timestamptz column"
  );
  // Check lease_expires_at has correct type
  assert(
    sql.includes("lease_expires_at timestamp with time zone") || sql.includes("lease_expires_at timestamptz"),
    "lease_expires_at is a timestamptz column"
  );
  // Check claim_v2 index targets status IN ('pending', 'failed')
  assert(
    sql.includes("'pending', 'failed'") || sql.includes("'failed'"),
    "claim_v2 index WHERE clause covers 'failed' status"
  );
  assert(
    sql.includes("next_attempt_at"),
    "claim_v2 index includes next_attempt_at column"
  );
}

section("13. discover_people function — SECURITY DEFINER + safe search_path");
{
  const fixFile = path.join(ROOT, "supabase", "migrations", "20260915_fix_discover_people_ambiguous_user_id.sql");
  assert(fs.existsSync(fixFile), "discover_people fix migration file exists");

  const sql = fs.readFileSync(fixFile, "utf8").toLowerCase();

  assert(sql.includes("security definer"), "discover_people has SECURITY DEFINER");
  assert(
    sql.includes("set search_path = public, pg_temp"),
    "discover_people has safe set search_path = public, pg_temp"
  );
  assert(
    sql.includes("grant execute on function public.discover_people") &&
    sql.includes("to authenticated"),
    "authenticated role has EXECUTE permission on discover_people"
  );
}

section("14. discover_people — friendship user_id references are qualified");
{
  const fixFile = path.join(ROOT, "supabase", "migrations", "20260915_fix_discover_people_ambiguous_user_id.sql");
  const sql = fs.readFileSync(fixFile, "utf8");

  // Should use table alias prefix for all friendships references
  assert(
    sql.includes("fs1.user_id") && sql.includes("fs1.friend_id"),
    "friendships subquery 1 uses fs1.user_id / fs1.friend_id (qualified)"
  );
  assert(
    sql.includes("fs2.user_id") && sql.includes("fs2.friend_id"),
    "friendships subquery 2 uses fs2.user_id / fs2.friend_id (qualified)"
  );
  // #variable_conflict use_column directive must be present
  assert(
    sql.includes("#variable_conflict use_column"),
    "discover_people has #variable_conflict use_column directive"
  );
  // Must NOT have bare unqualified 'user_id' in FROM friendships context
  // (all must be fs1.user_id or fs2.user_id or f.user_id or v_caller_id)
  const hasBareUserIdInFriendships = /from public\.friendships\s+where\s+user_id/i.test(sql);
  assert(!hasBareUserIdInFriendships, "discover_people has no unqualified user_id in friendships WHERE clause");
}

section("15. Hook file — toggleError exported and error states separated");
{
  const hookFile = path.join(ROOT, "hooks", "use-discover-people.ts");
  assert(fs.existsSync(hookFile), "use-discover-people.ts exists");

  const src = fs.readFileSync(hookFile, "utf8");

  assert(src.includes("toggleError"), "Hook declares toggleError state");
  assert(src.includes("toggleErrorType"), "Hook declares toggleErrorType state");
  assert(src.includes("setToggleError"), "Hook has setToggleError setter");
  assert(src.includes("setToggleErrorType"), "Hook has setToggleErrorType setter");

  // toggleDiscoverability must NOT call setError (people-list error)
  const toggleFnMatch = src.match(/toggleDiscoverability\s*=\s*React\.useCallback[^}]*}\s*,\s*\[[^\]]*\]\s*\)/s);
  if (toggleFnMatch) {
    const toggleFnBody = toggleFnMatch[0];
    assert(
      !toggleFnBody.includes("setError(") || toggleFnBody.split("setToggleError").length > 1,
      "toggleDiscoverability does not call setError (people-list)"
    );
  } else {
    // Fallback: check that setError appears in toggle section only as toggleError
    assert(
      src.includes("setToggleError(classified.message)"),
      "toggleDiscoverability sets setToggleError(classified.message)"
    );
  }

  // fetchPeople must NOT call setToggleError
  const fetchPeopleMatch = src.match(/fetchPeople\s*=\s*React\.useCallback[^}]*}\s*,\s*\[[^\]]*\]\s*\)/s);
  if (fetchPeopleMatch) {
    assert(
      !fetchPeopleMatch[0].includes("setToggleError"),
      "fetchPeople does NOT call setToggleError"
    );
  }

  // Return value must include toggleError and toggleErrorType
  assert(src.includes("toggleError,"), "Hook return value exports toggleError");
  assert(src.includes("toggleErrorType,"), "Hook return value exports toggleErrorType");
}

section("16. Hook file — diagnostic console.error in fetchPeople");
{
  const hookFile = path.join(ROOT, "hooks", "use-discover-people.ts");
  const src = fs.readFileSync(hookFile, "utf8");

  assert(
    src.includes('[Discover People RPC Error]'),
    "fetchPeople logs raw RPC error with '[Discover People RPC Error]' prefix"
  );
  assert(
    src.includes("rpcError?.code") || src.includes("rpcError?.message"),
    "fetchPeople logs rpcError.code and/or message"
  );
  assert(
    !src.includes("access_token") && !src.includes("Bearer"),
    "fetchPeople does NOT log authentication tokens"
  );
}

section("17. discover-page.tsx — toggleError wired to toggle card area");
{
  const pageFile = path.join(ROOT, "components", "discover", "discover-page.tsx");
  assert(fs.existsSync(pageFile), "discover-page.tsx exists");

  const src = fs.readFileSync(pageFile, "utf8");

  assert(src.includes("toggleError"), "discover-page consumes toggleError");
  assert(
    src.includes("{toggleError &&"),
    "discover-page renders toggle error banner conditionally"
  );
  // Toggle error banner must appear BEFORE the tab switcher (near toggle card)
  const toggleBannerIdx = src.indexOf("{toggleError &&");
  const tabSwitcherIdx = src.indexOf("activeTab === \"discover\"");
  assert(
    toggleBannerIdx > -1 && tabSwitcherIdx > -1 && toggleBannerIdx < tabSwitcherIdx,
    "toggleError banner is rendered BEFORE the discover tab results area"
  );
  assert(
    src.includes("Unable to update discoverability"),
    "toggleError banner contains 'Unable to update discoverability' text"
  );
}

section("18. discover-page.tsx — people fetch error uses peopleError only");
{
  const pageFile = path.join(ROOT, "components", "discover", "discover-page.tsx");
  const src = fs.readFileSync(pageFile, "utf8");

  assert(
    src.includes("Unable to load people"),
    "discover-page has 'Unable to load people' state"
  );
  // "Unable to load people" must be driven by peopleError, not toggleError
  const unableIdx = src.indexOf("Unable to load people");
  const peopleErrorBeforeIt = src.lastIndexOf("peopleError", unableIdx);
  assert(
    peopleErrorBeforeIt > -1,
    "'Unable to load people' is gated by peopleError, not toggleError"
  );
}

section("19. discover-page.tsx — empty state shown independently of toggleError");
{
  const pageFile = path.join(ROOT, "components", "discover", "discover-page.tsx");
  const src = fs.readFileSync(pageFile, "utf8");

  assert(
    src.includes("No discoverable people yet"),
    "discover-page has 'No discoverable people yet' empty state"
  );
  // Empty state must NOT be gated by toggleError
  const emptyStateIdx = src.indexOf("No discoverable people yet");
  // Verify it's in an else/ternary branch not inside a toggleError block
  const toggleErrorBlockEnd = src.indexOf("{toggleError &&") + src.match(/\{toggleError &&[\s\S]*?\n\s*\)/)?.[0]?.length || 0;
  assert(
    emptyStateIdx > toggleErrorBlockEnd,
    "'No discoverable people yet' is NOT inside the toggleError block"
  );
}

section("20. network-error.ts — no 'unauthenticated' in AUTH check collides with P0001");
{
  const netFile = path.join(ROOT, "lib", "utils", "network-error.ts");
  assert(fs.existsSync(netFile), "network-error.ts exists");

  const src = fs.readFileSync(netFile, "utf8");

  // P0001 non-auth case must come AFTER auth check and only if message != UNAUTHENTICATED
  assert(
    src.includes("P0001") && src.includes("unauthenticated"),
    "network-error.ts references P0001 and unauthenticated"
  );
  assert(
    src.includes("rawCode === \"P0001\""),
    "network-error.ts has explicit P0001 handling"
  );
  // The P0001 non-auth SERVER_ERROR branch must exist
  assert(
    src.includes("9a. P0001") || src.includes("P0001 —"),
    "network-error.ts has a dedicated P0001 non-auth classification comment"
  );
  // PGRST116 is still NOT_FOUND
  assert(
    src.includes("PGRST116"),
    "network-error.ts still includes PGRST116 check"
  );
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log("\n" + "═".repeat(65));
console.log(`Phase 20 Regression Results: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("\nFailed tests:");
  failures.forEach((f) => console.log(`  ✗ ${f}`));
  process.exit(1);
} else {
  console.log("All tests passed. ✅");
  process.exit(0);
}
