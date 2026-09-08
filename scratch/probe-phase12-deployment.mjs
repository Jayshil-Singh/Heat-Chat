import https from "node:https";

const liveUrl = "https://heat-chat-beta.vercel.app";

function fetchPage(path) {
  return new Promise((resolve, reject) => {
    https.get(`${liveUrl}${path}`, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on("error", reject);
  });
}

async function probe() {
  console.log("Probing live deployment on https://heat-chat-beta.vercel.app...");
  const chatRes = await fetchPage("/chat");
  console.log("GET /chat Status:", chatRes.status);

  const discoverRes = await fetchPage("/discover");
  console.log("GET /discover Status:", discoverRes.status);

  const settingsRes = await fetchPage("/settings");
  console.log("GET /settings Status:", settingsRes.status);

  const swRes = await fetchPage("/sw.js");
  console.log("GET /sw.js Status:", swRes.status);
  console.log("Service Worker contains cache bypass:", swRes.body.includes("shouldBypassCache"));
}

probe().catch(console.error);
