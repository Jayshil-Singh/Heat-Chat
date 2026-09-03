import fs from "node:fs";
import path from "node:path";
import assert from "node:assert";

console.log("=== AUDIT EXACT REGEX SOURCE BYTES (D102 & D103) ===\n");

// 1. SQL File Inspection
const sqlPath = path.resolve(process.cwd(), "supabase/migrations/20260909_phase7_notifications_and_push.sql");
const sqlContent = fs.readFileSync(sqlPath, "utf-8");

// Extract the wildcard regex line
const sqlRegexMatch = sqlContent.match(/v_host ~ '(\^\[a-z0-9\][^']+)'/);
if (!sqlRegexMatch) {
  console.error("FAIL: Could not extract wildcard regex from SQL migration");
  process.exit(1);
}

const extractedSqlRegex = sqlRegexMatch[1];
const expectedSqlRegex = "^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.(fcm\\.googleapis\\.com|push\\.apple\\.com|push\\.services\\.mozilla\\.com|notify\\.windows\\.com)$";

console.log("1. Extracted SQL Regex from Migration:");
console.log("   Raw string:", extractedSqlRegex);
console.log("   Matches expected string?:", extractedSqlRegex === expectedSqlRegex);

// Verify character bytes
const charBeforeGroupIdx = extractedSqlRegex.indexOf("([a-z0-9-]{0,61}");
const charBeforeGroup = extractedSqlRegex[charBeforeGroupIdx];
const charPreceding = extractedSqlRegex[charBeforeGroupIdx - 1];

console.log("   Opening parenthesis char:", charBeforeGroup, "(ASCII code:", charBeforeGroup.charCodeAt(0), ")");
console.log("   Preceding char:", charPreceding, "(ASCII code:", charPreceding.charCodeAt(0), ")");
const hasEscapedParenInSql = extractedSqlRegex.includes("\\(");
console.log("   Contains escaped \\( in SQL?:", hasEscapedParenInSql);

// 2. TypeScript File Inspection
const tsPath = path.resolve(process.cwd(), "lib/notifications/egress.ts");
const tsContent = fs.readFileSync(tsPath, "utf-8");

const tsPatternMatch = tsContent.match(/WILDCARD_LABEL_PATTERN\s*=\s*(\/[^\/]+\/)/);
if (!tsPatternMatch) {
  console.error("FAIL: Could not extract WILDCARD_LABEL_PATTERN from egress.ts");
  process.exit(1);
}

const extractedTsPatternLiteral = tsPatternMatch[1];
const expectedTsPatternLiteral = "/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/";

console.log("\n2. Extracted TypeScript Regex Literal from egress.ts:");
console.log("   Literal:", extractedTsPatternLiteral);
console.log("   Matches expected literal?:", extractedTsPatternLiteral === expectedTsPatternLiteral);

const hasEscapedParenInTs = extractedTsPatternLiteral.includes("\\(");
const hasPlainNonCapturingInTs = extractedTsPatternLiteral.includes("(?:");

console.log("   Contains plain (?: in TS?:", hasPlainNonCapturingInTs);
console.log("   Contains escaped \\( in TS?:", hasEscapedParenInTs);

// 3. Assertions
assert.strictEqual(extractedSqlRegex, expectedSqlRegex, "SQL regex must match expected POSIX ERE");
assert.strictEqual(hasEscapedParenInSql, false, "SQL must contain 0 instances of \\(");
assert.strictEqual(extractedTsPatternLiteral, expectedTsPatternLiteral, "TS regex literal must match expected ECMAScript pattern");
assert.strictEqual(hasEscapedParenInTs, false, "TS must contain 0 instances of \\(");
assert.strictEqual(hasPlainNonCapturingInTs, true, "TS must contain plain (?:");

console.log("\n✅ D102 & D103 REAL SOURCE BYTE VERIFICATION: 100% PASSED!\n");
