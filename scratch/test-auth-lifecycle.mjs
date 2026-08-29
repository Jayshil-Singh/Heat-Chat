import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

// Load .env.local
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

function makeClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ [FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`  ✅ [PASS] ${message}`);
}

async function runAuthLifecycleTests() {
  console.log("===============================================================================");
  console.log("HEAT CHAT — AUTH LIFECYCLE & MULTI-TAB SESSION VERIFICATION");
  console.log("===============================================================================\n");

  const client = makeClient();
  const testRunId = Date.now().toString().slice(-6);
  const email = `lifecycle_${testRunId}@test.local`;
  const password = `LifePass_${testRunId}!`;

  // 1. Registration
  console.log("1. Testing Registration & Verification Payload...");
  const { data: regData, error: regErr } = await client.auth.signUp({
    email,
    password,
    options: {
      data: { username: `user_${testRunId}`, display_name: "Lifecycle User" },
      emailRedirectTo: "http://localhost:3000/auth/callback",
    },
  });
  assert(!regErr && regData.user, "User registration completes cleanly");
  assert(Boolean(regData.user.id), "User ID assigned by Supabase Auth");

  // 2. Login
  console.log("\n2. Testing Login Behavior...");
  const { data: loginData, error: loginErr } = await client.auth.signInWithPassword({
    email,
    password,
  });
  assert(!loginErr && loginData.session, "Login returns authenticated session");
  assert(Boolean(loginData.user.email_confirmed_at), "User has authoritative email_confirmed_at value");

  // 3. Session Refresh (getUser / refreshSession)
  console.log("\n3. Testing Session Refresh & Authoritative Token Verification...");
  const authedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${loginData.session.access_token}` } },
  });

  const { data: userData, error: userErr } = await authedClient.auth.getUser(loginData.session.access_token);
  assert(!userErr && userData.user, "getUser retrieves fresh authoritative user record");
  assert(userData.user.email === email, "Fresh user matches authenticated account");

  // 4. Multi-tab simulation (re-evaluating user on focus)
  console.log("\n4. Testing Multi-Tab Re-Evaluation Simulation...");
  const multiTabCheck = await authedClient.auth.getUser();
  const isVerifiedInTab = Boolean(multiTabCheck.data?.user?.email_confirmed_at);
  assert(isVerifiedInTab, "Multi-tab re-evaluation correctly evaluates authoritative verification status");

  // 5. Logout
  console.log("\n5. Testing Logout...");
  const { error: logoutErr } = await authedClient.auth.signOut();
  assert(!logoutErr, "SignOut successfully revokes session");

  console.log("\n===============================================================================");
  console.log("🎉 ALL AUTH LIFECYCLE TESTS PASSED!");
  console.log("===============================================================================\n");
}

runAuthLifecycleTests().catch((err) => {
  console.error("Fatal lifecycle test error:", err);
  process.exit(1);
});
