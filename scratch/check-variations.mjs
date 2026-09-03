import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const variations = [
  { email: "phase7_test_a@test.local", password: "Phase7TestPassword123!" },
  { email: "phase7_test_b@test.local", password: "Phase7TestPassword123!" },
  { email: "phase7_test_a@example.com", password: "Phase7TestPassword123!" },
  { email: "phase7_test_b@example.com", password: "Phase7TestPassword123!" },
  { email: "phase7_a@test.local", password: "Phase7TestPassword123!" },
  { email: "phase7_b@test.local", password: "Phase7TestPassword123!" },
  { email: "phase7_test_a@test.local", password: "Password123!" },
  { email: "phase7_test_b@test.local", password: "Password123!" },
  { email: "p7_test_a@test.local", password: "Password123!" },
  { email: "p7_test_b@test.local", password: "Password123!" },
  { email: "phase7_a@example.com", password: "Password123!" },
  { email: "phase7_b@example.com", password: "Password123!" },
];

async function checkVariations() {
  console.log("Checking email/password variations...");
  for (const v of variations) {
    const { data, error } = await client.auth.signInWithPassword({
      email: v.email,
      password: v.password
    });
    if (!error && data?.session) {
      console.log(`✅ SUCCESS: ${v.email} logged in! User ID: ${data.user.id}`);
    } else {
      console.log(`❌ ${v.email} (${v.password}): ${error?.message}`);
    }
  }
}

checkVariations().catch(console.error);
