import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const files = [
  "supabase/migrations/20260909_phase7_notifications_and_push.sql",
  "lib/notifications/egress.ts",
  "lib/notifications/provider-rules.json"
];

console.log("==================================================================");
console.log(" REPOSITORY PHASE 7 SOURCE INSPECTION AT COMMIT 3ed2d6b");
console.log("==================================================================\n");

for (const f of files) {
  const fullPath = path.join(cwd, f);
  const exists = fs.existsSync(fullPath);
  console.log(`File: ${f}`);
  console.log(`  Exists on disk: ${exists ? "YES" : "NO"}`);
  if (exists) {
    const content = fs.readFileSync(fullPath, "utf-8");
    console.log(`  Size: ${content.length} bytes`);
  }
}
