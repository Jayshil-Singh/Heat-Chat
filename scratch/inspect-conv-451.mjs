import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function inspectConv() {
  const convId = "451ed7e8-1f8e-40d0-8575-470720acf809";
  console.log(`=== INSPECTING CONVERSATION ${convId} ===`);
  const { data: conv, error: cErr } = await supabase.from("conversations").select("*").eq("id", convId);
  console.log("Conversation:", conv, cErr);

  const { data: members, error: mErr } = await supabase.from("conversation_members").select("*").eq("conversation_id", convId);
  console.log("Members:", members, mErr);
}

inspectConv().catch(console.error);
