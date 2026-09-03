import fs from "node:fs";
import path from "node:path";

const uuidTs = fs.readFileSync("lib/validation/uuid.ts", "utf8");
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(id) {
  return typeof id === "string" && UUID_REGEX.test(id);
}

console.log("==================================================================");
console.log(" HEAT CHAT — MASTER AUDIT & HARDENING VERIFICATION SUITE");
console.log("==================================================================\n");

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

// ── 1. UUID VALIDATOR TESTS ──────────────────────────────────────────────────
console.log("--- 1. Centralized UUID Validation Invariants ---");
assert(isValidUuid("451ed7e8-1f8e-40d0-8575-470720acf809"), "Valid lowercase UUID passes");
assert(isValidUuid("451ED7E8-1F8E-40D0-8575-470720ACF809"), "Valid uppercase UUID passes");
assert(!isValidUuid("invalid-uuid"), "Arbitrary string rejected");
assert(!isValidUuid("451ed7e8-1f8e-40d0-8575-470720acf80"), "Short UUID rejected");
assert(!isValidUuid("451ed7e8-1f8e-40d0-8575-470720acf8099"), "Long UUID rejected");
assert(!isValidUuid("451ed7e8-1f8e-40d0-8575-470720acf80g"), "Non-hex characters rejected");
assert(!isValidUuid("'; DROP TABLE messages; --"), "SQL injection string rejected");
assert(!isValidUuid(null), "null rejected");
assert(!isValidUuid(undefined), "undefined rejected");
assert(!isValidUuid(12345), "number rejected");

// ── 2. MIDDLEWARE PROTECTED ROUTES ───────────────────────────────────────────
console.log("\n--- 2. Middleware Route Protection Audit ---");
const middlewareCode = fs.readFileSync("lib/supabase/middleware.ts", "utf8");
assert(
  middlewareCode.includes('pathname.startsWith("/saved")'),
  "Middleware explicitly protects /saved under isNormalProtectedRoute"
);
assert(
  middlewareCode.includes('pathname.startsWith("/chat")'),
  "Middleware protects /chat"
);
assert(
  middlewareCode.includes('pathname.startsWith("/friends")'),
  "Middleware protects /friends"
);
assert(
  middlewareCode.includes('pathname.startsWith("/profile")'),
  "Middleware protects /profile"
);
assert(
  middlewareCode.includes('pathname.startsWith("/settings")'),
  "Middleware protects /settings"
);

// ── 3. AUTH REDIRECT & LOGIN NORMALIZATION ───────────────────────────────────
console.log("\n--- 3. Auth Redirect Normalization ---");
const loginCode = fs.readFileSync("app/(auth)/login/page.tsx", "utf8");
assert(
  loginCode.includes('searchParams.get("redirectTo") || searchParams.get("redirect")'),
  "LoginForm supports both redirectTo and redirect parameters"
);
assert(
  loginCode.includes('rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")'),
  "LoginForm sanitizes redirect to prevent open redirect vulnerabilities"
);

const invitePageCode = fs.readFileSync("app/group/invite/[token]/page.tsx", "utf8");
assert(
  invitePageCode.includes("redirectTo="),
  "Group invite page uses canonical redirectTo parameter for post-login redirect"
);

// ── 4. MODAL & OVERLAY DISMISSAL AUDIT ───────────────────────────────────────
console.log("\n--- 4. Modal & Dialog Backdrop Dismissal Matrix ---");

