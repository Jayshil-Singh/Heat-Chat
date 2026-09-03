import fs from "node:fs";
import path from "node:path";

const dir = "supabase/migrations";
const files = fs.readdirSync(dir).filter(f => f.endsWith(".sql")).sort();

const seen = new Set();
const statements = [];

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
      // Parse parameters: only need types for ALTER FUNCTION
      const rawArgs = match[2].trim();
      let paramTypes = "";
      if (rawArgs.length > 0) {
        // Split arguments by comma, but handle default values or arrays
        const parts = rawArgs.split(",");
        const types = parts.map(p => {
          let cleaned = p.trim();
          // Remove default ...
          cleaned = cleaned.replace(/\s+default\s+[\s\S]*/i, "");
          // Extract type (last word, or word with array [])
          const tokens = cleaned.trim().split(/\s+/);
          // If first token is 'in', 'out', 'inout', 'variadic', handle it
          let typeToken = tokens[tokens.length - 1];
          if (tokens.length >= 2 && tokens[0].toLowerCase() === "p_" || tokens.length >= 2) {
            typeToken = tokens.slice(1).join(" ");
          }
          return typeToken;
        });
        paramTypes = types.join(", ");
      }

      const sigKey = `${fnName}(${paramTypes})`;
      if (!seen.has(sigKey)) {
        seen.add(sigKey);
        statements.push({
          fnName,
          rawArgs,
          file,
        });
      }
    }
  }
}

console.log(`Generated ${statements.length} function statements.`);
for (const s of statements) {
  console.log(`-- From ${s.file}`);
  console.log(`${s.fnName}(${s.rawArgs})`);
}
