/**
 * Heat Chat — Phase 7 Live Notifications Schema Audit Probe
 * Inspects rmvpdcftfdeizitnrvkw.supabase.co for existing notification infrastructure
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const supabaseKey = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectTable(tableName) {
  const { data, error } = await supabase.from(tableName).select("*").limit(1);
  if (error) {
    if (error.code === "PGRST205" || error.message?.includes("not find")) {
      console.log(`  ❌ Table public.${tableName}: DOES NOT EXIST (or not in cache)`);
      return null;
    }
    console.log(`  ⚠️ Table public.${tableName}: Exists but returned ${error.code} (${error.message})`);
    return { exists: true, error: error.message };
  }
  console.log(`  ✅ Table public.${tableName}: EXISTS and accessible via PostgREST`);
  return { exists: true, sample: data };
}

async function inspectRpc(rpcName, params = {}) {
  const { data, error } = await supabase.rpc(rpcName, params);
  if (error) {
    if (error.code === "PGRST202" || error.message?.includes("not find the function")) {
      console.log(`  ❌ RPC public.${rpcName}: DOES NOT EXIST`);
      return false;
    }
    console.log(`  ✅ RPC public.${rpcName}: EXISTS (returned: ${error.message})`);
    return true;
  }
  console.log(`  ✅ RPC public.${rpcName}: EXISTS and returned data`);
  return true;
}

async function run() {
  console.log("==================================================================");
  console.log(" PHASE 7 LIVE NOTIFICATIONS SCHEMA AUDIT");
  console.log(" Target:", supabaseUrl);
  console.log("==================================================================\n");

  console.log("--- 1. Tables Audit ---");
  await inspectTable("notifications");
  await inspectTable("notification_preferences");
  await inspectTable("conversation_notification_preferences");
  await inspectTable("conversation_user_states");
  await inspectTable("push_subscriptions");

  console.log("\n--- 2. RPCs Audit ---");
  await inspectRpc("mark_notification_as_read", { notif_id: "00000000-0000-0000-0000-000000000000" });
  await inspectRpc("mark_all_notifications_as_read");
  await inspectRpc("toggle_conversation_mute", { conv_id: "00000000-0000-0000-0000-000000000000", is_muted: true });
  await inspectRpc("register_push_subscription");
  await inspectRpc("get_notification_unread_count");

  console.log("\n==================================================================");
}

run().catch(console.error);
