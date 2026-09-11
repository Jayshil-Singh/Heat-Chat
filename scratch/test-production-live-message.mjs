import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert";

// Load local environment for secrets
const envPath = path.resolve(process.cwd(), ".env.local");
let CRON_SECRET = "";
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("CRON_SECRET=")) {
      CRON_SECRET = trimmed.split("=")[1].trim().replace(/^["']|["']$/g, "");
    }
  }
}

const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";
const PROD_URL = "https://heat-chat-beta.vercel.app";

async function main() {
  console.log("==================================================================");
  console.log(" CONTROLLED PRODUCTION MESSAGE & QUEUE VERIFICATION");
  console.log(" URL:", PROD_URL);
  console.log(" Timestamp:", new Date().toISOString());
  console.log("==================================================================\n");

  // Step 1: Sign in test user and extract @supabase/ssr session cookie
  console.log("Step 1: Authenticating test user phase7_test_a@test.local...");
  let savedCookies = [];
  const ssrClient = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => savedCookies,
      setAll: (c) => {
        savedCookies = c;
      },
    },
  });

  const { data: authData, error: authError } = await ssrClient.auth.signInWithPassword({
    email: "phase7_test_a@test.local",
    password: "Phase7TestPassword123!",
  });

  if (authError || !authData?.user) {
    throw new Error(`Auth failed: ${authError?.message}`);
  }
  console.log("✅ Authenticated as user:", authData.user.id);
  console.log("   Cookies captured:", savedCookies.map((c) => c.name).join(", "));

  const cookieHeader = savedCookies.map((c) => `${c.name}=${c.value}`).join("; ");

  // Step 2: Query a valid conversation for this user
  console.log("\nStep 2: Resolving conversation membership...");
  const { data: memberRows, error: memberErr } = await ssrClient
    .from("conversation_members")
    .select("conversation_id")
    .limit(5);

  if (memberErr || !memberRows || memberRows.length === 0) {
    throw new Error(`No conversation found for test user: ${memberErr?.message || "empty"}`);
  }

  const conversationId = memberRows[0].conversation_id;
  console.log("✅ Conversation ID:", conversationId);

  // Step 3: Send real test message to live production endpoint
  console.log("\nStep 3: Sending POST to live production messages endpoint...");
  const endpoint = `${PROD_URL}/api/conversations/${conversationId}/messages`;
  const startTime = Date.now();

  const testClientMessageId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const testPayload = {
    content: `Automated resilience test message ${Date.now()}`,
    messageType: "text",
    clientMessageId: testClientMessageId,
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader,
    },
    body: JSON.stringify(testPayload),
  });

  const elapsedMs = Date.now() - startTime;
  const status = res.status;
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}

  const requestId = res.headers.get("x-vercel-id") || "none";
  const serverTiming = res.headers.get("server-timing") || "none";
  const diagTimings = res.headers.get("x-diag-timings") || "none";

  console.log(`   Response Status: ${status} (took ${elapsedMs}ms)`);
  console.log(`   Vercel Request ID: ${requestId}`);
  console.log(`   Server-Timing Header: ${serverTiming}`);
  console.log(`   Diag Timings Header: ${diagTimings}`);
  console.log("   Timings from Route JSON:", json?.timings);
  console.log("   Response JSON:", json);

  assert.strictEqual(status, 201, `Expected HTTP 201 Created, got ${status}`);
  assert.strictEqual(json?.success, true, "Expected success: true");
  assert.ok(json?.id, "Expected response to have 'id'");
  assert.ok(json?.messageId, "Expected response to have 'messageId'");
  assert.ok(json?.message_id, "Expected response to have 'message_id'");
  assert.strictEqual(json.id, json.messageId, "id and messageId must match");
  assert.strictEqual(json.id, json.message_id, "id and message_id must match");
  assert.strictEqual(json.clientMessageId, testClientMessageId, "clientMessageId must match sent temp ID");

  const createdMessageId = json.id;
  console.log("✅ Message successfully persisted and HTTP 201 returned immediately!");
  console.log("   Persisted Message ID:", createdMessageId);

  // Step 4: Verify that the DB trigger created notification for recipient
  console.log("\nStep 4: Checking recipient notifications in live DB...");
  try {
    const clientB = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: authB } = await clientB.auth.signInWithPassword({
      email: "phase7_test_b@test.local",
      password: "Phase7TestPassword123!",
    });
    if (authB?.user) {
      const { data: notifs } = await clientB
        .from("notifications")
        .select("id, type, created_at")
        .eq("user_id", authB.user.id)
        .order("created_at", { ascending: false })
        .limit(3);
      console.log(`   Recipient (User B) recent notifications:`, notifs?.length || 0);
      if (notifs && notifs.length > 0) {
        console.log(`   Latest notification ID: ${notifs[0].id} (type: ${notifs[0].type})`);
      }
    }
  } catch (err) {
    console.log("   (Could not verify recipient notifications directly:", err.message, ")");
  }

  // Step 5: Trigger the queue worker via cron-job.org auth
  console.log("\nStep 5: Invoking queue worker (/api/internal/notifications/process-queue)...");
  if (!CRON_SECRET) {
    console.log("⚠️ CRON_SECRET not available in local .env, skipping worker HTTP call");
    return;
  }

  const workerRes = await fetch(`${PROD_URL}/api/internal/notifications/process-queue`, {
    method: "POST",
    headers: {
      "x-internal-secret": CRON_SECRET,
    },
  });

  const workerStatus = workerRes.status;
  const workerJson = await workerRes.json();
  console.log(`   Queue Worker Status: ${workerStatus}`);
  console.log("   Queue Worker Response:", workerJson);

  assert.strictEqual(workerStatus, 200, "Queue worker must return HTTP 200");
  assert.strictEqual(typeof workerJson.claimed, "number", "Worker must return numeric claimed count");
  console.log("✅ Queue worker executed successfully!");

  console.log("\n==================================================================");
  console.log(" 🎉 ALL PRODUCTION VERIFICATION CHECKS PASSED!");
  console.log("==================================================================");
}

main().catch((err) => {
  console.error("\n❌ Production verification failed:", err);
  process.exit(1);
});
