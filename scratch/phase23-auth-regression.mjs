#!/usr/bin/env node
/**
 * Phase 23 — Auth Regression Suite for process-queue route
 *
 * Covers:
 * 1. x-internal-secret + CRON_SECRET    => verifyInternalSecret returns true
 * 2. Authorization Bearer + CRON_SECRET => verifyInternalSecret returns true
 * 3. Invalid secret                     => verifyInternalSecret returns false
 * 4. Missing auth                       => verifyInternalSecret returns false
 * 5. INTERNAL_WORKER_SECRET accepted    => verifyInternalSecret returns true
 * 6. Whitespace/quote stripping         => clean() normalises values
 * 7. x-internal-secret priority over Bearer
 * 8. Case-insensitive Bearer prefix
 * 9. timingSafeEqual still used
 * 10. Both GET and POST exported
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import assert from "assert";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, "..");

const routePath = path.join(
  ROOT_DIR,
  "app", "api", "internal", "notifications", "process-queue", "route.ts"
);
const routeCode = fs.readFileSync(routePath, "utf-8");

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
    failed++;
  }
}

console.log("\n=====================================================");
console.log("  Phase 23 — Auth Regression Suite");
console.log("=====================================================\n");

// ---------------------------------------------------------------------------
// Source-level invariant tests (no secret values hardcoded)
// ---------------------------------------------------------------------------

runTest("GET exported", () => {
  assert.match(routeCode, /export\s+async\s+function\s+GET/);
});

runTest("POST exported", () => {
  assert.match(routeCode, /export\s+async\s+function\s+POST/);
});

runTest("x-internal-secret is primary auth header", () => {
  assert.match(routeCode, /x-internal-secret/);
  const xIdx = routeCode.indexOf("x-internal-secret");
  const bearerIdx = routeCode.indexOf("authorization");
  assert.ok(xIdx < bearerIdx, "x-internal-secret must appear before authorization in source");
});

runTest("Authorization Bearer accepted (case-insensitive regex)", () => {
  assert.match(routeCode, /Bearer\\s\+\(.+\)\$\/i/);
});

runTest("CRON_SECRET read from process.env", () => {
  assert.match(routeCode, /process\.env\.CRON_SECRET/);
});

runTest("INTERNAL_WORKER_SECRET read from process.env", () => {
  assert.match(routeCode, /process\.env\.INTERNAL_WORKER_SECRET/);
});

runTest("timingSafeEqual used for comparison", () => {
  assert.match(routeCode, /timingSafeEqual/);
});

runTest("No secrets configured in production returns false", () => {
  assert.match(routeCode, /no_secrets_configured/);
});

runTest("[Queue Worker] INVOKED log fires before AUTHORIZED/UNAUTHORIZED in handleProcessQueue", () => {
  const fnIdx = routeCode.indexOf("async function handleProcessQueue");
  assert.ok(fnIdx > 0, "handleProcessQueue must exist");

  const invokedIdx = routeCode.indexOf("[Queue Worker] INVOKED", fnIdx);
  const authorizedIdx = routeCode.indexOf("[Queue Worker] AUTHORIZED", fnIdx);
  const unauthorizedIdx = routeCode.indexOf("[Queue Worker] UNAUTHORIZED", fnIdx);

  assert.ok(invokedIdx > 0, "[Queue Worker] INVOKED log must exist in handleProcessQueue");
  assert.ok(authorizedIdx > 0, "[Queue Worker] AUTHORIZED log must exist");
  assert.ok(unauthorizedIdx > 0, "[Queue Worker] UNAUTHORIZED log must exist");
  assert.ok(invokedIdx < unauthorizedIdx, "INVOKED must precede UNAUTHORIZED");
  assert.ok(invokedIdx < authorizedIdx, "INVOKED must precede AUTHORIZED");
});

runTest("[Auth Diag] logs emitted with safe metadata keys", () => {
  assert.match(routeCode, /\[Auth Diag\]/);
  assert.match(routeCode, /has_x_internal_secret=/);
  assert.match(routeCode, /has_authorization=/);
  assert.match(routeCode, /token_length=/);
  assert.match(routeCode, /CRON_SECRET_set=/);
  assert.match(routeCode, /CRON_SECRET_length=/);
  assert.match(routeCode, /auth_result=/);
});

runTest("No secret values are ever logged (no env var values in log strings)", () => {
  // Ensure we never log `${cronSecret}` or `${workerSecret}` or `${token}`
  assert.doesNotMatch(routeCode, /\$\{cronSecret\}/);
  assert.doesNotMatch(routeCode, /\$\{workerSecret\}/);
  assert.doesNotMatch(routeCode, /\$\{xSecret\}/);
  assert.doesNotMatch(routeCode, /\$\{bearerToken\}/);
  // Allow token_length=${token.length} but not token itself
  assert.doesNotMatch(routeCode, /token_length=\$\{token[^.]/);
});

runTest("clean() helper trims whitespace and strips surrounding quotes", () => {
  // Verify the helper exists and handles quote stripping
  assert.match(routeCode, /function clean/);
  assert.match(routeCode, /slice\(1, -1\)/); // quote stripping
  assert.match(routeCode, /\.trim\(\)/);
});

// ---------------------------------------------------------------------------
// Logic simulation tests (inline, no secret values)
// ---------------------------------------------------------------------------

// Replicate clean() from route.ts
function clean(raw) {
  if (!raw) return "";
  let v = raw.trim();
  if (v.length >= 2) {
    if ((v[0] === '"' && v[v.length - 1] === '"') ||
        (v[0] === "'" && v[v.length - 1] === "'")) {
      v = v.slice(1, -1).trim();
    }
  }
  return v;
}

function timingSafeCompare(a, b) {
  if (!a || !b) return false;
  const ba = Buffer.from(a, "utf-8");
  const bb = Buffer.from(b, "utf-8");
  if (ba.length !== bb.length) return false;
  try { return crypto.timingSafeEqual(ba, bb); } catch { return false; }
}

function extractBearer(authHeader) {
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  return m ? clean(m[1]) : "";
}

function simulateAuth(headers, cronSecret, workerSecret) {
  const xSecret = clean(headers["x-internal-secret"] ?? "");
  const authRaw = headers["authorization"] ?? "";
  const bearerToken = extractBearer(authRaw);
  const token = xSecret || bearerToken;

  const secrets = [clean(cronSecret), clean(workerSecret)].filter(Boolean);
  if (!token) return false;
  if (secrets.length === 0) return false;

  return secrets.some(s => timingSafeCompare(token, s));
}

const FAKE_SECRET = crypto.randomBytes(32).toString("hex");
const FAKE_WORKER = crypto.randomBytes(32).toString("hex");

runTest("x-internal-secret + CRON_SECRET => auth success", () => {
  const result = simulateAuth(
    { "x-internal-secret": FAKE_SECRET },
    FAKE_SECRET, ""
  );
  assert.strictEqual(result, true);
});

runTest("Authorization Bearer + CRON_SECRET => auth success", () => {
  const result = simulateAuth(
    { "authorization": `Bearer ${FAKE_SECRET}` },
    FAKE_SECRET, ""
  );
  assert.strictEqual(result, true);
});

runTest("Invalid secret => auth failure", () => {
  const result = simulateAuth(
    { "x-internal-secret": "wrong-secret" },
    FAKE_SECRET, ""
  );
  assert.strictEqual(result, false);
});

runTest("Missing auth => auth failure", () => {
  const result = simulateAuth({}, FAKE_SECRET, "");
  assert.strictEqual(result, false);
});

runTest("INTERNAL_WORKER_SECRET => auth success", () => {
  const result = simulateAuth(
    { "x-internal-secret": FAKE_WORKER },
    FAKE_SECRET, FAKE_WORKER
  );
  assert.strictEqual(result, true);
});

runTest("Quoted x-internal-secret is stripped and accepted", () => {
  const result = simulateAuth(
    { "x-internal-secret": `"${FAKE_SECRET}"` },
    FAKE_SECRET, ""
  );
  assert.strictEqual(result, true);
});

runTest("Whitespace-padded secret is trimmed and accepted", () => {
  const result = simulateAuth(
    { "x-internal-secret": `  ${FAKE_SECRET}  ` },
    FAKE_SECRET, ""
  );
  assert.strictEqual(result, true);
});

runTest("Case-insensitive bearer prefix (BEARER) is accepted", () => {
  const result = simulateAuth(
    { "authorization": `BEARER ${FAKE_SECRET}` },
    FAKE_SECRET, ""
  );
  assert.strictEqual(result, true);
});

runTest("x-internal-secret takes priority over Authorization when both present", () => {
  // x-internal-secret has valid secret, Authorization has wrong secret
  const result = simulateAuth(
    {
      "x-internal-secret": FAKE_SECRET,
      "authorization": `Bearer wrong-secret`,
    },
    FAKE_SECRET, ""
  );
  assert.strictEqual(result, true);
});

runTest("No configured secrets => auth failure (production guard)", () => {
  const result = simulateAuth(
    { "x-internal-secret": FAKE_SECRET },
    "", ""
  );
  assert.strictEqual(result, false);
});

console.log("\n=====================================================");
console.log(`  Results: ${passed} passed | ${failed} failed`);
console.log("=====================================================\n");

if (failed > 0) process.exit(1);
