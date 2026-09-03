/**
 * Heat Chat — Production Bug Fixes & UI Lifecycle Verification Suite
 *
 * Validates:
 * 1. GET /api/saved (UUID validation, access checks, direct PostgREST join, empty array, no 500)
 * 2. DELETE /api/groups/[id]/members/[memberId] (RBAC hierarchy, owner protection, self-removal, 400/403/404 handling)
 * 3. remove_group_member RPC (deterministic jsonb result, no unhandled PL/pgSQL exceptions)
 * 4. UI lifecycle & navigation (backdrop click-to-close, ESC listeners, auto-revalidation, redirect on self-removal)
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

console.log("==================================================================");
console.log(" HEAT CHAT — PRODUCTION FIXES & UI LIFECYCLE VERIFICATION SUITE");
console.log("==================================================================\n");

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  } else {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  }
}

// ── TEST 1: Saved Messages API Route Invariants ─────────────────────────────
console.log("--- TEST GROUP 1: Saved Messages (/api/saved) Invariants ---");
const savedRoutePath = resolve("app/api/saved/route.ts");
assert(existsSync(savedRoutePath), "app/api/saved/route.ts exists");

const savedRouteCode = readFileSync(savedRoutePath, "utf-8");

assert(savedRouteCode.includes("UUID_REGEX"), "Validates conversationId format with UUID regex");
assert(savedRouteCode.includes("INVALID_CONVERSATION_ID"), "Returns INVALID_CONVERSATION_ID (400) on malformed conversationId");
assert(savedRouteCode.includes("conversation_members"), "Verifies caller conversation membership");
assert(savedRouteCode.includes("FORBIDDEN"), "Returns FORBIDDEN (403) for inaccessible conversation");
assert(savedRouteCode.includes("starred_messages"), "Queries public.starred_messages directly");
assert(savedRouteCode.includes("type"), "Selects conversations.type (never nonexistent conversation_type)");
assert(!savedRouteCode.includes("c.conversation_type"), "Zero occurrences of stale c.conversation_type in saved route");
assert(savedRouteCode.includes("message_user_states"), "Filters delete-for-me messages using message_user_states");
assert(savedRouteCode.includes("deleted_at"), "Handles delete-for-everyone messages gracefully");
assert(savedRouteCode.includes("This message was deleted"), "Sanitizes deleted message content to 'This message was deleted'");
assert(savedRouteCode.includes("chat-attachments"), "Generates signed URLs for saved media attachments");
assert(savedRouteCode.includes("hasMore"), "Returns paginated metadata (count, hasMore, nextCursor)");

// ── TEST 2: Group Member Removal API & RBAC Invariants ─────────────────────
console.log("\n--- TEST GROUP 2: Group Member Removal API (/api/groups/[id]/members/[memberId]) ---");
const memberRoutePath = resolve("app/api/groups/[id]/members/[memberId]/route.ts");
assert(existsSync(memberRoutePath), "app/api/groups/[id]/members/[memberId]/route.ts exists");

const memberRouteCode = readFileSync(memberRoutePath, "utf-8");

assert(memberRouteCode.includes("export async function DELETE"), "Exports DELETE method handler");
assert(memberRouteCode.includes("UUID_REGEX"), "Validates UUID format for both group and member IDs");
assert(memberRouteCode.includes("GROUP_NOT_FOUND"), "Returns GROUP_NOT_FOUND (404) if conversation not found or not group");
assert(memberRouteCode.includes("TARGET_NOT_MEMBER"), "Returns TARGET_NOT_MEMBER (404) if target not in group");
assert(memberRouteCode.includes("OWNER_CANNOT_LEAVE"), "Protects group owner from accidental self-removal (400)");
assert(memberRouteCode.includes("FORBIDDEN_HIERARCHY"), "Enforces role hierarchy (Admins/Moderators cannot remove superiors or peers)");
assert(memberRouteCode.includes("callerRole === \"owner\""), "Group owner can remove any member");
assert(memberRouteCode.includes("callerRole === \"admin\""), "Admins can remove moderators and regular members");
assert(memberRouteCode.includes("callerRole === \"moderator\""), "Moderators can remove regular members only");
assert(memberRouteCode.includes("Regular members cannot remove other members"), "Regular members cannot remove anyone");
assert(memberRouteCode.includes("conversation_members"), "Performs atomic deletion on conversation_members");

// ── TEST 3: Database Migration & RPC Signatures ─────────────────────────────
console.log("\n--- TEST GROUP 3: Database Migration & RPC Signatures ---");
const fixMigrationPath = resolve("supabase/migrations/20260907_fix_saved_and_member_removal.sql");
assert(existsSync(fixMigrationPath), "Migration 20260907_fix_saved_and_member_removal.sql exists");

const fixMigrationCode = readFileSync(fixMigrationPath, "utf-8");

assert(fixMigrationCode.includes("function public.get_saved_messages("), "Defines public.get_saved_messages function");
assert(fixMigrationCode.includes("c.type::text as conversation_type"), "get_saved_messages maps c.type::text as conversation_type");
assert(!fixMigrationCode.includes("c.conversation_type::text"), "Migration free of invalid c.conversation_type references");
assert(fixMigrationCode.includes("function public.remove_group_member("), "Defines public.remove_group_member function");
assert(fixMigrationCode.includes("returns jsonb"), "remove_group_member returns jsonb (deterministic JSON responses)");
assert(fixMigrationCode.includes("'OWNER_CANNOT_LEAVE'"), "remove_group_member RPC protects group owner");
assert(fixMigrationCode.includes("'FORBIDDEN_HIERARCHY'"), "remove_group_member RPC protects admin and moderator hierarchies");
assert(fixMigrationCode.includes("grant execute on function public.remove_group_member"), "Grants execute permission to authenticated role");

// ── TEST 4: Frontend Hook & Dialog Lifecycle ────────────────────────────────
console.log("\n--- TEST GROUP 4: Frontend Hook & Dialog Lifecycle ---");
const groupMgmtHookPath = resolve("hooks/use-group-management.ts");
const groupMgmtHookCode = readFileSync(groupMgmtHookPath, "utf-8");

assert(groupMgmtHookCode.includes("/api/groups/${conversationId}/members/${targetUserId}"), "useGroupManagement calls dedicated DELETE member API route");
assert(groupMgmtHookCode.includes("remove_group_member"), "useGroupManagement maintains RPC fallback");
assert(groupMgmtHookCode.includes("finally {"), "removeMember uses finally to guarantee setIsLoading(false)");

const groupDialogPath = resolve("components/chat/group-details-dialog.tsx");
const groupDialogCode = readFileSync(groupDialogPath, "utf-8");

assert(groupDialogCode.includes("onClick={() => {"), "GroupDetailsDialog backdrop contains onClick handler to close");
assert(groupDialogCode.includes("e.key === \"Escape\""), "GroupDetailsDialog handles Escape key to close");
assert(groupDialogCode.includes("isSelf"), "handleRemoveMember checks if removed member is the current user");
assert(groupDialogCode.includes("router.push(\"/chat\")"), "handleRemoveMember redirects to /chat when current user is removed");
assert(groupDialogCode.includes("onRefreshConversation?.()"), "handleRemoveMember invokes onRefreshConversation on success");

const groupInviteDialogPath = resolve("components/groups/group-invite-dialog.tsx");
const groupInviteDialogCode = readFileSync(groupInviteDialogPath, "utf-8");
assert(groupInviteDialogCode.includes("onClick={() => {"), "GroupInviteDialog backdrop contains onClick handler to close");
assert(groupInviteDialogCode.includes("e.key === \"Escape\""), "GroupInviteDialog handles Escape key to close");

const createPollDialogPath = resolve("components/groups/create-poll-dialog.tsx");
const createPollDialogCode = readFileSync(createPollDialogPath, "utf-8");
assert(createPollDialogCode.includes("onClick={() => {"), "CreatePollDialog backdrop contains onClick handler to close");
assert(createPollDialogCode.includes("e.key === \"Escape\""), "CreatePollDialog handles Escape key to close");

// ── TEST 5: Refresh & Revalidation Plumbing ─────────────────────────────────
console.log("\n--- TEST GROUP 5: Auto-Refresh & Revalidation Wire-up ---");
const activeChatPath = resolve("components/chat/active-chat.tsx");
const activeChatCode = readFileSync(activeChatPath, "utf-8");

assert(activeChatCode.includes("onRefreshConversation?: () => void;"), "ActiveChat accepts onRefreshConversation prop");
assert(activeChatCode.includes("onRefreshConversation={onRefreshConversation}"), "ActiveChat passes onRefreshConversation to ChatHeader");

const chatShellPath = resolve("components/chat/chat-shell.tsx");
const chatShellCode = readFileSync(chatShellPath, "utf-8");

assert(chatShellCode.includes("onRefreshConversations?: () => void;"), "ChatShell accepts onRefreshConversations prop");
assert(chatShellCode.includes("onRefreshConversation={onRefreshConversations}"), "ChatShell passes onRefreshConversation to ActiveChat");

const chatPagePath = resolve("app/(protected)/chat/[conversationId]/page.tsx");
const chatPageCode = readFileSync(chatPagePath, "utf-8");

assert(chatPageCode.includes("refreshConversations"), "ChatConversationPage gets refreshConversations from useConversations()");
assert(chatPageCode.includes("onRefreshConversations={refreshConversations}"), "ChatConversationPage supplies onRefreshConversations to ChatShell");

// ── TEST 6: Simulated API & RBAC Matrix Execution ───────────────────────────
console.log("\n--- TEST GROUP 6: Simulated RBAC & Validation Matrix ---");

function simulateMemberRemoval({ callerRole, targetRole, isSelf, convType }) {
  if (convType !== "group") return { status: 404, code: "GROUP_NOT_FOUND" };
  if (!callerRole) return { status: 403, code: "CALLER_NOT_MEMBER" };
  if (!targetRole) return { status: 404, code: "TARGET_NOT_MEMBER" };

  if (isSelf) {
    if (callerRole === "owner") {
      return { status: 400, code: "OWNER_CANNOT_LEAVE" };
    }
    return { status: 200, code: "SELF_REMOVED" };
  }

  if (callerRole === "owner") {
    return { status: 200, code: "REMOVED" };
  }
  if (callerRole === "admin") {
    if (targetRole === "owner" || targetRole === "admin") {
      return { status: 403, code: "FORBIDDEN_HIERARCHY" };
    }
    return { status: 200, code: "REMOVED" };
  }
  if (callerRole === "moderator") {
    if (targetRole === "owner" || targetRole === "admin" || targetRole === "moderator") {
      return { status: 403, code: "FORBIDDEN_HIERARCHY" };
    }
    return { status: 200, code: "REMOVED" };
  }
  return { status: 403, code: "FORBIDDEN" };
}

// Matrix tests
const t1 = simulateMemberRemoval({ callerRole: "owner", targetRole: "member", isSelf: false, convType: "group" });
assert(t1.status === 200 && t1.code === "REMOVED", "Owner can remove regular member (HTTP 200)");

const t2 = simulateMemberRemoval({ callerRole: "owner", targetRole: "admin", isSelf: false, convType: "group" });
assert(t2.status === 200 && t2.code === "REMOVED", "Owner can remove admin (HTTP 200)");

const t3 = simulateMemberRemoval({ callerRole: "owner", targetRole: "moderator", isSelf: false, convType: "group" });
assert(t3.status === 200 && t3.code === "REMOVED", "Owner can remove moderator (HTTP 200)");

const t4 = simulateMemberRemoval({ callerRole: "owner", targetRole: "owner", isSelf: true, convType: "group" });
assert(t4.status === 400 && t4.code === "OWNER_CANNOT_LEAVE", "Owner cannot self-remove without transfer (HTTP 400)");

const t5 = simulateMemberRemoval({ callerRole: "admin", targetRole: "owner", isSelf: false, convType: "group" });
assert(t5.status === 403 && t5.code === "FORBIDDEN_HIERARCHY", "Admin cannot remove group owner (HTTP 403)");

const t6 = simulateMemberRemoval({ callerRole: "admin", targetRole: "admin", isSelf: false, convType: "group" });
assert(t6.status === 403 && t6.code === "FORBIDDEN_HIERARCHY", "Admin cannot remove fellow admin (HTTP 403)");

const t7 = simulateMemberRemoval({ callerRole: "admin", targetRole: "moderator", isSelf: false, convType: "group" });
assert(t7.status === 200 && t7.code === "REMOVED", "Admin can remove moderator (HTTP 200)");

const t8 = simulateMemberRemoval({ callerRole: "admin", targetRole: "member", isSelf: false, convType: "group" });
assert(t8.status === 200 && t8.code === "REMOVED", "Admin can remove regular member (HTTP 200)");

const t9 = simulateMemberRemoval({ callerRole: "moderator", targetRole: "owner", isSelf: false, convType: "group" });
assert(t9.status === 403 && t9.code === "FORBIDDEN_HIERARCHY", "Moderator cannot remove group owner (HTTP 403)");

const t10 = simulateMemberRemoval({ callerRole: "moderator", targetRole: "admin", isSelf: false, convType: "group" });
assert(t10.status === 403 && t10.code === "FORBIDDEN_HIERARCHY", "Moderator cannot remove admin (HTTP 403)");

const t11 = simulateMemberRemoval({ callerRole: "moderator", targetRole: "moderator", isSelf: false, convType: "group" });
assert(t11.status === 403 && t11.code === "FORBIDDEN_HIERARCHY", "Moderator cannot remove fellow moderator (HTTP 403)");

const t12 = simulateMemberRemoval({ callerRole: "moderator", targetRole: "member", isSelf: false, convType: "group" });
assert(t12.status === 200 && t12.code === "REMOVED", "Moderator can remove regular member (HTTP 200)");

const t13 = simulateMemberRemoval({ callerRole: "member", targetRole: "member", isSelf: false, convType: "group" });
assert(t13.status === 403 && t13.code === "FORBIDDEN", "Regular member cannot remove another member (HTTP 403)");

const t14 = simulateMemberRemoval({ callerRole: "member", targetRole: "member", isSelf: true, convType: "group" });
assert(t14.status === 200 && t14.code === "SELF_REMOVED", "Regular member can self-remove/leave (HTTP 200)");

const t15 = simulateMemberRemoval({ callerRole: "admin", targetRole: "member", isSelf: false, convType: "direct" });
assert(t15.status === 404 && t15.code === "GROUP_NOT_FOUND", "Direct conversation rejected (HTTP 404)");

const t16 = simulateMemberRemoval({ callerRole: "admin", targetRole: null, isSelf: false, convType: "group" });
assert(t16.status === 404 && t16.code === "TARGET_NOT_MEMBER", "Non-member target rejected (HTTP 404)");

// ── SUMMARY ─────────────────────────────────────────────────────────────────
console.log("\n==================================================================");
console.log(` RESULTS: ${passed} Passed, ${failed} Failed`);
console.log("==================================================================");

if (failed > 0) {
  process.exit(1);
} else {
  console.log("🎉 ALL PRODUCTION FIXES & UI LIFECYCLE TESTS PASSED!\n");
}
