import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkUserAuth() {
  const email = "p10_demo@test.local";
  const password = "Password123!";
  const { data: authData, error: authErr } = await client.auth.signInWithPassword({ email, password });

  if (authErr) {
    console.log("Sign in error:", authErr.message);
    return null;
  }

  console.log("Signed in successfully as:", authData.user.id);
  return authData.session;
}

checkUserAuth().catch(console.error);
