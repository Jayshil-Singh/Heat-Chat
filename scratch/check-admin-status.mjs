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

async function checkAdminStatus() {
  console.log("Checking Admin Roles & Existing Admin Users in Database...");

  // Check roles
  const { data: roles, error: rolesErr } = await supabase
    .from("admin_roles")
    .select("id, name, hierarchy_level");

  console.log("Admin Roles defined in DB:", roles || rolesErr?.message);

  // Check profiles count
  const { count: profileCount } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true });

  console.log("Total Profiles in DB:", profileCount);

  // Check admin_user_roles count
  const { data: userRoles, error: urErr } = await supabase
    .from("admin_user_roles")
    .select("user_id, role_id");

  console.log("Existing assigned admin_user_roles count:", userRoles?.length || 0, urErr ? `(RLS Protected / ${urErr.message})` : "");
}

checkAdminStatus().catch(console.error);
