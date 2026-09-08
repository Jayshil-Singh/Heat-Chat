/**
 * Heat Chat — Discover People Fix Verification Suite
 *
 * Verifies:
 * 1. SQL migration file 20260915_fix_discover_people_ambiguous_user_id.sql integrity:
 *    - #variable_conflict use_column directive present
 *    - Fully qualified table columns (fs1.user_id, fs2.user_id)
 *    - SECURITY DEFINER and search_path hardening
 *    - Role permissions (grant to authenticated, revoke from public)
 * 2. Parity across existing migrations (20260907, 20260911)
 * 3. Frontend UI state handling:
 *    - components/discover/discover-page.tsx separates error state from empty state
 *    - components/discover/friend-request-list.tsx renders error with retry on empty lists
 * 4. Network error classification for Postgres 42xxx / server errors
 */

import fs from "node:fs";
import path from "node:path";
import { classifyNetworkError } from "../lib/utils/network-error.ts";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function assert(condition, num, title, details = "") {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS: Check ${String(num).padStart(2, "0")}] ${title}`);
  } else {
    failedTests++;
    const msg = `❌ [FAIL: Check ${String(num).padStart(2, "0")}] ${title}${details ? " -> " + details : ""}`;
    console.error(msg);
    failures.push({ num, title, details });
  }
}

async function main() {
  console.log("==================================================================");
  console.log("HEAT CHAT — DISCOVER PEOPLE FIX VERIFICATION SUITE");
  console.log("==================================================================\n");

  const root = process.cwd();

  // 1. SQL Migration Check
  console.log("--- 1. SQL Migration Invariants ---");
  const fixMigrationPath = path.join(root, "supabase", "migrations", "20260915_fix_discover_people_ambiguous_user_id.sql");
  assert(fs.existsSync(fixMigrationPath), 1, "Migration 20260915_fix_discover_people_ambiguous_user_id.sql exists");

  const sqlContent = fs.readFileSync(fixMigrationPath, "utf-8");
  assert(sqlContent.includes("#variable_conflict use_column"), 2, "Includes #variable_conflict use_column directive");
  assert(sqlContent.includes("fs1.user_id = v_caller_id"), 3, "fs1 alias qualifies user_id for caller in mutual friends");
  assert(sqlContent.includes("fs2.user_id = p.id"), 4, "fs2 alias qualifies user_id for target profile in mutual friends");
  assert(sqlContent.includes("security definer"), 5, "Function marked SECURITY DEFINER");
  assert(sqlContent.includes("set search_path = public, pg_temp"), 6, "Safe search_path specified");
  assert(sqlContent.includes("grant execute on function public.discover_people(text, integer, integer) to authenticated"), 7, "EXECUTE granted to authenticated");
  assert(sqlContent.includes("revoke all on function public.discover_people(text, integer, integer) from public"), 8, "All privileges revoked from public");

  // 2. Parity in earlier migrations
  console.log("\n--- 2. Historical Migration Parity ---");
  const m20260907 = fs.readFileSync(path.join(root, "supabase", "migrations", "20260907_discover_people.sql"), "utf-8");
  assert(m20260907.includes("fs1.user_id = v_caller_id") && m20260907.includes("#variable_conflict use_column"), 9, "20260907_discover_people.sql updated with fix");

  const m20260911 = fs.readFileSync(path.join(root, "supabase", "migrations", "20260911_phase14_production_incident_fix.sql"), "utf-8");
  assert(m20260911.includes("fs1.user_id = v_caller_id") && m20260911.includes("#variable_conflict use_column"), 10, "20260911_phase14_production_incident_fix.sql updated with fix");

  // 3. UI State Disentanglement
  console.log("\n--- 3. UI State Disentanglement ---");
  const discoverPageContent = fs.readFileSync(path.join(root, "components", "discover", "discover-page.tsx"), "utf-8");
  assert(discoverPageContent.includes("peopleError ? ("), 11, "discover-page.tsx conditionally renders error state when peopleError is present");
  assert(discoverPageContent.includes('title="Unable to load people"'), 12, "discover-page.tsx displays dedicated error view with retry action");
  assert(discoverPageContent.includes("peopleError && people.length > 0"), 13, "Top error banner only displayed when preserving cached results");

  const friendListContent = fs.readFileSync(path.join(root, "components", "discover", "friend-request-list.tsx"), "utf-8");
  assert(friendListContent.includes("error && incoming.length === 0 && outgoing.length === 0"), 14, "friend-request-list.tsx renders error state on empty list failures");
  assert(friendListContent.includes('title="Unable to load friend requests"'), 15, "friend-request-list.tsx shows explicit error title");

  // 4. Network Error Classification
  console.log("\n--- 4. Network Error Classification ---");
  const pgAmbiguousError = {
    code: "42702",
    message: 'column reference "user_id" is ambiguous',
    details: "It could refer to either a PL/pgSQL variable or a table column.",
  };
  const classified = classifyNetworkError(pgAmbiguousError);
  assert(classified.type === "SERVER_ERROR", 16, "Postgres 42702 error classified as SERVER_ERROR", `Got: ${classified.type}`);
  assert(classified.isRetryable === true, 17, "Classified error is flagged as retryable");

  console.log("\n==================================================================");
  console.log(`VERIFICATION SUMMARY: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
  console.log("==================================================================");

  if (failedTests > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Verification suite fatal error:", err);
  process.exit(1);
});
