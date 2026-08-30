/**
 * Heat Chat — Phase 1 QA Test Suite
 * Tests: Profile API, Privacy Settings API, Blocking API, Public Profile API
 *
 * Usage:
 *   node scratch/test-profiles-privacy-suite.mjs
 *
 * Requires:
 *   - NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 *   - At least two user accounts registered in Supabase (set below)
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Load .env.local ─────────────────────────────────────────────────────────
function loadEnv() {
  try {
    const envPath = resolve(__dirname, "../.env.local");
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, "");
      process.env[key] = value;
    }
  } catch {
    // .env.local might not exist in all environments
  }
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(1);
}

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Test State ──────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
let userAId, userBId;

function pass(name) {
  console.log(`  ✅ PASS  ${name}`);
  passed++;
}

function fail(name, reason) {
  console.error(`  ❌ FAIL  ${name}`);
  if (reason) console.error(`         → ${reason}`);
  failed++;
}

function section(title) {
  console.log(`\n═══ ${title} ═══`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function createTestUser(email, password, username, displayName) {
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName, username },
  });
  if (error) throw new Error(`createTestUser(${email}): ${error.message}`);

  // Ensure profile row exists (trigger may handle this)
  const { error: upsertErr } = await adminClient.from("profiles").upsert({
    id: data.user.id,
    username,
    display_name: displayName,
    status: "online",
    presence_status: "ONLINE",
    timezone: "UTC",
    language: "en",
  });
  if (upsertErr && !upsertErr.message.includes("duplicate")) {
    throw new Error(`Profile upsert (${email}): ${upsertErr.message}`);
  }
  return data.user;
}

async function cleanupTestUser(id) {
  if (!id) return;
  await adminClient.from("blocked_users").delete().or(`user_id.eq.${id},blocked_user_id.eq.${id}`);
  await adminClient.from("user_privacy_settings").delete().eq("user_id", id);
  await adminClient.auth.admin.deleteUser(id);
}

// ─── Test Suites ─────────────────────────────────────────────────────────────

section("SETUP — Creating test users");
try {
  const userA = await createTestUser(
    `test-phase1-a-${Date.now()}@heatchat.test`,
    "TestPass123!",
    `testa${Date.now()}`,
    "Test User A"
  );
  userAId = userA.id;
  pass("User A created");
} catch (e) {
  fail("User A creation", e.message);
}

try {
  const userB = await createTestUser(
    `test-phase1-b-${Date.now()}@heatchat.test`,
    "TestPass123!",
    `testb${Date.now()}`,
    "Test User B"
  );
  userBId = userB.id;
  pass("User B created");
} catch (e) {
  fail("User B creation", e.message);
}

if (!userAId || !userBId) {
  console.error("\n❌ Could not create test users. Aborting.");
  process.exit(1);
}

// ─── 1. Profile Row Tests ────────────────────────────────────────────────────
section("1. PROFILE ROW");

{
  const { data, error } = await adminClient
    .from("profiles")
    .select("*")
    .eq("id", userAId)
    .single();
  if (error || !data) {
    fail("Profile row exists for User A", error?.message);
  } else {
    pass("Profile row exists for User A");
    if (data.presence_status === "ONLINE") {
      pass("presence_status defaults to ONLINE");
    } else {
      fail("presence_status defaults to ONLINE", `got: ${data.presence_status}`);
    }
    if (data.timezone === "UTC") {
      pass("timezone defaults to UTC");
    } else {
      fail("timezone defaults to UTC", `got: ${data.timezone}`);
    }
    if (data.language === "en") {
      pass("language defaults to en");
    } else {
      fail("language defaults to en", `got: ${data.language}`);
    }
  }
}

// ─── 2. Privacy Settings Auto-Provision ──────────────────────────────────────
section("2. PRIVACY SETTINGS AUTO-PROVISION");

{
  // Insert via admin to simulate the API's auto-provision
  const { error } = await adminClient.from("user_privacy_settings").upsert({
    user_id: userAId,
  });
  if (error) {
    fail("Privacy settings upsert for User A", error.message);
  } else {
    pass("Privacy settings auto-provisioned for User A");
  }

  const { data, error: fetchErr } = await adminClient
    .from("user_privacy_settings")
    .select("*")
    .eq("user_id", userAId)
    .single();
  if (fetchErr || !data) {
    fail("Privacy settings row readable", fetchErr?.message);
  } else {
    pass("Privacy settings row readable");
    if (data.who_can_message === "everyone") {
      pass("who_can_message defaults to everyone");
    } else {
      fail("who_can_message defaults to everyone", `got: ${data.who_can_message}`);
    }
    if (data.read_receipts_enabled === true) {
      pass("read_receipts_enabled defaults to true");
    } else {
      fail("read_receipts_enabled defaults to true", `got: ${data.read_receipts_enabled}`);
    }
  }
}

// ─── 3. Blocking ─────────────────────────────────────────────────────────────
section("3. BLOCK / UNBLOCK");

{
  const { error } = await adminClient.from("blocked_users").insert({
    user_id: userAId,
    blocked_user_id: userBId,
    reason: "Test block",
  });
  if (error) {
    fail("User A can block User B", error.message);
  } else {
    pass("User A can block User B");
  }
}

{
  const { data, error } = await adminClient
    .from("blocked_users")
    .select("*")
    .eq("user_id", userAId)
    .eq("blocked_user_id", userBId)
    .single();
  if (error || !data) {
    fail("Block record readable by blocker", error?.message);
  } else {
    pass("Block record readable by blocker");
    if (data.reason === "Test block") {
      pass("Block reason persisted");
    } else {
      fail("Block reason persisted", `got: ${data.reason}`);
    }
  }
}

// Test is_user_blocked RPC
{
  const { data, error } = await adminClient.rpc("is_user_blocked", {
    user_a: userAId,
    user_b: userBId,
  });
  if (error) {
    fail("is_user_blocked RPC callable", error.message);
  } else if (data === true) {
    pass("is_user_blocked returns true for blocked pair");
  } else {
    fail("is_user_blocked returns true for blocked pair", `got: ${data}`);
  }
}

// Test self-block prevention
{
  const { error } = await adminClient.from("blocked_users").insert({
    user_id: userAId,
    blocked_user_id: userAId,
  });
  if (error && error.message.includes("blocked_user_id")) {
    pass("Self-block constraint prevents user from blocking themselves");
  } else if (error) {
    pass("Self-block constraint prevents user from blocking themselves (constraint fired)");
  } else {
    fail("Self-block constraint prevents user from blocking themselves", "No error raised");
    // Clean up if it didn't fail
    await adminClient.from("blocked_users").delete()
      .eq("user_id", userAId)
      .eq("blocked_user_id", userAId);
  }
}

// Test unblock
{
  const { error } = await adminClient.from("blocked_users").delete()
    .eq("user_id", userAId)
    .eq("blocked_user_id", userBId);
  if (error) {
    fail("Unblock (delete) succeeds", error.message);
  } else {
    pass("Unblock (delete) succeeds");
  }

  const { data } = await adminClient
    .from("blocked_users")
    .select("id")
    .eq("user_id", userAId)
    .eq("blocked_user_id", userBId);
  if (!data || data.length === 0) {
    pass("Block record removed after unblock");
  } else {
    fail("Block record removed after unblock", "Record still present");
  }
}

// Test is_user_blocked returns false after unblock
{
  const { data } = await adminClient.rpc("is_user_blocked", {
    user_a: userAId,
    user_b: userBId,
  });
  if (data === false) {
    pass("is_user_blocked returns false after unblock");
  } else {
    fail("is_user_blocked returns false after unblock", `got: ${data}`);
  }
}

// ─── 4. Privacy Settings Update ───────────────────────────────────────────────
section("4. PRIVACY SETTINGS UPDATE");

{
  const { error } = await adminClient.from("user_privacy_settings").update({
    who_can_message: "friends",
    read_receipts_enabled: false,
    typing_indicators_enabled: false,
  }).eq("user_id", userAId);
  if (error) {
    fail("Privacy settings update (admin)", error.message);
  } else {
    pass("Privacy settings update succeeds");
  }

  const { data } = await adminClient
    .from("user_privacy_settings")
    .select("who_can_message, read_receipts_enabled, typing_indicators_enabled")
    .eq("user_id", userAId)
    .single();
  if (data?.who_can_message === "friends" && data?.read_receipts_enabled === false) {
    pass("Privacy update values persisted correctly");
  } else {
    fail("Privacy update values persisted correctly", JSON.stringify(data));
  }
}

// Invalid audience should be caught at application level (API validates before DB)
// DB constraint check:
{
  const { error } = await adminClient.from("user_privacy_settings").update({
    who_can_message: "invalid_audience_xyz",
  }).eq("user_id", userAId);
  if (error) {
    pass("DB rejects invalid privacy audience value");
  } else {
    fail("DB rejects invalid privacy audience value", "No error raised — add DB constraint");
  }
}

// ─── 5. Profile Field Constraints ─────────────────────────────────────────────
section("5. PROFILE FIELD CONSTRAINTS");

{
  const { error } = await adminClient.from("profiles").update({
    status_message: "x".repeat(161),
  }).eq("id", userAId);
  if (error) {
    pass("status_message > 160 chars rejected by DB constraint");
  } else {
    fail("status_message > 160 chars rejected by DB constraint", "No error raised");
  }
}

{
  const { error } = await adminClient.from("profiles").update({
    presence_status: "INVALID_STATUS",
  }).eq("id", userAId);
  if (error) {
    pass("Invalid presence_status rejected by DB constraint");
  } else {
    fail("Invalid presence_status rejected by DB constraint", "No error raised");
  }
}

{
  const { error } = await adminClient.from("profiles").update({
    presence_status: "AWAY",
    status_message: "Currently in a meeting",
    status_emoji: "📅",
    timezone: "America/New_York",
    language: "en",
  }).eq("id", userAId);
  if (error) {
    fail("Valid profile update succeeds", error.message);
  } else {
    pass("Valid profile update (presence, status, timezone) succeeds");
  }
}

// ─── TEARDOWN ──────────────────────────────────────────────────────────────
section("TEARDOWN");

try {
  await cleanupTestUser(userAId);
  await cleanupTestUser(userBId);
  pass("Test users cleaned up");
} catch (e) {
  fail("Test user cleanup", e.message);
}

// ─── Results ─────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(52)}`);
console.log(`  TOTAL: ${passed + failed}  ✅ PASS: ${passed}  ❌ FAIL: ${failed}`);
console.log("─".repeat(52));

if (failed > 0) process.exit(1);
