const PROD_URL = "https://heat-chat-beta.vercel.app";

async function probe() {
  console.log(`Checking /discover on ${PROD_URL}...`);
  try {
    const res = await fetch(`${PROD_URL}/discover?_t=${Date.now()}`, { redirect: "manual" });
    console.log("Status:", res.status);
    console.log("Headers:", Object.fromEntries(res.headers.entries()));
    const text = await res.text();
    console.log("Response length:", text.length);
    console.log("Preview:", text.slice(0, 300));
  } catch (err) {
    console.error("Probe error:", err);
  }
}

probe();
