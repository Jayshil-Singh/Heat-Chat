const PROD_URL = "https://heat-chat-beta.vercel.app/api/groups/451ed7e8-1f8e-40d0-8575-470720acf809/members/00000000-0000-0000-0000-000000000000";

async function checkDeployment() {
  const maxAttempts = 30; // 30 attempts * 10s = 5 mins
  for (let i = 1; i <= maxAttempts; i++) {
    console.log(`[Attempt ${i}/${maxAttempts}] Checking Vercel deployment...`);
    try {
      const res = await fetch(PROD_URL, { method: "DELETE" });
      const contentType = res.headers.get("content-type") || "";
      const text = await res.text();
      console.log(`Status: ${res.status}, Content-Type: ${contentType}`);

      if (contentType.includes("application/json")) {
        console.log("JSON response received!");
        console.log("Body:", text);
        if (res.status === 401) {
          console.log("🎉 SUCCESS: DELETE /api/groups/[id]/members/[memberId] is DEPLOYED and ACTIVE on Vercel!");
          return true;
        }
      }
    } catch (e) {
      console.log("Fetch error:", e.message);
    }
    await new Promise((r) => setTimeout(r, 10000));
  }
  console.log("Timed out waiting for Vercel deployment.");
  return false;
}

checkDeployment().then((ok) => process.exit(ok ? 0 : 1));
