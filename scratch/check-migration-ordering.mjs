import fs from "node:fs";
import path from "node:path";

const dir = "supabase/migrations";
const files = fs.readdirSync(dir).filter(f => f.endsWith(".sql")).sort();

console.log("Lexicographical order of all migrations:");
const versions = new Map();

for (let i = 0; i < files.length; i++) {
  const file = files[i];
  const version = file.split("_")[0];
  console.log(`${(i + 1).toString().padStart(2, " ")}. [version: ${version}] ${file}`);
  if (versions.has(version)) {
    versions.get(version).push(file);
  } else {
    versions.set(version, [file]);
  }
}

console.log("\nVersion collisions (multiple files sharing same prefix):");
for (const [v, flist] of versions.entries()) {
  if (flist.length > 1) {
    console.log(`Prefix "${v}" has ${flist.length} files:`);
    for (const f of flist) console.log(`   - ${f}`);
  }
}
