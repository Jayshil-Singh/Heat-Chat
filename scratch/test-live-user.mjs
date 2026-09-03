import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  const email = `test_live_${Date.now()}@heat.chat`;
  const password = "Password123!Secure";
  const username = `u_${Date.now()}`;
  
  console.log("Attempting signUp for:", email);
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,
        display_name: "Live Test User"
      }
    }
  });

  if (error) {
    console.log("SignUp error:", error.message);
  } else {
    console.log("SignUp success:", {
      user_id: data.user?.id,
      has_session: Boolean(data.session),
      confirmed_at: data.user?.email_confirmed_at
    });
  }
}

main().catch(console.error);
