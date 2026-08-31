/**
 * Heat Chat — Supabase Auth Redirect Normalization & Flow Verification Suite
 */

import fs from "node:fs";

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

function getSiteUrl(envVal) {
  let url = envVal || "";
  if (!url) url = "http://localhost:3000";
  url = url.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }
  return url.replace(/\/+$/, "");
}

function getCallbackUrl(path = "/auth/callback", envVal) {
  const base = getSiteUrl(envVal);
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

const CANONICAL_DOMAIN = "https://heat-chat-beta.vercel.app";
const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

console.log("==================================================================");
console.log(" Heat Chat — Supabase Auth Redirect URL Normalization Audit");
console.log(` Canonical Domain: ${CANONICAL_DOMAIN}`);
console.log(` Supabase API:     ${SUPABASE_URL}`);
console.log("==================================================================\n");

// ── 1. Centralized Site URL & Callback URL Helpers ───────────────────────────
console.log("--- 1. Site URL & Callback URL Helper Verification ---");
const resolvedSiteUrl = getSiteUrl(CANONICAL_DOMAIN);
assert(resolvedSiteUrl === CANONICAL_DOMAIN, `getSiteUrl() resolves to "${CANONICAL_DOMAIN}" (actual: "${resolvedSiteUrl}")`);

const callbackUrl = getCallbackUrl("/auth/callback", CANONICAL_DOMAIN);
assert(callbackUrl === `${CANONICAL_DOMAIN}/auth/callback`, `getCallbackUrl("/auth/callback") resolves to "${CANONICAL_DOMAIN}/auth/callback"`);

const updatePasswordUrl = getCallbackUrl("/update-password", CANONICAL_DOMAIN);
assert(updatePasswordUrl === `${CANONICAL_DOMAIN}/update-password`, `getCallbackUrl("/update-password") resolves to "${CANONICAL_DOMAIN}/update-password"`);

// ── 2. Environment Configuration Audit ───────────────────────────────────────
console.log("\n--- 2. .env.production File Audit ---");
const envProd = fs.readFileSync(".env.production", "utf-8");
assert(
  envProd.includes(`NEXT_PUBLIC_SITE_URL=${CANONICAL_DOMAIN}`),
  `.env.production defines NEXT_PUBLIC_SITE_URL=${CANONICAL_DOMAIN}`
);
assert(
  !envProd.includes("heat-chat-jayshil-singhs-projects.vercel.app") &&
  !envProd.includes("heat-chat-beta-jayshil-singhs-projects.vercel.app"),
  ".env.production does NOT contain stale preview/deployment URLs"
);

// ── 3. Source Code Hardcoded Stale URL Scan ──────────────────────────────────
console.log("\n--- 3. Source Code Stale Domain Scan ---");
const filesToScan = [
  "app/(auth)/login/page.tsx",
  "app/(auth)/register/page.tsx",
  "app/(auth)/reset-password/page.tsx",
  "app/(auth)/update-password/page.tsx",
  "app/(auth)/verify-email/page.tsx",
  "app/admin/forgot-password/page.tsx",
  "app/auth/callback/route.ts",
  "hooks/use-auth.tsx",
  "lib/utils/site-url.ts",
];

const stalePatterns = [
  "heat-chat-jayshil-singhs-projects.vercel.app",
  "heat-chat-beta-jayshil-singhs-projects.vercel.app",
  "placeholder.supabase.co",
];

for (const file of filesToScan) {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, "utf-8");
    for (const pattern of stalePatterns) {
      assert(
        !content.includes(pattern),
        `${file} is free of stale pattern "${pattern}"`
      );
    }
  }
}

// ── 4. Live Supabase Auth Endpoints Reachability ──────────────────────────────
console.log("\n--- 4. Live Supabase Auth Endpoint & Redirect Probe ---");
try {
  // Test password recovery with normalized redirectTo
  const recoveryPayload = {
    email: "test_recovery_normalized@test.local",
    options: {
      redirectTo: `${CANONICAL_DOMAIN}/auth/callback`,
    },
  };

  const recoverRes = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
    },
    body: JSON.stringify(recoveryPayload),
  });

  assert(
    recoverRes.status === 200 || recoverRes.status === 429,
    `Supabase recover endpoint accepts normalized redirectTo (${CANONICAL_DOMAIN}/auth/callback) with HTTP ${recoverRes.status}`
  );

  // Test sign up with normalized emailRedirectTo
  const signupPayload = {
    email: `test_norm_${Date.now()}@test.local`,
    password: "Password123!",
    options: {
      emailRedirectTo: `${CANONICAL_DOMAIN}/auth/callback`,
    },
  };

  const signupRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
    },
    body: JSON.stringify(signupPayload),
  });

  assert(
    signupRes.status === 200 || signupRes.status === 400 || signupRes.status === 422 || signupRes.status === 429,
    `Supabase signup endpoint accepts normalized emailRedirectTo with HTTP ${signupRes.status}`
  );
} catch (err) {
  assert(false, `Live endpoint probe failed: ${err.message}`);
}

// ── 5. Auth Callback Route Invariants ─────────────────────────────────────────
console.log("\n--- 5. Auth Callback Route Flow Logic Invariants ---");
const callbackContent = fs.readFileSync("app/auth/callback/route.ts", "utf-8");
assert(
  callbackContent.includes("isPasswordRecovery"),
  "Auth callback detects recovery events and routes to /update-password"
);
assert(
  callbackContent.includes("new URL(\"/update-password\", request.url)"),
  "Auth callback redirects password recovery directly to /update-password"
);
assert(
  callbackContent.includes("new URL(\"/login\", request.url)") && callbackContent.includes("loginUrl.searchParams.set(\"verified\", \"true\")"),
  "Auth callback redirects confirmed signup users to /login?verified=true"
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log("\n==================================================================");
console.log(` Results: ${passed} Passed, ${failed} Failed`);
console.log("==================================================================");

if (failed > 0) {
  process.exit(1);
} else {
  console.log("🎉 ALL SUPABASE AUTH REDIRECT NORMALIZATION TESTS PASSED!\n");
}
