const LOCAL_URL = "http://localhost:3000";

async function testEndpoint(name, url, options = {}) {
  console.log(`\n--- Testing ${name} ---`);
  console.log(`${options.method || "GET"} ${url}`);
  try {
    const res = await fetch(url, options);
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // not json
    }
    console.log(`Status: ${res.status} ${res.statusText}`);
    console.log(`Body:`, json || text.slice(0, 300));
    return { status: res.status, json, text };
  } catch (err) {
    console.error(`Fetch error:`, err.message);
    return { error: err.message };
  }
}

async function main() {
  console.log("==================================================================");
  console.log(" TESTING LOCAL API WITH OUR FIXES: http://localhost:3000");
  console.log("==================================================================");

  // 1. GET /api/saved (unauthenticated)
  await testEndpoint("GET /api/saved (unauthenticated)", `${LOCAL_URL}/api/saved`);

  // 2. DELETE /api/groups/[id]/members/[memberId] (unauthenticated)
  await testEndpoint(
    "DELETE /api/groups/[id]/members/[memberId] (unauthenticated)",
    `${LOCAL_URL}/api/groups/451ed7e8-1f8e-40d0-8575-470720acf809/members/00000000-0000-0000-0000-000000000000`,
    { method: "DELETE" }
  );

  // 3. DELETE with invalid UUIDs
  await testEndpoint(
    "DELETE /api/groups/[id]/members/[memberId] (invalid UUID)",
    `${LOCAL_URL}/api/groups/invalid-group-id/members/invalid-member-id`,
    { method: "DELETE" }
  );
}

main().catch(console.error);
