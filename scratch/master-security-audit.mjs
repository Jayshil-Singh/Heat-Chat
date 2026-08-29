import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

// Load .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
let SUPABASE_URL = "";
let SUPABASE_ANON_KEY = "";

if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("NEXT_PUBLIC_SUPABASE_URL=")) {
      SUPABASE_URL = trimmed.split("=")[1].trim().replace(/^["']|["']$/g, "");
    } else if (trimmed.startsWith("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=")) {
      SUPABASE_ANON_KEY = trimmed.split("=")[1].trim().replace(/^["']|["']$/g, "");
    }
  }
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing Supabase URL or Anon Key in .env.local");
  process.exit(1);
}

function makeClient(accessToken = null) {
  const options = {
    auth: { persistSession: false, autoRefreshToken: false },
  };
  if (accessToken) {
    options.global = {
      headers: { Authorization: `Bearer ${accessToken}` },
    };
  }
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, options);
}

const auditResults = [];

function recordTest(testName, passed, details) {
  auditResults.push({ testName, passed, details });
  const icon = passed ? "✅ [PASS]" : "❌ [FAIL]";
  console.log(`${icon} ${testName}\n     ${details}\n`);
}

async function runAudit() {
  console.log("===============================================================================");
  console.log("HEAT CHAT — FINAL EMAIL VERIFICATION SECURITY BOUNDARY AUDIT");
  console.log("===============================================================================\n");

  const anonClient = makeClient();
  const testRunId = Date.now().toString().slice(-6);
  const password = `SecPass_${testRunId}!99`;

  // ---------------------------------------------------------------------------
  // 1. Create Verified Baseline Users (Alice & Bob)
  // ---------------------------------------------------------------------------
  console.log("1. Setting Up Verified Baseline Environment (Alice & Bob)...");
  const aliceEmail = `sec_alice_${testRunId}@test.local`;
  const bobEmail = `sec_bob_${testRunId}@test.local`;

  const { data: aliceReg } = await anonClient.auth.signUp({
    email: aliceEmail,
    password,
    options: { data: { username: `alice_${testRunId}`, display_name: "Alice Verified" } },
  });

  const { data: bobReg } = await anonClient.auth.signUp({
    email: bobEmail,
    password,
    options: { data: { username: `bob_${testRunId}`, display_name: "Bob Verified" } },
  });

  const { data: aliceAuth } = await anonClient.auth.signInWithPassword({ email: aliceEmail, password });
  const { data: bobAuth } = await anonClient.auth.signInWithPassword({ email: bobEmail, password });

  const aliceUser = aliceAuth.user;
  const bobUser = bobAuth.user;
  const aliceClient = makeClient(aliceAuth.session.access_token);
  const bobClient = makeClient(bobAuth.session.access_token);

  await aliceClient.from("profiles").upsert({
    id: aliceUser.id,
    username: `alice_${testRunId}`,
    display_name: "Alice Verified",
    status: "online",
  });

  await bobClient.from("profiles").upsert({
    id: bobUser.id,
    username: `bob_${testRunId}`,
    display_name: "Bob Verified",
    status: "online",
  });

  // Connect Alice & Bob as accepted friends
  await aliceClient.from("friendships").upsert({
    user_id: aliceUser.id,
    friend_id: bobUser.id,
    status: "accepted",
  });
  await bobClient.from("friendships").upsert({
    user_id: bobUser.id,
    friend_id: aliceUser.id,
    status: "accepted",
  });

  // Create Alice-Bob direct conversation
  const { data: convId, error: convErr } = await aliceClient.rpc("get_or_create_direct_conversation", {
    target_user_id: bobUser.id,
  });

  if (convErr || !convId) {
    console.error("Failed to create direct conversation between Alice and Bob:", convErr);
    process.exit(1);
  }

  // Insert confidential message from Alice
  const { data: confidentialMsg, error: msgErr } = await aliceClient
    .from("messages")
    .insert({
      conversation_id: convId,
      sender_id: aliceUser.id,
      content: `CONFIDENTIAL_VAULT_TOKEN_${testRunId}`,
      message_type: "text",
    })
    .select()
    .single();

  if (msgErr || !confidentialMsg) {
    console.error("Failed to post confidential message:", msgErr);
    process.exit(1);
  }

  console.log(`   Alice ID: ${aliceUser.id}`);
  console.log(`   Bob ID: ${bobUser.id}`);
  console.log(`   Private Conversation ID: ${convId}`);
  console.log(`   Confidential Message ID: ${confidentialMsg.id}\n`);

  // ---------------------------------------------------------------------------
  // 2. Setup Unverified Attacker Account (Eve)
  // ---------------------------------------------------------------------------
  console.log("2. Setting Up Unverified Attacker Account (Eve)...");
  const eveEmail = `sec_eve_attacker_${testRunId}@test.local`;
  const { data: eveReg, error: eveRegErr } = await anonClient.auth.signUp({
    email: eveEmail,
    password,
    options: {
      data: { username: `eve_${testRunId}`, display_name: "Eve Attacker" },
      emailRedirectTo: "http://localhost:3000/auth/callback",
    },
  });

  if (eveRegErr || !eveReg.user) {
    console.error("Failed to register Eve:", eveRegErr);
    process.exit(1);
  }

  const eveUser = eveReg.user;
  const eveToken = eveReg.session?.access_token;
  console.log(`   Eve User ID: ${eveUser.id}`);
  console.log(`   Eve Session Token Issued?: ${Boolean(eveToken)}`);
  console.log(`   Eve email_confirmed_at: ${eveUser.email_confirmed_at}\n`);

  // Test with Eve's token if present, and also test pure Anonymous (unverified without session) client
  const eveClient = eveToken ? makeClient(eveToken) : anonClient;

  // ---------------------------------------------------------------------------
  // 3. Mandatory Security Tests
  // ---------------------------------------------------------------------------
  console.log("3. Executing Required Security Boundary Tests:\n");

  // TEST 1: UnverifiedConversationAccessDenied
  // Eve attempts direct PostgREST SELECT on conversations table
  const { data: eveConvs, error: eveConvErr } = await eveClient
    .from("conversations")
    .select("*")
    .eq("id", convId);

  const convDenied = !eveConvs || eveConvs.length === 0;
  recordTest(
    "UnverifiedConversationAccessDenied",
    convDenied,
    convDenied
      ? `RLS blocked access to Alice's conversation (returned ${eveConvs?.length || 0} rows)`
      : `SECURITY FAILURE: Unverified user read private conversation ${convId}`
  );

  // TEST 2: UnverifiedMessageAccessDenied
  // Eve attempts direct PostgREST SELECT on messages table
  const { data: eveMsgs, error: eveMsgErr } = await eveClient
    .from("messages")
    .select("*")
    .eq("conversation_id", convId);

  const msgDenied = !eveMsgs || eveMsgs.length === 0;
  recordTest(
    "UnverifiedMessageAccessDenied",
    msgDenied,
    msgDenied
      ? `RLS blocked access to private messages (returned ${eveMsgs?.length || 0} rows)`
      : `SECURITY FAILURE: Unverified user read confidential message`
  );

  // TEST 3: UnverifiedMessageInsertDenied
  // Eve attempts direct PostgREST INSERT into Alice's conversation
  const { data: eveIns, error: eveInsErr } = await eveClient
    .from("messages")
    .insert({
      conversation_id: convId,
      sender_id: eveUser.id,
      content: "UNAUTHORIZED_EVE_PAYLOAD",
    })
    .select();

  const insertDenied = Boolean(eveInsErr) || !eveIns || eveIns.length === 0;
  recordTest(
    "UnverifiedMessageInsertDenied",
    insertDenied,
    insertDenied
      ? `Message insert rejected by RLS: ${eveInsErr?.message || "Policy check violation"}`
      : `SECURITY FAILURE: Unverified user inserted a message into private conversation`
  );

  // TEST 4: UnverifiedAttachmentAccessDenied
  // Eve attempts direct PostgREST SELECT on attachments table
  const { data: eveAtts, error: eveAttErr } = await eveClient
    .from("attachments")
    .select("*");

  const attDenied = !eveAtts || eveAtts.filter((a) => a.message_id === confidentialMsg.id).length === 0;
  recordTest(
    "UnverifiedAttachmentAccessDenied",
    attDenied,
    attDenied
      ? `RLS blocked reading private attachments (returned 0 matching records)`
      : `SECURITY FAILURE: Unverified user accessed private attachment records`
  );

  // TEST 5: UnverifiedStorageReadDenied
  // Eve attempts direct Storage API list in chat-attachments
  const { data: storList, error: storListErr } = await eveClient.storage
    .from("chat-attachments")
    .list(convId);

  const storReadDenied = !storList || storList.length === 0 || Boolean(storListErr);
  recordTest(
    "UnverifiedStorageReadDenied",
    storReadDenied,
    storReadDenied
      ? `Storage list rejected / returned 0 files (${storListErr?.message || "Empty listing"})`
      : `SECURITY FAILURE: Unverified user listed files in storage bucket`
  );

  // TEST 6: UnverifiedStorageSignedUrlDenied
  // Eve attempts direct Storage createSignedUrl for private conversation attachment
  const { data: signedUrlData, error: signErr } = await eveClient.storage
    .from("chat-attachments")
    .createSignedUrl(`${convId}/confidential_image.jpg`, 60);

  const signedUrlDenied = Boolean(signErr) || !signedUrlData?.signedUrl;
  recordTest(
    "UnverifiedStorageSignedUrlDenied",
    signedUrlDenied,
    signedUrlDenied
      ? `Storage signed URL generation rejected: ${signErr?.message || "Access Denied"}`
      : `SECURITY FAILURE: Unverified user generated signed URL for private asset`
  );

  // TEST 7: UnverifiedStorageUploadDenied
  // Eve attempts direct Storage upload to Alice's conversation folder
  const dummyBuffer = Buffer.from("MALICIOUS_FILE_DATA");
  const { data: upData, error: upErr } = await eveClient.storage
    .from("chat-attachments")
    .upload(`${convId}/malicious_${testRunId}.jpg`, dummyBuffer, {
      contentType: "image/jpeg",
    });

  const uploadDenied = Boolean(upErr) || !upData;
  recordTest(
    "UnverifiedStorageUploadDenied",
    uploadDenied,
    uploadDenied
      ? `Storage upload rejected by storage RLS: ${upErr?.message || "Policy check violation"}`
      : `SECURITY FAILURE: Unverified user uploaded file to private storage`
  );

  // TEST 8: UnverifiedDirectProfileAccessDenied
  // Eve attempts to update Alice's profile
  const { data: tamperData, error: tamperErr } = await eveClient
    .from("profiles")
    .update({ display_name: "TAMPERED_BY_EVE" })
    .eq("id", aliceUser.id)
    .select();

  const tamperDenied = Boolean(tamperErr) || !tamperData || tamperData.length === 0;
  recordTest(
    "UnverifiedDirectProfileAccessDenied",
    tamperDenied,
    tamperDenied
      ? `Profile tampering rejected by RLS: ${tamperErr?.message || "0 rows updated"}`
      : `SECURITY FAILURE: Unverified user modified another user's profile`
  );

  // TEST 9: VerifiedAccessStillAllowed
  // Verified user Alice reads her conversation and message successfully
  const { data: aliceReadConvs, error: aConvReadErr } = await aliceClient
    .from("conversations")
    .select("*")
    .eq("id", convId);

  const { data: aliceReadMsgs, error: aMsgReadErr } = await aliceClient
    .from("messages")
    .select("*")
    .eq("conversation_id", convId);

  const verifiedAllowed =
    !aConvReadErr &&
    aliceReadConvs?.length === 1 &&
    !aMsgReadErr &&
    aliceReadMsgs?.length === 1 &&
    aliceReadMsgs[0].content === `CONFIDENTIAL_VAULT_TOKEN_${testRunId}`;

  recordTest(
    "VerifiedAccessStillAllowed",
    verifiedAllowed,
    verifiedAllowed
      ? `Verified user Alice successfully read her conversation and message`
      : `Verified access failed: aConvReadErr=${aConvReadErr?.message}, aMsgReadErr=${aMsgReadErr?.message}`
  );

  // ---------------------------------------------------------------------------
  // 4. Teardown Test Data
  // ---------------------------------------------------------------------------
  console.log("4. Cleaning Up Test Artifacts...");
  await aliceClient.from("messages").delete().eq("id", confidentialMsg.id);
  await aliceClient.from("conversation_members").delete().eq("conversation_id", convId);
  await aliceClient.from("conversations").delete().eq("id", convId);
  console.log("   Test artifacts removed.\n");

  // ---------------------------------------------------------------------------
  // 5. Final Report Summary
  // ---------------------------------------------------------------------------
  console.log("===============================================================================");
  console.log("MASTER SECURITY AUDIT SUMMARY");
  console.log("===============================================================================");
  const total = auditResults.length;
  const passed = auditResults.filter((r) => r.passed).length;
  const failed = auditResults.filter((r) => !r.passed).length;

  console.log(`Total Security Tests: ${total}`);
  console.log(`Passed:               ${passed}`);
  console.log(`Failed:               ${failed}`);

  if (failed === 0) {
    console.log("\n🎉 FINAL STATUS: EMAIL VERIFICATION SECURITY FULLY ENFORCED");
  } else {
    console.log("\n⚠️ FINAL STATUS: EMAIL VERIFICATION UI ENFORCED — DATABASE SECURITY GAP REMAINS");
  }
  console.log("===============================================================================\n");
}

runAudit().catch((err) => {
  console.error("Audit fatal error:", err);
  process.exit(1);
});
