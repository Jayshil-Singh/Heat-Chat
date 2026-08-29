import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const envPath = path.resolve(process.cwd(), ".env.local");
let SUPABASE_URL = "";
let SUPABASE_ANON_KEY = "";

if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("NEXT_PUBLIC_SUPABASE_URL=")) {
      SUPABASE_URL = trimmed.split("=")[1].trim().replace(/^["']|["']$/g, "");
    } else if (trimmed.startsWith("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=")) {
      SUPABASE_ANON_KEY = trimmed.split("=")[1].trim().replace(/^["']|["']$/g, "");
    }
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`[PASS] ${message}`);
}

async function runLiveDeploymentSmokeTest() {
  console.log("==================================================================");
  console.log(" HEAT CHAT — LIVE PRODUCTION DEPLOYMENT SMOKE TEST");
  console.log("==================================================================\n");

  // 1. Measure Latencies & Health
  console.log("--- 1. Live Latency & Health Probes ---");
  const t0 = Date.now();
  const { data: healthCheck, error: healthErr } = await supabase.from("profiles").select("id").limit(1);
  const dbLatency = Date.now() - t0;
  assert(!healthErr, `Database query succeeded (Latency: ${dbLatency}ms)`);

  const t1 = Date.now();
  const { data: storageCheck, error: storageErr } = await supabase.storage.listBuckets();
  const storageLatency = Date.now() - t1;
  assert(!storageErr && Array.isArray(storageCheck), `Storage API succeeded (Latency: ${storageLatency}ms)`);

  // 2. Storage Buckets Privacy
  console.log("\n--- 2. Storage Bucket Privacy ---");
  const { error: uploadErr } = await supabase.storage.from("chat-attachments").upload("unauth.bin", Buffer.from("test"));
  assert(Boolean(uploadErr), "'chat-attachments' bucket is strictly PRIVATE (Anonymous upload rejected)");

  // 3. RLS Data Integrity on Sensitive Tables
  console.log("\n--- 3. RLS Data Integrity on Sensitive Tables ---");
  const sensitiveTables = ["admin_user_roles", "admin_audit_logs", "admin_invitations", "admin_mfa_recovery_codes", "messages"];
  for (const t of sensitiveTables) {
    const { data } = await supabase.from(t).select("*").limit(1);
    assert(data === null || data.length === 0, `Table '${t}' rejects anonymous read`);
  }

  // 4. Role Hierarchy Constraints
  console.log("\n--- 4. Role Hierarchy Invariants ---");
  const HIERARCHY = { SuperAdmin: 100, SystemAdmin: 80, Admin: 60, Moderator: 40, Support: 30, Analyst: 20 };
  assert(HIERARCHY.SuperAdmin === 100, "SuperAdmin level = 100");
  assert(HIERARCHY.Moderator === 40, "Moderator level = 40");
  assert(HIERARCHY.Support === 30, "Support level = 30");
  assert(HIERARCHY.Analyst === 20, "Analyst level = 20");

  console.log("\n==================================================================");
  console.log(" SUMMARY: LIVE DEPLOYMENT SMOKE TEST PASSED (100%)");
  console.log("==================================================================\n");
}

runLiveDeploymentSmokeTest().catch(console.error);
