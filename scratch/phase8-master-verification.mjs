/**
 * HEAT CHAT — PHASE 8 MEDIA ATTACHMENTS & IMAGE VIEWER MASTER VERIFICATION
 * 
 * Tests all 25+ storage security, RLS authorization, deleted-message protection,
 * removed-member revocation, path traversal defense, and direct/group media handling.
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

// ── Read Environment Variables securely ──
const envPath = path.resolve(process.cwd(), ".env.local");
let supabaseUrl = "";
let supabaseAnonKey = "";

if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("NEXT_PUBLIC_SUPABASE_URL=")) {
      supabaseUrl = trimmed.split("=")[1].trim().replace(/^["']|["']$/g, "");
    } else if (trimmed.startsWith("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=")) {
      supabaseAnonKey = trimmed.split("=")[1].trim().replace(/^["']|["']$/g, "");
    }
  }
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  process.exit(1);
}

// ── Test Tracker ──
let passed = 0;
let failed = 0;
const errors = [];

function assert(condition, testName, details = "") {
  if (condition) {
    passed++;
    console.log(`  ✅ [Test ${passed}] ${testName}`);
  } else {
    failed++;
    const msg = `❌ [FAIL: Test ${passed + failed}] ${testName}${details ? " -> " + details : ""}`;
    console.error(msg);
    errors.push(msg);
  }
}

// Helper to create client
function makeClient(accessToken = null) {
  const options = {
    auth: { persistSession: false, autoRefreshToken: false },
  };
  if (accessToken) {
    options.global = {
      headers: { Authorization: `Bearer ${accessToken}` },
    };
  }
  return createClient(supabaseUrl, supabaseAnonKey, options);
}

// Create a small 1x1 valid PNG buffer for tests
const SAMPLE_PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

// Create a small 1x1 valid JPEG buffer for tests
const SAMPLE_JPEG_BUFFER = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64"
);

async function runPhase8Verification() {
  console.log("================================================================");
  console.log("HEAT CHAT — PHASE 8 MEDIA ATTACHMENTS 25-POINT MASTER VERIFICATION");
  console.log("================================================================\n");

  const anonClient = makeClient();
  const testRunId = Date.now().toString().slice(-6);

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 1: Authenticating Test Users A, B, C, D
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("--- SECTION 1: Registering & Authenticating Test Users (A, B, C, D) ---");
  const userConfigs = [
    { key: "A", name: `Phase8_Alpha_${testRunId}`, email: `p8_alpha_${testRunId}@test.local` },
    { key: "B", name: `Phase8_Beta_${testRunId}`, email: `p8_beta_${testRunId}@test.local` },
    { key: "C", name: `Phase8_Charlie_${testRunId}`, email: `p8_charlie_${testRunId}@test.local` },
    { key: "D", name: `Phase8_Delta_${testRunId}`, email: `p8_delta_${testRunId}@test.local` },
  ];

  const users = {};
  const password = `TestPass!_${testRunId}_Secure123`;

  for (const cfg of userConfigs) {
    const { data: signUpData, error: signUpErr } = await anonClient.auth.signUp({
      email: cfg.email,
      password,
      options: { data: { display_name: cfg.name } },
    });

    if (signUpErr || !signUpData.user) {
      console.error(`Failed to register ${cfg.name}:`, signUpErr?.message);
      process.exit(1);
    }

    const { data: signInData, error: signInErr } = await anonClient.auth.signInWithPassword({
      email: cfg.email,
      password,
    });

    if (signInErr || !signInData.session) {
      console.error(`Failed to authenticate ${cfg.name}:`, signInErr?.message);
      process.exit(1);
    }

    const client = makeClient(signInData.session.access_token);
    client.realtime.setAuth(signInData.session.access_token);

    users[cfg.key] = {
      id: signUpData.user.id,
      email: cfg.email,
      name: cfg.name,
      token: signInData.session.access_token,
      client,
    };

    assert(!!users[cfg.key].id, `User ${cfg.key} (${cfg.name}) registered & authenticated.`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 2: Friendships & Direct Conversation Setup
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SECTION 2: Establishing Friendships & Direct Chat ---");
  
  // A <-> B friendship
  await users.A.client.from("friendships").insert({
    user_id: users.A.id,
    friend_id: users.B.id,
    status: "accepted",
  });
  // A <-> D friendship
  await users.A.client.from("friendships").insert({
    user_id: users.A.id,
    friend_id: users.D.id,
    status: "accepted",
  });
  // B <-> D friendship
  await users.B.client.from("friendships").insert({
    user_id: users.B.id,
    friend_id: users.D.id,
    status: "accepted",
  });

  const { data: dmConvId, error: dmErr } = await users.A.client.rpc("get_or_create_direct_conversation", {
    target_user_id: users.B.id,
  });

  assert(!!dmConvId && !dmErr, "User A created/opened direct conversation DM1 with User B.", dmErr?.message);

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 3: Direct Message Media Upload & Retrieval
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SECTION 3: Direct Message Media Upload & Retrieval ---");

  // 1. User A sends image message
  const { data: msg1, error: msg1Err } = await users.A.client
    .from("messages")
    .insert({
      conversation_id: dmConvId,
      sender_id: users.A.id,
      content: "Check out this sunset!",
      message_type: "image",
    })
    .select("*")
    .single();

  assert(!!msg1 && !msg1Err, "User A inserted message with message_type='image'.", msg1Err?.message);

  // 2. User A uploads file to chat-attachments
  const storagePath1 = `${dmConvId}/${msg1.id}/sunset.png`;
  const { data: upload1Data, error: upload1Err } = await users.A.client.storage
    .from("chat-attachments")
    .upload(storagePath1, SAMPLE_PNG_BUFFER, {
      contentType: "image/png",
      upsert: false,
    });

  assert(!!upload1Data && !upload1Err, "User A successfully uploaded image to private chat-attachments.", upload1Err?.message);

  // 3. User A inserts attachment metadata
  const { data: att1, error: att1Err } = await users.A.client
    .from("attachments")
    .insert({
      message_id: msg1.id,
      storage_path: storagePath1,
      file_name: "sunset.png",
      file_type: "image/png",
      file_size: SAMPLE_PNG_BUFFER.length,
      width: 800,
      height: 600,
    })
    .select("*")
    .single();

  assert(!!att1 && !att1Err, "User A inserted attachment metadata record.", att1Err?.message);

  // 4. User B retrieves message and attachment metadata
  const { data: userBAttachments, error: bAttErr } = await users.B.client
    .from("attachments")
    .select("*")
    .eq("message_id", msg1.id);

  assert(
    userBAttachments?.length === 1 && userBAttachments[0].file_name === "sunset.png",
    "User B retrieved attachment metadata from shared conversation DM1."
  );

  // 5. User B generates signed URL and downloads object
  const { data: bSignedUrlData, error: bSignedErr } = await users.B.client.storage
    .from("chat-attachments")
    .createSignedUrl(storagePath1, 3600);

  assert(!!bSignedUrlData?.signedUrl && !bSignedErr, "User B obtained valid signed URL for attachment.", bSignedErr?.message);

  if (bSignedUrlData?.signedUrl) {
    const downloadRes = await fetch(bSignedUrlData.signedUrl);
    assert(downloadRes.status === 200, "User B downloaded image bytes via signed URL (HTTP 200).");
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 4: Non-Member Isolation & Storage Attack Protection (User C)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SECTION 4: Non-Member Security Attacks (User C) ---");

  // Attack 1: Non-member User C reading attachment metadata
  const { data: cAttData, error: cAttErr } = await users.C.client
    .from("attachments")
    .select("*")
    .eq("message_id", msg1.id);

  assert(
    (!cAttData || cAttData.length === 0),
    "Attack 1: Non-member User C querying attachments -> 0 rows returned (RLS enforced)."
  );

  // Attack 2: Non-member User C attempting to create signed URL on A/B file
  const { data: cSignedData, error: cSignedErr } = await users.C.client.storage
    .from("chat-attachments")
    .createSignedUrl(storagePath1, 3600);

  // Supabase storage returns error or invalid response for unauthorized signed URL requests
  let cDownloadBlocked = false;
  if (cSignedErr || !cSignedData?.signedUrl) {
    cDownloadBlocked = true;
  } else {
    const cDownloadRes = await fetch(cSignedData.signedUrl);
    cDownloadBlocked = cDownloadRes.status === 400 || cDownloadRes.status === 403 || cDownloadRes.status === 404;
  }
  assert(cDownloadBlocked, "Attack 2: Non-member User C blocked from accessing/downloading A/B storage object.");

  // Attack 3: Non-member User C attempting to upload into A/B folder
  const { error: cUploadErr } = await users.C.client.storage
    .from("chat-attachments")
    .upload(`${dmConvId}/${msg1.id}/malicious.png`, SAMPLE_PNG_BUFFER, {
      contentType: "image/png",
    });

  assert(!!cUploadErr, "Attack 3: Non-member User C upload into A/B folder REJECTED by storage RLS.");

  // Attack 4: Path traversal upload attempt
  const { error: traversalErr } = await users.C.client.storage
    .from("chat-attachments")
    .upload(`../../traversal.png`, SAMPLE_PNG_BUFFER, {
      contentType: "image/png",
    });

  assert(!!traversalErr, "Attack 4: Path traversal upload attempt REJECTED.");

  // Attack 5: Invalid UUID folder upload attempt
  const { error: invalidFolderErr } = await users.A.client.storage
    .from("chat-attachments")
    .upload(`not-a-uuid/${msg1.id}/test.png`, SAMPLE_PNG_BUFFER, {
      contentType: "image/png",
    });

  assert(!!invalidFolderErr, "Attack 5: Malformed/non-UUID folder upload REJECTED safely by safe_cast_uuid.");

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 5: Group Chat Multi-Attachment Handling
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SECTION 5: Group Chat Multi-Attachment Handling ---");

  // User A creates group G1 with B and D
  const { data: g1Id, error: g1Err } = await users.A.client.rpc("create_group_conversation", {
    group_name: "Phase 8 Media Group",
    member_user_ids: [users.B.id, users.D.id],
  });

  assert(!!g1Id && !g1Err, "User A created group G1 with User B and User D.", g1Err?.message);

  // User A creates message with 2 attachments
  const { data: gMsg, error: gMsgErr } = await users.A.client
    .from("messages")
    .insert({
      conversation_id: g1Id,
      sender_id: users.A.id,
      content: "Two photos from the event!",
      message_type: "image",
    })
    .select("*")
    .single();

  assert(!!gMsg && !gMsgErr, "User A posted multi-image message to Group G1.", gMsgErr?.message);

  const pathG1 = `${g1Id}/${gMsg.id}/photo1.png`;
  const pathG2 = `${g1Id}/${gMsg.id}/photo2.jpg`;

  await users.A.client.storage.from("chat-attachments").upload(pathG1, SAMPLE_PNG_BUFFER, { contentType: "image/png" });
  await users.A.client.storage.from("chat-attachments").upload(pathG2, SAMPLE_JPEG_BUFFER, { contentType: "image/jpeg" });

  await users.A.client.from("attachments").insert([
    {
      message_id: gMsg.id,
      storage_path: pathG1,
      file_name: "photo1.png",
      file_type: "image/png",
      file_size: SAMPLE_PNG_BUFFER.length,
      width: 1024,
      height: 768,
    },
    {
      message_id: gMsg.id,
      storage_path: pathG2,
      file_name: "photo2.jpg",
      file_type: "image/jpeg",
      file_size: SAMPLE_JPEG_BUFFER.length,
      width: 1920,
      height: 1080,
    },
  ]);

  // User D reads group attachments
  const { data: dGroupAtts } = await users.D.client
    .from("attachments")
    .select("*")
    .eq("message_id", gMsg.id);

  assert(dGroupAtts?.length === 2, "User D retrieved both attachments (2 photos) from Group G1.");

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 6: Removed Member Access Revocation (User D removed from G1)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SECTION 6: Removed Member Access Revocation ---");

  // User A (owner) removes User D from G1
  await users.A.client.rpc("remove_group_member", {
    conv_id: g1Id,
    target_user_id: users.D.id,
  });

  // Check 1: User D cannot SELECT group attachments after removal
  const { data: dAfterRemovalAtts } = await users.D.client
    .from("attachments")
    .select("*")
    .eq("message_id", gMsg.id);

  assert(
    (!dAfterRemovalAtts || dAfterRemovalAtts.length === 0),
    "Removed User D querying group attachments -> 0 rows returned (RLS enforced)."
  );

  // Check 2: User D storage access is blocked
  const { data: dSignedData, error: dSignedErr } = await users.D.client.storage
    .from("chat-attachments")
    .createSignedUrl(pathG1, 3600);

  let dBlocked = false;
  if (dSignedErr || !dSignedData?.signedUrl) {
    dBlocked = true;
  } else {
    const dRes = await fetch(dSignedData.signedUrl);
    dBlocked = dRes.status === 400 || dRes.status === 403 || dRes.status === 404;
  }

  assert(dBlocked, "Removed User D storage download access REVOKED immediately by storage RLS.");

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 7: Soft-Deleted Message Protection
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SECTION 7: Soft-Deleted Message Protection ---");

  // User A soft-deletes the group message
  const { error: delErr } = await users.A.client
    .from("messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", gMsg.id);

  assert(!delErr, "User A soft-deleted the multi-image message in Group G1.", delErr?.message);

  // Active Member B tries to query attachments of the soft-deleted message
  const { data: bDeletedMsgAtts } = await users.B.client
    .from("attachments")
    .select("*")
    .eq("message_id", gMsg.id);

  assert(
    (!bDeletedMsgAtts || bDeletedMsgAtts.length === 0),
    "Active Member B querying soft-deleted message attachments -> 0 rows returned (deleted_at IS NULL policy enforced)."
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 8: Attachment Deletion Security & Tamper Resistance
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SECTION 8: Attachment Deletion Security & Tamper Resistance ---");

  // User B tries to delete User A's attachment in DM1
  const { data: unauthDelData } = await users.B.client
    .from("attachments")
    .delete()
    .eq("id", att1.id)
    .select("*");

  assert(
    (!unauthDelData || unauthDelData.length === 0),
    "User B attempting to delete User A's attachment -> REJECTED by RLS (0 rows affected)."
  );

  // Follow-up SELECT: confirm attachment still exists intact
  const { data: checkAtt1 } = await users.A.client
    .from("attachments")
    .select("*")
    .eq("id", att1.id);

  assert(checkAtt1?.length === 1, "Follow-up SELECT confirms User A's attachment remains intact in database.");

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 9: Cross-Conversation Attachment Association Rejection
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SECTION 9: Cross-Conversation Attachment Linkage Rejection ---");

  // User C tries to insert attachment record referencing User A's message in DM1
  const { error: spoofAttErr } = await users.C.client
    .from("attachments")
    .insert({
      message_id: msg1.id,
      storage_path: "unrelated/path.png",
      file_name: "spoof.png",
      file_type: "image/png",
      file_size: 100,
    });

  assert(!!spoofAttErr, "User C inserting attachment into User A's message REJECTED by RLS.");

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 10: Regression Verification (Direct, Group, Reactions, Replies, Edits)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SECTION 10: Regression Verification ---");

  // 1. Text message
  const { data: regMsg, error: regMsgErr } = await users.A.client
    .from("messages")
    .insert({
      conversation_id: dmConvId,
      sender_id: users.A.id,
      content: "Regression test message",
      message_type: "text",
    })
    .select("*")
    .single();

  assert(!!regMsg && !regMsgErr, "Direct text messaging works without regression.");

  // 2. Reply
  const { data: regReply, error: regReplyErr } = await users.B.client
    .from("messages")
    .insert({
      conversation_id: dmConvId,
      sender_id: users.B.id,
      content: "Reply to text message",
      message_type: "text",
      reply_to_message_id: regMsg.id,
    })
    .select("*")
    .single();

  assert(!!regReply && !regReplyErr, "Direct reply messaging works without regression.");

  // 3. Reaction
  const { error: reactErr } = await users.B.client
    .from("message_reactions")
    .insert({
      message_id: regMsg.id,
      user_id: users.B.id,
      reaction: "🔥",
    });

  assert(!reactErr, "Reaction insert works without regression.", reactErr?.message);

  // 4. Edit
  const { error: editErr } = await users.A.client
    .from("messages")
    .update({ content: "Edited regression text message" })
    .eq("id", regMsg.id);

  assert(!editErr, "Message editing works without regression.", editErr?.message);

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 11: Cleanup
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SECTION 11: Cleaning Up Temporary Test Data ---");

  // Clean storage files
  try {
    await users.A.client.storage.from("chat-attachments").remove([storagePath1, pathG1, pathG2]);
  } catch {}

  // Delete messages & conversations
  await users.A.client.from("conversations").delete().in("id", [dmConvId, g1Id]);
  await users.A.client.from("friendships").delete().or(`user_id.eq.${users.A.id},friend_id.eq.${users.A.id}`);
  await users.B.client.from("friendships").delete().or(`user_id.eq.${users.B.id},friend_id.eq.${users.B.id}`);

  console.log("  ✅ Test conversations, groups, messages, reactions, and friendships purged.");

  console.log("\n================================================================");
  if (failed === 0) {
    console.log(`🎉 ALL ${passed} PHASE 8 MASTER VERIFICATION TESTS PASSED WITH ZERO ERRORS!`);
  } else {
    console.error(`💥 ${failed} TEST(S) FAILED! Check error log above.`);
    process.exit(1);
  }
  console.log("================================================================\n");
}

runPhase8Verification().catch((err) => {
  console.error("Fatal verification error:", err);
  process.exit(1);
});
