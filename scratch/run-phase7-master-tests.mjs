import fs from "node:fs";
import path from "node:path";
import assert from "node:assert";
import {
  canonicalizePushEndpoint,
  isValidPushHost,
  SAFE_PATH_QUERY_PATTERN,
  WILDCARD_LABEL_PATTERN,
  isPrivateOrReservedIp,
} from "../lib/notifications/egress.ts";

console.log("==================================================================");
console.log(" HEAT CHAT — PHASE 7 MASTER VERIFICATION SUITE [D92, D96-D103]");
console.log("==================================================================\n");

let passedAssertions = 0;
let failedAssertions = 0;

function check(name, condition, details = "") {
  if (condition) {
    console.log(`  ✅ [PASS] ${name}`);
    passedAssertions++;
  } else {
    console.error(`  ❌ [FAIL] ${name} ${details ? "- " + details : ""}`);
    failedAssertions++;
  }
}

// -----------------------------------------------------------------------------
// [D92] Provider Artifact Structural Parity
// -----------------------------------------------------------------------------
console.log("--- [D92] Provider Artifact Structural Parity ---");
const providerRulesPath = path.resolve(process.cwd(), "lib/notifications/provider-rules.json");
const providerRules = JSON.parse(fs.readFileSync(providerRulesPath, "utf-8"));

check("provider-rules.json exists and has $schema", Boolean(providerRules.$schema));
check("exactHosts contains 5 authorized browsers", providerRules.exactHosts.length === 5);
check("exactHosts contains android.googleapis.com", providerRules.exactHosts.includes("android.googleapis.com"));
check("exactHosts contains fcm.googleapis.com", providerRules.exactHosts.includes("fcm.googleapis.com"));
check("exactHosts contains notify.windows.com", providerRules.exactHosts.includes("notify.windows.com"));
check("exactHosts contains updates.push.services.mozilla.com", providerRules.exactHosts.includes("updates.push.services.mozilla.com"));
check("exactHosts contains web.push.apple.com", providerRules.exactHosts.includes("web.push.apple.com"));

check("wildcardSuffixes contains 4 suffixes", providerRules.wildcardSuffixes.length === 4);
check("wildcardSuffixes contains fcm.googleapis.com", providerRules.wildcardSuffixes.includes("fcm.googleapis.com"));
check("wildcardSuffixes contains notify.windows.com", providerRules.wildcardSuffixes.includes("notify.windows.com"));
check("wildcardSuffixes contains push.apple.com", providerRules.wildcardSuffixes.includes("push.apple.com"));
check("wildcardSuffixes contains push.services.mozilla.com", providerRules.wildcardSuffixes.includes("push.services.mozilla.com"));

check("wildcardLabel specifies 1..63 min/max length", providerRules.wildcardLabel.minLength === 1 && providerRules.wildcardLabel.maxLength === 63);
check("wildcardLabel disallows underscores and leading/trailing hyphens", 
  providerRules.wildcardLabel.allowUnderscore === false &&
  providerRules.wildcardLabel.allowLeadingHyphen === false &&
  providerRules.wildcardLabel.allowTrailingHyphen === false &&
  providerRules.wildcardLabel.singleLevelOnly === true
);
check("portPolicy specifies strip-443", providerRules.portPolicy.canonicalPort === "strip-443");
check("provider-rules.json does NOT own path regex", providerRules.allowedCharacterPattern === undefined);

// -----------------------------------------------------------------------------
// [D102] Structural Implementation Source Parsing
// -----------------------------------------------------------------------------
console.log("\n--- [D102] Structural Implementation Source Parsing ---");
const migrationPath = path.resolve(process.cwd(), "supabase/migrations/20260909_phase7_notifications_and_push.sql");
const migrationContent = fs.readFileSync(migrationPath, "utf-8");

// Locate the wildcard validation regex in migration
const sqlRegexMatch = migrationContent.match(/v_host ~ '(\^\[a-z0-9\][^']+)'/);
check("SQL migration contains v_host ~ '...' expression", Boolean(sqlRegexMatch));
const extractedSqlRegex = sqlRegexMatch ? sqlRegexMatch[1] : "";
const expectedSqlRegex = "^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.(fcm\\.googleapis\\.com|push\\.apple\\.com|push\\.services\\.mozilla\\.com|notify\\.windows\\.com)$";

