// Schema inspection script — queries the live Supabase REST API
// to check which Phase 3 objects already exist without needing Docker/psql.
// Run: node scratch/inspect-live-schema.mjs

const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const ANON_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

async function query(sql) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/query`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    const t = await res.text();
    return { error: t };
  }
  return res.json();
}

async function pgQuery(sql) {
  // Use the pg_meta REST endpoint (available on Supabase projects)
  const res = await fetch(
    `${SUPABASE_URL}/pg/query?query=${encodeURIComponent(sql)}`,
    {
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
    }
  );
  if (!res.ok) {
    const t = await res.text();
    return { error: t, status: res.status };
  }
  return res.json();
}

// Check via information_schema using the REST API on existing tables
async function checkViaRestHead(table) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?limit=0`, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      Prefer: "count=none",
    },
  });
  return { table, exists: res.ok, status: res.status };
}

async function main() {
  console.log("\n=== Live Supabase Schema Inspection ===");
  console.log(`Project: ${SUPABASE_URL}\n`);

  const phase3Tables = [
    "message_user_states",
    "message_pins",
    "message_delivery_states",
    "conversation_user_states",
    "conversation_drafts",
  ];

  console.log("--- Phase 3 Tables ---");
  for (const t of phase3Tables) {
    const r = await checkViaRestHead(t);
    console.log(`  ${r.exists ? "✅ EXISTS" : "❌ MISSING"}: ${t} (HTTP ${r.status})`);
  }

  console.log("\n--- Existing messaging tables (sanity check) ---");
  const existing = ["messages", "conversations", "conversation_members", "message_reactions", "message_reads", "attachments", "starred_messages"];
  for (const t of existing) {
    const r = await checkViaRestHead(t);
    console.log(`  ${r.exists ? "✅ OK" : "❌ MISSING"}: ${t} (HTTP ${r.status})`);
  }

  // Try to check columns on messages via a limited query
  console.log("\n--- messages column check (Phase 3 columns) ---");
  const colRes = await fetch(
    `${SUPABASE_URL}/rest/v1/messages?select=client_message_id,edited_at,deleted_by,delete_scope,forwarded_from_message_id&limit=0`,
    {
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        Prefer: "count=none",
      },
    }
  );
  if (colRes.ok) {
    console.log("  ✅ Phase 3 columns on messages: ALL PRESENT");
  } else {
    const t = await colRes.text();
    console.log(`  ❌ Phase 3 columns on messages: MISSING — ${colRes.status} ${t.slice(0,200)}`);
  }

  console.log("\n=== Inspection complete ===\n");
}

main().catch(console.error);
