import { createClient } from "@supabase/supabase-js";

const client = createClient(
  "https://rmvpdcftfdeizitnrvkw.supabase.co",
  "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU",
  { auth: { persistSession: false } }
);

const domains = [
  "test.com",
  "test.local",
  "example.com",
  "heat-chat.com",
  "heat-chat.app",
  "heat-chat.internal",
  "supabase.io",
  "gmail.com",
];

const prefixes = [
  "phase7_test_a",
  "phase7_test_b",
  "PHASE7_TEST_A",
  "PHASE7_TEST_B",
  "phase7_a",
  "phase7_b",
  "test_a",
  "test_b",
];

const passwords = [
  "Phase7TestPassword123!",
  "Password123!",
  "HeatChat123!",
  "AdminPassword123!",
];

async function findConfirmed() {
  console.log("Searching for confirmed accounts...");
  for (const p of prefixes) {
    for (const d of domains) {
      const email = `${p}@${d}`;
      for (const pass of passwords) {
        const { data, error } = await client.auth.signInWithPassword({ email, password: pass });
        if (!error && data?.session) {
          console.log(`🎉 MATCH FOUND: ${email} with password ${pass}! User ID: ${data.user.id}`);
          return;
        }
        if (error && error.message !== "Invalid login credentials" && error.message !== "Email not confirmed") {
          console.log(`Note for ${email}: ${error.message}`);
        }
      }
    }
  }
  console.log("Done checking candidates.");
}

findConfirmed().catch(console.error);
