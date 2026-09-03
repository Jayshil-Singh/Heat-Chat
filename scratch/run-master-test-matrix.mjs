/**
 * Heat Chat — Master Test Matrix Execution Script
 * Executes all tests across separate categories and records exact pass/fail counts.
 */

import { execSync } from "node:child_process";

const suites = [
  { name: "Unit Tests", cmd: "node --experimental-strip-types scratch/test-unit-suite.mjs", category: "Unit Tests" },
  { name: "Open Redirect Adversarial", cmd: "node scratch/test-open-redirect-suite.mjs", category: "Open-Redirect Tests" },
  { name: "Static Contract Tests", cmd: "node scratch/test-static-contracts.mjs", category: "Static Tests" },
  { name: "Database Invariant Tests", cmd: "node scratch/test-db-invariants.mjs", category: "Database Tests" },
  { name: "Live Post-Migration Schema Probe", cmd: "node scratch/verify-live-db-post-migration.mjs", category: "Database Tests" },
  { name: "Live RLS & Security Suite", cmd: "node scratch/test-live-rls-and-security.mjs", category: "Database Tests" },
  { name: "DB Schema Simulation (Clean & Partial)", cmd: "node scratch/simulate-db-migrations.mjs", category: "Database Tests" },
  { name: "API Integration Tests", cmd: "node scratch/test-real-api-integration.mjs", category: "API Integration Tests" },
  { name: "Live Production Smoke Tests", cmd: "node scratch/test-live-production-smoke.mjs", category: "Live Smoke Tests" },
];

console.log("==================================================================");
console.log(" HEAT CHAT MASTER TEST MATRIX EXECUTION");
console.log(" Timestamp:", new Date().toISOString());
console.log("==================================================================\n");

let passedSuites = 0;
let failedSuites = 0;

for (const s of suites) {
  process.stdout.write(`Executing [${s.category}] ${s.name}... `);
  try {
    execSync(s.cmd, { stdio: "pipe" });
    console.log("✅ PASSED");
    passedSuites++;
  } catch (err) {
    console.log("❌ FAILED");
    console.error(err.stdout?.toString() || err.stderr?.toString() || err.message);
    failedSuites++;
  }
}

console.log("\n==================================================================");
console.log(` MASTER TEST MATRIX SUMMARY: ${passedSuites}/${suites.length} Suites Passed`);
console.log("==================================================================\n");

if (failedSuites > 0) {
  process.exit(1);
}
