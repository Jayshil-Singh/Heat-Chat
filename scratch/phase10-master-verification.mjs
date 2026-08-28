import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

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
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  process.exit(1);
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
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, options);
}

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = "") {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] Test ${totalTests.toString().padStart(2, "0")}: ${testName}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] Test ${totalTests.toString().padStart(2, "0")}: ${testName} - ${details}`);
  }
}

async function runVerification() {
  console.log("===============================================================================");
  console.log("HEAT CHAT — PHASE 10 MASTER LIVE VERIFICATION SUITE");
  console.log("Full-Text Search, In-Chat Search, Global Search, Starred Messages & Privacy");
  console.log("===============================================================================\n");

  const anonClient = makeClient();
  const testRunId = Date.now().toString().slice(-6);

  const userConfigs = [
    { key: "A", name: `Phase10_Alpha_${testRunId}`, email: `p10_alpha_${testRunId}@test.local` },
    { key: "B", name: `Phase10_Beta_${testRunId}`, email: `p10_beta_${testRunId}@test.local` },
    { key: "C", name: `Phase10_Charlie_${testRunId}`, email: `p10_charlie_${testRunId}@test.local` },
    { key: "D", name: `Phase10_Delta_${testRunId}`, email: `p10_delta_${testRunId}@test.local` },
    { key: "E", name: `Phase10_Echo_${testRunId}`, email: `p10_echo_${testRunId}@test.local` },
  ];

  const clients = {};
  const users = {};
  const password = `TestPass!_${testRunId}_Secure123`;

  try {
    console.log("1. Registering & Authenticating 5 Test Users (A, B, C, D, E)...");
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
        console.error(`Failed to login ${cfg.name}:`, signInErr?.message);
        process.exit(1);
      }

      const token = signInData.session.access_token;
      clients[cfg.key] = makeClient(token);
      users[cfg.key] = signInData.user;

      // Upsert profile
      await clients[cfg.key].from("profiles").upsert({
        id: signInData.user.id,
        username: `user_${cfg.name.toLowerCase()}`,
        display_name: cfg.name,
        status: "online",
      });
    }
    console.log("   Authenticated 5 test users successfully.\n");

    // Establish friendships so direct & group chats can be created smoothly
    console.log("2. Setting up test friendships...");
    const pairs = [
      ["A", "B"], ["A", "C"], ["A", "D"], ["A", "E"],
      ["B", "C"], ["B", "D"], ["C", "D"],
    ];
    for (const [u1, u2] of pairs) {
      await clients[u1].from("friendships").upsert({
        user_id: users[u1].id,
        friend_id: users[u2].id,
        status: "accepted",
      });
      await clients[u2].from("friendships").upsert({
        user_id: users[u2].id,
        friend_id: users[u1].id,
        status: "accepted",
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n3. Testing Database Schema & RPC Functions Presence...");
    
    // Check RPC: search_conversation_messages
    const { error: rpcSearchConvErr } = await clients.A.rpc("search_conversation_messages", {
      p_conv_id: "00000000-0000-0000-0000-000000000000",
      p_query: "test",
    });
    // Should fail with 'Not authorized to search this conversation' or return empty
    assert(
      rpcSearchConvErr && rpcSearchConvErr.message.includes("Not authorized"),
      "search_conversation_messages RPC exists and enforces membership check"
    );

    // Check RPC: search_global_messages
    const { data: rpcGlobalData, error: rpcGlobalErr } = await clients.A.rpc("search_global_messages", {
      p_query: "nonexistentuniquephrase9999",
    });
    assert(!rpcGlobalErr && Array.isArray(rpcGlobalData), "search_global_messages RPC exists and executes cleanly");

    // Check RPC: toggle_starred_message
    const { error: rpcStarErr } = await clients.A.rpc("toggle_starred_message", {
      p_message_id: "00000000-0000-0000-0000-000000000000",
    });
    assert(
      rpcStarErr && rpcStarErr.message.includes("Message not found or unauthorized"),
      "toggle_starred_message RPC exists and validates message existence"
    );

    // Check starred_messages table SELECT RLS
    const { data: starSelectData, error: starSelectErr } = await clients.A.from("starred_messages").select("*");
    assert(!starSelectErr && Array.isArray(starSelectData), "starred_messages table exists with active SELECT RLS");

    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n4. Direct Messaging & In-Chat Search Verification...");
    
    // Create direct conversation between User A and User B
    const { data: convABId, error: convABErr } = await clients.A.rpc("get_or_create_direct_conversation", {
      target_user_id: users.B.id,
    });
    assert(!convABErr && convABId, "User A creates direct conversation with User B");

    // Insert 4 messages with distinct keywords
    const msgA1 = await clients.A.from("messages").insert({
      conversation_id: convABId,
      sender_id: users.A.id,
      content: "The supersonic aircraft completed its flight from London to Tokyo safely.",
      message_type: "text",
    }).select().single();

    const msgB1 = await clients.B.from("messages").insert({
      conversation_id: convABId,
      sender_id: users.B.id,
      content: "Tokyo has magnificent gardens and high speed railway systems.",
      message_type: "text",
    }).select().single();

    const msgA2 = await clients.A.from("messages").insert({
      conversation_id: convABId,
      sender_id: users.A.id,
      content: "Deep ocean submarine exploration in the Mariana Trench.",
      message_type: "text",
    }).select().single();

    const msgB2 = await clients.B.from("messages").insert({
      conversation_id: convABId,
      sender_id: users.B.id,
      content: "Aircraft engineering requires advanced aerodynamic materials.",
      message_type: "text",
    }).select().single();

    assert(msgA1.data && msgB1.data && msgA2.data && msgB2.data, "Messages inserted into direct conversation");

    // User A searches "Tokyo" -> should match msgA1 and msgB1
    const { data: searchTokyoA, error: searchTokyoAErr } = await clients.A.rpc("search_conversation_messages", {
      p_conv_id: convABId,
      p_query: "Tokyo",
    });
    assert(
      !searchTokyoAErr && searchTokyoA.length === 2,
      "User A in-chat search for 'Tokyo' returns exactly 2 matches",
      `Got ${searchTokyoA?.length} matches`
    );

    // User B searches "Tokyo" -> same 2 matches
    const { data: searchTokyoB } = await clients.B.rpc("search_conversation_messages", {
      p_conv_id: convABId,
      p_query: "tokyo",
    });
    assert(searchTokyoB?.length === 2, "User B case-insensitive search for 'tokyo' returns 2 matches");

    // User A searches "aircraft" -> should match msgA1 and msgB2
    const { data: searchAircraft } = await clients.A.rpc("search_conversation_messages", {
      p_conv_id: convABId,
      p_query: "aircraft",
    });
    assert(searchAircraft?.length === 2, "In-chat search for 'aircraft' returns 2 matches");

    // English Stemming check: search "flying" or "flights" matches "flight"
    const { data: searchStemming } = await clients.A.rpc("search_conversation_messages", {
      p_conv_id: convABId,
      p_query: "flights",
    });
    assert(searchStemming?.length >= 1, "English full-text stemming matches 'flights' to 'flight'");

    // Non-member isolation: User C attempts in-chat search on AB conversation -> rejected!
    const { error: nonMemberSearchErr } = await clients.C.rpc("search_conversation_messages", {
      p_conv_id: convABId,
      p_query: "Tokyo",
    });
    assert(
      nonMemberSearchErr && nonMemberSearchErr.message.includes("Not authorized"),
      "Non-member User C is rejected from searching conversation A-B"
    );

    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n5. Soft-Deleted Message Search Privacy Verification...");

    const secretMsg = await clients.A.from("messages").insert({
      conversation_id: convABId,
      sender_id: users.A.id,
      content: "Top secret supersonic stealth telemetry passcode 884729",
      message_type: "text",
    }).select().single();

    // Verify secret message appears in search initially
    const { data: searchSecret1 } = await clients.A.rpc("search_conversation_messages", {
      p_conv_id: convABId,
      p_query: "telemetry",
    });
    assert(searchSecret1?.length === 1 && searchSecret1[0].id === secretMsg.data.id, "Active secret message matches search query");

    // Soft delete the message
    await clients.A.from("messages").update({
      deleted_at: new Date().toISOString(),
      content: "This message was deleted",
    }).eq("id", secretMsg.data.id);

    // In-chat search for "telemetry" -> must return 0 rows!
    const { data: searchSecret2 } = await clients.A.rpc("search_conversation_messages", {
      p_conv_id: convABId,
      p_query: "telemetry",
    });
    assert(searchSecret2?.length === 0, "Soft-deleted message content NEVER appears in in-chat search");

    // Global search for "telemetry" -> must return 0 rows!
    const { data: globalSecret } = await clients.A.rpc("search_global_messages", {
      p_query: "telemetry",
    });
    assert(globalSecret?.length === 0, "Soft-deleted message content NEVER appears in global search");

    // In-chat search for "deleted" -> must return 0 rows (deleted placeholder not indexed)
    const { data: searchDeletedPlaceholder } = await clients.A.rpc("search_conversation_messages", {
      p_conv_id: convABId,
      p_query: "deleted",
    });
    assert(searchDeletedPlaceholder?.length === 0, "Deleted placeholder text is excluded from search index");

    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n6. Global Search Multi-Conversation & Scope Isolation Verification...");

    // Create Group Conversation with A, B, C
    const { data: groupABCId, error: groupErr } = await clients.A.rpc("create_group_conversation", {
      group_name: "Phase 10 Quantum Research Team",
      member_user_ids: [users.B.id, users.C.id],
    });
    assert(!groupErr && groupABCId, "User A creates group conversation with Users B and C");

    // Group message
    const grpMsg = await clients.C.from("messages").insert({
      conversation_id: groupABCId,
      sender_id: users.C.id,
      content: "Quantum computing algorithms for molecular physics simulation.",
      message_type: "text",
    }).select().single();

    // Direct message between A and D
    const { data: convADId } = await clients.A.rpc("get_or_create_direct_conversation", {
      target_user_id: users.D.id,
    });
    const adMsg = await clients.D.from("messages").insert({
      conversation_id: convADId,
      sender_id: users.D.id,
      content: "Quantum cryptography experiment scheduled for midnight.",
      message_type: "text",
    }).select().single();

    // User A runs global search for "Quantum" -> matches BOTH groupABC and convAD!
    const { data: globalSearchA } = await clients.A.rpc("search_global_messages", {
      p_query: "quantum",
    });
    assert(
      globalSearchA?.length === 2,
      "User A global search finds matches across multiple conversations (group + direct)",
      `Found ${globalSearchA?.length} matches`
    );

    // User D runs global search for "Quantum" -> must match ONLY convAD (D is NOT in groupABC)
    const { data: globalSearchD } = await clients.D.rpc("search_global_messages", {
      p_query: "quantum",
    });
    assert(
      globalSearchD?.length === 1 && globalSearchD[0].conversation_id === convADId,
      "User D global search returns ONLY conversations where User D is an active member"
    );

    // User E runs global search for "Quantum" -> must return 0 results (E is in neither)
    const { data: globalSearchE } = await clients.E.rpc("search_global_messages", {
      p_query: "quantum",
    });
    assert(globalSearchE?.length === 0, "User E global search returns 0 results for non-member conversations");

    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n7. Group Member Removal & Instant Search Revocation...");

    // Remove User C from Group ABC
    await clients.A.rpc("remove_group_member", {
      conv_id: groupABCId,
      target_user_id: users.C.id,
    });

    // User C immediately searches global messages for "Quantum" -> must be 0!
    const { data: globalSearchCRemoved } = await clients.C.rpc("search_global_messages", {
      p_query: "quantum",
    });
    assert(
      globalSearchCRemoved?.length === 0,
      "Removed member User C immediately loses global search access to group messages"
    );

    // User C in-chat search on groupABC -> rejected!
    const { error: inChatCRemovedErr } = await clients.C.rpc("search_conversation_messages", {
      p_conv_id: groupABCId,
      p_query: "quantum",
    });
    assert(
      inChatCRemovedErr && inChatCRemovedErr.message.includes("Not authorized"),
      "Removed member User C is immediately blocked from in-chat search"
    );

    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n8. Starred Messages (Bookmarking) Verification...");

    // User A stars msgB1
    const { data: starRes1, error: starErr1 } = await clients.A.rpc("toggle_starred_message", {
      p_message_id: msgB1.data.id,
    });
    assert(!starErr1 && starRes1 === true, "User A stars message B1 (returns true)");

    // User A stars msgA2
    const { data: starRes2 } = await clients.A.rpc("toggle_starred_message", {
      p_message_id: msgA2.data.id,
    });
    assert(starRes2 === true, "User A stars message A2 (returns true)");

    // User A queries starred_messages -> returns 2 records
    const { data: starredA } = await clients.A.from("starred_messages").select("*").eq("user_id", users.A.id);
    assert(starredA?.length === 2, "User A has exactly 2 starred messages");

    // User B queries starred_messages -> returns 0 records (A's bookmarks are private!)
    const { data: starredB } = await clients.B.from("starred_messages").select("*");
    assert(starredB?.length === 0, "User B cannot view User A's starred messages (strict RLS isolation)");

    // User A unstars msgB1 by toggling again
    const { data: starRes3 } = await clients.A.rpc("toggle_starred_message", {
      p_message_id: msgB1.data.id,
    });
    assert(starRes3 === false, "User A unstars message B1 by calling toggle again (returns false)");

    // User A now has 1 starred message
    const { data: starredAAfter } = await clients.A.from("starred_messages").select("*");
    assert(starredAAfter?.length === 1, "User A starred count updated to 1 after unstarring");

    // Non-member User E attempts to star msgA2 -> rejected!
    const { error: starNonMemberErr } = await clients.E.rpc("toggle_starred_message", {
      p_message_id: msgA2.data.id,
    });
    assert(
      starNonMemberErr && starNonMemberErr.message.includes("Message not found or unauthorized"),
      "Non-member User E is rejected from starring messages in conversation A-B"
    );

    // Star a soft-deleted message -> rejected!
    const { error: starDeletedErr } = await clients.A.rpc("toggle_starred_message", {
      p_message_id: secretMsg.data.id,
    });
    assert(
      starDeletedErr && starDeletedErr.message.includes("Message not found or unauthorized"),
      "Cannot star a soft-deleted message"
    );

    // Soft-deleting a previously starred message hides it from SELECT queries
    await clients.A.from("messages").update({
      deleted_at: new Date().toISOString(),
      content: "This message was deleted",
    }).eq("id", msgA2.data.id);

    const { data: starredAHidden } = await clients.A.from("starred_messages").select("*");
    assert(
      starredAHidden?.length === 0,
      "Soft-deleting a message immediately excludes it from starred messages SELECT query via RLS"
    );

    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n9. Group-Message Starring, Delete RLS Isolation & Context RPC...");

    // Star group message
    const { data: grpStarRes } = await clients.B.rpc("toggle_starred_message", {
      p_message_id: grpMsg.data.id,
    });
    assert(grpStarRes === true, "User B stars group message (returns true)");

    // User B verifies group message is in starred list
    const { data: grpStarredList } = await clients.B.from("starred_messages").select("*").eq("message_id", grpMsg.data.id);
    assert(grpStarredList?.length === 1, "User B queries starred group message successfully");

    // Cross-user deletion isolation: User C attempts to delete User B's starred message
    const { data: delAttempt } = await clients.C.from("starred_messages").delete().eq("id", grpStarredList[0].id).select();
    assert(!delAttempt || delAttempt.length === 0, "User C cannot delete User B's starred message (DELETE RLS policy)");

    // get_message_context_by_id: User A fetches context for valid message in active conversation
    const { data: ctxA, error: ctxAErr } = await clients.A.rpc("get_message_context_by_id", {
      p_message_id: msgB1.data.id,
    });
    assert(
      !ctxAErr && ctxA?.length === 1 && ctxA[0].sender_username === `user_phase10_beta_${testRunId.toLowerCase()}`,
      "get_message_context_by_id returns complete message and sender profile metadata for conversation member"
    );

    // get_message_context_by_id: Non-member User E attempts to fetch context
    const { data: ctxE } = await clients.E.rpc("get_message_context_by_id", {
      p_message_id: msgB1.data.id,
    });
    assert(ctxE?.length === 0, "Non-member User E receives 0 rows from get_message_context_by_id");

    // Search result limit enforcement: query with p_limit = 1
    const { data: limitTest } = await clients.A.rpc("search_conversation_messages", {
      p_conv_id: convABId,
      p_query: "Tokyo",
      p_limit: 1,
    });
    assert(limitTest?.length === 1, "search_conversation_messages enforces p_limit parameter strictly");

    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n10. Search Sanitization, Injection & Special Characters...");

    // Search special characters: no crash, empty result or sanitized match
    const specialChars = "quantum!@#$%^&*()_+=-{}[]:;'\"<>,.?/|\\`~";
    const { data: specialSearch, error: specialErr } = await clients.A.rpc("search_global_messages", {
      p_query: specialChars,
    });
    assert(!specialErr, "Special characters search handled safely without syntax errors or injection");

    // Blank / whitespace query
    const { data: blankSearch } = await clients.A.rpc("search_global_messages", {
      p_query: "   ",
    });
    assert(Array.isArray(blankSearch) && blankSearch.length === 0, "Whitespace-only query safely returns empty array");

    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n10. Cross-Phase Regressions Check...");

    // Phase 6: Direct messaging works
    const testDirect = await clients.B.from("messages").insert({
      conversation_id: convABId,
      sender_id: users.B.id,
      content: "Regression test DM",
      message_type: "text",
    }).select().single();
    assert(testDirect.data?.id, "Phase 6: Direct messaging functional");

    // Phase 7: Group roles & messaging
    const { data: roleA } = await clients.A.rpc("get_conversation_role", {
      conv_id: groupABCId,
      check_user_id: users.A.id,
    });
    assert(roleA === "owner", "Phase 7: Group roles functional (User A is owner)");

    // Phase 9: Notifications & Mute toggle
    const { data: muteRes } = await clients.A.rpc("toggle_conversation_mute", {
      conv_id: convABId,
      is_muted: true,
    });
    assert(muteRes === true, "Phase 9: Conversation mute toggle functional");

    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n11. Cleaning Up Test Data...");
    
    // Clean starred messages
    await clients.A.from("starred_messages").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await clients.B.from("starred_messages").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    // Clean messages
    await clients.A.from("messages").delete().in("conversation_id", [convABId, convADId, groupABCId]);

    // Clean conversation members
    await clients.A.from("conversation_members").delete().in("conversation_id", [convABId, convADId, groupABCId]);

    // Clean conversations
    await clients.A.from("conversations").delete().in("id", [convABId, convADId, groupABCId]);

    // Clean friendships
    for (const [u1, u2] of pairs) {
      await clients[u1].from("friendships").delete().match({ user_id: users[u1].id, friend_id: users[u2].id });
      await clients[u2].from("friendships").delete().match({ user_id: users[u2].id, friend_id: users[u1].id });
    }

    console.log("   Temporary test data cleaned up successfully.\n");

  } catch (err) {
    console.error("Fatal error during verification:", err);
    failedTests++;
  }

  console.log("===============================================================================");
  console.log(`VERIFICATION SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
  console.log("===============================================================================");

  if (failedTests > 0) {
    process.exit(1);
  }
}

runVerification();
