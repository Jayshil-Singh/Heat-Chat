/**
 * Heat Chat — Live RLS & Security Verification Suite
 * Tests actual PostgREST authorization boundaries on rmvpdcftfdeizitnrvkw
 */

import assert from "node:assert";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://rmvpdcftfdeizitnrvkw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bm-NG6px_0m-dNsWPQ0KfQ_RrIThuMU";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log("==================================================================");
  console.log(" LIVE RLS & SECURITY POST-MIGRATION SUITE");
  console.log(" Target: rmvpdcftfdeizitnrvkw.supabase.co");
  console.log("==================================================================\n");

  let passed = 0;
  let total = 0;

  function it(name, cond, details = "") {
    total++;
    if (cond) {
      console.log(`  ✅ [PASS] ${name} ${details}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${name} ${details}`);
      assert.fail(`${name}: ${details}`);
    }
  }

  // 1. Direct Unauthenticated SELECT on poll_votes
  const { data: pvSelect, error: pvErr } = await supabase.from("poll_votes").select("*");
  it("Unauthenticated direct query to poll_votes returns 0 rows", (pvSelect || []).length === 0);

  // 2. Direct Unauthenticated INSERT on poll_votes
  const { data: pvIns, error: pvInsErr } = await supabase.from("poll_votes").insert({
    poll_id: "c3a8e244-672c-4b68-8094-bf8342795811",
    option_id: "c3a8e244-672c-4b68-8094-bf8342795812",
    user_id: "c3a8e244-672c-4b68-8094-bf8342795813"
  });
  it("Unauthenticated direct insert to poll_votes is rejected by RLS", Boolean(pvInsErr));

  // 3. Direct Unauthenticated SELECT on polls
  const { data: pSelect, error: pErr } = await supabase.from("polls").select("*");
  it("Unauthenticated direct query to polls returns 0 rows", (pSelect || []).length === 0);

  // 4. Direct Unauthenticated INSERT on polls
  const { error: pInsErr } = await supabase.from("polls").insert({
    conversation_id: "c3a8e244-672c-4b68-8094-bf8342795811",
    question: "Attacking polls table?",
    created_by: "c3a8e244-672c-4b68-8094-bf8342795813"
  });
  it("Unauthenticated direct insert to polls is rejected by RLS", Boolean(pInsErr));

  // 5. Direct Unauthenticated SELECT on group_invitations
  const { data: giSelect, error: giErr } = await supabase.from("group_invitations").select("*");
  it("Unauthenticated direct query to group_invitations returns 0 rows", (giSelect || []).length === 0);

  // 6. Direct Unauthenticated SELECT on group_invite_links
  const { data: gilSelect, error: gilErr } = await supabase.from("group_invite_links").select("*");
  it("Unauthenticated direct query to group_invite_links returns 0 rows", (gilSelect || []).length === 0);

  // 7. Direct Unauthenticated SELECT on attachments
  const { data: attSelect } = await supabase.from("attachments").select("*");
  it("Unauthenticated direct query to attachments returns 0 rows", (attSelect || []).length === 0);

  // 8. Direct Unauthenticated SELECT on starred_messages
  const { data: smSelect } = await supabase.from("starred_messages").select("*");
  it("Unauthenticated direct query to starred_messages returns 0 rows", (smSelect || []).length === 0);

  // 9. Direct Unauthenticated SELECT on admin_audit_logs
  const { data: aalSelect } = await supabase.from("admin_audit_logs").select("*");
  it("Unauthenticated direct query to admin_audit_logs returns 0 rows", (aalSelect || []).length === 0);

  // 10. Direct Unauthenticated SELECT on moderation_reports
  const { data: mrSelect } = await supabase.from("moderation_reports").select("*");
  it("Unauthenticated direct query to moderation_reports returns 0 rows", (mrSelect || []).length === 0);

  // 11. RPC get_conversation_polls Authorization
  const { error: gcpErr } = await supabase.rpc("get_conversation_polls", {
    p_conversation_id: "c3a8e244-672c-4b68-8094-bf8342795811"
  });
  it("RPC get_conversation_polls rejects unauthenticated caller", gcpErr && gcpErr.message === "Authentication required");

  // 12. RPC join_group_via_invite_link Authorization
  const { error: jgErr } = await supabase.rpc("join_group_via_invite_link", {
    p_token: "test-token"
  });
  it("RPC join_group_via_invite_link rejects unauthenticated caller", jgErr && jgErr.message === "Authentication required");

  // 13. RPC vote_poll Authorization
  const { error: vpErr } = await supabase.rpc("vote_poll", {
    p_poll_id: "c3a8e244-672c-4b68-8094-bf8342795811",
    p_option_ids: ["c3a8e244-672c-4b68-8094-bf8342795812"]
  });
  it("RPC vote_poll rejects unauthenticated caller", vpErr && vpErr.message === "Authentication required");

  // 14. RPC close_poll Authorization
  const { error: cpErr } = await supabase.rpc("close_poll", {
    p_poll_id: "c3a8e244-672c-4b68-8094-bf8342795811"
  });
  it("RPC close_poll rejects unauthenticated caller", cpErr && cpErr.message === "Authentication required");

  // 15. RPC remove_group_member deterministic JSONB response
  const { data: rgmData } = await supabase.rpc("remove_group_member", {
    conv_id: "c3a8e244-672c-4b68-8094-bf8342795811",
    target_user_id: "c3a8e244-672c-4b68-8094-bf8342795812"
  });
  it("RPC remove_group_member returns structured JSONB UNAUTHORIZED", rgmData?.code === "UNAUTHORIZED" && rgmData?.success === false);

  console.log("\n==================================================================");
  console.log(` LIVE RLS & SECURITY SUITE: ${passed}/${total} PASSED`);
  console.log("==================================================================\n");
}

main().catch(err => {
  console.error("Test execution aborted:", err);
  process.exit(1);
});
