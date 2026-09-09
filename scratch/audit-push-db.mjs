import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log("=== PROBING PUSH SUBSCRIPTIONS IN SUPABASE ===");

  // 1. Probe push_subscriptions table
  const { data: tableData, error: tableError } = await supabase
    .from("push_subscriptions")
    .select("*")
    .limit(1);
  console.log("push_subscriptions table select:", { data: tableData, error: tableError });

  // 2. Probe register_push_subscription RPC (anonymous call to check existence and error)
  const { data: rpcData, error: rpcError } = await supabase.rpc("register_push_subscription", {
    p_endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
    p_p256dh: "test-p256dh-key-min-16-chars",
    p_auth: "test-auth-key-min-8",
    p_user_agent: "test-ua",
    p_device_type: "desktop",
    p_device_id: null,
    p_installation_id: null,
  });
  console.log("register_push_subscription (7 params):", { data: rpcData, error: rpcError });

  // 3. Try with 5 params (older migration signature from Phase 7)
  const { data: rpcData5, error: rpcError5 } = await supabase.rpc("register_push_subscription", {
    p_endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
    p_p256dh: "test-p256dh-key-min-16-chars",
    p_auth: "test-auth-key-min-8",
    p_user_agent: "test-ua",
    p_device_type: "desktop",
  });
  console.log("register_push_subscription (5 params):", { data: rpcData5, error: rpcError5 });

  // 4. Probe verify_push_subscription RPC
  const { data: verifyData, error: verifyError } = await supabase.rpc("verify_push_subscription", {
    p_endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
  });
  console.log("verify_push_subscription:", { data: verifyData, error: verifyError });
}

main().catch(console.error);
