import fs from "node:fs";
import path from "node:path";

const dir = "supabase/migrations";
const files = fs.readdirSync(dir).filter(f => f.endsWith(".sql")).sort();

const missing = [];

for (const file of files) {
  const content = fs.readFileSync(path.join(dir, file), "utf8");
  const regex = /CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+([a-zA-Z0-9_.]+)\s*\(([\s\S]*?)\)\s*RETURNS\s+([\s\S]*?)\s+AS\s+\$\$([\s\S]*?)\$\$\s*LANGUAGE\s+plpgsql\s*([\s\S]*?);/gi;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const fnName = match[1];
    const postLanguage = match[5];
    const preBody = match[3];
    const isSecDef = /SECURITY\s+DEFINER/i.test(postLanguage) || /SECURITY\s+DEFINER/i.test(preBody);
    const hasSearchPath = /SET\s+search_path/i.test(postLanguage) || /SET\s+search_path/i.test(preBody);
    if (isSecDef && !hasSearchPath) {
      missing.push({ file, fnName, args: match[2].replace(/\s+/g, " ").trim(), returnType: match[3].replace(/\s+/g, " ").trim() });
    }
  }
}

console.log("Total missing definitions:", missing.length);
const byFn = {};
for (const m of missing) {
  byFn[m.fnName] = byFn[m.fnName] || [];
  byFn[m.fnName].push({ file: m.file, args: m.args, returnType: m.returnType });
}
console.log("Unique function names missing search_path (" + Object.keys(byFn).length + "):");
for (const [name, occurrences] of Object.entries(byFn)) {
  console.log(`- ${name}`);
  for (const o of occurrences) {
    console.log(`    ${o.file}: (${o.args}) -> ${o.returnType}`);
  }
}
