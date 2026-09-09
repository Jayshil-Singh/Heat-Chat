import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkCatalog() {
  console.log("=== CHECKING POSTGREST RPC ENDPOINTS ===");

  // Call with exact 7 params
  const res7 = await fetch(`${SUPABASE_URL}/rest/v1/rpc/register_push_subscription`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
      p_p256dh: "test-p256dh-key-min-16-chars",
      p_auth: "test-auth-key-min-8",
      p_user_agent: "test-ua",
      p_device_type: "desktop",
      p_device_id: null,
      p_installation_id: null,
    }),
  });
  console.log("Status with 7 params:", res7.status, await res7.text());

  // Call with 5 params
  const res5 = await fetch(`${SUPABASE_URL}/rest/v1/rpc/register_push_subscription`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
      p_p256dh: "test-p256dh-key-min-16-chars",
      p_auth: "test-auth-key-min-8",
      p_user_agent: "test-ua",
      p_device_type: "desktop",
    }),
  });
  console.log("Status with 5 params:", res5.status, await res5.text());
}

checkCatalog().catch(console.error);
