import fs from "node:fs";
import path from "node:path";

const migrationsDir = "supabase/migrations";
const files = fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith(".sql"))
  .sort();

console.log("Found", files.length, "migration files in chronological/lexicographical order:\n");

const functionHistory = new Map(); // fnName -> [{ file, line, returnType, isSecurityDefiner }]
const tableHistory = new Map(); // tableName -> [{ file, action }]
const migrationDetails = [];

for (const file of files) {
  const content = fs.readFileSync(path.join(migrationsDir, file), "utf8");
  const timestamp = file.split("_")[0];
  const name = file.slice(timestamp.length + 1);

  // Match CREATE TABLE
  const tableMatches = content.matchAll(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:public\.)?([a-zA-Z0-9_]+)/gi);
  const createdTables = [];
  for (const m of tableMatches) {
    createdTables.push(m[1]);
    if (!tableHistory.has(m[1])) tableHistory.set(m[1], []);
    tableHistory.get(m[1]).push({ file, action: "CREATE" });
  }

  // Match ALTER TABLE
  const alterMatches = content.matchAll(/ALTER\s+TABLE(?:\s+IF\s+EXISTS)?\s+(?:public\.)?([a-zA-Z0-9_]+)/gi);
  const alteredTables = [];
  for (const m of alterMatches) {
    alteredTables.push(m[1]);
    if (!tableHistory.has(m[1])) tableHistory.set(m[1], []);
    tableHistory.get(m[1]).push({ file, action: "ALTER" });
  }

  // Match CREATE [OR REPLACE] FUNCTION
  const fnMatches = content.matchAll(/CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+(?:public\.)?([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)\s*RETURNS\s+([\s\S]*?)(?:LANGUAGE|AS|\$)/gi);
  const definedFns = [];
  for (const m of fnMatches) {
    const fnName = m[1];
    const params = m[2].replace(/\s+/g, " ").trim();
    const retType = m[3].replace(/\s+/g, " ").trim();
    const isSecurityDefiner = /SECURITY\s+DEFINER/i.test(content.slice(m.index, m.index + 1000));
    const hasSearchPath = /SET\s+search_path\s*=/i.test(content.slice(m.index, m.index + 1500));

    definedFns.push({ fnName, params, retType, isSecurityDefiner, hasSearchPath });
    if (!functionHistory.has(fnName)) functionHistory.set(fnName, []);
    functionHistory.get(fnName).push({ file, params, retType, isSecurityDefiner, hasSearchPath });
  }

  migrationDetails.push({
    file,
    timestamp,
    name,
    createdTables,
    alteredTables,
    definedFns,
  });
}

console.log("=== MIGRATION OVERVIEW ===");
for (const m of migrationDetails) {
  console.log(`[${m.timestamp}] ${m.file}:`);
  if (m.createdTables.length > 0) console.log(`  + Tables Created: ${m.createdTables.join(", ")}`);
  if (m.alteredTables.length > 0) console.log(`  ~ Tables Altered: ${[...new Set(m.alteredTables)].join(", ")}`);
  if (m.definedFns.length > 0) console.log(`  * Functions (${m.definedFns.length}): ${m.definedFns.map(f => f.fnName).join(", ")}`);
}

console.log("\n=== FUNCTIONS DEFINED IN MULTIPLE MIGRATIONS (OVERWRITES) ===");
for (const [fnName, history] of functionHistory.entries()) {
  if (history.length > 1) {
    console.log(`\nFunction: ${fnName} (defined ${history.length} times):`);
    for (const h of history) {
      console.log(`  - ${h.file}`);
      console.log(`    params: ${h.params}`);
      console.log(`    returns: ${h.retType}`);
      console.log(`    sec_def: ${h.isSecurityDefiner}, search_path: ${h.hasSearchPath}`);
    }
  }
}
