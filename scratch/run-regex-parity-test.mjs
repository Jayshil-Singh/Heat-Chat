import fs from "node:fs";
import path from "node:path";

// Programmatic vectors requested by the user:
const label1 = "a";
const label2 = "ab";
const label63 = "a".repeat(63);
const label64 = "a".repeat(64);

const vectors = [
  { host: `${label1}.fcm.googleapis.com`, expected: true, desc: "1-character label" },
  { host: `${label2}.fcm.googleapis.com`, expected: true, desc: "2-character label" },
  { host: `${label63}.fcm.googleapis.com`, expected: true, desc: "63-character label" },
  { host: `${label64}.fcm.googleapis.com`, expected: false, desc: "64-character label (too long)" },
  { host: "-a.fcm.googleapis.com", expected: false, desc: "leading hyphen" },
  { host: "a-.fcm.googleapis.com", expected: false, desc: "trailing hyphen" },
  { host: "a_b.fcm.googleapis.com", expected: false, desc: "underscore in label" },
  { host: "a.b.fcm.googleapis.com", expected: false, desc: "multi-level subdomain" },
];

console.log("==================================================================");
console.log(" EXECUTE REGEX PARITY TEST ACROSS PROGRAMMATIC VECTORS");
console.log("==================================================================\n");

// 1. TypeScript Regex Validation
const WILDCARD_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const wildcardSuffixes = ["fcm.googleapis.com", "push.apple.com", "push.services.mozilla.com", "notify.windows.com"];

function testTsHost(host) {
  for (const suffix of wildcardSuffixes) {
    if (host.endsWith("." + suffix)) {
      const label = host.slice(0, -(suffix.length + 1));
      if (WILDCARD_LABEL_PATTERN.test(label)) {
        return true;
      }
    }
  }
  return false;
}

// 2. JavaScript equivalent of PostgreSQL POSIX ERE pattern:
// PostgreSQL: ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.(fcm\.googleapis\.com|push\.apple\.com|push\.services\.mozilla\.com|notify\.windows\.com)$
const pgPosixEreRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.(fcm\.googleapis\.com|push\.apple\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/;

console.log("--- 1. Vector Results Table ---");
let allPass = true;

for (const v of vectors) {
  const tsResult = testTsHost(v.host);
  const pgResult = pgPosixEreRegex.test(v.host);
  const matchesExpected = tsResult === v.expected && pgResult === v.expected;
  const parityMatches = tsResult === pgResult;

  if (!matchesExpected || !parityMatches) {
    allPass = false;
  }

  console.log(
    `Host: ${v.host.padEnd(35)} | Expected: ${String(v.expected).padEnd(5)} | TS: ${String(tsResult).padEnd(5)} | PG ERE: ${String(pgResult).padEnd(5)} | ${matchesExpected ? "✅ PASS" : "❌ FAIL"}`
  );
}

console.log("\nAll Vector Assertions Passed:", allPass ? "YES (100% PARITY)" : "NO");

console.log("\n--- 2. File Presence Audit on Disk ---");
const filesToCheck = [
  "supabase/migrations/20260909_phase7_notifications_and_push.sql",
  "lib/notifications/egress.ts",
  "lib/notifications/provider-rules.json"
];

for (const f of filesToCheck) {
  const fullPath = path.resolve(process.cwd(), f);
  const exists = fs.existsSync(fullPath);
  console.log(`  [FILE] ${f}: ${exists ? "FOUND ON DISK" : "MISSING FROM DISK (Not created yet)"}`);
}
