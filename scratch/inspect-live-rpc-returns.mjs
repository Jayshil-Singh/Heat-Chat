import { createClient } from "@supabase/supabase-js";

const client = createClient(
  "https://rmvpdcftfdeizitnrvkw.supabase.co",
  "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU",
  { auth: { persistSession: false } }
);

async function test() {
  const c = await client.rpc("claim_notification_deliveries", { p_batch_size: 10, p_lease_seconds: 60 });
  console.log("claim_notification_deliveries:", c);

  const u = await client.rpc("get_notification_unread_count");
  console.log("get_notification_unread_count:", u);

  const clean = await client.rpc("cleanup_stale_notifications", { p_retention_days: 30, p_deliveries_retention_days: 7 });
  console.log("cleanup_stale_notifications:", clean);
}

test();
