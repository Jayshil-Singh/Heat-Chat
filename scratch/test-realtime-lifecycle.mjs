/**
 * Heat Chat — Realtime Channel Lifecycle Test Suite
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

let passCount = 0;
let failCount = 0;

function assert(name, condition, detail) {
  if (condition) {
    console.log(`  \u2705 PASS: ${name}`);
    passCount++;
  } else {
    console.error(`  \u274c FAIL: ${name}${detail ? " \u2014 " + detail : ""}`);
    failCount++;
  }
}

function readFile(path) {
  try { return readFileSync(path, "utf8"); } catch { return ""; }
}

function getAllTsFiles(dir, results = []) {
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      try {
        const s = statSync(full);
        if (s.isDirectory() && !["node_modules", ".next", ".git"].includes(entry)) {
          getAllTsFiles(full, results);
        } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
          results.push(full);
        }
      } catch {}
    }
  } catch {}
  return results;
}

console.log("\n=======================================================");
console.log(" Heat Chat \u2014 Realtime Channel Lifecycle Test Suite");
console.log("=======================================================\n");

// 1. Notifications
console.log("--- 1. Notifications Channel Lifecycle ---");
const notifs = readFile("hooks/use-notifications.ts");
const hasSplitPattern = /channel\.on\([\s\S]{0,400}?\);\s*\n\s*channel\.on\(/.test(notifs);
assert("use-notifications: does NOT use split channel.on(); pattern", !hasSplitPattern);
const notifChannelBlock = notifs.slice(notifs.indexOf(".channel(channelName)"), notifs.indexOf("return () => {", notifs.indexOf(".channel(channelName)")));
assert("use-notifications: .subscribe() after all .on() registrations", notifChannelBlock.indexOf(".subscribe()") > notifChannelBlock.lastIndexOf('"postgres_changes"'));
assert("use-notifications: removeChannel in cleanup", notifs.includes("supabase.removeChannel(channel)"));

// 2. FriendsProvider single owner
console.log("\n--- 2. Friends Channel — Single Owner ---");
const friendsCtx = readFile("hooks/use-friends-context.tsx");
assert("FriendsProvider exists", friendsCtx.includes("export function FriendsProvider"));
assert("FriendsProvider: random suffix prevents channel name reuse", friendsCtx.includes("Math.random()") && friendsCtx.includes("friends-rt-"));
const friendsChannelBlock = friendsCtx.slice(friendsCtx.indexOf(".channel(channelName)"), friendsCtx.indexOf("return () => {", friendsCtx.indexOf(".channel(channelName)")));
assert("FriendsProvider: .on() chained before .subscribe()", friendsChannelBlock.indexOf(".subscribe()") > friendsChannelBlock.lastIndexOf('"postgres_changes"'));
assert("FriendsProvider: removeChannel in cleanup", friendsCtx.includes("supabase.removeChannel(channel)"));
assert("FriendsProvider: guards against undefined user.id", friendsCtx.includes("if (!user?.id) return;"));
assert("useFriendsContext consumer hook exported", friendsCtx.includes("export function useFriendsContext"));

// 3. No direct useFriends imports in consumers
console.log("\n--- 3. Consumer Migration ---");
const allFiles = getAllTsFiles(".");
const oldPattern = /from ["']@\/hooks\/use-friends["']/;
const violators = allFiles.filter(f => {
  if (f.replace(/\\/g, "/").includes("hooks/use-friends.ts")) return false;
  return oldPattern.test(readFile(f));
});
assert("No component imports from @/hooks/use-friends", violators.length === 0, violators.join(", "));

const consumers = [
  "components/search/command-palette.tsx",
  "components/chat/create-group-dialog.tsx",
  "components/chat/group-details-dialog.tsx",
  "app/(protected)/friends/page.tsx",
  "app/(protected)/friends/requests/page.tsx",
];
for (const f of consumers) {
  assert(`${f.split("/").pop()} uses useFriendsContext`, readFile(f).includes("useFriendsContext"));
}

// 4. Layout wraps provider
console.log("\n--- 4. FriendsProvider in Layout ---");
const layout = readFile("app/(protected)/layout.tsx");
assert("Protected layout imports FriendsProvider", layout.includes("FriendsProvider"));
assert("Protected layout wraps with <FriendsProvider>", layout.includes("<FriendsProvider>"));

// 5. Realtime chat
console.log("\n--- 5. useRealtimeChat Lifecycle ---");
const rtChat = readFile("hooks/use-realtime-chat.ts");
const rtSubIdx = rtChat.lastIndexOf(".subscribe(");
const rtLastOn = rtChat.lastIndexOf('"postgres_changes"');
assert("useRealtimeChat: .subscribe() after all .on()", rtSubIdx > rtLastOn);
assert("useRealtimeChat: removeChannel in cleanup", rtChat.includes("supabase.removeChannel(channel)"));

// 6. No module-level mutable channel vars
console.log("\n--- 6. No Module-Level Channel Variables ---");
const hookFiles = getAllTsFiles("hooks");
const mutablePat = /^let\s+\w*[Cc]hannel/m;
const hookViolators = hookFiles.filter(f => mutablePat.test(readFile(f)));
assert("No module-level mutable channel variable", hookViolators.length === 0, hookViolators.join(", "));

// 7. user.id guards
console.log("\n--- 7. user.id Guards ---");
const guarded = [
  "hooks/use-notifications.ts",
  "hooks/use-friends-context.tsx",
  "hooks/use-realtime-chat.ts",
  "hooks/use-conversations.ts",
];
for (const f of guarded) {
  const c = readFile(f);
  assert(`${f.split("/").pop()}: guards channel before user.id is ready`, c.includes("if (!user?.id)") || c.includes("if (!conversationId)"));
}

console.log("\n=======================================================");
console.log(` Results: ${passCount} Passed, ${failCount} Failed`);
console.log("=======================================================\n");
if (failCount > 0) process.exit(1);
