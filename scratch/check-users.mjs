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

async function listUsers() {
  console.log("Querying public profiles in database...");
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, status, created_at, updated_at");

  if (error) {
    console.log(`Profiles query result: ${error.code} - ${error.message}`);
  } else {
    console.log(`Found ${profiles?.length || 0} profiles in database:`);
    console.log(JSON.stringify(profiles, null, 2));
  }
}

listUsers().catch(console.error);
