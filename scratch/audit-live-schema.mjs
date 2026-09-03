/**
 * Heat Chat — Phase 6 Master Schema & Database Audit Script
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log("==================================================================");
console.log(" Heat Chat — Live Supabase & Local Schema Audit");
console.log(` Target: ${SUPABASE_URL}`);
console.log("==================================================================\n");

async function runAudit() {
  const tables = [
    "profiles",
    "friendships",
    "conversations",
    "conversation_members",
    "messages",
    "attachments",
    "message_user_states",
    "message_pins",
    "message_delivery_states",
    "conversation_user_states",
    "conversation_drafts",
    "message_reactions",
    "message_reads",
    "starred_messages",
    "moderation_reports",
    "moderation_notes",
    "notifications",
  ];

  console.log("--- 1. Table Probe via REST API ---");
  for (const table of tables) {
    try {
      const { data, error, status } = await supabase.from(table).select("*").limit(1);
      if (error && status !== 401 && status !== 403 && status !== 404 && status !== 400) {
        console.log(`  Table [${table}]: Status ${status}, Error: ${error.message}`);
      } else {
        console.log(`  Table [${table}]: Status ${status || 200} (Accessible/Secured via RLS)`);
      }
    } catch (err) {
      console.log(`  Table [${table}]: Error ${err.message}`);
    }
  }

  console.log("\n--- 2. Storage Buckets Probe ---");
  try {
    const { data: buckets, error: bucketErr } = await supabase.storage.listBuckets();
    if (bucketErr) {
      console.log("  listBuckets error (likely requires service key / auth):", bucketErr.message);
    } else {
      console.log("  Buckets found:", buckets?.map(b => b.name) || []);
    }
  } catch (err) {
    console.log("  Storage buckets error:", err.message);
  }

  console.log("\n--- 3. RPC / Functions Probes ---");
  const rpcs = [
    "create_group_conversation",
    "add_group_members",
    "remove_group_member",
    "update_group_member_role",
    "update_group_details",
    "leave_group",
    "search_messages",
    "search_media",
    "search_people",
    "get_saved_messages",
    "get_mention_candidates",
  ];

  for (const rpc of rpcs) {
    try {
      const { data, error } = await supabase.rpc(rpc, {});
      // Even if unauthenticated or missing parameters, error message reveals function existence
      const msg = error?.message || "Success";
      const exists = !msg.includes("Could not find the function") && !msg.includes("function") && !msg.includes("404");
      console.log(`  RPC [${rpc}]: ${exists ? "EXISTS" : "MISSING"} (Response: ${msg})`);
    } catch (err) {
      console.log(`  RPC [${rpc}]: Error ${err.message}`);
    }
  }
}

runAudit().catch(console.error);
