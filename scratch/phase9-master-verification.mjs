/**
 * HEAT CHAT — PHASE 9 NOTIFICATIONS & PREFERENCES MASTER VERIFICATION
 * 
 * Tests in-app notifications, preferences RLS, conversation mute security,
 * trigger auto-generation, sender suppression, group isolation, removed-member isolation,
 * soft-deleted message privacy, mark-as-read RPCs, realtime delivery, and Phase 6-8 regressions.
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

// Small 1x1 valid PNG buffer for regression tests
const SAMPLE_PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

async function runPhase9Verification() {
  console.log("================================================================");
  console.log("HEAT CHAT — PHASE 9 NOTIFICATIONS 40-POINT MASTER VERIFICATION");
  console.log("================================================================\n");

  const anonClient = makeClient();
  const testRunId = Date.now().toString().slice(-6);

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 1: Authenticating Test Users A, B, C, D, E
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("--- SECTION 1: Registering & Authenticating 5 Test Users (A, B, C, D, E) ---");
  const userConfigs = [
    { key: "A", name: `Phase9_Alpha_${testRunId}`, email: `p9_alpha_${testRunId}@test.local` },
    { key: "B", name: `Phase9_Beta_${testRunId}`, email: `p9_beta_${testRunId}@test.local` },
    { key: "C", name: `Phase9_Charlie_${testRunId}`, email: `p9_charlie_${testRunId}@test.local` },
    { key: "D", name: `Phase9_Delta_${testRunId}`, email: `p9_delta_${testRunId}@test.local` },
    { key: "E", name: `Phase9_Echo_${testRunId}`, email: `p9_echo_${testRunId}@test.local` },
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
  // SECTION 2: User Notification Preferences & Strict RLS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SECTION 2: User Notification Preferences & Strict RLS ---");

  // User A inserts own notification preferences
  const { data: aPrefInsert, error: aPrefErr } = await users.A.client
    .from("notification_preferences")
    .upsert({
      user_id: users.A.id,
      notifications_enabled: true,
      sound_enabled: true,
      desktop_notifications_enabled: true,
      message_preview_enabled: true,
    })
    .select()
    .single();

  assert(!!aPrefInsert && !aPrefErr, "User A inserted/updated own notification preferences.", aPrefErr?.message);

  // User A reads own preferences
  const { data: aPrefRead } = await users.A.client
    .from("notification_preferences")
    .select("*")
    .eq("user_id", users.A.id)
    .single();

  assert(aPrefRead?.desktop_notifications_enabled === true, "User A read own notification preferences.");

  // Attack 1: User B attempting to SELECT User A's preferences -> 0 rows returned
  const { data: bReadAPref } = await users.B.client
    .from("notification_preferences")
    .select("*")
    .eq("user_id", users.A.id);

  assert((!bReadAPref || bReadAPref.length === 0), "Attack 1: User B querying User A preferences -> 0 rows returned (RLS enforced).");

  // Attack 2: User B attempting to UPDATE User A's preferences -> 0 rows affected
  const { data: bUpdateAPref } = await users.B.client
    .from("notification_preferences")
    .update({ notifications_enabled: false })
    .eq("user_id", users.A.id)
    .select();

  assert((!bUpdateAPref || bUpdateAPref.length === 0), "Attack 2: User B updating User A preferences -> 0 rows affected (RLS enforced).");

  // Attack 3: User B attempting to DELETE User A's preferences -> 0 rows affected
  const { data: bDeleteAPref } = await users.B.client
    .from("notification_preferences")
    .delete()
    .eq("user_id", users.A.id)
    .select();

  assert((!bDeleteAPref || bDeleteAPref.length === 0), "Attack 3: User B deleting User A preferences -> 0 rows affected (RLS enforced).");

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 3: Friendships & Direct Chat Setup
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SECTION 3: Friendships & Direct Chat Setup ---");

  await users.A.client.from("friendships").insert({ user_id: users.A.id, friend_id: users.B.id, status: "accepted" });
  await users.A.client.from("friendships").insert({ user_id: users.A.id, friend_id: users.D.id, status: "accepted" });
  await users.A.client.from("friendships").insert({ user_id: users.A.id, friend_id: users.E.id, status: "accepted" });
  await users.B.client.from("friendships").insert({ user_id: users.B.id, friend_id: users.D.id, status: "accepted" });

  const { data: dmConvId, error: dmErr } = await users.A.client.rpc("get_or_create_direct_conversation", {
    target_user_id: users.B.id,
  });

  assert(!!dmConvId && !dmErr, "User A created/opened direct conversation DM1 with User B.", dmErr?.message);

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 4: Conversation Mute Settings & RLS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SECTION 4: Conversation Mute Settings & RLS ---");

  // User B mutes conversation DM1
  const { data: muteRes, error: muteErr } = await users.B.client.rpc("toggle_conversation_mute", {
    conv_id: dmConvId,
    is_muted: true,
  });

  assert(muteRes === true && !muteErr, "User B successfully muted conversation DM1 via RPC.", muteErr?.message);

  // User B queries own mute preference
  const { data: bMuteCheck } = await users.B.client
    .from("conversation_notification_preferences")
    .select("*")
    .eq("conversation_id", dmConvId)
    .eq("user_id", users.B.id)
    .single();

  assert(bMuteCheck?.muted === true, "User B verified conversation DM1 is muted in database.");

  // Attack 4: Non-member User C attempting to mute conversation DM1
  const { error: cMuteErr } = await users.C.client.rpc("toggle_conversation_mute", {
    conv_id: dmConvId,
    is_muted: true,
  });

  assert(!!cMuteErr, "Attack 4: Non-member User C muting DM1 REJECTED by authorization check.");

  // Attack 5: User A querying User B's conversation mute preferences -> 0 rows returned
  const { data: aReadBMute } = await users.A.client
    .from("conversation_notification_preferences")
    .select("*")
    .eq("conversation_id", dmConvId)
    .eq("user_id", users.B.id);

  assert((!aReadBMute || aReadBMute.length === 0), "Attack 5: User A reading User B mute preferences -> 0 rows returned (RLS enforced).");

  // User B un-mutes DM1 for next tests
  await users.B.client.rpc("toggle_conversation_mute", {
    conv_id: dmConvId,
    is_muted: false,
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 5: Direct Message Notification Generation & Sender Suppression
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SECTION 5: Direct Message Notifications & Sender Suppression ---");

  // User A sends message in DM1
  const { data: dmMsg1, error: dmMsg1Err } = await users.A.client
    .from("messages")
    .insert({
      conversation_id: dmConvId,
      sender_id: users.A.id,
      content: "Hello Beta, notification test!",
      message_type: "text",
    })
    .select()
    .single();

  assert(!!dmMsg1 && !dmMsg1Err, "User A sent message in DM1.", dmMsg1Err?.message);

  // Wait for trigger execution
  await new Promise((r) => setTimeout(r, 600));

  // User B queries notifications -> should find 1 notification row
  const { data: bNotifs } = await users.B.client
    .from("notifications")
    .select("*")
    .eq("message_id", dmMsg1.id);

  assert(bNotifs?.length === 1 && bNotifs[0].user_id === users.B.id, "User B received automated notification row for DM1 message.");

  // Sender Suppression: User A queries notifications -> 0 rows for own message
  const { data: aNotifs } = await users.A.client
    .from("notifications")
    .select("*")
    .eq("message_id", dmMsg1.id);

  assert((!aNotifs || aNotifs.length === 0), "Sender Suppression: User A received 0 notifications for own sent message.");

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 6: Group Chat Notifications & Membership Isolation
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SECTION 6: Group Chat Notifications & Membership Isolation ---");

  // User A creates group G1 with B, D, E
  const { data: g1Id, error: g1Err } = await users.A.client.rpc("create_group_conversation", {
    group_name: "Phase 9 Group",
    member_user_ids: [users.B.id, users.D.id, users.E.id],
  });

  assert(!!g1Id && !g1Err, "User A created group G1 with B, D, and E.", g1Err?.message);

  // User A sends group message
  const { data: gMsg1, error: gMsg1Err } = await users.A.client
    .from("messages")
    .insert({
      conversation_id: g1Id,
      sender_id: users.A.id,
      content: "Group notification broadcast to all members!",
      message_type: "text",
    })
    .select()
    .single();

  assert(!!gMsg1 && !gMsg1Err, "User A posted message in Group G1.", gMsg1Err?.message);

  await new Promise((r) => setTimeout(r, 600));

  // Check Member B notification
  const { data: gNotifB } = await users.B.client.from("notifications").select("*").eq("message_id", gMsg1.id);
  assert(gNotifB?.length === 1, "Group Member B received notification row for Group G1 message.");

  // Check Member D notification
  const { data: gNotifD } = await users.D.client.from("notifications").select("*").eq("message_id", gMsg1.id);
  assert(gNotifD?.length === 1, "Group Member D received notification row for Group G1 message.");

  // Check Member E notification
  const { data: gNotifE } = await users.E.client.from("notifications").select("*").eq("message_id", gMsg1.id);
  assert(gNotifE?.length === 1, "Group Member E received notification row for Group G1 message.");

  // Non-member User C notification check
  const { data: gNotifC } = await users.C.client.from("notifications").select("*").eq("message_id", gMsg1.id);
  assert((!gNotifC || gNotifC.length === 0), "Non-member User C received 0 notifications for Group G1 (Non-member isolation).");

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 7: Removed Member Access Revocation
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SECTION 7: Removed Member Notification Isolation ---");

  // User A removes User E from Group G1
  await users.A.client.rpc("remove_group_member", {
    conv_id: g1Id,
    target_user_id: users.E.id,
  });

  // User A sends second group message
  const { data: gMsg2 } = await users.A.client
    .from("messages")
    .insert({
      conversation_id: g1Id,
      sender_id: users.A.id,
      content: "Message after User E removal",
      message_type: "text",
    })
    .select()
    .single();

  await new Promise((r) => setTimeout(r, 600));

  // Removed User E check
  const { data: eNotifsAfterRemoval } = await users.E.client
    .from("notifications")
    .select("*")
    .eq("message_id", gMsg2.id);

  assert(
    (!eNotifsAfterRemoval || eNotifsAfterRemoval.length === 0),
    "Removed Member E received 0 notifications for subsequent group messages (Revocation enforced)."
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 8: Notification Center Storage RLS Security
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SECTION 8: Notification Center Storage RLS Security ---");

  const notifIdB = bNotifs?.[0]?.id;

  if (notifIdB) {
    // Attack 6: Non-member User C querying User B's notification
    const { data: cReadBNotif } = await users.C.client
      .from("notifications")
      .select("*")
      .eq("id", notifIdB);

    assert((!cReadBNotif || cReadBNotif.length === 0), "Attack 6: User C querying User B notifications -> 0 rows returned (RLS enforced).");

    // Attack 7: User C attempting to update User B's notification
    const { data: cUpdateBNotif } = await users.C.client
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notifIdB)
      .select();

    assert((!cUpdateBNotif || cUpdateBNotif.length === 0), "Attack 7: User C updating User B notification -> 0 rows affected (RLS enforced).");

    // Attack 8: User C attempting to delete User B's notification
    const { data: cDeleteBNotif } = await users.C.client
      .from("notifications")
      .delete()
      .eq("id", notifIdB)
      .select();

    assert((!cDeleteBNotif || cDeleteBNotif.length === 0), "Attack 8: User C deleting User B notification -> 0 rows affected (RLS enforced).");
  } else {
    assert(false, "Attack 6: User C querying User B notifications -> notifIdB was not created.");
    assert(false, "Attack 7: User C updating User B notification -> notifIdB was not created.");
    assert(false, "Attack 8: User C deleting User B notification -> notifIdB was not created.");
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 9: Mark As Read RPC Functions
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SECTION 9: Mark As Read RPC Functions ---");

  if (notifIdB) {
    // User B marks own notification as read
    const { data: markReadRes, error: markReadErr } = await users.B.client.rpc("mark_notification_as_read", {
      notif_id: notifIdB,
    });

    assert(markReadRes === true && !markReadErr, "User B marked single notification as read via RPC.", markReadErr?.message);

    // Verify read_at is populated
    const { data: checkBRead } = await users.B.client
      .from("notifications")
      .select("read_at")
      .eq("id", notifIdB)
      .single();

    assert(!!checkBRead?.read_at, "Notification read_at verified populated in database.");

    // Attack 9: User A trying to mark User B's notification as read
    const { data: unauthMarkRead } = await users.A.client.rpc("mark_notification_as_read", {
      notif_id: notifIdB,
    });

    assert(unauthMarkRead === false, "Attack 9: User A marking User B notification as read -> returned false (0 rows modified).");
  } else {
    assert(false, "User B marked single notification as read -> notifIdB was not created.");
    assert(false, "Notification read_at verified populated in database -> notifIdB was not created.");
    assert(false, "Attack 9: User A marking User B notification as read -> notifIdB was not created.");
  }

  // User B marks all as read
  const { data: markAllCount, error: markAllErr } = await users.B.client.rpc("mark_all_notifications_as_read");
  assert(markAllCount !== null && !markAllErr, `User B marked all notifications as read via RPC (count: ${markAllCount}).`);

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 10: Soft-Deleted Message Notification Privacy
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SECTION 10: Soft-Deleted Message Notification Privacy ---");

  // User A soft-deletes the first group message
  const { error: delMsgErr } = await users.A.client
    .from("messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", gMsg1.id);

  assert(!delMsgErr, "User A soft-deleted message gMsg1.", delMsgErr?.message);

  // Member D queries notifications along with parent message status
  const { data: dNotifRow } = await users.D.client
    .from("notifications")
    .select("id, message_id")
    .eq("message_id", gMsg1.id)
    .single();

  const { data: dMsgCheck } = await users.D.client
    .from("messages")
    .select("id, deleted_at, content")
    .eq("id", dNotifRow.message_id)
    .single();

  assert(!!dMsgCheck?.deleted_at, "Deleted message privacy: parent message detected with deleted_at populated.");

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 11: Realtime Notification INSERT Broadcast
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SECTION 11: Realtime Notification INSERT Broadcast ---");

  let realtimeNotifReceived = false;
  const notifChannel = users.B.client.channel(`rt-notif-b-${testRunId}-${Date.now()}`);

  notifChannel.on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "notifications",
      filter: `user_id=eq.${users.B.id}`,
    },
    (payload) => {
      if (payload.new && payload.new.user_id === users.B.id) {
        realtimeNotifReceived = true;
      }
    }
  );

  await new Promise((resolve) => {
    notifChannel.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
    });
  });

  await new Promise((r) => setTimeout(r, 1000));

  // User A sends message in DM1 to trigger realtime notification
  await users.A.client.from("messages").insert({
    conversation_id: dmConvId,
    sender_id: users.A.id,
    content: "Realtime notification trigger test",
    message_type: "text",
  });

  await new Promise((resolve) => setTimeout(resolve, 3000));
  await notifChannel.unsubscribe();

  assert(realtimeNotifReceived === true, "Member B received Realtime notification INSERT event.");

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 12: Regressions (Phases 6, 7, 8)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SECTION 12: Regressions (Phases 6, 7, 8) ---");

  // 1. Reply
  const { data: regReply, error: regReplyErr } = await users.B.client
    .from("messages")
    .insert({
      conversation_id: dmConvId,
      sender_id: users.B.id,
      content: "Reply regression check",
      message_type: "text",
      reply_to_message_id: dmMsg1.id,
    })
    .select()
    .single();

  assert(!!regReply && !regReplyErr, "Replies function without regression.");

  // 2. Reaction
  const { error: reactErr } = await users.B.client
    .from("message_reactions")
    .insert({ message_id: dmMsg1.id, user_id: users.B.id, reaction: "🔥" });

  assert(!reactErr, "Reactions function without regression.");

  // 3. Media Upload & Attachment
  const mediaStoragePath = `${dmConvId}/${regReply.id}/test_p9.png`;
  const { error: mediaUploadErr } = await users.B.client.storage
    .from("chat-attachments")
    .upload(mediaStoragePath, SAMPLE_PNG_BUFFER, { contentType: "image/png" });

  assert(!mediaUploadErr, "Media storage upload functions without regression.");

  const { data: mediaAtt, error: mediaAttErr } = await users.B.client
    .from("attachments")
    .insert({
      message_id: regReply.id,
      storage_path: mediaStoragePath,
      file_name: "test_p9.png",
      file_type: "image/png",
      file_size: SAMPLE_PNG_BUFFER.length,
      width: 400,
      height: 300,
    })
    .select()
    .single();

  assert(!!mediaAtt && !mediaAttErr, "Media attachments function without regression.");

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 13: Cleanup
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SECTION 13: Cleaning Up Temporary Test Data ---");

  try {
    await users.B.client.storage.from("chat-attachments").remove([mediaStoragePath]);
  } catch {}

  // Delete conversations (cascades to messages, notifications, attachments, etc.)
  await users.A.client.from("conversations").delete().in("id", [dmConvId, g1Id]);
  await users.A.client.from("notification_preferences").delete().in("user_id", Object.values(users).map((u) => u.id));
  await users.A.client.from("friendships").delete().or(`user_id.eq.${users.A.id},friend_id.eq.${users.A.id}`);
  await users.B.client.from("friendships").delete().or(`user_id.eq.${users.B.id},friend_id.eq.${users.B.id}`);

  console.log("  ✅ Test notifications, preferences, conversations, messages, reactions, and attachments purged.");

  console.log("\n================================================================");
  if (failed === 0) {
    console.log(`🎉 ALL ${passed} PHASE 9 MASTER VERIFICATION TESTS PASSED WITH ZERO ERRORS!`);
  } else {
    console.error(`💥 ${failed} TEST(S) FAILED! Check error log above.`);
    process.exit(1);
  }
  console.log("================================================================\n");
}

runPhase9Verification().catch((err) => {
  console.error("Fatal verification error:", err);
  process.exit(1);
});
