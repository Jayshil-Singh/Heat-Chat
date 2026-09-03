import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkPhase6() {
  const rpcs = ["create_poll", "vote_poll", "close_poll", "join_group_via_invite_link", "delete_group_conversation"];
  for (const rpc of rpcs) {
    const { data, error } = await supabase.rpc(rpc, {});
    console.log(`RPC [${rpc}]:`, error ? { code: error.code, msg: error.message } : "OK");
  }

  const tables = ["polls", "poll_options", "poll_votes", "group_invitations", "group_invite_links"];
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select("*").limit(0);
    console.log(`Table [${t}]:`, error ? { code: error.code, msg: error.message } : "OK");
  }
}

checkPhase6().catch(console.error);
