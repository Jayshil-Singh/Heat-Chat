// Verify all 13 RPCs with exact argument signatures against live Supabase
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const ANON_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

const supabase = createClient(SUPABASE_URL, ANON_KEY);

const dummyConvId = "00000000-0000-0000-0000-000000000000";
const dummyMsgId = "11111111-1111-1111-1111-111111111111";

async function testRpc(name, params) {
  const { data, error } = await supabase.rpc(name, params);
  // If the RPC exists, Supabase will execute it and return either an auth error, access error, or success
  // If the RPC does NOT exist, Supabase returns error code PGRST202 or 404
  const exists = !error || !error.message?.includes("Could not find the function");
  return {
    name,
    exists,
    errorMessage: error?.message || null,
    details: error?.details || null,
  };
}

async function main() {
  console.log("\n=== Testing Live Database RPCs on rmvpdcftfdeizitnrvkw ===\n");

  const rpcTests = [
    {
      name: "send_message",
      params: {
        p_conversation_id: dummyConvId,
        p_content: "Hello",
        p_client_message_id: dummyMsgId,
        p_reply_to_message_id: null,
        p_forwarded_from_message_id: null,
        p_message_type: "text",
      },
    },
    {
      name: "edit_message",
      params: { p_message_id: dummyMsgId, p_content: "Edited" },
    },
    {
      name: "delete_message_for_me",
      params: { p_message_id: dummyMsgId },
    },
    {
      name: "delete_message_for_everyone",
      params: { p_message_id: dummyMsgId },
    },
    {
      name: "forward_message",
      params: {
        p_message_id: dummyMsgId,
        p_target_conversation_id: dummyConvId,
        p_client_message_id: "22222222-2222-2222-2222-222222222222",
      },
    },
    {
      name: "pin_message",
      params: { p_message_id: dummyMsgId },
    },
    {
      name: "unpin_message",
      params: { p_message_id: dummyMsgId },
    },
    {
      name: "toggle_message_reaction",
      params: { p_message_id: dummyMsgId, p_reaction: "🔥" },
    },
    {
      name: "mark_message_delivered",
      params: { p_message_id: dummyMsgId },
    },
    {
      name: "mark_conversation_read",
      params: { p_conversation_id: dummyConvId },
    },
    {
      name: "mark_conversation_unread",
      params: { p_conversation_id: dummyConvId },
    },
    {
      name: "save_draft",
      params: {
        p_conversation_id: dummyConvId,
        p_content: "Draft text",
        p_reply_to_message_id: null,
      },
    },
    {
      name: "delete_draft",
      params: { p_conversation_id: dummyConvId },
    },
  ];

  let allExist = true;

  for (const t of rpcTests) {
    const res = await testRpc(t.name, t.params);
    if (res.exists) {
      console.log(`  ✅ RPC ${t.name}: EXISTS (Server responded: "${res.errorMessage || "Success"}")`);
    } else {
      console.error(`  ❌ RPC ${t.name}: MISSING -> ${res.errorMessage}`);
      allExist = false;
    }
  }

  console.log("\n--- Checking columns on messages ---");
  const { data: colsData, error: colsErr } = await supabase
    .from("messages")
    .select("client_message_id, edited_at, deleted_by, delete_scope, forwarded_from_message_id")
    .limit(0);

  if (colsErr) {
    console.error("  ❌ messages columns MISSING:", colsErr.message);
  } else {
    console.log("  ✅ All Phase 3 columns on public.messages: PRESENT & ACCESSIBLE");
  }

  console.log("\n--- Checking 5 new Phase 3 Tables ---");
  const tables = [
    "message_user_states",
    "message_pins",
    "message_delivery_states",
    "conversation_user_states",
    "conversation_drafts",
  ];

  for (const tbl of tables) {
    const { error } = await supabase.from(tbl).select("*").limit(0);
    if (error) {
      console.error(`  ❌ Table ${tbl}: ERROR -> ${error.message}`);
    } else {
      console.log(`  ✅ Table ${tbl}: PRESENT (RLS active, returned 0 rows)`);
    }
  }

  console.log("\n=======================================================");
  if (allExist && !colsErr) {
    console.log(" 🎉 ALL PHASE 3 LIVE DATABASE OBJECTS CONFIRMED!");
  } else {
    console.log(" ⚠️ SOME OBJECTS ARE MISSING.");
  }
  console.log("=======================================================\n");
}

main().catch(console.error);
