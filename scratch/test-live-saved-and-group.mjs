import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function probe() {
  console.log("=== PROBING get_saved_messages ===");
  // Test 5 params
  const res5 = await supabase.rpc("get_saved_messages", {
    p_query: null,
    p_conversation_id: "451ed7e8-1f8e-40d0-8575-470720acf809",
    p_message_type: null,
    p_before: null,
    p_limit: 30
  });
  console.log("5 params result:", res5.error ? { code: res5.error.code, msg: res5.error.message, details: res5.error.details, hint: res5.error.hint } : "OK");

  // Test 6 params (with p_category)
  const res6 = await supabase.rpc("get_saved_messages", {
    p_query: null,
    p_category: "all",
    p_conversation_id: "451ed7e8-1f8e-40d0-8575-470720acf809",
    p_message_type: null,
    p_before: null,
    p_limit: 30
  });
  console.log("6 params result:", res6.error ? { code: res6.error.code, msg: res6.error.message, details: res6.error.details, hint: res6.error.hint } : "OK");

  console.log("\n=== PROBING remove_group_member ===");
  // Test various parameter names for remove_group_member
  const rgm1 = await supabase.rpc("remove_group_member", {
    conv_id: "451ed7e8-1f8e-40d0-8575-470720acf809",
    target_user_id: "00000000-0000-0000-0000-000000000000"
  });
  console.log("remove_group_member (conv_id, target_user_id):", rgm1.error ? { code: rgm1.error.code, msg: rgm1.error.message, details: rgm1.error.details, hint: rgm1.error.hint } : "OK");

  const rgm2 = await supabase.rpc("remove_group_member", {
    conversation_id: "451ed7e8-1f8e-40d0-8575-470720acf809",
    user_id: "00000000-0000-0000-0000-000000000000"
  });
  console.log("remove_group_member (conversation_id, user_id):", rgm2.error ? { code: rgm2.error.code, msg: rgm2.error.message, details: rgm2.error.details, hint: rgm2.error.hint } : "OK");

  const rgm3 = await supabase.rpc("remove_group_member", {
    conversation_id: "451ed7e8-1f8e-40d0-8575-470720acf809",
    member_id: "00000000-0000-0000-0000-000000000000"
  });
  console.log("remove_group_member (conversation_id, member_id):", rgm3.error ? { code: rgm3.error.code, msg: rgm3.error.message, details: rgm3.error.details, hint: rgm3.error.hint } : "OK");

  const rgm4 = await supabase.rpc("remove_group_member", {
    p_conversation_id: "451ed7e8-1f8e-40d0-8575-470720acf809",
    p_user_id: "00000000-0000-0000-0000-000000000000"
  });
  console.log("remove_group_member (p_conversation_id, p_user_id):", rgm4.error ? { code: rgm4.error.code, msg: rgm4.error.message, details: rgm4.error.details, hint: rgm4.error.hint } : "OK");
}

probe().catch(console.error);
