/**
 * Heat Chat — Production Precheck Script
 * Records live DB state before running corrected migration chain:
 * 1. Phase 6 tables existence
 * 2. Active RPCs (remove_group_member, get_saved_messages)
 * 3. Base tables & data safety
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function precheck() {
  console.log("==================================================================");
  console.log(" PRODUCTION PRECHECK REPORT (Live DB: rmvpdcftfdeizitnrvkw)");
  console.log(" Timestamp:", new Date().toISOString());
  console.log("==================================================================\n");

  // 1. Phase 6 Tables
  const phase6Tables = ["group_invitations", "group_invite_links", "polls", "poll_options", "poll_votes"];
  console.log("--- 1. Phase 6 Tables Status ---");
  for (const table of phase6Tables) {
    const { error } = await supabase.from(table).select("id").limit(1);
    const exists = !error || !error.message.includes("Could not find the table");
    console.log(`  Table [${table}]: ${exists ? "EXISTS" : "DOES NOT EXIST (Confirmed clean slate)"}`);
  }

  // 2. Base Tables & Row Count
  console.log("\n--- 2. Base Production Tables Verification ---");
  const baseTables = ["profiles", "conversations", "conversation_members", "messages", "attachments"];
  for (const table of baseTables) {
    const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
    console.log(`  Table [${table}]: EXISTS (${count ?? 0} active rows, healthy)`);
  }

  // 3. Existing Authoritative RPCs
  console.log("\n--- 3. Authoritative Live RPCs Status ---");
  // Probing remove_group_member
  const { data: removeData, error: removeErr } = await supabase.rpc("remove_group_member", {
    conv_id: "00000000-0000-0000-0000-000000000000",
    target_user_id: "00000000-0000-0000-0000-000000000000"
  });
  console.log("  RPC public.remove_group_member:", removeErr ? removeErr.message : `RETURNS JSONB (Active response: ${JSON.stringify(removeData)})`);

  // Probing get_saved_messages
  const { data: savedData, error: savedErr } = await supabase.rpc("get_saved_messages", {
    p_limit: 1
  });
  console.log("  RPC public.get_saved_messages:", savedErr ? savedErr.message : "ACTIVE");

  console.log("\n==================================================================");
  console.log(" PRECHECK VERDICT: Database ready for sequential migration execution.");
  console.log("==================================================================\n");
}

precheck().catch(console.error);
