import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rmvpdcftfdeizitnrvkw.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY is required to run the Admin Auth creation script.");
  console.error("Usage: SUPABASE_SERVICE_ROLE_KEY=<service_role_key> node scratch/admin-recreate-test-users.mjs");
  process.exit(1);
}

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const client = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU", {
  auth: { persistSession: false, autoRefreshToken: false }
});

const userAData = {
  email: "phase7_test_a@test.local",
  password: "Phase7TestPassword123!",
  username: "phase7_test_a",
  display_name: "PHASE7_TEST_A"
};

const userBData = {
  email: "phase7_test_b@test.local",
  password: "Phase7TestPassword123!",
  username: "phase7_test_b",
  display_name: "PHASE7_TEST_B"
};

async function run() {
  console.log("=== SUPABASE ADMIN AUTH: RECREATING CONFIRMED USERS ===");

  // 1. List and identify existing users
  const { data: listData, error: listErr } = await adminClient.auth.admin.listUsers();
  if (listErr) {
    console.error("Error listing users:", listErr.message);
    process.exit(1);
  }

  for (const target of [userAData, userBData]) {
    const existing = listData.users.find(u => u.email === target.email);
    if (existing) {
      console.log(`Found existing user ${target.email} (${existing.id}). Deleting...`);
      const { error: delErr } = await adminClient.auth.admin.deleteUser(existing.id);
      if (delErr) {
        console.error(`Failed to delete user ${target.email}:`, delErr.message);
      } else {
        console.log(`✅ Deleted unconfirmed user ${target.email}`);
      }
    } else {
      console.log(`No existing user found for ${target.email}`);
    }

    // 2. Create as auto-confirmed user
    console.log(`Creating auto-confirmed user ${target.email}...`);
    const { data: newUserData, error: createErr } = await adminClient.auth.admin.createUser({
      email: target.email,
      password: target.password,
      email_confirm: true,
      user_metadata: {
        username: target.username,
        display_name: target.display_name
      }
    });

    if (createErr) {
      console.error(`Failed to create ${target.email}:`, createErr.message);
      process.exit(1);
    }

    console.log(`✅ Created ${target.email} (ID: ${newUserData.user.id}, confirmed: ${!!newUserData.user.email_confirmed_at})`);
  }

  // 3. Verify normal signInWithPassword()
  console.log("\n--- Testing normal client sign-in with publishable key ---");
  for (const target of [userAData, userBData]) {
    const { data: signData, error: signErr } = await client.auth.signInWithPassword({
      email: target.email,
      password: target.password
    });
    if (signErr || !signData?.session) {
      console.error(`❌ Failed sign-in for ${target.email}:`, signErr?.message);
    } else {
      console.log(`✅ Successfully signed in ${target.email}! Access token obtained.`);
    }
  }

  console.log("\nAdmin user setup complete. Ready to run scratch/test-live-authenticated-phase7.mjs!");
}

run().catch(console.error);