check("Extracted SQL regex matches expected POSIX ERE", extractedSqlRegex === expectedSqlRegex, `Extracted: ${extractedSqlRegex}`);

// Read egress.ts and extract WILDCARD_LABEL_PATTERN
const egressPath = path.resolve(process.cwd(), "lib/notifications/egress.ts");
const egressContent = fs.readFileSync(egressPath, "utf-8");

const tsPatternMatch = egressContent.match(/WILDCARD_LABEL_PATTERN\s*=\s*(\/[^\/]+\/)/);
check("egress.ts contains WILDCARD_LABEL_PATTERN literal", Boolean(tsPatternMatch));
const extractedTsPatternStr = tsPatternMatch ? tsPatternMatch[1] : "";
check("Extracted TypeScript pattern matches expected RegExp literal", extractedTsPatternStr === "/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/");
check("WILDCARD_LABEL_PATTERN.source matches expected string", WILDCARD_LABEL_PATTERN.source === "^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$");

// -----------------------------------------------------------------------------
// [D103] Literal Source Character Verification
// -----------------------------------------------------------------------------
console.log("\n--- [D103] Literal Source Character Verification ---");
// Ensure SQL contains unescaped '(' before label group
check("SQL migration contains unescaped ( before label group", extractedSqlRegex.includes("^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?"));
check("SQL migration contains zero \\( before label group", !extractedSqlRegex.includes("\\("));

// Ensure TypeScript contains plain '(?:' and no '\(?:'
check("TypeScript pattern contains plain (?:", extractedTsPatternStr.includes("(?:"));
check("TypeScript pattern contains zero \\( or \\(?:", !extractedTsPatternStr.includes("\\(") && !extractedTsPatternStr.includes("\\(?:"));

// -----------------------------------------------------------------------------
// [D96] Source-Extracted POSIX ERE & TypeScript Parity
// -----------------------------------------------------------------------------
console.log("\n--- [D96] Source-Extracted POSIX ERE & TypeScript Parity ---");
// Compile extracted SQL regex into JavaScript RegExp for exact POSIX ERE simulation
const compiledExtractedSqlRegex = new RegExp(extractedSqlRegex);

const label1 = "a";
const label2 = "ab";
const label63 = "a".repeat(63);
const label64 = "a".repeat(64);

const d96Vectors = [
  { host: `${label1}.fcm.googleapis.com`, expected: true, desc: "1-character label" },
  { host: `${label2}.fcm.googleapis.com`, expected: true, desc: "2-character label" },
  { host: `${label63}.fcm.googleapis.com`, expected: true, desc: "63-character label" },
  { host: `${label64}.fcm.googleapis.com`, expected: false, desc: "64-character label (rejected)" },
  { host: "-a.fcm.googleapis.com", expected: false, desc: "leading hyphen" },
  { host: "a-.fcm.googleapis.com", expected: false, desc: "trailing hyphen" },
  { host: "a_b.fcm.googleapis.com", expected: false, desc: "underscore in label" },
  { host: "a.b.fcm.googleapis.com", expected: false, desc: "multi-level subdomain" },
];

for (const v of d96Vectors) {
  const tsRes = isValidPushHost(v.host);
  const sqlRes = compiledExtractedSqlRegex.test(v.host);
  check(
    `[D96] ${v.desc}: ${v.host}`,
    tsRes === v.expected && sqlRes === v.expected,
    `TS: ${tsRes}, SQL: ${sqlRes}, Expected: ${v.expected}`
  );
}

// -----------------------------------------------------------------------------
// [D97] Percent-Encoding Validity Parity
// -----------------------------------------------------------------------------
console.log("\n--- [D97] Percent-Encoding Validity Parity ---");
const validPercentPaths = [
  "/a%20b",
  "/a%2Fb",
  "/a%2fb",
  "/token%3Aabc",
  "/x?foo=a%26b",
];

const malformedPercentPaths = [
  "/a%",
  "/a%A",
  "/a%ZZ",
  "/a%G1",
  "/a%%",
  "/a%1G",
];

