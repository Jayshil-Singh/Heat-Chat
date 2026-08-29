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

function makeClient(accessToken) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    },
  });
}

async function runAudit() {
  console.log("================================================================");
  console.log("HEAT CHAT — FINAL EMAIL VERIFICATION SECURITY BOUNDARY AUDIT");
  console.log("================================================================\n");

  const anonClient = makeClient();

  // 1. Authenticate a verified user (Alice)
  console.log("--- Step 1: Sign in Verified User (p10_demo@test.local) ---");
  const { data: verifiedAuth, error: vErr } = await anonClient.auth.signInWithPassword({
    email: "p10_demo@test.local",
    password: "Password123!",
  });

  if (vErr || !verifiedAuth?.session) {
    console.error("Failed to sign in verified user:", vErr);
    process.exit(1);
  }

  const verifiedUser = verifiedAuth.user;
  const verifiedToken = verifiedAuth.session.access_token;
  const verifiedClient = makeClient(verifiedToken);
  console.log(`Verified User ID: ${verifiedUser.id}`);
  console.log(`Verified User Email Confirmed At: ${verifiedUser.email_confirmed_at}`);

  // Fetch verified user's conversations
  const { data: vConvs } = await verifiedClient
    .from("conversation_members")
    .select("conversation_id, conversations(*)")
    .limit(1);

  const testConvId = vConvs?.[0]?.conversation_id;
  console.log(`Sample Existing Conversation ID: ${testConvId || "none"}`);

  // 2. Check unverified user state
  console.log("\n--- Step 2: Create / Inspect Unverified Test User ---");
  const timestamp = Date.now();
  const unverifiedEmail = `unverified_audit_${timestamp}@test.local`;
  const unverifiedPass = "Password123!";

  const { data: signUpData, error: sErr } = await anonClient.auth.signUp({
    email: unverifiedEmail,
    password: unverifiedPass,
    options: {
      data: {
        username: `unv_${timestamp}`,
        display_name: "Unverified Auditor",
      },
      emailRedirectTo: "http://localhost:3000/auth/callback",
    },
  });

  if (sErr) {
    console.error("SignUp error:", sErr);
    process.exit(1);
  }

  console.log(`Unverified User ID: ${signUpData.user?.id}`);
  console.log(`Unverified Session Present?: ${Boolean(signUpData.session)}`);
  console.log(`Unverified email_confirmed_at: ${signUpData.user?.email_confirmed_at}`);

  let unverifiedToken = signUpData.session?.access_token;

  if (!unverifiedToken) {
    // Try sign in
    console.log("No session on signUp. Attempting direct signInWithPassword...");
    const { data: unvSignIn, error: unvErr } = await anonClient.auth.signInWithPassword({
      email: unverifiedEmail,
      password: unverifiedPass,
    });
    console.log(`Direct signIn result: error=${unvErr?.message || "none"}, session=${Boolean(unvSignIn?.session)}`);
    unverifiedToken = unvSignIn?.session?.access_token;
  }

  console.log(`\n--- Step 3: Direct API Security Audit with Unverified Token ---`);
  if (!unverifiedToken) {
    console.log("ℹ️ Supabase Auth does NOT issue access tokens to unverified users when email confirmation is enabled.");
    console.log("   Therefore, unverified users only hold an anonymous role and CANNOT authenticate to PostgREST/Storage.");
    console.log("   Testing Anon Role access against private tables...");
    
    // Testing Anon Role attempts
    const { data: anonConvs, error: aConvErr } = await anonClient.from("conversations").select("*");
    console.log(`Anon SELECT conversations: data count=${anonConvs?.length || 0}, error=${aConvErr?.message || "none"}`);

    const { data: anonMsgs, error: aMsgErr } = await anonClient.from("messages").select("*");
    console.log(`Anon SELECT messages: data count=${anonMsgs?.length || 0}, error=${aMsgErr?.message || "none"}`);

    const { data: anonAtts, error: aAttErr } = await anonClient.from("attachments").select("*");
    console.log(`Anon SELECT attachments: data count=${anonAtts?.length || 0}, error=${aAttErr?.message || "none"}`);

    const { data: anonStorage, error: aStorErr } = await anonClient.storage.from("chat-attachments").list();
    console.log(`Anon Storage list: data count=${anonStorage?.length || 0}, error=${aStorErr?.message || "none"}`);
  } else {
    console.log("Unverified user has an authenticated access token. Testing direct PostgREST & Storage access...");
    const unverifiedClient = makeClient(unverifiedToken);

    // 1. SELECT own profile
    const { data: ownProf, error: ownProfErr } = await unverifiedClient
      .from("profiles")
      .select("*")
      .eq("id", signUpData.user.id);
    console.log(`Unverified SELECT own profile: count=${ownProf?.length || 0}, error=${ownProfErr?.message || "none"}`);

    // 2. SELECT other user's conversations
    const { data: otherConvs, error: oConvErr } = await unverifiedClient
      .from("conversations")
      .select("*");
    console.log(`Unverified SELECT conversations: count=${otherConvs?.length || 0}, error=${oConvErr?.message || "none"}`);

    // 3. SELECT messages from Alice's conversation
    if (testConvId) {
      const { data: msgs, error: msgErr } = await unverifiedClient
        .from("messages")
        .select("*")
        .eq("conversation_id", testConvId);
      console.log(`Unverified SELECT target conversation messages: count=${msgs?.length || 0}, error=${msgErr?.message || "none"}`);

      // 4. INSERT message into Alice's conversation
      const { data: insMsg, error: insErr } = await unverifiedClient
        .from("messages")
        .insert({
          conversation_id: testConvId,
          sender_id: signUpData.user.id,
          content: "Unauthorized unverified intrusion message",
        })
        .select();
      console.log(`Unverified INSERT message into conversation: error=${insErr?.message || "none"}`);
    }

    // 5. Storage list in chat-attachments
    const { data: storList, error: storErr } = await unverifiedClient.storage.from("chat-attachments").list();
    console.log(`Unverified Storage list chat-attachments: count=${storList?.length || 0}, error=${storErr?.message || "none"}`);

    // 6. Storage download / signed URL attempt
    if (testConvId) {
      const { data: signedUrlData, error: signErr } = await unverifiedClient.storage
        .from("chat-attachments")
        .createSignedUrl(`${testConvId}/test.jpg`, 60);
      console.log(`Unverified Storage createSignedUrl: signedUrl=${Boolean(signedUrlData?.signedUrl)}, error=${signErr?.message || "none"}`);
    }
  }

  console.log("\n================================================================");
  console.log("AUDIT STEP 1 COMPLETE");
  console.log("================================================================");
}

runAudit().catch(console.error);
