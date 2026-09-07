const PROD_URL = "https://heat-chat-beta.vercel.app";

async function probe() {
  console.log(`Checking production deployment at ${PROD_URL}...`);

  const endpoints = [
    { path: "/manifest.webmanifest", type: "manifest" },
    { path: "/favicon.ico", type: "favicon" },
    { path: "/sw.js", type: "service worker" },
    { path: "/offline", type: "offline page" },
    { path: "/icons/icon-192.png", type: "icon-192" },
    { path: "/icons/icon-512.png", type: "icon-512" },
    { path: "/icons/icon-maskable-512.png", type: "icon-maskable" },
    { path: "/icons/apple-touch-icon.png", type: "apple-touch-icon" },
  ];

  let allOk = true;

  for (const ep of endpoints) {
    try {
      const url = `${PROD_URL}${ep.path}?_t=${Date.now()}`;
      const res = await fetch(url, { cache: "no-store" });
      const ct = res.headers.get("content-type");
      const len = res.headers.get("content-length") || (await res.clone().arrayBuffer()).byteLength;
      const status = res.status;

      let extra = "";
      if (ep.type === "service worker") {
        const text = await res.clone().text();
        const hasV2 = text.includes("heat-chat-shell-v2");
        extra = hasV2 ? "(v2 with PWA shell)" : "(older version!)";
        if (!hasV2) allOk = false;
      } else if (ep.type === "manifest") {
        const text = await res.clone().text();
        const isStandalone = text.includes("standalone");
        extra = isStandalone ? "(valid manifest)" : "(invalid)";
        if (!isStandalone) allOk = false;
      }

      console.log(
        `  ${status === 200 ? "✓" : "✗"} [${status}] ${ep.path.padEnd(32)} ${ct || ""} (${len} bytes) ${extra}`
      );

      if (status !== 200) {
        allOk = false;
      }
    } catch (err) {
      console.log(`  ✗ [ERR] ${ep.path}: ${err.message}`);
      allOk = false;
    }
  }

  return allOk;
}

probe().then((ok) => {
  if (ok) {
    console.log("\n🎉 Production deployment has updated with Phase 10 PWA!");
    process.exit(0);
  } else {
    console.log("\n⏳ Production deployment is still in progress or not updated yet...");
    process.exit(1);
  }
});
