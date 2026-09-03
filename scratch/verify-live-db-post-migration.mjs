/**
 * Heat Chat — Live Database Post-Migration Verification Script
 * Probes the live Supabase instance rmvpdcftfdeizitnrvkw
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log("==================================================================");
  console.log(" LIVE SUPABASE POST-MIGRATION VERIFICATION PROBE");
  console.log(" Project: rmvpdcftfdeizitnrvkw.supabase.co");
  console.log(" Timestamp:", new Date().toISOString());
  console.log("==================================================================\n");

  let passed = 0;
  let failed = 0;

  function record(name, condition, details = "") {
    if (condition) {
      console.log(`  ✅ [PASS] ${name} ${details}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${name} ${details}`);
      failed++;
    }
  }

  // 1. PHASE 6 TABLES
  console.log("--- 1. Phase 6 Tables Schema Cache Inspection ---");
  const targetTables = [
    "group_invitations",
    "group_invite_links",
    "polls",
    "poll_options",
    "poll_votes"
  ];

  for (const table of targetTables) {
    const { data, error } = await supabase.from(table).select("*").limit(1);
    const exists = !error || (!error.message.includes("Could not find the table") && error.code !== "PGRST205");
    record(`Table public.${table}`, exists, exists ? "EXISTS in schema cache" : `Error: ${error?.message}`);
  }

  // 2. CHECK SPECIFIC COLUMNS
  console.log("\n--- 2. Critical Columns Inspection ---");
  // Check polls.updated_at
  const { data: pollColData, error: pollColErr } = await supabase.from("polls").select("id, updated_at, is_anonymous").limit(1);
  record("polls.updated_at column exists", !pollColErr || !pollColErr.message.includes("updated_at"), pollColErr ? pollColErr.message : "Active");

  // Check group_invite_links columns (token, max_uses, uses_count, is_revoked)
  const { error: linkColErr } = await supabase.from("group_invite_links").select("id, token, max_uses, uses_count, is_revoked").limit(1);
  record("group_invite_links columns exist", !linkColErr, linkColErr ? linkColErr.message : "Active");

  // 3. PHASE 6 FUNCTIONS & RPCS
  console.log("\n--- 3. Live Functions & RPC Signatures Inspection ---");

  // A. get_conversation_polls
  const dummyConvId = "00000000-0000-0000-0000-000000000000";
  const { data: pollRpcData, error: pollRpcErr } = await supabase.rpc("get_conversation_polls", {
    p_conversation_id: dummyConvId
  });
  // If function exists, it will raise 'Authentication required' or 'Not a member' (code P0001 or 400 with message), NOT PGRST202 (not found)
  const pollRpcExists = !pollRpcErr || pollRpcErr.code !== "PGRST202";
  record("RPC public.get_conversation_polls", pollRpcExists, pollRpcErr ? `Response: ${pollRpcErr.message}` : "Success");

  // B. vote_poll
  const { error: voteErr } = await supabase.rpc("vote_poll", {
    p_poll_id: dummyConvId,
    p_option_ids: [dummyConvId]
  });
  const voteExists = !voteErr || voteErr.code !== "PGRST202";
  record("RPC public.vote_poll", voteExists, voteErr ? `Response: ${voteErr.message}` : "Success");

  // C. close_poll
  const { error: closeErr } = await supabase.rpc("close_poll", {
    p_poll_id: dummyConvId
  });
  const closeExists = !closeErr || closeErr.code !== "PGRST202";
  record("RPC public.close_poll", closeExists, closeErr ? `Response: ${closeErr.message}` : "Success");

  // D. join_group_via_invite_link
  const { error: joinErr } = await supabase.rpc("join_group_via_invite_link", {
    p_token: "dummy-token-verification"
  });
  const joinExists = !joinErr || joinErr.code !== "PGRST202";
  record("RPC public.join_group_via_invite_link", joinExists, joinErr ? `Response: ${joinErr.message}` : "Success");

  // E. remove_group_member
  const { data: remData, error: remErr } = await supabase.rpc("remove_group_member", {
    conv_id: dummyConvId,
    target_user_id: dummyConvId
  });
  const remJsonb = remData && typeof remData === "object" && "success" in remData;
  record("RPC public.remove_group_member (JSONB)", remJsonb, `Data: ${JSON.stringify(remData)}`);

  // F. get_saved_messages
  const { error: savedErr } = await supabase.rpc("get_saved_messages", {
    p_limit: 1
  });
  const savedExists = !savedErr || savedErr.code !== "PGRST202";
  record("RPC public.get_saved_messages", savedExists, savedErr ? `Response: ${savedErr.message}` : "Success");

  console.log("\n==================================================================");
  console.log(` VERIFICATION SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log("==================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Verification probe error:", err);
  process.exit(1);
});
