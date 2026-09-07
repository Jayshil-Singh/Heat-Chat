import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.cwd(), ".env.local");
let supabaseUrl = "";
let supabaseAnonKey = "";

if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("NEXT_PUBLIC_SUPABASE_URL=")) {
      supabaseUrl = trimmed.split("=")[1].trim().replace(/^["']|["']$/g, "");
    } else if (trimmed.startsWith("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=")) {
      supabaseAnonKey = trimmed.split("=")[1].trim().replace(/^["']|["']$/g, "");
    }
  }
}

const client = createClient(supabaseUrl, supabaseAnonKey);
const { data, error } = await client.rpc("get_my_discoverability");
console.log("get_my_discoverability result:", { data, error });

const { data: prefData, error: prefError } = await client.from("discovery_preferences").select("*").limit(1);
console.log("discovery_preferences table result:", { prefData, prefError });
