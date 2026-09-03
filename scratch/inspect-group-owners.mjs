import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rmvpdcftfdeizitnrvkw.supabase.co";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log("Checking group conversations...");
  // Query conversations
  const { data: convs, error: convErr } = await supabase
    .from("conversations")
    .select("id, type, name, created_at")
    .eq("type", "group");

  if (convErr) {
    console.error("Error querying conversations:", convErr.message);
    return;
  }

  console.log(`Found ${convs ? convs.length : 0} group conversations.`);

  if (!convs || convs.length === 0) {
    console.log("No group conversations exist. Clean slate for invariant!");
    return;
  }

  for (const c of convs) {
    const { data: members, error: mErr } = await supabase
      .from("conversation_members")
      .select("user_id, role")
      .eq("conversation_id", c.id);

    if (mErr) {
      console.error(`Error querying members for ${c.id}:`, mErr.message);
      continue;
    }

    const owners = (members || []).filter(m => m.role === "owner");
    console.log(`Group ${c.id} ("${c.name}"): total members=${members?.length}, owners=${owners.length}`);
    if (owners.length === 0) {
      console.warn(`⚠️ ZERO OWNERS detected in group ${c.id}!`);
    } else if (owners.length > 1) {
      console.error(`🚨 MULTIPLE OWNERS (${owners.length}) detected in group ${c.id}!`);
    }
  }
}

check();
