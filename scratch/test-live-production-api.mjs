const BASE_URL = "https://heat-chat-beta.vercel.app";

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
    console.log(`Headers content-type:`, res.headers.get("content-type"));
    console.log(`Body:`, json || text.slice(0, 300));
    return { status: res.status, json, text };
  } catch (err) {
    console.error(`Fetch error:`, err.message);
    return { error: err.message };
  }
}

async function main() {
  console.log("==================================================================");
  console.log(" TESTING LIVE PRODUCTION API: https://heat-chat-beta.vercel.app");
  console.log("==================================================================");

  // 1. GET /api/saved without auth (unauthorized user)
  await testEndpoint("GET /api/saved (unauthenticated)", `${BASE_URL}/api/saved`);

  // 2. GET /api/saved with invalid UUID
  await testEndpoint(
    "GET /api/saved (invalid conversation UUID)",
    `${BASE_URL}/api/saved?conversationId=not-a-valid-uuid`
  );

  // 3. GET /api/saved with valid conversation ID (unauthenticated)
  await testEndpoint(
    "GET /api/saved (with valid conversationId, unauthenticated)",
    `${BASE_URL}/api/saved?conversationId=451ed7e8-1f8e-40d0-8575-470720acf809`
  );

  // 4. DELETE /api/groups/[id]/members/[memberId] without auth
  await testEndpoint(
    "DELETE /api/groups/[id]/members/[memberId] (unauthenticated)",
    `${BASE_URL}/api/groups/451ed7e8-1f8e-40d0-8575-470720acf809/members/00000000-0000-0000-0000-000000000000`,
    { method: "DELETE" }
  );

  // 5. DELETE /api/groups/[id]/members/[memberId] with invalid UUID
  await testEndpoint(
    "DELETE /api/groups/[id]/members/[memberId] (invalid UUID)",
    `${BASE_URL}/api/groups/invalid-group-id/members/invalid-member-id`,
    { method: "DELETE" }
  );
}

main().catch(console.error);
