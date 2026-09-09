import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function probeFunctions() {
  const rpcs = [
    { name: "register_push_subscription", args: {} },
    { name: "verify_push_subscription", args: { p_endpoint: "https://fcm.googleapis.com/test" } },
    { name: "get_user_push_subscriptions", args: {} },
    { name: "revoke_push_subscription", args: { p_subscription_id: "00000000-0000-0000-0000-000000000000" } },
    { name: "get_notification_unread_count", args: {} },
    { name: "mark_notification_read", args: { notification_id: "00000000-0000-0000-0000-000000000000" } },
    { name: "mark_all_notifications_read", args: {} },
  ];

  console.log("=== PROBING ALL NOTIFICATION / PUSH RPCS ===");
  for (const r of rpcs) {
    const { data, error, status } = await supabase.rpc(r.name, r.args);
    console.log(`RPC ${r.name}: Status ${status}`, error ? `Error [${error.code}]: ${error.message}` : "OK");
  }
}

probeFunctions().catch(console.error);
