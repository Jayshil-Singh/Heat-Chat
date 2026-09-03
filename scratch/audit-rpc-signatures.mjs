/**
 * Heat Chat — Phase 6 Master Schema & Database Parameterized RPC Audit Script
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log("==================================================================");
console.log(" Heat Chat — Parameterized RPC Signature Probe");
console.log("==================================================================\n");

async function runRpcSignatureAudit() {
  const rpcs = [
    { name: "create_group_conversation", args: { group_name: "Test", member_user_ids: [] } },
    { name: "add_group_members", args: { conv_id: "00000000-0000-0000-0000-000000000000", new_user_ids: [] } },
    { name: "remove_group_member", args: { conv_id: "00000000-0000-0000-0000-000000000000", target_user_id: "00000000-0000-0000-0000-000000000000" } },
    { name: "update_group_member_role", args: { conv_id: "00000000-0000-0000-0000-000000000000", target_user_id: "00000000-0000-0000-0000-000000000000", new_role: "admin" } },
    { name: "update_group_details", args: { conv_id: "00000000-0000-0000-0000-000000000000", new_name: "Test" } },
    { name: "leave_group", args: { conv_id: "00000000-0000-0000-0000-000000000000" } },
    { name: "search_messages", args: { p_query: "test" } },
    { name: "search_media", args: { p_query: "test" } },
    { name: "search_people", args: { p_query: "test" } },
    { name: "get_saved_messages", args: {} },
    { name: "get_mention_candidates", args: { p_conversation_id: "00000000-0000-0000-0000-000000000000" } },
  ];

  for (const rpc of rpcs) {
    try {
      const { data, error } = await supabase.rpc(rpc.name, rpc.args);
      const msg = error?.message || "Success";
      const exists = !msg.includes("Could not find the function") && !msg.includes("404");
      console.log(`  RPC [${rpc.name}]: ${exists ? "EXISTS" : "MISSING"} (Response: ${msg})`);
    } catch (err) {
      console.log(`  RPC [${rpc.name}]: Error ${err.message}`);
    }
  }
}

runRpcSignatureAudit().catch(console.error);
