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

const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function setupDemoUser() {
  const email = "p10_demo@test.local";
  const password = "Password123!";

  console.log("Setting up demo user:", email);

  // Sign up
  const { data: signUpData, error: signUpErr } = await client.auth.signUp({
    email,
    password,
    options: {
      data: {
        username: "p10_demo",
        display_name: "Phase10 Demo User",
      },
    },
  });

  // Sign in to get auth token
  const { data: signInData, error: signInErr } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (signInErr || !signInData.session) {
    console.error("Sign in error:", signInErr);
    return;
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${signInData.session.access_token}` } },
  });

  await userClient.from("profiles").upsert({
    id: signInData.user.id,
    username: "p10_demo",
    display_name: "Phase10 Demo User",
    status: "online",
  });

  console.log("Demo user created and authenticated successfully!");
}

setupDemoUser();
