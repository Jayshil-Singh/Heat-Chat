import fs from "node:fs";
import path from "node:path";

const sqlPath = path.resolve(process.cwd(), "supabase/full_schema.sql");
const content = fs.readFileSync(sqlPath, "utf-8");

const tables = new Set();
const functions = new Set();
const triggers = new Set();
const indexes = new Set();
const policies = [];
const bucketMatches = [];

const lines = content.split("\n");

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();

  // Tables
  const tableMatch = line.match(/^create\s+table\s+(if\s+not\s+exists\s+)?(public\.)?([a-z0-9_]+)/i);
  if (tableMatch) {
    tables.add(tableMatch[3]);
  }

  // Functions
  const funcMatch = line.match(/^create\s+(or\s+replace\s+)?function\s+(public\.)?([a-z0-9_]+)/i);
  if (funcMatch) {
    functions.add(funcMatch[3]);
  }

  // Triggers
  const trigMatch = line.match(/^create\s+trigger\s+([a-z0-9_]+)/i);
  if (trigMatch) {
    triggers.add(trigMatch[1]);
  }

  // Indexes
  const idxMatch = line.match(/^create\s+(unique\s+)?index\s+(if\s+not\s+exists\s+)?([a-z0-9_]+)/i);
  if (idxMatch) {
    indexes.add(idxMatch[3]);
  }

// Multiline policy matching
const policyRegex = /create\s+policy\s+"([^"]+)"\s*\n?\s*on\s+([a-z0-9_.]+)/gi;
let m;
while ((m = policyRegex.exec(content)) !== null) {
  policies.push({ policy: m[1].trim(), table: m[2].trim() });
}

  // Storage buckets
  if (line.includes("storage.buckets") || line.includes("chat-attachments")) {
    bucketMatches.push(line);
  }
}

console.log("=== TABLES (" + tables.size + ") ===");
console.log([...tables].join("\n"));

console.log("\n=== FUNCTIONS (" + functions.size + ") ===");
console.log([...functions].join("\n"));

console.log("\n=== TRIGGERS (" + triggers.size + ") ===");
console.log([...triggers].join("\n"));

console.log("\n=== INDEXES (" + indexes.size + ") ===");
console.log([...indexes].join("\n"));

console.log("\n=== RLS POLICIES (" + policies.length + ") ===");
policies.forEach(p => console.log(`[${p.table}] "${p.policy}"`));

console.log("\n=== STORAGE MENTIONS ===");
console.log(bucketMatches.join("\n"));
