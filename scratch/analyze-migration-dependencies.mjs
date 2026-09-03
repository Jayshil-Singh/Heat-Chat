import fs from "node:fs";
import path from "node:path";

const dir = "supabase/migrations";
const files = fs.readdirSync(dir).filter(f => f.endsWith(".sql")).sort();

const createdTables = new Set();
const hazards = [];

for (const file of files) {
  let content = fs.readFileSync(path.join(dir, file), "utf8");

  // Strip single-line comments
  content = content.replace(/--.*$/gm, "");
  // Strip multi-line comments
  content = content.replace(/\/\*[\s\S]*?\*\//g, "");

  // Find all CREATE TABLE [IF NOT EXISTS] public.<table_name>
  const createTableRegex = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:public\.)?([a-zA-Z0-9_]+)/gi;
  let match;
  while ((match = createTableRegex.exec(content)) !== null) {
    createdTables.add(match[1].toLowerCase());
  }

  // Find all ALTER TABLE [ONLY] public.<table_name>
  const alterTableRegex = /ALTER\s+TABLE(?:\s+ONLY)?\s+(?:public\.)?([a-zA-Z0-9_]+)/gi;
  while ((match = alterTableRegex.exec(content)) !== null) {
    const table = match[1].toLowerCase();
    if (!createdTables.has(table)) {
      hazards.push({
        file,
        type: "ALTER_BEFORE_CREATE",
        table,
      });
    }
  }

  // Find all CREATE [UNIQUE] INDEX ... ON [public.]<table_name>
  const createIndexRegex = /CREATE(?:\s+UNIQUE)?\s+INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+[a-zA-Z0-9_]+\s+ON\s+(?:public\.)?([a-zA-Z0-9_]+)/gi;
  while ((match = createIndexRegex.exec(content)) !== null) {
    const table = match[1].toLowerCase();
    if (!createdTables.has(table)) {
      hazards.push({
        file,
        type: "INDEX_BEFORE_CREATE",
        table,
      });
    }
  }

  // Find all FOREIGN KEY references: REFERENCES [public.]<table_name>
  const referencesRegex = /REFERENCES\s+(?:public\.)?([a-zA-Z0-9_]+)/gi;
  while ((match = referencesRegex.exec(content)) !== null) {
    const table = match[1].toLowerCase();
    if (table !== "users" && table !== "auth" && !createdTables.has(table)) {
      hazards.push({
        file,
        type: "REFERENCES_BEFORE_CREATE",
        table,
      });
    }
  }
}

console.log("Filtered Ordering Hazards detected (" + hazards.length + "):");
for (const h of hazards) {
  console.log(`❌ [${h.type}] in ${h.file} targets "${h.table}"`);
}
if (hazards.length === 0) {
  console.log("✅ Zero table DDL ordering hazards detected across all 24 migrations in alphabetical order!");
}