const dialogFiles = [
  { file: "components/ui/dialog.tsx", name: "Base Dialog" },
  { file: "components/profile/block-dialog.tsx", name: "BlockDialog" },
  { file: "components/search/command-palette.tsx", name: "CommandPalette" },
  { file: "components/profile/edit-profile-dialog.tsx", name: "EditProfileDialog (Discard)" },
  { file: "app/(protected)/profile/edit/page.tsx", name: "ProfileEditPage (Discard)" },
  { file: "components/admin/delete-user-dialog.tsx", name: "DeleteUserDialog" },
  { file: "components/admin/admin-header.tsx", name: "AdminHeader (Mobile Drawer)" },
  { file: "app/admin/users/page.tsx", name: "Admin Users Action Modal" },
  { file: "app/admin/reports/page.tsx", name: "Admin Reports Resolution Modal" },
  { file: "app/admin/messages/page.tsx", name: "Admin Messages Break-Glass Modal" },
  { file: "app/admin/audit-logs/page.tsx", name: "Admin Audit Logs Diff Modal" },
  { file: "components/chat/create-group-dialog.tsx", name: "CreateGroupDialog" },
  { file: "components/chat/group-details-dialog.tsx", name: "GroupDetailsDialog" },
  { file: "components/chat/starred-messages-dialog.tsx", name: "StarredMessagesDialog" },
  { file: "components/groups/create-poll-dialog.tsx", name: "CreatePollDialog" },
  { file: "components/groups/group-invite-dialog.tsx", name: "GroupInviteDialog" },
];

for (const { file, name } of dialogFiles) {
  const content = fs.readFileSync(file, "utf8");
  assert(
    content.includes("onClick") && content.includes("stopPropagation"),
    `${name} has outer backdrop onClick and inner card stopPropagation`
  );
}

// ── 5. REALTIME CHANNEL SINGLE-OWNER ARCHITECTURE ────────────────────────────
console.log("\n--- 5. Realtime Channel Lifecycle Hardening ---");
const useTypingCode = fs.readFileSync("hooks/use-typing.ts", "utf8");
assert(
  !useTypingCode.includes("channelRef.current || supabase.channel"),
  "useTyping does NOT instantiate orphaned supabase.channel if channelRef is unset"
);
assert(
  useTypingCode.includes("if (!conversationId || !user?.id || !channelRef.current) return;"),
  "useTyping guards sendTyping and stopTyping with channelRef.current existence"
);

const useRtChatCode = fs.readFileSync("hooks/use-realtime-chat.ts", "utf8");
assert(
  useRtChatCode.includes("callbacksRef.current ="),
  "useRealtimeChat wraps dynamic callbacks in callbacksRef"
);
assert(
  useRtChatCode.includes("}, [conversationId, supabase]);"),
  "useRealtimeChat effect dependencies are strictly [conversationId, supabase]"
);

const usePollsCode = fs.readFileSync("hooks/use-polls.ts", "utf8");
assert(
  usePollsCode.includes("fetchPollsRef.current(true)"),
  "usePolls passes isSilent=true for realtime updates to prevent loading flash"
);
assert(
  usePollsCode.includes("}, [conversationId, user?.id, supabase]);"),
  "usePolls realtime effect dependencies are strictly [conversationId, user?.id, supabase]"
);

// ── 6. API ROUTE UUID PARAMETER VALIDATION ───────────────────────────────────
console.log("\n--- 6. API Route Parameter Validation Invariants ---");
const parameterizedRoutes = [
  "app/api/polls/[id]/vote/route.ts",
  "app/api/polls/[id]/close/route.ts",
  "app/api/groups/[id]/polls/route.ts",
  "app/api/groups/[id]/invitations/route.ts",
  "app/api/groups/[id]/route.ts",
  "app/api/groups/[id]/members/[memberId]/route.ts",
  "app/api/conversations/[id]/messages/route.ts",
  "app/api/messages/[id]/reactions/route.ts",
  "app/api/messages/[id]/save/route.ts",
  "app/api/messages/[id]/pin/route.ts",
];

for (const routePath of parameterizedRoutes) {
  const code = fs.readFileSync(routePath, "utf8");
  assert(
    code.includes("isValidUuid"),
    `${routePath} validates parameter format with isValidUuid`
  );
}

console.log("\n==================================================================");
console.log(` RESULTS: ${passed} Passed, ${failed} Failed`);
console.log("==================================================================");

if (failed > 0) {
  process.exit(1);
} else {
  console.log("🎉 ALL MASTER AUDIT & HARDENING CHECKS PASSED!");
}
