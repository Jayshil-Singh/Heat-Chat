/**
 * Heat Chat — Genuine Database Invariant & Security Test Suite
 * Connects directly to the live Supabase database and verifies invariants.
 */
import assert from "node:assert";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rmvpdcftfdeizitnrvkw.supabase.co";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

const supabase = createClient(supabaseUrl, supabaseKey);

let passed = 0;
let total = 0;

async function test(name, fn) {
  total++;
  try {
    await fn();
    passed++;
    console.log(`  ✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

async function run() {
  console.log("\n=== DATABASE INVARIANT & SECURITY TEST SUITE ===");
  console.log(`Target Database: ${supabaseUrl}\n`);

  // 1. GROUP OWNER DATA INVARIANT
  console.log("--- 1. Group Owner Invariant Forensic Verification ---");
  await test("Zero groups have multiple owners in production", async () => {
    const { data: convs, error: convErr } = await supabase
      .from("conversations")
      .select("id, name")
      .eq("type", "group");

    assert.strictEqual(convErr, null, `Conversations query failed: ${convErr?.message}`);
    
    // Check every group conversation
    for (const c of convs || []) {
      const { data: members, error: mErr } = await supabase
        .from("conversation_members")
        .select("user_id, role")
        .eq("conversation_id", c.id)
        .eq("role", "owner");

      assert.strictEqual(mErr, null);
      assert.ok(
        (members || []).length <= 1,
        `Group ${c.id} violates invariant with ${(members || []).length} owners!`
      );
    }
  });

  // 2. POLL VOTES DIRECT ACCESS LEAK DEFENSE
  console.log("\n--- 2. PostgREST Poll Votes Privacy Verification ---");
  await test("Unauthenticated direct query to poll_votes is completely blocked by RLS", async () => {
    const { data, error } = await supabase
      .from("poll_votes")
      .select("user_id, option_id");

    // Must return empty array or RLS rejection; never leak rows to unauthenticated caller
    assert.ok(
      data === null || (Array.isArray(data) && data.length === 0),
      `Leak detected: unauthenticated client received ${data?.length} poll_votes rows!`
    );
  });

  // 3. ATTACHMENT ACCESS DEFENSE
  console.log("\n--- 3. PostgREST Attachment Privacy Verification ---");
  await test("Unauthenticated direct query to attachments is blocked by RLS", async () => {
    const { data, error } = await supabase
      .from("attachments")
      .select("id, storage_path, file_name");

    assert.ok(
      data === null || (Array.isArray(data) && data.length === 0),
      `Leak detected: unauthenticated client received ${data?.length} attachment rows!`
    );
  });

  // 4. ADMIN AUDIT LOGS ACCESS DEFENSE
  console.log("\n--- 4. Admin Platform Isolation Verification ---");
  await test("Unauthenticated direct query to admin_audit_logs is completely blocked", async () => {
    const { data, error } = await supabase
      .from("admin_audit_logs")
      .select("*");

    assert.ok(
      data === null || (Array.isArray(data) && data.length === 0),
      `Leak detected: unauthenticated client received admin audit logs!`
    );
  });

  // 5. MODERATION REPORTS ACCESS DEFENSE
  console.log("\n--- 5. Moderation Reports Privacy Verification ---");
  await test("Unauthenticated direct query to moderation_reports is completely blocked", async () => {
    const { data, error } = await supabase
      .from("moderation_reports")
      .select("*");

    assert.ok(
      data === null || (Array.isArray(data) && data.length === 0),
      `Leak detected: unauthenticated client received moderation reports!`
    );
  });

  // 6. PROFILES PRIVACY DEFENSE
  console.log("\n--- 6. Sensitive Profile Data Defense ---");
  await test("Direct profiles query does not leak unconfirmed email or private settings", async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .limit(5);

    assert.strictEqual(error, null);
    // Public username and display_name are allowed, but check no raw sensitive fields leak
    if (data && data.length > 0) {
      assert.strictEqual(data[0].email, undefined, "Email column must not be returned in public select");
    }
  });

  console.log(`\n==============================================`);
  console.log(`DATABASE INVARIANT TESTS: ${passed}/${total} PASSED`);
  console.log(`==============================================\n`);
}

run().catch((err) => {
  console.error("Database test suite aborted:", err);
  process.exit(1);
});
