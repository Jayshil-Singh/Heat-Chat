import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkLiveTables() {
  const tables = [
    "profiles",
    "conversations",
    "conversation_members",
    "messages",
    "attachments",
    "starred_messages",
    "friends",
    "friend_requests",
    "user_blocks",
    "moderation_reports",
    "message_user_states",
    "message_pins",
    "message_reactions",
    "message_reads",
    "message_delivery_states",
    "conversation_user_states",
    "conversation_drafts",
    "polls",
    "group_invitations"
  ];

  console.log("=== CHECKING TABLES ON LIVE DB ===");
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select("*").limit(0);
    console.log(`  Table [${t}]: ${error ? "MISSING: " + error.message : "EXISTS"}`);
  }

  console.log("\n=== CHECKING CONVERSATIONS COLUMNS ===");
  const { data: convSample, error: convErr } = await supabase.from("conversations").select("*").limit(1);
  if (convErr) {
    console.log("Conversations query error:", convErr);
  } else if (convSample && convSample.length > 0) {
    console.log("Conversations columns:", Object.keys(convSample[0]));
  } else {
    // try selecting individual columns to see which exist
    const cols = ["id", "type", "conversation_type", "name", "description", "avatar_url", "cover_url", "privacy", "permissions", "created_by", "created_at", "updated_at"];
    for (const c of cols) {
      const { error } = await supabase.from("conversations").select(c).limit(0);
      console.log(`  Column conversations.${c}: ${error ? "MISSING (" + error.message + ")" : "EXISTS"}`);
    }
  }
}

checkLiveTables().catch(console.error);
