import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

async function testLocalSignup() {
  const testRunId = Date.now();
  const aliceEmail = `alice_${testRunId}@test.local`;
  const password = "Password123!";

  const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: reg, error: regErr } = await client.auth.signUp({
    email: aliceEmail,
    password,
    options: { data: { username: `u_${testRunId}`, display_name: "Alice" } },
  });

  console.log("Signup with @test.local:", regErr ? regErr.message : `Success (session: ${!!reg.session})`);
  if (!reg.session) {
    const { data: auth, error: authErr } = await client.auth.signInWithPassword({
      email: aliceEmail,
      password,
    });
    console.log("Direct sign-in:", authErr ? authErr.message : `Success (session: ${!!auth.session})`);
  }
}

testLocalSignup().catch(console.error);
