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

async function inspect() {
  console.log("Checking live database tables on Supabase...");
  const tables = [
    "profiles",
    "conversations",
    "messages",
    "admin_roles",
    "admin_permissions",
    "admin_role_permissions",
    "admin_user_roles",
    "admin_audit_logs",
    "moderation_reports",
    "system_settings",
    "admin_invitations",
    "admin_mfa_recovery_codes"
  ];

  for (const table of tables) {
    const { data, error } = await supabase.from(table).select("*").limit(1);
    if (error) {
      console.log(`Table '${table}': NOT FOUND or ERROR -> ${error.code} : ${error.message}`);
    } else {
      console.log(`Table '${table}': EXISTS (rows returned: ${data?.length || 0})`);
    }
  }
}

inspect().catch(console.error);
