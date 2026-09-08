import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

const client = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log("=== 1. FETCHING OPENAPI SPEC FROM POSTGREST ===");
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/?apikey=${SUPABASE_KEY}`);
    const openapi = await res.json();
    
    const rpcNames = [
      "get_my_discoverability",
      "discover_people",
      "set_discoverability",
      "get_my_friend_requests",
      "send_friend_request",
      "accept_friend_request",
      "reject_friend_request",
      "decline_friend_request",
      "cancel_friend_request",
    ];

    console.log("OpenAPI definitions found for RPCs:");
    for (const name of rpcNames) {
      const pathKey = `/rpc/${name}`;
      if (openapi.paths && openapi.paths[pathKey]) {
        console.log(`\nRPC ${name}:`);
        const postDef = openapi.paths[pathKey].post;
        if (postDef) {
          console.log("  Parameters:", JSON.stringify(postDef.parameters, null, 2));
          console.log("  Responses:", Object.keys(postDef.responses));
          if (postDef.responses["200"]) {
            console.log("  200 schema:", JSON.stringify(postDef.responses["200"].schema, null, 2));
          }
        }
      } else {
        console.log(`\nRPC ${name}: NOT FOUND IN OPENAPI SPEC!`);
      }
    }
  } catch (err) {
    console.error("Failed to fetch OpenAPI:", err);
  }

  console.log("\n=== 2. DIRECT RPC CALLS (ANONYMOUS) ===");
  const testCalls = [
    { name: "get_my_discoverability", params: {} },
    { name: "discover_people", params: { search_query: null, result_limit: 30, result_offset: 0 } },
    { name: "discover_people", params: {} },
    { name: "set_discoverability", params: { enabled: true } },
    { name: "get_my_friend_requests", params: {} },
    { name: "send_friend_request", params: { target_user_id: "00000000-0000-0000-0000-000000000000" } },
    { name: "accept_friend_request", params: { request_id: "00000000-0000-0000-0000-000000000000" } },
    { name: "decline_friend_request", params: { request_id: "00000000-0000-0000-0000-000000000000" } },
    { name: "cancel_friend_request", params: { request_id: "00000000-0000-0000-0000-000000000000" } },
  ];

  for (const call of testCalls) {
    const { data, error, status } = await client.rpc(call.name, call.params);
    console.log(`RPC ${call.name}(${JSON.stringify(call.params)}):`, {
      status,
      data,
      error: error ? { code: error.code, message: error.message, details: error.details, hint: error.hint } : null,
    });
  }
}

main().catch(console.error);
