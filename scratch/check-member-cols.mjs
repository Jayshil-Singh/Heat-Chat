import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkMemberCols() {
  const cols = ["id", "conversation_id", "user_id", "member_id", "role", "joined_at", "created_at"];
  for (const c of cols) {
    const { error } = await supabase.from("conversation_members").select(c).limit(0);
    console.log(`conversation_members.${c}: ${error ? "MISSING: " + error.message : "EXISTS"}`);
  }
}

checkMemberCols().catch(console.error);
