import fs from "node:fs";
import path from "node:path";

const dir = "supabase/migrations";
const files = fs.readdirSync(dir).filter(f => f.endsWith(".sql")).sort();

const secDefFunctions = [];

for (const file of files) {
  const content = fs.readFileSync(path.join(dir, file), "utf8");

  // Regex to match CREATE OR REPLACE FUNCTION ...
  const regex = /CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+([a-zA-Z0-9_.]+)\s*\(([\s\S]*?)\)\s*RETURNS\s+([\s\S]*?)\s+AS\s+\$\$([\s\S]*?)\$\$\s*LANGUAGE\s+plpgsql\s*([\s\S]*?);/gi;

  let match;
  while ((match = regex.exec(content)) !== null) {
    const fnName = match[1];
    const postLanguage = match[5];
    const preBody = match[3];
    const fullSignature = `${fnName}(...)`;
    
    // Check if security definer appears anywhere in declaration or postLanguage
    const isSecDef = /SECURITY\s+DEFINER/i.test(postLanguage) || /SECURITY\s+DEFINER/i.test(preBody);
    const hasSearchPath = /SET\s+search_path/i.test(postLanguage) || /SET\s+search_path/i.test(preBody);

    if (isSecDef) {
      secDefFunctions.push({
        file,
        fnName,
        hasSearchPath,
        postLanguage: postLanguage.replace(/\s+/g, " ").trim(),
      });
    }
  }
}

console.log(`Found ${secDefFunctions.length} SECURITY DEFINER function definitions:\n`);

let missingCount = 0;
for (const fn of secDefFunctions) {
  if (!fn.hasSearchPath) {
    console.log(`❌ MISSING search_path: ${fn.fnName} in ${fn.file}`);
    missingCount++;
  } else {
    console.log(`✅ HAS search_path:     ${fn.fnName} in ${fn.file}`);
  }
}

console.log(`\nSummary: ${secDefFunctions.length} SECURITY DEFINER functions, ${missingCount} missing SET search_path.`);
