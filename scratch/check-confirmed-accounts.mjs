import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const candidates = [
  { email: "p10_demo@test.local", password: "Password123!" },
  { email: "demo@test.local", password: "Password123!" },
  { email: "test_verified@test.local", password: "Password123!" },
  { email: "admin@test.local", password: "Password123!" },
  { email: "test_user_phase8@test.local", password: "Password123!" },
  { email: "test_user_phase9@test.local", password: "Password123!" },
  { email: "test@example.com", password: "Password123!" },
  { email: "admin@heat-chat.internal", password: "AdminPassword123!" },
];

async function checkCandidates() {
  console.log("Checking candidate confirmed accounts...");
  const confirmed = [];
  for (const c of candidates) {
    const { data, error } = await client.auth.signInWithPassword({
      email: c.email,
      password: c.password
    });
    if (!error && data?.session) {
      console.log(`✅ Confirmed user found: ${c.email}`);
      confirmed.push({ email: c.email, user: data.user, session: data.session });
    } else {
      console.log(`❌ ${c.email}: ${error?.message || "No session"}`);
    }
  }
  console.log(`Total confirmed accounts found: ${confirmed.length}`);
}

checkCandidates();
