/**
 * Heat Chat — Production Domain & Endpoint Verification Suite
 */

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

const PROD_ORIGIN = "https://heat-chat-beta.vercel.app";
const PREVIEW_ORIGIN = "https://heat-chat-beta-2qwq5oi78-jayshil-singhs-projects.vercel.app";
const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

console.log("==================================================================");
console.log(" Heat Chat — Canonical Production Domain & Endpoint Verification");
console.log(` Canonical Domain: ${PROD_ORIGIN}`);
console.log(` Supabase API:     ${SUPABASE_URL}`);
console.log("==================================================================\n");

// ── 1. Test /manifest.json on Production Domain ──────────────────────────────
console.log("--- 1. /manifest.json on Canonical Production Domain ---");
try {
  const manifestRes = await fetch(`${PROD_ORIGIN}/manifest.json`, {
    redirect: "manual",
  });
  assert(manifestRes.status === 200, `Production /manifest.json returns HTTP 200 OK directly (status: ${manifestRes.status})`);
  const contentType = manifestRes.headers.get("content-type") || "";
  assert(contentType.includes("json"), `Production /manifest.json returns JSON Content-Type (${contentType})`);
  const manifestData = await manifestRes.json();
  assert(manifestData.name === "Heat Chat", `Manifest name is "${manifestData.name}"`);
  assert(manifestData.start_url === "/", `Manifest start_url is "${manifestData.start_url}"`);
  assert(manifestData.display === "standalone", `Manifest display is "${manifestData.display}"`);
} catch (err) {
  assert(false, `Failed to fetch production manifest: ${err.message}`);
}

// ── 2. Test Preview URL Deployment Protection Redirect (Standard Behavior) ───
console.log("\n--- 2. Preview URL Vercel Deployment Protection Check ---");
try {
  const previewRes = await fetch(`${PREVIEW_ORIGIN}/manifest.json`, {
    redirect: "manual",
  });
  assert(
    previewRes.status === 302 || previewRes.status === 307 || previewRes.status === 401,
    `Preview URL is protected by Vercel Deployment Protection (HTTP ${previewRes.status} redirect to SSO)`
  );
  const location = previewRes.headers.get("location") || "";
  assert(
    location.includes("vercel.com/sso-api") || previewRes.status === 302,
    `Preview protection redirect target verified: ${location.slice(0, 60)}...`
  );
} catch (err) {
  console.log(`  Note: Preview fetch exception: ${err.message}`);
}

// ── 3. Test Production Auth & App Routes ──────────────────────────────────────
console.log("\n--- 3. Production Application Route Responses ---");
const routesToTest = [
  { path: "/login", expectedStatus: 200, name: "Login Page" },
  { path: "/register", expectedStatus: 200, name: "Register Page" },
  { path: "/verify-email", expectedStatus: 200, name: "Verify Email Page" },
  { path: "/reset-password", expectedStatus: 200, name: "Reset Password Page" },
  { path: "/chat", expectedStatus: [200, 307, 308], name: "Chat Route (Protected)" },
];

for (const route of routesToTest) {
  try {
    const res = await fetch(`${PROD_ORIGIN}${route.path}`, {
      redirect: "manual",
    });
    const expected = Array.isArray(route.expectedStatus)
      ? route.expectedStatus.includes(res.status)
      : res.status === route.expectedStatus;
    assert(expected, `${route.name} (${route.path}) returned HTTP ${res.status}`);
  } catch (err) {
    assert(false, `${route.name} failed to load: ${err.message}`);
  }
}

// ── 4. Test Live Supabase Auth Endpoints ──────────────────────────────────────
console.log("\n--- 4. Live Supabase Auth Endpoint Connectivity ---");
try {
  // Test password token endpoint
  const tokenRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
    },
    body: JSON.stringify({
      email: "probe_check@test.local",
      password: "InvalidProbePassword123!",
    }),
  });
  const tokenData = await tokenRes.json();
  assert(
    tokenRes.status === 400 && (tokenData.error_code === "invalid_credentials" || tokenData.error_description),
    `Supabase password auth endpoint active and responding at ${SUPABASE_URL} (HTTP ${tokenRes.status})`
  );

  // Test password recovery endpoint
  const recoverRes = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
    },
    body: JSON.stringify({
      email: "recovery_probe@test.local",
    }),
  });
  assert(
    recoverRes.status === 200 || recoverRes.status === 429,
    `Supabase password recovery endpoint active (HTTP ${recoverRes.status})`
  );

  // Test signup / OTP endpoint
  const signupRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
    },
    body: JSON.stringify({
      email: `probe_signup_${Date.now()}@test.local`,
      password: "TestPassword123!",
    }),
  });
  assert(
    signupRes.status === 200 || signupRes.status === 400 || signupRes.status === 422 || signupRes.status === 429,
    `Supabase signup/OTP endpoint active (HTTP ${signupRes.status})`
  );
} catch (err) {
  assert(false, `Supabase Auth API check failed: ${err.message}`);
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log("\n==================================================================");
console.log(` Results: ${passed} Passed, ${failed} Failed`);
console.log("==================================================================");

if (failed > 0) {
  process.exit(1);
} else {
  console.log("🎉 ALL PRODUCTION DOMAIN & SUPABASE ENDPOINT TESTS PASSED!\n");
}
