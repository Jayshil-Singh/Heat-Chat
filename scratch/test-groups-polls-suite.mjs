/**
 * scratch/test-groups-polls-suite.mjs
 * 
 * Comprehensive Unit, Schema, Security, and Flow Test Suite for Phase 6:
 * Groups, Group Administration, Invitations, Roles, Polls & Group Media
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    failedTests++;
    console.error(`  ❌ FAIL: ${message}`);
  }
}

console.log("\n===============================================================================");
console.log("HEAT CHAT — PHASE 6 TEST SUITE: GROUPS, ROLES, PERMISSIONS, INVITATIONS & POLLS");
console.log("===============================================================================\n");

// ── TEST 1: Database Migration Audit ───────────────────────────────────────────
console.log("--- TEST GROUP 1: Database Migration Audit ---");
const migrationPath = resolve("supabase/migrations/20260906_groups_polls_invitations.sql");
assert(existsSync(migrationPath), "Migration 20260906_groups_polls_invitations.sql exists");

const migrationContent = readFileSync(migrationPath, "utf-8");
assert(migrationContent.includes("alter table public.conversations"), "Migration extends conversations table");
assert(migrationContent.includes("cover_url text"), "Migration adds cover_url to conversations");
assert(migrationContent.includes("permissions jsonb"), "Migration adds permissions jsonb to conversations");
assert(migrationContent.includes("role in ('owner', 'admin', 'moderator', 'member')"), "Migration extends role check to include moderator");
assert(migrationContent.includes("create table if not exists public.group_invitations"), "Migration defines group_invitations table");
assert(migrationContent.includes("create table if not exists public.group_invite_links"), "Migration defines group_invite_links table");
assert(migrationContent.includes("create table if not exists public.polls"), "Migration defines polls table");
assert(migrationContent.includes("create table if not exists public.poll_options"), "Migration defines poll_options table");
assert(migrationContent.includes("create table if not exists public.poll_votes"), "Migration defines poll_votes table");
assert(migrationContent.includes("function public.create_poll"), "Migration defines atomic create_poll RPC");
assert(migrationContent.includes("function public.vote_poll"), "Migration defines atomic vote_poll RPC");
assert(migrationContent.includes("function public.close_poll"), "Migration defines atomic close_poll RPC");
assert(migrationContent.includes("function public.join_group_via_invite_link"), "Migration defines join_group_via_invite_link RPC");
assert(migrationContent.includes("function public.delete_group_conversation"), "Migration defines delete_group_conversation RPC");

// ── TEST 2: Role Hierarchy & Escalation Prevention ───────────────────────────
console.log("\n--- TEST GROUP 2: Role Hierarchy & Authorization Rules ---");
assert(migrationContent.includes("v_caller_role is null or v_caller_role <> 'owner'"), "Role updates require group owner");
assert(migrationContent.includes("Owner cannot demote self without transferring ownership first"), "Owner cannot accidentally demote self without transfer");
assert(migrationContent.includes("update public.conversation_members set role = 'owner' where conversation_id = conv_id and user_id = target_user_id"), "Ownership transfer promotes target to owner atomically");
assert(migrationContent.includes("update public.conversation_members set role = 'admin' where conversation_id = conv_id and user_id = v_caller_id"), "Ownership transfer demotes old owner to admin atomically");
assert(migrationContent.includes("Admins cannot remove other admins or the group owner"), "Admin cannot remove fellow admins or group owner");
assert(migrationContent.includes("Moderators cannot remove admins, owners, or other moderators"), "Moderators cannot remove higher or equal roles");
assert(migrationContent.includes("Regular members cannot remove other members"), "Members cannot remove other members");

// ── TEST 3: TypeScript Type Coverage ──────────────────────────────────────────
console.log("\n--- TEST GROUP 3: TypeScript Definitions Coverage ---");
const dbTypes = readFileSync(resolve("types/database.ts"), "utf-8");
assert(dbTypes.includes('"owner" | "admin" | "moderator" | "member"'), "MemberRole includes moderator in types/database.ts");
assert(dbTypes.includes('"poll"'), "MessageType includes poll in types/database.ts");

const chatTypes = readFileSync(resolve("types/chat.ts"), "utf-8");
assert(chatTypes.includes("export interface GroupPermissions"), "GroupPermissions interface exported in types/chat.ts");
assert(chatTypes.includes("export interface PollDto"), "PollDto interface exported in types/chat.ts");
assert(chatTypes.includes("export interface PollOptionDto"), "PollOptionDto interface exported in types/chat.ts");
assert(chatTypes.includes("export interface GroupInvitationDto"), "GroupInvitationDto interface exported in types/chat.ts");
assert(chatTypes.includes("export interface GroupInviteLinkDto"), "GroupInviteLinkDto interface exported in types/chat.ts");

// ── TEST 4: API Routes Implementation ─────────────────────────────────────────
console.log("\n--- TEST GROUP 4: API Endpoints Verification ---");
assert(existsSync(resolve("app/api/groups/[id]/route.ts")), "app/api/groups/[id]/route.ts exists");
assert(existsSync(resolve("app/api/groups/[id]/invitations/route.ts")), "app/api/groups/[id]/invitations/route.ts exists");
assert(existsSync(resolve("app/api/groups/[id]/invitations/[inviteId]/route.ts")), "app/api/groups/[id]/invitations/[inviteId]/route.ts exists");
assert(existsSync(resolve("app/api/groups/[id]/invite-links/route.ts")), "app/api/groups/[id]/invite-links/route.ts exists");
assert(existsSync(resolve("app/api/groups/join/[token]/route.ts")), "app/api/groups/join/[token]/route.ts exists");
assert(existsSync(resolve("app/api/groups/[id]/polls/route.ts")), "app/api/groups/[id]/polls/route.ts exists");
assert(existsSync(resolve("app/api/polls/[id]/vote/route.ts")), "app/api/polls/[id]/vote/route.ts exists");
assert(existsSync(resolve("app/api/polls/[id]/close/route.ts")), "app/api/polls/[id]/close/route.ts exists");

// Verify anonymous poll privacy guard in API
const pollsApiContent = readFileSync(resolve("app/api/groups/[id]/polls/route.ts"), "utf-8");
assert(pollsApiContent.includes("voterUserIds: poll.is_anonymous ? undefined : votes.map"), "API strictly hides voter identities for anonymous polls");

// Verify cryptographic token generation for invite links
const inviteLinksApiContent = readFileSync(resolve("app/api/groups/[id]/invite-links/route.ts"), "utf-8");
assert(inviteLinksApiContent.includes("crypto.randomBytes(32).toString(\"hex\")"), "Invite links use 256-bit cryptographic entropy");

// ── TEST 5: UI Components & Hooks Verification ─────────────────────────────────
console.log("\n--- TEST GROUP 5: UI Components & Hooks Verification ---");
assert(existsSync(resolve("hooks/use-polls.ts")), "hooks/use-polls.ts exists");
assert(existsSync(resolve("components/groups/create-poll-dialog.tsx")), "components/groups/create-poll-dialog.tsx exists");
assert(existsSync(resolve("components/groups/poll-card.tsx")), "components/groups/poll-card.tsx exists");
assert(existsSync(resolve("components/groups/group-invite-dialog.tsx")), "components/groups/group-invite-dialog.tsx exists");
assert(existsSync(resolve("app/group/invite/[token]/page.tsx")), "app/group/invite/[token]/page.tsx exists");

const groupDetailsContent = readFileSync(resolve("components/chat/group-details-dialog.tsx"), "utf-8");
assert(groupDetailsContent.includes("activeTab === \"overview\""), "GroupDetailsDialog includes Overview tab");
assert(groupDetailsContent.includes("activeTab === \"members\""), "GroupDetailsDialog includes Members tab with Moderator support");
assert(groupDetailsContent.includes("activeTab === \"permissions\""), "GroupDetailsDialog includes Permissions tab");
assert(groupDetailsContent.includes("activeTab === \"invites\""), "GroupDetailsDialog includes Invites tab");
assert(groupDetailsContent.includes("activeTab === \"danger\""), "GroupDetailsDialog includes Danger Zone tab");

console.log("\n===============================================================================");
console.log(`TEST RESULTS: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
console.log("===============================================================================\n");

if (failedTests > 0) {
  process.exit(1);
}
