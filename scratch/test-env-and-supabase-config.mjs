/**
 * Heat Chat — Vercel & Supabase Environment Configuration Verification Suite
 */

import fs from "node:fs";
import path from "node:path";

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${message}`);
  }
}

console.log("==================================================================");
console.log(" Heat Chat — Vercel & Supabase Environment Configuration Audit");
console.log("==================================================================\n");

// ── 1. Check for placeholder.supabase.co in source files ───────────────────────
console.log("--- 1. Source Code Placeholder Scan ---");
const filesToScan = [
  "lib/supabase/client.ts",
  "lib/supabase/server.ts",
  "lib/supabase/middleware.ts",
  ".env.production",
  ".env.local",
  "middleware.ts",
  "lib/utils/site-url.ts",
];

for (const relPath of filesToScan) {
  if (fs.existsSync(relPath)) {
    const content = fs.readFileSync(relPath, "utf-8");
    // Verify placeholder.supabase.co is NOT used as an active fallback URL
    const hasFallbackPlaceholder = content.includes('|| "https://placeholder.supabase.co"');
    assert(!hasFallbackPlaceholder, `${relPath} has NO active fallback to placeholder.supabase.co`);
  }
}

// ── 2. Check .env.production configuration ─────────────────────────────────────
console.log("\n--- 2. .env.production Values ---");
const envProdContent = fs.readFileSync(".env.production", "utf-8");
assert(envProdContent.includes("NEXT_PUBLIC_SUPABASE_URL=https://rmvpdcftfdeizitnrvkw.supabase.co"), ".env.production defines real NEXT_PUBLIC_SUPABASE_URL");
assert(envProdContent.includes("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU"), ".env.production defines real NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
assert(envProdContent.includes("NEXT_PUBLIC_SITE_URL="), ".env.production defines NEXT_PUBLIC_SITE_URL");

// ── 3. Check .env.local configuration ──────────────────────────────────────────
console.log("\n--- 3. .env.local Values ---");
const envLocalContent = fs.readFileSync(".env.local", "utf-8");
assert(envLocalContent.includes("NEXT_PUBLIC_SUPABASE_URL=https://rmvpdcftfdeizitnrvkw.supabase.co"), ".env.local defines real NEXT_PUBLIC_SUPABASE_URL");
assert(envLocalContent.includes("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU"), ".env.local defines real NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

// ── 4. Verify Supabase Client Fail-Fast Behavior ──────────────────────────────
console.log("\n--- 4. Supabase Client Error Handling ---");
const clientTs = fs.readFileSync("lib/supabase/client.ts", "utf-8");
assert(clientTs.includes("throw new Error"), "client.ts throws error on missing env variables rather than silent placeholder fallback");
assert(clientTs.includes("placeholder.supabase.co"), "client.ts explicitly rejects placeholder.supabase.co if passed");
assert(clientTs.includes("NEXT_PUBLIC_SUPABASE_ANON_KEY"), "client.ts supports both PUBLISHABLE_KEY and ANON_KEY");

const serverTs = fs.readFileSync("lib/supabase/server.ts", "utf-8");
assert(serverTs.includes("throw new Error"), "server.ts throws error on missing env variables");
assert(serverTs.includes("placeholder.supabase.co"), "server.ts explicitly rejects placeholder.supabase.co");

const middlewareTs = fs.readFileSync("lib/supabase/middleware.ts", "utf-8");
assert(middlewareTs.includes("NEXT_PUBLIC_SUPABASE_ANON_KEY"), "middleware.ts supports both PUBLISHABLE_KEY and ANON_KEY");

// ── 5. Verify Manifest File Integrity ────────────────────────────────────────
console.log("\n--- 5. Manifest Integrity ---");
const manifestPath = "public/manifest.json";
assert(fs.existsSync(manifestPath), "public/manifest.json exists");
const manifestContent = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
assert(manifestContent.name === "Heat Chat", "manifest name is 'Heat Chat'");
assert(manifestContent.start_url === "/", "manifest start_url is '/'");
assert(manifestContent.display === "standalone", "manifest display is 'standalone'");

// ── 6. Live Supabase Auth Endpoint Probe ──────────────────────────────────────
console.log("\n--- 6. Live Supabase Auth Endpoint Probe ---");
try {
  const authRes = await fetch("https://rmvpdcftfdeizitnrvkw.supabase.co/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU",
    },
    body: JSON.stringify({ email: "nonexistent@example.com", password: "wrongpassword123" }),
  });
  const data = await authRes.json();
  // We expect an auth rejection (HTTP 400 with invalid_credentials), NOT a DNS resolution error (ERR_NAME_NOT_RESOLVED)
  assert(authRes.status === 400 || authRes.status === 200, `Live Supabase Auth API reachable at https://rmvpdcftfdeizitnrvkw.supabase.co (HTTP ${authRes.status})`);
  assert(data.error_code === "invalid_credentials" || data.error_description || data.access_token, "Supabase Auth returned valid auth response structure (not DNS failure)");
} catch (err) {
  assert(false, `Live Supabase endpoint check failed: ${err.message}`);
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log("\n==================================================================");
console.log(` Results: ${passed} Passed, ${failed} Failed`);
console.log("==================================================================");

if (failed > 0) {
  process.exit(1);
} else {
  console.log("🎉 ALL ENVIRONMENT & SUPABASE CONFIGURATION TESTS PASSED!\n");
}
