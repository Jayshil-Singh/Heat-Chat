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

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true }
});

async function diagnoseSignUp() {
  console.log("==================================================================");
  console.log(" DIAGNOSING SUPABASE SIGNUP RETURN VALUES & STATE");
  console.log("==================================================================");

  const testEmail = `test_diag_${Date.now()}@example.com`;
  const testPassword = "TestPassword123!@#";

  console.log(`\nAttempting signUp with: ${testEmail}`);
  const { data, error } = await supabase.auth.signUp({
    email: testEmail,
    password: testPassword,
    options: {
      data: {
        username: `diag_${Date.now()}`.slice(0, 20),
        display_name: "Diagnostic User",
      },
      emailRedirectTo: "http://localhost:3000/auth/callback"
    }
  });

  if (error) {
    console.error("signUp Error:", error.message);
    return;
  }

  console.log("\n--- SIGNUP RESULT ---");
  console.log("User ID:", data.user?.id);
  console.log("User email:", data.user?.email);
  console.log("User email_confirmed_at:", data.user?.email_confirmed_at);
  console.log("User confirmed_at:", data.user?.confirmed_at);
  console.log("Session exists:", Boolean(data.session));
  console.log("Session access_token exists:", Boolean(data.session?.access_token));
  console.log("Identities count:", data.user?.identities?.length);

  // Check getUser() immediately
  const { data: userData, error: userError } = await supabase.auth.getUser();
  console.log("\n--- GET USER IMMEDIATELY AFTER SIGNUP ---");
  console.log("getUser ID:", userData.user?.id);
  console.log("getUser email_confirmed_at:", userData.user?.email_confirmed_at);
  console.log("getUser error:", userError?.message);

  // Clean up the created test user via SQL / admin if needed or delete
  console.log("\nDiagnosis complete.");
}

diagnoseSignUp().catch(console.error);
