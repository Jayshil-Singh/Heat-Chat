import fs from "node:fs";

async function run() {
  const res = await fetch("https://heat-chat-beta.vercel.app/login", { cache: "no-store" });
  console.log("Status:", res.status);
  console.log("Relevant Headers:");
  for (const [k, v] of res.headers.entries()) {
    if (k.includes("vercel") || k.includes("cache") || k.includes("age") || k.includes("etag") || k.includes("date")) {
      console.log(`  ${k}: ${v}`);
    }
  }
  const text = await res.text();
  const scriptRegex = /src=["'](\/_next\/static\/[^"']+)["']/g;
  const scriptMatches = [];
  let m;
  while ((m = scriptRegex.exec(text)) !== null) {
    scriptMatches.push(m[1]);
  }
  console.log(`\nScripts found on live site (${scriptMatches.length}):`);
  for (const s of scriptMatches.slice(0, 5)) {
    console.log("  " + s);
  }

  // Check if build-manifest.json or chunks match local .next
  if (fs.existsSync(".next/build-manifest.json")) {
    const localManifest = JSON.parse(fs.readFileSync(".next/build-manifest.json", "utf8"));
    const localLoginScripts = localManifest.pages["/login"] || [];
    console.log("\nLocal .next login scripts:");
    for (const s of localLoginScripts.slice(0, 5)) {
      console.log("  /_next/" + s);
    }
    
    // Check if the live scripts are present in local build
    const matchesCount = scriptMatches.filter(s => localLoginScripts.some(l => s.endsWith(l))).length;
    console.log(`\nMatching script chunks: ${matchesCount} / ${scriptMatches.length}`);
  }
}

run();
