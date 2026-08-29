import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.cwd(), ".env.local");
let SUPABASE_URL = "";
let SUPABASE_ANON_KEY = "";

if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("NEXT_PUBLIC_SUPABASE_URL=")) {
      SUPABASE_URL = trimmed.split("=")[1].trim().replace(/^["']|["']$/g, "");
    } else if (trimmed.startsWith("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=")) {
      SUPABASE_ANON_KEY = trimmed.split("=")[1].trim().replace(/^["']|["']$/g, "");
    }
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkAllCounts() {
  const allTables = [
    "profiles", "conversations", "conversation_members", "messages",
    "message_reactions", "message_reads", "attachments", "friendships",
    "notification_preferences", "conversation_notification_preferences",
    "notifications", "starred_messages", "admin_roles", "admin_permissions",
    "admin_role_permissions", "admin_user_roles", "admin_audit_logs",
    "admin_security_events", "moderation_reports", "system_settings",
    "admin_invitations", "admin_mfa_recovery_codes"
  ];

  console.log("=== ALL 22 TABLE ROW COUNTS ===");
  for (const table of allTables) {
    const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
    if (error) {
      console.log(`${table}: [Error / RLS: ${error.message}]`);
    } else {
      console.log(`${table}: ${count} rows`);
    }
  }

  const { data: bsAvail, error: bsErr } = await supabase.rpc("admin_is_bootstrap_available");
  console.log("admin_is_bootstrap_available:", bsAvail, bsErr?.message || "");
}

checkAllCounts().catch(console.error);
