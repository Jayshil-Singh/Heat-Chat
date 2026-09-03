import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const userA = { email: "phase7_test_a@test.local", password: "Phase7TestPassword123!", username: "phase7_test_a" };
const userB = { email: "phase7_test_b@test.local", password: "Phase7TestPassword123!", username: "phase7_test_b" };

async function registerAndCheck() {
  console.log("=== REGISTERING DEDICATED PHASE 7 TEST ACCOUNTS ===");

  for (const u of [userA, userB]) {
    console.log(`\nAttempting signUp for ${u.email}...`);
    const { data: signData, error: signErr } = await client.auth.signUp({
      email: u.email,
      password: u.password,
      options: {
        data: { username: u.username, display_name: u.username.toUpperCase() }
      }
    });

    if (signErr) {
      console.log(`  signUp response: ${signErr.message}`);
    } else {
      console.log(`  signUp user ID: ${signData.user?.id}, confirmed: ${!!signData.user?.email_confirmed_at}`);
    }

    console.log(`Attempting signInWithPassword for ${u.email}...`);
    const { data: authData, error: authErr } = await client.auth.signInWithPassword({
      email: u.email,
      password: u.password
    });

    if (authErr) {
      console.log(`  signIn response: ❌ ${authErr.message}`);
    } else if (authData?.session) {
      console.log(`  signIn response: ✅ ACTIVE SESSION CONFIRMED (User: ${authData.user.id})`);
    } else {
      console.log(`  signIn response: ❌ No session returned`);
    }
  }
}

registerAndCheck().catch(console.error);
