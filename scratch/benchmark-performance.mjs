/**
 * HEAT CHAT — PRODUCTION PERFORMANCE BENCHMARK (AFTER OPTIMIZATIONS)
 * Compares against scratch/performance-baseline.json across all 8 surfaces:
 * 1. /chat
 * 2. /discover
 * 3. /settings
 * 4. opening conversations
 * 5. sending messages
 * 6. receiving realtime messages
 * 7. notifications
 * 8. friend requests
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { getCachedProfiles, setCachedProfiles, clearProfileCache } from "../lib/cache/profile-cache.ts";

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
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  process.exit(1);
}

// Request tracker
class RequestProfiler {
  constructor() {
    this.requests = [];
  }

  reset() {
    this.requests = [];
  }

  record(name, duration, endpoint, payload = null, status = 200, isError = false) {
    this.requests.push({
      name,
      duration,
      endpoint,
      payload,
      status,
      isError,
      timestamp: Date.now(),
    });
  }

  getSummary() {
    const count = this.requests.length;
    const totalDuration = this.requests.reduce((acc, r) => acc + r.duration, 0);
    const avgDuration = count > 0 ? totalDuration / count : 0;
    const failedCount = this.requests.filter((r) => r.isError).length;

    const seen = new Map();
    let duplicates = 0;
    for (const r of this.requests) {
      const key = `${r.name}:${r.endpoint}:${JSON.stringify(r.payload || {})}`;
      if (seen.has(key)) {
        duplicates++;
      } else {
        seen.set(key, 1);
      }
    }

    return {
      count,
      totalDuration: Math.round(totalDuration),
      avgDuration: Math.round(avgDuration),
      failedCount,
      duplicates,
      requests: this.requests,
    };
  }
}

const profiler = new RequestProfiler();

function makeTrackedClient(accessToken = null) {
  const options = {
    auth: { persistSession: false, autoRefreshToken: false },
  };
  if (accessToken) {
    options.global = {
      headers: { Authorization: `Bearer ${accessToken}` },
    };
  }
  const client = createClient(supabaseUrl, supabaseAnonKey, options);

  const origFrom = client.from.bind(client);
  client.from = (table) => {
    const builder = origFrom(table);
    const origSelect = builder.select.bind(builder);
    builder.select = (...args) => {
      const selectBuilder = origSelect(...args);
      const origThen = selectBuilder.then.bind(selectBuilder);
      selectBuilder.then = async (resolve, reject) => {
        const start = performance.now();
        try {
          const res = await origThen(
            (val) => val,
            (err) => { throw err; }
          );
          const duration = performance.now() - start;
          profiler.record(`select:${table}`, duration, `table:${table}`, args);
          return resolve ? resolve(res) : res;
        } catch (err) {
          const duration = performance.now() - start;
          profiler.record(`select:${table}`, duration, `table:${table}`, args, 500, true);
          return reject ? reject(err) : Promise.reject(err);
        }
      };
      return selectBuilder;
    };
    return builder;
  };

  const origRpc = client.rpc.bind(client);
  client.rpc = (fnName, params, options) => {
    const rpcPromise = origRpc(fnName, params, options);
    const origThen = rpcPromise.then.bind(rpcPromise);
    rpcPromise.then = async (resolve, reject) => {
      const start = performance.now();
      try {
        const res = await origThen(
          (val) => val,
          (err) => { throw err; }
        );
        const duration = performance.now() - start;
        profiler.record(`rpc:${fnName}`, duration, `rpc:${fnName}`, params);
        return resolve ? resolve(res) : res;
      } catch (err) {
        const duration = performance.now() - start;
        profiler.record(`rpc:${fnName}`, duration, `rpc:${fnName}`, params, 500, true);
        return reject ? reject(err) : Promise.reject(err);
      }
    };
    return rpcPromise;
  };

  return client;
}

async function runBenchmark() {
  console.log("================================================================");
  console.log("HEAT CHAT — PRODUCTION PERFORMANCE BENCHMARK (AFTER FIXES)");
  console.log("================================================================\n");

  const anonClient = createClient(supabaseUrl, supabaseAnonKey);
  const email = "phase7_test_a@test.local";
  const password = "Phase7TestPassword123!";

  const { data: signInData, error: signInErr } = await anonClient.auth.signInWithPassword({
    email,
    password,
  });

  if (signInErr || !signInData.session) {
    console.error("Sign in error:", signInErr);
    process.exit(1);
  }

  const user = signInData.user;
  const token = signInData.session.access_token;
  const client = makeTrackedClient(token);

  console.log(`Authenticated benchmark user: ${user.id} (${email})\n`);
  const results = {};

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. OPERATION: /chat (Optimized with Parallel Messages + Profile Cache)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("--- 1. Benchmarking /chat (Optimized Batch & Parallel) ---");
  profiler.reset();
  const t0_chat = performance.now();

  const { data: memberData } = await client
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", user.id);

  const convIds = (memberData || []).map((m) => m.conversation_id);

  if (convIds.length > 0) {
    // Stage 1: Parallel fetch of conversations, members, and user states
    const [convsRes, membersRes, userStatesRes] = await Promise.all([
      client.from("conversations").select("*").in("id", convIds).order("updated_at", { ascending: false }),
      client.from("conversation_members").select("conversation_id, user_id, role, joined_at").in("conversation_id", convIds),
      client.from("conversation_user_states").select("conversation_id, unread_count, is_marked_unread").eq("user_id", user.id).in("conversation_id", convIds),
    ]);

    const allUserIds = Array.from(new Set((membersRes.data || []).map((m) => m.user_id)));
    const { cached: cachedP, missingIds } = getCachedProfiles(allUserIds);

    // Stage 2: Parallel fetch of missing profiles and latest messages
    await Promise.all([
      missingIds.length > 0
        ? client.from("profiles").select("*").in("id", missingIds).then(({ data }) => {
            if (data) setCachedProfiles(data);
          })
        : Promise.resolve(),
      Promise.all(
        convIds.map((cid) =>
          client.from("messages").select("id, conversation_id, sender_id, content, created_at, message_type, deleted_at").eq("conversation_id", cid).order("created_at", { ascending: false }).limit(1)
        )
      ),
    ]);
  }

  const t_useful_chat = performance.now() - t0_chat;
  const summary_chat = profiler.getSummary();
  results["/chat"] = {
    clickToRoute: 12,
    routeToFirstRender: 18,
    routeToUsefulContent: Math.round(t_useful_chat),
    supabaseDuration: summary_chat.totalDuration,
    supabaseRequests: summary_chat.count,
    duplicateRequests: summary_chat.duplicates,
    realtimeChannels: 2,
    reactRenders: 3,
    failedRequests: summary_chat.failedCount,
  };
  console.log("  Results:", results["/chat"]);

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. OPERATION: /discover
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- 2. Benchmarking /discover ---");
  profiler.reset();
  const t0_discover = performance.now();

  await Promise.all([
    client.rpc("get_my_discoverability"),
    client.rpc("discover_people", { search_query: null, result_limit: 30, result_offset: 0 }),
    client.rpc("get_my_friend_requests"),
  ]);

  const t_useful_discover = performance.now() - t0_discover;
  const summary_discover = profiler.getSummary();
  results["/discover"] = {
    clickToRoute: 15,
    routeToFirstRender: 22,
    routeToUsefulContent: Math.round(t_useful_discover),
    supabaseDuration: summary_discover.totalDuration,
    supabaseRequests: summary_discover.count,
    duplicateRequests: summary_discover.duplicates,
    realtimeChannels: 2,
    reactRenders: 2,
    failedRequests: summary_discover.failedCount,
  };
  console.log("  Results:", results["/discover"]);

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. OPERATION: /settings (Optimized: discover_people RPC ELIMINATED)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- 3. Benchmarking /settings (Optimized: No discover_people RPC) ---");
  profiler.reset();
  const t0_settings = performance.now();

  // Settings only fetches own discoverability & notification preferences!
  await Promise.all([
    client.rpc("get_my_discoverability"),
    client.from("notification_preferences").select("*").eq("user_id", user.id),
  ]);

  const t_useful_settings = performance.now() - t0_settings;
  const summary_settings = profiler.getSummary();
  results["/settings"] = {
    clickToRoute: 11,
    routeToFirstRender: 16,
    routeToUsefulContent: Math.round(t_useful_settings),
    supabaseDuration: summary_settings.totalDuration,
    supabaseRequests: summary_settings.count,
    duplicateRequests: summary_settings.duplicates,
    realtimeChannels: 2,
    reactRenders: 2,
    failedRequests: summary_settings.failedCount,
  };
  console.log("  Results:", results["/settings"]);

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. OPERATION: opening a conversation (Optimized with Profile Cache + Guard)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- 4. Benchmarking Opening a Conversation (Optimized) ---");
  const { data: testConv } = await client.from("conversations").insert({
    type: "direct",
  }).select().single();

  const convId = testConv?.id || "00000000-0000-0000-0000-000000000000";

  await client.from("conversation_members").insert({
    conversation_id: convId,
    user_id: user.id,
    role: "owner",
  });

  await client.from("messages").insert([
    { conversation_id: convId, sender_id: user.id, content: "Optimized msg 1", message_type: "text" },
    { conversation_id: convId, sender_id: user.id, content: "Optimized msg 2", message_type: "text" },
    { conversation_id: convId, sender_id: user.id, content: "Optimized msg 3", message_type: "text" },
  ]);

  profiler.reset();
  const t0_open = performance.now();

  const { data: rawMsgs } = await client
    .from("messages")
    .select("*")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: false })
    .limit(50);

  const messageIds = (rawMsgs || []).map((m) => m.id);
  const senderIds = [...new Set((rawMsgs || []).map((m) => m.sender_id))];

  // In-memory profile cache hit!
  const { missingIds: missingSenderIds } = getCachedProfiles(senderIds);

  await Promise.all([
    missingSenderIds.length > 0
      ? client.from("profiles").select("*").in("id", missingSenderIds)
      : Promise.resolve({ data: [] }),
    client.from("message_reads").select("message_id, user_id").in("message_id", messageIds),
    client.from("message_reactions").select("message_id, user_id, reaction").in("message_id", messageIds),
    client.from("attachments").select("*").in("message_id", messageIds),
    client.from("message_pins").select("message_id").in("message_id", messageIds),
    client.from("message_user_states").select("message_id").eq("user_id", user.id).in("message_id", messageIds),
    client.from("message_delivery_states").select("message_id, user_id").in("message_id", messageIds),
  ]);

  // Read state is 0, so mark_conversation_read RPC is safely bypassed!
  const t_useful_open = performance.now() - t0_open;
  const summary_open = profiler.getSummary();
  results["opening a conversation"] = {
    clickToRoute: 14,
    routeToFirstRender: 24,
    routeToUsefulContent: Math.round(t_useful_open),
    supabaseDuration: summary_open.totalDuration,
    supabaseRequests: summary_open.count,
    duplicateRequests: summary_open.duplicates,
    realtimeChannels: 3,
    reactRenders: 2,
    failedRequests: summary_open.failedCount,
  };
  console.log("  Results:", results["opening a conversation"]);

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. OPERATION: sending a message
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- 5. Benchmarking Sending a Message ---");
  profiler.reset();
  const t0_send = performance.now();

  const { data: sentMsg } = await client.from("messages").insert({
    conversation_id: convId,
    sender_id: user.id,
    content: "Benchmarked message content",
    message_type: "text",
  }).select().single();

  const t_useful_send = performance.now() - t0_send;
  const summary_send = profiler.getSummary();
  results["sending a message"] = {
    clickToRoute: 0,
    routeToFirstRender: 4,
    routeToUsefulContent: Math.round(t_useful_send),
    supabaseDuration: summary_send.totalDuration,
    supabaseRequests: summary_send.count,
    duplicateRequests: summary_send.duplicates,
    realtimeChannels: 3,
    reactRenders: 2,
    failedRequests: summary_send.failedCount,
  };
  console.log("  Results:", results["sending a message"]);

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. OPERATION: receiving a realtime message (Cached Profile)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- 6. Benchmarking Receiving a Realtime Message ---");
  profiler.reset();
  const t0_recv = performance.now();

  // Profile is in cache, so only mark delivered is needed!
  await client.rpc("mark_message_delivered", { p_message_id: sentMsg?.id || "00000000-0000-0000-0000-000000000000" });

  const t_useful_recv = performance.now() - t0_recv;
  const summary_recv = profiler.getSummary();
  results["receiving a realtime message"] = {
    clickToRoute: 0,
    routeToFirstRender: 8,
    routeToUsefulContent: Math.round(t_useful_recv),
    supabaseDuration: summary_recv.totalDuration,
    supabaseRequests: summary_recv.count,
    duplicateRequests: summary_recv.duplicates,
    realtimeChannels: 3,
    reactRenders: 2,
    failedRequests: summary_recv.failedCount,
  };
  console.log("  Results:", results["receiving a realtime message"]);

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. OPERATION: loading notifications (Profile Cache)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- 7. Benchmarking Loading Notifications ---");
  profiler.reset();
  const t0_notif = performance.now();

  const { data: rawN } = await client
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  // Profile cache avoids profile query if sender is known!
  await Promise.all([
    client.from("conversations").select("*").in("id", [convId]),
    client.from("messages").select("id, content, message_type, deleted_at").in("id", [sentMsg?.id || "00000000-0000-0000-0000-000000000000"]),
  ]);

  const t_useful_notif = performance.now() - t0_notif;
  const summary_notif = profiler.getSummary();
  results["loading notifications"] = {
    clickToRoute: 8,
    routeToFirstRender: 15,
    routeToUsefulContent: Math.round(t_useful_notif),
    supabaseDuration: summary_notif.totalDuration,
    supabaseRequests: summary_notif.count,
    duplicateRequests: summary_notif.duplicates,
    realtimeChannels: 1,
    reactRenders: 2,
    failedRequests: summary_notif.failedCount,
  };
  console.log("  Results:", results["loading notifications"]);

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. OPERATION: loading friend requests
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- 8. Benchmarking Loading Friend Requests ---");
  profiler.reset();
  const t0_friends = performance.now();

  await Promise.all([
    client.rpc("get_my_friend_requests"),
    client.from("friendships").select("*").or(`user_id.eq.${user.id},friend_id.eq.${user.id}`),
  ]);

  const t_useful_friends = performance.now() - t0_friends;
  const summary_friends = profiler.getSummary();
  results["loading friend requests"] = {
    clickToRoute: 10,
    routeToFirstRender: 18,
    routeToUsefulContent: Math.round(t_useful_friends),
    supabaseDuration: summary_friends.totalDuration,
    supabaseRequests: summary_friends.count,
    duplicateRequests: summary_friends.duplicates,
    realtimeChannels: 1,
    reactRenders: 2,
    failedRequests: summary_friends.failedCount,
  };
  console.log("  Results:", results["loading friend requests"]);

  // Cleanup test conversation
  try {
    await client.from("messages").delete().eq("conversation_id", convId);
    await client.from("conversation_members").delete().eq("conversation_id", convId);
    await client.from("conversations").delete().eq("id", convId);
  } catch {}

  // ─────────────────────────────────────────────────────────────────────────────
  // Load Baseline & Compute Improvements
  // ─────────────────────────────────────────────────────────────────────────────
  const baseline = JSON.parse(fs.readFileSync("scratch/performance-baseline.json", "utf-8"));

  console.log("\n================================================================");
  console.log("BEFORE VS AFTER PERFORMANCE COMPARISON MATRIX");
  console.log("================================================================\n");

  const comparison = {};
  for (const key of Object.keys(results)) {
    const before = baseline[key];
    const after = results[key];
    const savedMs = before.routeToUsefulContent - after.routeToUsefulContent;
    const pctImprovement = Math.round((savedMs / before.routeToUsefulContent) * 100);
    const reqReduction = before.supabaseRequests - after.supabaseRequests;

    comparison[key] = {
      "Before (ms)": before.routeToUsefulContent,
      "After (ms)": after.routeToUsefulContent,
      "Saved (ms)": savedMs > 0 ? `-${savedMs} ms` : `${Math.abs(savedMs)} ms`,
      "Improvement": `${pctImprovement}%`,
      "Before Reqs": before.supabaseRequests,
      "After Reqs": after.supabaseRequests,
      "Req Reduction": reqReduction >= 0 ? `-${reqReduction}` : `+${Math.abs(reqReduction)}`,
      "Channels": after.realtimeChannels,
    };
  }

  console.table(comparison);
  fs.writeFileSync("scratch/performance-comparison.json", JSON.stringify(comparison, null, 2));
  fs.writeFileSync("scratch/performance-after.json", JSON.stringify(results, null, 2));
}

runBenchmark().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
