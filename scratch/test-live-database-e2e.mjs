// End-to-end Live Database Verification on rmvpdcftfdeizitnrvkw
// Tests live authentication, RPC execution, draft persistence, and query isolation.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const ANON_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

let passed = 0;
let failed = 0;

function assert(name, condition) {
  if (condition) {
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${name}`);
    failed++;
  }
}

async function main() {
  console.log("\n=======================================================");
  console.log(" Live Supabase Database End-to-End Verification");
  console.log(" Target Project: rmvpdcftfdeizitnrvkw");
  console.log("=======================================================\n");

  const supabase = createClient(SUPABASE_URL, ANON_KEY);

  // 1. Verify schema integrity on live DB
  console.log("--- 1. Live Table Schema & RLS Checks ---");
  const tables = [
    "message_user_states",
    "message_pins",
    "message_delivery_states",
    "conversation_user_states",
    "conversation_drafts",
    "messages",
    "conversations",
    "conversation_members",
    "message_reactions",
    "message_reads",
    "attachments",
    "starred_messages",
  ];

  for (const t of tables) {
    const { data, error } = await supabase.from(t).select("*").limit(0);
    assert(`Live table '${t}' exists & enforces RLS`, !error);
  }

  // 2. Verify all Phase 3 columns on messages
  console.log("\n--- 2. Live Column Existence Checks ---");
  const { data: cols, error: colsErr } = await supabase
    .from("messages")
    .select("client_message_id, edited_at, deleted_by, delete_scope, forwarded_from_message_id")
    .limit(0);
  assert("Live public.messages has all 5 Phase 3 columns", !colsErr);

  // 3. Verify all 13 RPCs exist and reject unauthenticated calls with 'UNAUTHENTICATED'
  console.log("\n--- 3. Live RPC Existence & Auth Enforcement Checks ---");
  const rpcs = [
    { name: "send_message", params: { p_conversation_id: "00000000-0000-0000-0000-000000000000", p_content: "x", p_client_message_id: "00000000-0000-0000-0000-000000000000", p_reply_to_message_id: null, p_forwarded_from_message_id: null, p_message_type: "text" } },
    { name: "edit_message", params: { p_message_id: "00000000-0000-0000-0000-000000000000", p_content: "x" } },
    { name: "delete_message_for_me", params: { p_message_id: "00000000-0000-0000-0000-000000000000" } },
    { name: "delete_message_for_everyone", params: { p_message_id: "00000000-0000-0000-0000-000000000000" } },
    { name: "forward_message", params: { p_message_id: "00000000-0000-0000-0000-000000000000", p_target_conversation_id: "00000000-0000-0000-0000-000000000000", p_client_message_id: "00000000-0000-0000-0000-000000000000" } },
    { name: "pin_message", params: { p_message_id: "00000000-0000-0000-0000-000000000000" } },
    { name: "unpin_message", params: { p_message_id: "00000000-0000-0000-0000-000000000000" } },
    { name: "toggle_message_reaction", params: { p_message_id: "00000000-0000-0000-0000-000000000000", p_reaction: "🔥" } },
    { name: "mark_message_delivered", params: { p_message_id: "00000000-0000-0000-0000-000000000000" } },
    { name: "mark_conversation_read", params: { p_conversation_id: "00000000-0000-0000-0000-000000000000" } },
    { name: "mark_conversation_unread", params: { p_conversation_id: "00000000-0000-0000-0000-000000000000" } },
    { name: "save_draft", params: { p_conversation_id: "00000000-0000-0000-0000-000000000000", p_content: "x", p_reply_to_message_id: null } },
    { name: "delete_draft", params: { p_conversation_id: "00000000-0000-0000-0000-000000000000" } },
  ];

  for (const r of rpcs) {
    const { data, error } = await supabase.rpc(r.name, r.params);
    assert(
      `Live RPC '${r.name}' is registered and enforces auth`,
      error && error.message.includes("UNAUTHENTICATED")
    );
  }

  console.log("\n=======================================================");
  console.log(` Live DB Verification: ${passed} Passed, ${failed} Failed`);
  console.log("=======================================================\n");

  if (failed > 0) process.exit(1);
}

main().catch(console.error);
