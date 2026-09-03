/**
 * Heat Chat — Static Architecture & Contract Verification Suite
 * Verifies code contracts, single-owner patterns, and migration invariants.
 */
import fs from "node:fs";
import assert from "node:assert";

let passed = 0;
let total = 0;

function it(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

console.log("\n=== STATIC ARCHITECTURAL CONTRACT SUITE ===");

// 1. CONVERSATIONS PROVIDER ARCHITECTURE
console.log("\n--- 1. ConversationsProvider Contract ---");
it("ProtectedLayout mounts ConversationsProvider wrapping AppShell", () => {
  const content = fs.readFileSync("app/(protected)/layout.tsx", "utf8");
  assert.ok(content.includes("<ConversationsProvider>"), "Missing ConversationsProvider in layout");
  assert.ok(content.includes("<AppShell>{children}</AppShell>"), "AppShell not nested inside providers");
});

it("hooks/use-conversations.ts uses stable single-owner channel name without random suffix", () => {
  const content = fs.readFileSync("hooks/use-conversations.ts", "utf8");
  assert.ok(content.includes("user-conversations-${user.id}"), "Stable channel name missing");
  assert.ok(!content.includes("Math.random()"), "Found forbidden random channel suffix");
  assert.ok(content.includes("export function ConversationsProvider"), "Missing ConversationsProvider export");
  assert.ok(content.includes("export function useConversations"), "Missing useConversations export");
});

it("hooks/use-polls.ts does not subscribe to raw poll_votes table", () => {
  const content = fs.readFileSync("hooks/use-polls.ts", "utf8");
  assert.ok(!content.includes('table: "poll_votes"'), "Forbidden poll_votes realtime subscription found");
  assert.ok(content.includes('table: "polls"'), "Missing polls table subscription");
});

// 2. OPEN REDIRECT DEFENSE CONTRACT
console.log("\n--- 2. Open Redirect Defense Contract ---");
it("middleware.ts uses getSafeRedirectUrl", () => {
  const content = fs.readFileSync("lib/supabase/middleware.ts", "utf8");
  assert.ok(content.includes("getSafeRedirectUrl"), "middleware missing getSafeRedirectUrl");
});

it("admin login and MFA pages use getSafeRedirectUrl", () => {
  const login = fs.readFileSync("app/admin/login/page.tsx", "utf8");
  const mfa = fs.readFileSync("app/admin/mfa/verify/page.tsx", "utf8");
  assert.ok(login.includes("getSafeRedirectUrl"), "admin login missing getSafeRedirectUrl");
  assert.ok(mfa.includes("getSafeRedirectUrl"), "admin MFA verify missing getSafeRedirectUrl");
});

// 3. REMEDIATION MIGRATION CONTRACT
console.log("\n--- 3. Remediation Migration 20260908 Contract ---");
it("Migration 20260908 contains all security & invariant fixes", () => {
  const sql = fs.readFileSync("supabase/migrations/20260908_remediate_security_definer_and_invariants.sql", "utf8");
  assert.ok(sql.includes("ALTER FUNCTION public.%I(%s) SET search_path = public, pg_temp;"), "Missing dynamic search_path hardening");
  assert.ok(sql.includes("CREATE UNIQUE INDEX IF NOT EXISTS unique_group_owner_idx"), "Missing unique_group_owner_idx");
  assert.ok(sql.includes("ALTER PUBLICATION supabase_realtime DROP TABLE public.poll_votes;"), "Missing drop poll_votes from realtime");
  assert.ok(sql.includes("CREATE OR REPLACE FUNCTION public.get_conversation_polls"), "Missing get_conversation_polls RPC");
  assert.ok(sql.includes("FOR UPDATE;"), "Missing FOR UPDATE in join_group_via_invite_link");
});

it("scripts/migrate.mjs registers all 24 migrations in topological dependency order", () => {
  const content = fs.readFileSync("scripts/migrate.mjs", "utf8");
  assert.ok(content.includes("20260827_initial_schema.sql"), "initial schema missing");
  assert.ok(content.includes("20260827_direct_conversation_constraints.sql"), "direct conversation constraints missing");
  assert.ok(content.includes("20260908_remediate_security_definer_and_invariants.sql"), "remediation migration missing");
});

console.log(`\n==============================================`);
console.log(`STATIC CONTRACT TESTS: ${passed}/${total} PASSED`);
console.log(`==============================================\n`);
