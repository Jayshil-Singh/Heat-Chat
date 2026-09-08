import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const email = `discover_test_${Date.now()}@test.internal`;
  const password = "TestPassword123!@#";

  console.log("1. Signing up temporary test user:", email);
  const { data: signUpData, error: signUpError } = await client.auth.signUp({
    email,
    password,
    options: {
      data: {
        username: `user_${Date.now().toString().slice(-6)}`,
        display_name: "Discover Test",
      },
    },
  });

  if (signUpError) {
    console.error("SignUp error:", signUpError);
    return;
  }

  const session = signUpData?.session;
  console.log("SignUp success, session present?", Boolean(session));

  let token = session?.access_token;
  let userId = signUpData?.user?.id;

  if (!token) {
    console.log("No session from signup, attempting signIn...");
    const { data: signInData, error: signInError } = await client.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      console.error("SignIn error:", signInError);
      return;
    }
    token = signInData?.session?.access_token;
    userId = signInData?.user?.id;
  }

  console.log("Authenticated User ID:", userId);

  const authClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  console.log("\n2. Calling get_my_discoverability...");
  const res1 = await authClient.rpc("get_my_discoverability");
  console.log("get_my_discoverability:", res1);

  console.log("\n3. Calling set_discoverability({ enabled: true })...");
  const res2 = await authClient.rpc("set_discoverability", { enabled: true });
  console.log("set_discoverability:", res2);

  console.log("\n4. Calling discover_people({ search_query: null, result_limit: 30, result_offset: 0 })...");
  const res3 = await authClient.rpc("discover_people", {
    search_query: null,
    result_limit: 30,
    result_offset: 0,
  });
  console.log("discover_people result:", {
    data: res3.data,
    error: res3.error ? {
      code: res3.error.code,
      message: res3.error.message,
      details: res3.error.details,
      hint: res3.error.hint,
    } : null,
  });

  console.log("\n5. Calling get_my_friend_requests()...");
  const res4 = await authClient.rpc("get_my_friend_requests");
  console.log("get_my_friend_requests:", res4);
}

main().catch(console.error);
