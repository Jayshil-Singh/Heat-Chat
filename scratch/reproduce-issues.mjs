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

const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  console.log("=== SIGNING IN AS DEMO USER ===");
  const email = "p10_demo@test.local";
  const password = "Password123!";
  const { data: authData, error: authErr } = await client.auth.signInWithPassword({ email, password });
  
  if (authErr) {
    console.error("Sign in failed:", authErr);
    return;
  }

  const token = authData.session.access_token;
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  console.log("Authenticated as:", authData.user.id);

  console.log("\n=== REPRODUCING ISSUE 1: get_saved_messages ===");
  const savedRes = await userClient.rpc("get_saved_messages", {
    p_query: null,
    p_conversation_id: "451ed7e8-1f8e-40d0-8575-470720acf809",
    p_message_type: null,
    p_before: null,
    p_limit: 30
  });

  if (savedRes.error) {
    console.error("get_saved_messages ERROR:", savedRes.error);
  } else {
    console.log("get_saved_messages SUCCESS! Rows:", savedRes.data?.length);
  }

  console.log("\n=== REPRODUCING ISSUE 2: remove_group_member ===");
  const removeRes = await userClient.rpc("remove_group_member", {
    conv_id: "451ed7e8-1f8e-40d0-8575-470720acf809",
    target_user_id: "00000000-0000-0000-0000-000000000000"
  });

  if (removeRes.error) {
    console.error("remove_group_member ERROR:", removeRes.error);
  } else {
    console.log("remove_group_member SUCCESS!");
  }
}

main().catch(console.error);
