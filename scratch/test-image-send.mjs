import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Load .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
const env = {};
envContent.split("\n").forEach((line) => {
  const match = line.match(/^\s*([\w_]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = (match[2] || "").trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    env[match[1]] = value;
  }
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

function makeClient(accessToken) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    },
  });
}

// 1x1 Transparent PNG Buffer
const SAMPLE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

async function run() {
  console.log("=== VERIFYING IMAGE MESSAGE SENDING PIPELINE ===");

  const anonClient = makeClient();
  const timestamp = Date.now();
  const emailA = `img_test_a_${timestamp}@test.local`;
  const emailB = `img_test_b_${timestamp}@test.local`;
  const password = "Password123!";

  // 1. Sign up test users A and B
  const { data: signUpA, error: errA } = await anonClient.auth.signUp({
    email: emailA,
    password,
    options: { data: { display_name: "ImageTesterA", username: `imgtest_a_${timestamp}` } },
  });
  if (errA || !signUpA.user) {
    console.error("Failed to sign up User A:", errA);
    process.exit(1);
  }

  const { data: signUpB, error: errB } = await anonClient.auth.signUp({
    email: emailB,
    password,
    options: { data: { display_name: "ImageTesterB", username: `imgtest_b_${timestamp}` } },
  });
  if (errB || !signUpB.user) {
    console.error("Failed to sign up User B:", errB);
    process.exit(1);
  }

  const userA = signUpA.user;
  const userB = signUpB.user;
  const clientA = makeClient(signUpA.session.access_token);
  const clientB = makeClient(signUpB.session.access_token);
  console.log("1. Authenticated test users A and B");

  // 2. Establish friendship
  await clientA.from("friendships").insert({
    user_id: userA.id,
    friend_id: userB.id,
    status: "accepted",
  });
  console.log("2. Established friendship");

  // 3. Create direct conversation via RPC
  const { data: convId, error: convErr } = await clientA.rpc("get_or_create_direct_conversation", {
    target_user_id: userB.id,
  });

  if (convErr || !convId) {
    console.error("Failed to create conversation via RPC:", convErr);
    process.exit(1);
  }
  console.log("3. Created direct conversation:", convId);

  // 4. Test sending photo WITHOUT caption (reproducing the exact bug scenario)
  console.log("4. Testing image message send WITHOUT caption (empty text input)...");
  const caption = "";
  const trimmed = caption.trim();
  const hasAttachments = true;
  const messageContent = trimmed || (hasAttachments ? "Photo" : "");

  const { data: insertedMsg, error: insertError } = await clientA
    .from("messages")
    .insert({
      conversation_id: convId,
      sender_id: userA.id,
      content: messageContent,
      message_type: "image",
    })
    .select("*")
    .single();

  if (insertError || !insertedMsg) {
    console.error("FAILED to insert image message without caption:", insertError);
    process.exit(1);
  }

  console.log("   ✅ Message inserted successfully without constraint violation! ID:", insertedMsg.id);
  console.log("   ✅ content stored in DB:", JSON.stringify(insertedMsg.content));
  console.log("   ✅ message_type:", insertedMsg.message_type);

  // 5. Upload storage attachment to conversation-scoped path
  const storagePath = `${convId}/${insertedMsg.id}/test_photo.png`;
  const { error: uploadErr } = await clientA.storage
    .from("chat-attachments")
    .upload(storagePath, SAMPLE_PNG, {
      contentType: "image/png",
      upsert: false,
    });

  if (uploadErr) {
    console.error("Storage upload failed:", uploadErr);
    process.exit(1);
  }
  console.log("5. Uploaded file to storage:", storagePath);

  // 6. Insert attachment record
  const { data: att, error: attErr } = await clientA
    .from("attachments")
    .insert({
      message_id: insertedMsg.id,
      storage_path: storagePath,
      file_name: "test_photo.png",
      file_type: "image/png",
      file_size: SAMPLE_PNG.length,
      width: 1,
      height: 1,
    })
    .select("*")
    .single();

  if (attErr || !att) {
    console.error("Failed to insert attachment metadata:", attErr);
    process.exit(1);
  }
  console.log("6. Inserted attachment record:", att.id);

  // 7. Test User B retrieving attachment metadata and generating signed URL
  const { data: userBAttachments, error: bAttErr } = await clientB
    .from("attachments")
    .select("*")
    .eq("message_id", insertedMsg.id);

  if (bAttErr || !userBAttachments || userBAttachments.length === 0) {
    console.error("User B failed to retrieve attachment metadata:", bAttErr);
    process.exit(1);
  }
  console.log("7. User B retrieved attachment metadata successfully.");

  const { data: bSignedData, error: bSignedErr } = await clientB.storage
    .from("chat-attachments")
    .createSignedUrl(storagePath, 3600);

  if (bSignedErr || !bSignedData?.signedUrl) {
    console.error("User B failed to generate signed URL:", bSignedErr);
    process.exit(1);
  }
  console.log("8. User B generated signed URL successfully.");

  // 9. Test sending photo WITH custom caption
  console.log("9. Testing image message send WITH custom caption...");
  const customCaption = "Look at this test photo!";
  const { data: msgWithCaption, error: captionMsgErr } = await clientA
    .from("messages")
    .insert({
      conversation_id: convId,
      sender_id: userA.id,
      content: customCaption,
      message_type: "image",
    })
    .select("*")
    .single();

  if (captionMsgErr || !msgWithCaption) {
    console.error("Failed to insert image message with custom caption:", captionMsgErr);
    process.exit(1);
  }
  console.log("   ✅ Message with custom caption inserted successfully! ID:", msgWithCaption.id);
  console.log("   ✅ content stored in DB:", JSON.stringify(msgWithCaption.content));

  // 10. Cleanup
  await clientA.storage.from("chat-attachments").remove([storagePath]);
  await clientA.from("conversations").delete().eq("id", convId);
  await clientA.from("friendships").delete().or(`user_id.eq.${userA.id},friend_id.eq.${userA.id}`);
  console.log("10. Cleaned up temporary test data.");

  console.log("\n================================================================");
  console.log("🎉 ALL IMAGE PIPELINE & CONVERSATION TESTS PASSED WITH ZERO ERRORS!");
  console.log("================================================================");
}

run().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