for (const p of validPercentPaths) {
  const tsValid = SAFE_PATH_QUERY_PATTERN.test(p);
  check(`[D97] Valid percent path accepted: ${p}`, tsValid === true);
}

for (const p of malformedPercentPaths) {
  const tsValid = SAFE_PATH_QUERY_PATTERN.test(p);
  check(`[D97] Malformed percent path rejected: ${p}`, tsValid === false);
}

// -----------------------------------------------------------------------------
// [D98] Percent-Encoding Byte-for-Byte Preservation
// -----------------------------------------------------------------------------
console.log("\n--- [D98] Percent-Encoding Byte-for-Byte Preservation ---");
const preservationEndpoints = [
  { raw: "https://fcm.googleapis.com/fcm/send/token%3Aabc", expectedPath: "/fcm/send/token%3Aabc" },
  { raw: "https://fcm.googleapis.com/fcm/send/token%2fa", expectedPath: "/fcm/send/token%2fa" },
  { raw: "https://fcm.googleapis.com/fcm/send/token%2FA", expectedPath: "/fcm/send/token%2FA" },
  { raw: "https://updates.push.services.mozilla.com/wpush/v2/a%20b", expectedPath: "/wpush/v2/a%20b" },
];

for (const item of preservationEndpoints) {
  const canonical = canonicalizePushEndpoint(item.raw);
  const expectedCanonical = `https://fcm.googleapis.com${item.expectedPath}`.replace(
    "fcm.googleapis.com",
    item.raw.includes("mozilla") ? "updates.push.services.mozilla.com" : "fcm.googleapis.com"
  );
  check(
    `[D98] Verbatim preservation of %HH: ${item.raw}`,
    canonical === expectedCanonical,
    `Result: ${canonical}, Expected: ${expectedCanonical}`
  );
}

// -----------------------------------------------------------------------------
// [D100] Encoded-Delimiter Preservation
// -----------------------------------------------------------------------------
console.log("\n--- [D100] Encoded-Delimiter Preservation ---");
const encodedDelimiterTests = [
  {
    raw: "https://fcm.googleapis.com/a%3Fb",
    desc: "%3F does not alter path/query slicing",
    expected: "https://fcm.googleapis.com/a%3Fb",
  },
  {
    raw: "https://fcm.googleapis.com/a%23fragment",
    desc: "%23 is not rejected as literal fragment",
    expected: "https://fcm.googleapis.com/a%23fragment",
  },
  {
    raw: "https://fcm.googleapis.com/a%2F..%2Ftoken",
    desc: "%2F is not collapsed as path traversal",
    expected: "https://fcm.googleapis.com/a%2F..%2Ftoken",
  },
];

for (const test of encodedDelimiterTests) {
  const canonical = canonicalizePushEndpoint(test.raw);
  check(`[D100] ${test.desc}`, canonical === test.expected, `Got: ${canonical}`);
}

// -----------------------------------------------------------------------------
// [D101] Provider Suffix Composition & Boundary Security
// -----------------------------------------------------------------------------
console.log("\n--- [D101] Provider Suffix Composition & Boundary Security ---");
const d101Accept = [
  "cluster1.fcm.googleapis.com",
  "1-web.push.apple.com",
  "wns2-sn1p.notify.windows.com",
];

const d101Reject = [
  "a.b.fcm.googleapis.com",
  "evil.android.googleapis.com",
  "fcm.googleapis.com.attacker.example",
  "evil-fcm.googleapis.com",
  "foo_bar.fcm.googleapis.com",
  "-evil.fcm.googleapis.com",
  "evil-.fcm.googleapis.com",
];

for (const host of d101Accept) {
  check(`[D101] Valid wildcard suffix composition accepted: ${host}`, isValidPushHost(host) === true);
}

for (const host of d101Reject) {
  check(`[D101] Boundary attack rejected: ${host}`, isValidPushHost(host) === false);
}

