import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function check() {
  console.log("Checking User A (phase7_test_a@test.local)...");
  const resA = await client.auth.signInWithPassword({
    email: "phase7_test_a@test.local",
    password: "Phase7TestPassword123!"
  });
  console.log("User A:", resA.error ? resA.error.message : `CONFIRMED (User ID: ${resA.data.user.id})`);

  console.log("Checking User B (phase7_test_b@test.local)...");
  const resB = await client.auth.signInWithPassword({
    email: "phase7_test_b@test.local",
    password: "Phase7TestPassword123!"
  });
  console.log("User B:", resB.error ? resB.error.message : `CONFIRMED (User ID: ${resB.data.user.id})`);
}

check().catch(console.error);
