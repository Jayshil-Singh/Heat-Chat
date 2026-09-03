import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
  console.log("Checking live database tables for Phase 7...");
  const { data: subData, error: subError } = await supabase.from("push_subscriptions").select("id").limit(1);
  console.log("push_subscriptions table:", subError ? subError.message : "EXISTS");

  const { data: delData, error: delError } = await supabase.from("notification_deliveries").select("id").limit(1);
  console.log("notification_deliveries table:", delError ? delError.message : "EXISTS");

  const { data: notifData, error: notifError } = await supabase.from("notifications").select("id, dedupe_key, event_type").limit(1);
  console.log("notifications phase 7 columns:", notifError ? notifError.message : "EXISTS");
}

check();
