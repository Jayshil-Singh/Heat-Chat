import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false }
});

const emails = [
  "phase7_test_a@test.local",
  "phase7_test_b@test.local",
  "phase7_a@test.local",
  "phase7_b@test.local",
  "phase7-test-a@test.local",
  "phase7-test-b@test.local",
  "phase7testa@test.local",
  "phase7testb@test.local",
  "phase7_test_a@heat-chat.internal",
  "phase7_test_b@heat-chat.internal",
  "test_a@test.local",
  "test_b@test.local",
  "test_phase7_a@test.local",
  "test_phase7_b@test.local",
  "phase7_user_a@test.local",
  "phase7_user_b@test.local",
];

const passwords = [
  "Phase7TestPassword123!",
  "Password123!",
  "Phase7Password123!",
  "TestPassword123!",
];

async function scan() {
  console.log("Scanning possible confirmed accounts...");
  for (const email of emails) {
    for (const password of passwords) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (!error && data?.session) {
        console.log(`🎉 FOUND CONFIRMED ACCOUNT: ${email} with ${password}! User: ${data.user.id}`);
        return;
      }
      if (error && error.message !== "Invalid login credentials" && error.message !== "Email not confirmed") {
        console.log(`Interesting error for ${email}:`, error.message);
      }
    }
  }
  console.log("Scan complete. No confirmed account matched the wordlist.");
}

scan().catch(console.error);
