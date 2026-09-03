import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log("=== 1. AUDITING LIVE SUPABASE DATABASE FUNCTIONS ===");

  // Check 1: get_saved_messages
  console.log("\n--- Probing public.get_saved_messages ---");
  // Test calling with dummy/valid parameters
  const { data: savedData, error: savedErr } = await supabase.rpc("get_saved_messages", {
    p_query: null,
    p_conversation_id: null,
    p_message_type: null,
    p_before: null,
    p_limit: 10
  });

  console.log("get_saved_messages result:", {
    data: savedData,
    error: savedErr
  });

  // Check 2: remove_group_member
  console.log("\n--- Probing public.remove_group_member ---");
  // Try with conv_id and target_user_id
  const testConvId = "451ed7e8-1f8e-40d0-8575-470720acf809";
  const testUserId = "00000000-0000-0000-0000-000000000000";

  const { data: removeData, error: removeErr } = await supabase.rpc("remove_group_member", {
    conv_id: testConvId,
    target_user_id: testUserId
  });

  console.log("remove_group_member result:", {
    data: removeData,
    error: removeErr
  });

  // Test OpenAPI schema / RPC signatures from PostgREST
  console.log("\n--- Fetching PostgREST schema for functions ---");
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_saved_messages`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });
    const txt = await res.text();
    console.log("Direct POST /rest/v1/rpc/get_saved_messages response:", res.status, txt);
  } catch (e) {
    console.error("Fetch get_saved_messages error:", e);
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/remove_group_member`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        conv_id: testConvId,
        target_user_id: testUserId
      })
    });
    const txt = await res.text();
    console.log("Direct POST /rest/v1/rpc/remove_group_member response:", res.status, txt);
  } catch (e) {
    console.error("Fetch remove_group_member error:", e);
  }
}

main().catch(console.error);