// -----------------------------------------------------------------------------
// [D99] Full Endpoint Differential Matrix
// -----------------------------------------------------------------------------
console.log("\n--- [D99] Full Endpoint Differential Matrix ---");
const matrixVectors = [
  // 1. Valid Chrome/FCM
  { endpoint: "https://fcm.googleapis.com/fcm/send/token123", valid: true, canonical: "https://fcm.googleapis.com/fcm/send/token123" },
  // 2. Valid with explicit :443 stripped
  { endpoint: "https://fcm.googleapis.com:443/fcm/send/token123", valid: true, canonical: "https://fcm.googleapis.com/fcm/send/token123" },
  // 3. Mixed hostname casing lowercased
  { endpoint: "https://FCM.GOOGLEAPIS.COM/fcm/send/token123", valid: true, canonical: "https://fcm.googleapis.com/fcm/send/token123" },
  // 4. Valid wildcard Apple
  { endpoint: "https://p01-web.push.apple.com/send/tok_apple", valid: true, canonical: "https://p01-web.push.apple.com/send/tok_apple" },
  // 5. Valid Mozilla
  { endpoint: "https://updates.push.services.mozilla.com/wpush/v2/gAAAAAB", valid: true, canonical: "https://updates.push.services.mozilla.com/wpush/v2/gAAAAAB" },
  // 6. Valid Windows WNS
  { endpoint: "https://wns2-sn1p.notify.windows.com/w/?token=xyz", valid: true, canonical: "https://wns2-sn1p.notify.windows.com/w/?token=xyz" },
  // 7. Reject raw IPv4
  { endpoint: "https://127.0.0.1/fcm/send", valid: false },
  // 8. Reject raw IPv6
  { endpoint: "https://[::1]/fcm/send", valid: false },
  // 9. Reject internal spaces
  { endpoint: "https://fcm.googleapis.com/fcm /send", valid: false },
  // 10. Reject fragment
  { endpoint: "https://fcm.googleapis.com/fcm/send#frag", valid: false },
  // 11. Reject non-443 port
  { endpoint: "https://fcm.googleapis.com:8443/fcm/send", valid: false },
  // 12. Reject userinfo
  { endpoint: "https://user:pass@fcm.googleapis.com/fcm/send", valid: false },
  // 13. Reject unapproved domain
  { endpoint: "https://evil.attacker.com/push", valid: false },
];

for (const vec of matrixVectors) {
  let tsCanonical = null;
  let tsValid = true;
  try {
    tsCanonical = canonicalizePushEndpoint(vec.endpoint);
  } catch {
    tsValid = false;
  }

  check(
    `[D99] Endpoint Differential: ${vec.endpoint}`,
    tsValid === vec.valid && (!vec.valid || tsCanonical === vec.canonical),
    `Valid: ${tsValid} (expected ${vec.valid}), Canonical: ${tsCanonical}`
  );
}

// -----------------------------------------------------------------------------
// Defense-in-depth IP classification tests
// -----------------------------------------------------------------------------
console.log("\n--- IP Classification & Preflight Defense-in-Depth ---");
check("127.0.0.1 is loopback (rejected)", isPrivateOrReservedIp("127.0.0.1") === true);
check("10.0.0.1 is private (rejected)", isPrivateOrReservedIp("10.0.0.1") === true);
check("192.168.1.1 is private (rejected)", isPrivateOrReservedIp("192.168.1.1") === true);
check("169.254.169.254 is metadata (rejected)", isPrivateOrReservedIp("169.254.169.254") === true);
check("::1 is loopback (rejected)", isPrivateOrReservedIp("::1") === true);
check("::ffff:127.0.0.1 is mapped loopback (rejected)", isPrivateOrReservedIp("::ffff:127.0.0.1") === true);
check("::ffff:169.254.169.254 is mapped metadata (rejected)", isPrivateOrReservedIp("::ffff:169.254.169.254") === true);
check("8.8.8.8 is public (allowed)", isPrivateOrReservedIp("8.8.8.8") === false);
check("142.250.190.46 is public Google IP (allowed)", isPrivateOrReservedIp("142.250.190.46") === false);

console.log("\n==================================================================");
console.log(` RESULTS: ${passedAssertions} PASSED, ${failedAssertions} FAILED`);
console.log("==================================================================");

if (failedAssertions > 0) {
  process.exit(1);
}
