import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

async function testAuth() {
  const emailA = `test_phase7_userA_${Date.now()}@example.com`;
  const emailB = `test_phase7_userB_${Date.now()}@example.com`;
  const password = "TestPassword123!#";

  const clientA = createClient(SUPABASE_URL, SUPABASE_KEY);
  const clientB = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log("Signing up User A:", emailA);
  const { data: dataA, error: errA } = await clientA.auth.signUp({
    email: emailA,
    password: password,
    options: { data: { username: "user_a_" + Date.now() } }
  });
  console.log("User A signup:", errA ? errA.message : `Success (session: ${!!dataA.session})`);

  console.log("Signing up User B:", emailB);
  const { data: dataB, error: errB } = await clientB.auth.signUp({
    email: emailB,
    password: password,
    options: { data: { username: "user_b_" + Date.now() } }
  });
  console.log("User B signup:", errB ? errB.message : `Success (session: ${!!dataB.session})`);

  return { clientA, clientB, sessionA: dataA.session, sessionB: dataB.session };
}

testAuth().catch(console.error);
