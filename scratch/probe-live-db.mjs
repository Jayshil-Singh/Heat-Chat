// Inspect all RPCs and endpoints on live Supabase
const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const ANON_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

async function probeRpc(rpcName, params = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${rpcName}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });
  const text = await res.text();
  return { rpcName, status: res.status, body: text.slice(0, 150) };
}

async function probeTable(tableName) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}?limit=0`, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      Prefer: "count=none",
    },
  });
  const text = await res.text();
  return { tableName, status: res.status, body: text.slice(0, 150) };
}

async function main() {
  console.log("=== Probing Live Supabase: " + SUPABASE_URL + " ===");

  const rpcs = [
    "send_message",
    "edit_message",
    "delete_message_for_me",
    "delete_message_for_everyone",
    "forward_message",
    "pin_message",
    "unpin_message",
    "toggle_message_reaction",
    "mark_message_delivered",
    "mark_conversation_read",
    "mark_conversation_unread",
    "save_draft",
    "delete_draft",
    // Existing known RPCs
    "is_user_blocked",
    "can_send_message",
    "is_conversation_member",
  ];

  console.log("\n--- RPC Probing ---");
  for (const rpc of rpcs) {
    const res = await probeRpc(rpc);
    console.log(`RPC ${rpc}: HTTP ${res.status} -> ${res.body}`);
  }

  const tables = [
    "message_user_states",
    "message_pins",
    "message_delivery_states",
    "conversation_user_states",
    "conversation_drafts",
    "messages",
    "conversations",
  ];

  console.log("\n--- Table Probing ---");
  for (const tbl of tables) {
    const res = await probeTable(tbl);
    console.log(`Table ${tbl}: HTTP ${res.status} -> ${res.body}`);
  }
}

main().catch(console.error);
