async function checkSW() {
  for (let i = 1; i <= 30; i++) {
    console.log(`[Attempt ${i}/30] Probing https://heat-chat-beta.vercel.app/sw.js ...`);
    try {
      const res = await fetch("https://heat-chat-beta.vercel.app/sw.js", { cache: "no-store" });
      const text = await res.text();
      if (text.includes("heat-chat-shell-v3")) {
        console.log("🎉 Vercel deployment ACTIVE! sw.js contains heat-chat-shell-v3 and 503 fallback.");
        process.exit(0);
      } else if (text.includes("heat-chat-shell-v2")) {
        console.log("Still v2 on edge CDN, waiting for Vercel deployment...");
      } else {
        console.log("Status:", res.status, "Length:", text.length);
      }
    } catch (e) {
      console.log("Error:", e.message);
    }
    await new Promise((r) => setTimeout(r, 6000));
  }
  console.log("Timeout waiting for deployment.");
  process.exit(1);
}

checkSW();
