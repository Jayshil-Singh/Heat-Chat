import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const projectRoot = 'c:/Users/jayshil.singh/Desktop/ALL/Heat Chat';
const envPath = path.resolve(projectRoot, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

let supabaseUrl = '';
let supabaseKey = '';

for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (trimmed.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) {
    supabaseUrl = trimmed.slice('NEXT_PUBLIC_SUPABASE_URL='.length).trim();
  }
  if (trimmed.startsWith('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=')) {
    supabaseKey = trimmed.slice('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='.length).trim();
  }
}

const supabaseModulePath = path.resolve(projectRoot, 'node_modules/@supabase/supabase-js/dist/index.mjs');
const { createClient } = await import(pathToFileURL(supabaseModulePath).href);

async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✅ ${message}`);
}

async function runPhase7MasterVerification() {
  console.log('================================================================');
  console.log('HEAT CHAT — PHASE 7 GROUP CHATS MASTER VERIFICATION SUITE');
  console.log('================================================================\n');

  const anonClient = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchWithRetry }
  });

  // Check if RPC functions exist in remote DB
  console.log('--- 1. Checking Phase 7 RPC Functions in Remote Supabase DB ---');
  const dummyRes = await anonClient.rpc('create_group_conversation', {
    group_name: 'test',
    member_user_ids: []
  });

  if (dummyRes.error && dummyRes.error.message.includes('Could not find the function')) {
    console.error('❌ Phase 7 RPC functions not found in remote database.');
    console.error('👉 Please apply "supabase/migrations/20260828_group_chats.sql" in Supabase SQL Editor.');
    process.exit(2);
  }
  console.log('  ✅ create_group_conversation RPC exists in remote schema.');

  // ==========================================================================
  // SETUP 5 TEST USERS: User A (Owner), User B (Admin), User C (Member), User D (Friend), User E (Non-member)
  // ==========================================================================
  console.log('\n--- 2. Setting Up 5 Test Users (A, B, C, D, E) ---');
  const ts = Date.now().toString().slice(-6);
  const users = {};
  const tokens = {};
  const clients = {};

  const userConfigs = [
    { key: 'A', name: 'Alpha Owner', username: `p7_a_${ts}` },
    { key: 'B', name: 'Beta Admin', username: `p7_b_${ts}` },
    { key: 'C', name: 'Charlie Member', username: `p7_c_${ts}` },
    { key: 'D', name: 'Delta Friend', username: `p7_d_${ts}` },
    { key: 'E', name: 'Echo Attacker', username: `p7_e_${ts}` },
  ];

  for (const cfg of userConfigs) {
    const email = `heatchat.p7.${cfg.key.toLowerCase()}.${ts}@gmail.com`;
    const password = `PassP7_${ts}!99`;
    const { data: authData, error: authErr } = await anonClient.auth.signUp({
      email,
      password,
      options: { data: { username: cfg.username, display_name: cfg.name } }
    });
    assert(!authErr && authData?.user?.id && authData?.session?.access_token, `User ${cfg.key} (${cfg.name}) registered.`);
    users[cfg.key] = authData.user;
    tokens[cfg.key] = authData.session.access_token;
    clients[cfg.key] = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
      global: { fetch: fetchWithRetry, headers: { Authorization: `Bearer ${authData.session.access_token}` } }
    });
  }

  // ==========================================================================
  // ESTABLISH FRIENDSHIPS
  // Friendships: A-B (accepted), A-C (accepted), A-D (accepted), B-D (accepted)
  // E is NOT a friend of anyone
  // ==========================================================================
  console.log('\n--- 3. Establishing Accepted Friendships ---');
  const friendPairs = [
    ['A', 'B'],
    ['A', 'C'],
    ['A', 'D'],
    ['B', 'D']
  ];

  for (const [u1, u2] of friendPairs) {
    await clients[u1].from('friendships').insert({ user_id: users[u1].id, friend_id: users[u2].id, status: 'accepted' });
  }
  console.log('  ✅ Friendships A-B, A-C, A-D, B-D established as "accepted".');

  // ==========================================================================
  // TEST 1: GROUP CREATION & OWNERSHIP INVARIANTS
  // ==========================================================================
  console.log('\n--- 4. Testing Group Creation & Ownership Invariants ---');
  
  // Non-friend protection: User A attempts to create group with User E (non-friend)
  const { error: nonFriendErr } = await clients.A.rpc('create_group_conversation', {
    group_name: 'Illegal Group with E',
    member_user_ids: [users.E.id]
  });
  assert(nonFriendErr !== null, 'Non-friend protection: create_group_conversation REJECTED adding non-friend User E.');

  // User A creates Group G1 with User B and User C
  const { data: g1Id, error: g1Err } = await clients.A.rpc('create_group_conversation', {
    group_name: 'Alpha Super Team',
    member_user_ids: [users.B.id, users.C.id],
    group_avatar_url: 'https://example.com/team-avatar.png'
  });
  assert(!g1Err && g1Id, 'User A created Group G1 ("Alpha Super Team") with User B and User C.');

  // Verify group conversation row in DB
  const { data: g1Row } = await clients.A.from('conversations').select('*').eq('id', g1Id).single();
  assert(g1Row?.type === 'group' && g1Row?.created_by === users.A.id, 'Group G1 row created with type="group" and created_by=User A.');

  // Verify membership and roles
  const { data: g1Members } = await clients.A.from('conversation_members')
    .select('user_id, role')
    .eq('conversation_id', g1Id);
  
  const roleMap = {};
  g1Members.forEach(m => { roleMap[m.user_id] = m.role; });

  assert(roleMap[users.A.id] === 'owner', 'User A has role="owner".');
  assert(roleMap[users.B.id] === 'member', 'User B has role="member".');
  assert(roleMap[users.C.id] === 'member', 'User C has role="member".');
  assert(!roleMap[users.D.id] && !roleMap[users.E.id], 'Users D and E are not members of Group G1.');

  // ==========================================================================
  // TEST 2: GROUP MESSAGING & READ PERMISSIONS
  // ==========================================================================
  console.log('\n--- 5. Testing Group Messaging ---');
  const { data: msg1, error: msg1Err } = await clients.A.from('messages').insert({
    conversation_id: g1Id,
    sender_id: users.A.id,
    content: 'Hello everyone in Group G1!',
    message_type: 'text'
  }).select().single();
  assert(!msg1Err && msg1?.id, 'User A sent message msg1 to Group G1.');

  // User B and User C read message
  const { data: bMsg1 } = await clients.B.from('messages').select('*').eq('id', msg1.id).single();
  const { data: cMsg1 } = await clients.C.from('messages').select('*').eq('id', msg1.id).single();
  assert(bMsg1?.content === msg1.content, 'User B retrieved message msg1 from Group G1.');
  assert(cMsg1?.content === msg1.content, 'User C retrieved message msg1 from Group G1.');

  // ==========================================================================
  // TEST 3: GROUP REPLIES & CROSS-GROUP REJECTION
  // ==========================================================================
  console.log('\n--- 6. Testing Group Replies & Cross-Group Rejection ---');
  // User B replies to msg1 in Group G1
  const { data: replyMsg, error: replyErr } = await clients.B.from('messages').insert({
    conversation_id: g1Id,
    sender_id: users.B.id,
    content: 'Beta replying in group G1',
    reply_to_message_id: msg1.id,
    message_type: 'text'
  }).select().single();
  assert(!replyErr && replyMsg?.reply_to_message_id === msg1.id, 'User B created reply referencing msg1 in Group G1.');

  // Create isolated Group G2 = User A and User D
  const { data: g2Id } = await clients.A.rpc('create_group_conversation', {
    group_name: 'Alpha and Delta Project',
    member_user_ids: [users.D.id]
  });
  assert(g2Id && g2Id !== g1Id, 'Created Group G2 (User A and User D).');

  // Attempt Cross-Group Reply: User A attempts to insert message in Group G2 referencing msg1 (from G1)
  const { error: crossGroupErr } = await clients.A.from('messages').insert({
    conversation_id: g2Id,
    sender_id: users.A.id,
    content: 'Illegal cross-group reply',
    reply_to_message_id: msg1.id,
    message_type: 'text'
  });
  assert(crossGroupErr !== null, 'validate_reply_same_conversation trigger REJECTED cross-group reply (G2 -> G1).');

  // ==========================================================================
  // TEST 4: GROUP REACTIONS & DEDUPLICATION
  // ==========================================================================
  console.log('\n--- 7. Testing Group Reactions ---');
  // A reacts ❤️, B reacts 🔥, C reacts 👍
  await clients.A.from('message_reactions').insert({ message_id: msg1.id, user_id: users.A.id, reaction: '❤️' });
  await clients.B.from('message_reactions').insert({ message_id: msg1.id, user_id: users.B.id, reaction: '🔥' });
  await clients.C.from('message_reactions').insert({ message_id: msg1.id, user_id: users.C.id, reaction: '👍' });

  const { data: g1Reactions } = await clients.A.from('message_reactions').select('*').eq('message_id', msg1.id);
  assert(g1Reactions?.length === 3, 'All 3 reactions (❤️, 🔥, 👍) from Users A, B, C recorded in Group G1.');

  // Duplicate reaction rejection
  const { error: dupReactErr } = await clients.A.from('message_reactions').insert({
    message_id: msg1.id,
    user_id: users.A.id,
    reaction: '❤️'
  });
  assert(dupReactErr !== null, 'unique_message_user_reaction constraint REJECTED duplicate reaction in group.');

  // ==========================================================================
  // TEST 5: GROUP EDITING & SOFT DELETION
  // ==========================================================================
  console.log('\n--- 8. Testing Group Editing & Soft Deletion ---');
  // User A edits msg1
  await new Promise(r => setTimeout(r, 1100));
  const editedContent = 'Edited message in Group G1 by Alpha';
  await clients.A.from('messages').update({ content: editedContent }).eq('id', msg1.id);

  const { data: editedCheck } = await clients.B.from('messages').select('content, updated_at').eq('id', msg1.id).single();
  assert(editedCheck.content === editedContent, 'User B observed edited group message content.');

  // User B attempts to edit User A's message -> MUST FAIL
  const { data: bTamper, error: bTamperErr } = await clients.B.from('messages').update({
    content: 'Tampered by Beta'
  }).eq('id', msg1.id).select();
  assert(bTamperErr !== null || (bTamper && bTamper.length === 0), 'RLS REJECTED User B editing User A\'s message in group (0 rows affected).');

  // User A soft-deletes msg1
  await clients.A.from('messages').update({ deleted_at: new Date().toISOString() }).eq('id', msg1.id);
  const { data: delCheck } = await clients.C.from('messages').select('deleted_at').eq('id', msg1.id).single();
  assert(delCheck.deleted_at !== null, 'User C observes deleted_at timestamp populated on group message.');

  // ==========================================================================
  // TEST 6: ROLE MANAGEMENT & ATOMIC OWNERSHIP TRANSFER
  // ==========================================================================
  console.log('\n--- 9. Testing Role Management & Atomic Ownership Transfer ---');
  // 1. Owner A promotes Member B to Admin
  const { error: promErr } = await clients.A.rpc('update_group_member_role', {
    conv_id: g1Id,
    target_user_id: users.B.id,
    new_role: 'admin'
  });
  assert(!promErr, 'Owner A promoted Member B to "admin".');

  const { data: bRoleCheck } = await clients.A.from('conversation_members')
    .select('role').eq('conversation_id', g1Id).eq('user_id', users.B.id).single();
  assert(bRoleCheck.role === 'admin', 'User B confirmed role="admin" in database.');

  // 2. Admin B adds accepted friend User D to Group G1
  const { error: addDErr } = await clients.B.rpc('add_group_members', {
    conv_id: g1Id,
    new_user_ids: [users.D.id]
  });
  assert(!addDErr, 'Admin B added friend User D to Group G1.');

  const { data: dInG1 } = await clients.A.from('conversation_members')
    .select('*').eq('conversation_id', g1Id).eq('user_id', users.D.id).single();
  assert(dInG1?.role === 'member', 'User D successfully joined Group G1 as role="member".');

  // 3. Admin B attempts to promote self to owner -> MUST FAIL
  const { error: bSelfPromoteErr } = await clients.B.rpc('update_group_member_role', {
    conv_id: g1Id,
    target_user_id: users.B.id,
    new_role: 'owner'
  });
  assert(bSelfPromoteErr !== null, 'Admin B cannot promote self or manage roles (REJECTED: only owner can manage roles).');

  // 4. Admin B attempts to remove Owner A -> MUST FAIL
  const { error: bRemoveOwnerErr } = await clients.B.rpc('remove_group_member', {
    conv_id: g1Id,
    target_user_id: users.A.id
  });
  assert(bRemoveOwnerErr !== null, 'Admin B cannot remove Owner A (REJECTED by remove_group_member).');

  // 5. Admin B removes Member D
  const { error: bRemoveDErr } = await clients.B.rpc('remove_group_member', {
    conv_id: g1Id,
    target_user_id: users.D.id
  });
  assert(!bRemoveDErr, 'Admin B removed regular Member D from Group G1.');

  const { data: dRemovedCheck } = await clients.A.from('conversation_members')
    .select('*').eq('conversation_id', g1Id).eq('user_id', users.D.id);
  assert(dRemovedCheck.length === 0, 'User D is no longer a member of Group G1.');

  // 6. Owner A transfers ownership to User B
  const { error: transferErr } = await clients.A.rpc('update_group_member_role', {
    conv_id: g1Id,
    target_user_id: users.B.id,
    new_role: 'owner'
  });
  assert(!transferErr, 'Owner A transferred group ownership to User B.');

  const { data: g1MembersAfterTransfer } = await clients.B.from('conversation_members')
    .select('user_id, role').eq('conversation_id', g1Id);
  const transferRoleMap = {};
  g1MembersAfterTransfer.forEach(m => { transferRoleMap[m.user_id] = m.role; });

  assert(transferRoleMap[users.B.id] === 'owner', 'User B is now "owner".');
  assert(transferRoleMap[users.A.id] === 'admin', 'Previous Owner A is now "admin".');

  const { data: g1ConvAfterTransfer } = await clients.B.from('conversations').select('created_by').eq('id', g1Id).single();
  assert(g1ConvAfterTransfer.created_by === users.B.id, 'conversations.created_by atomically updated to User B.');

  // 7. Old Owner A attempts owner-only operation -> MUST FAIL
  const { error: oldOwnerErr } = await clients.A.rpc('update_group_member_role', {
    conv_id: g1Id,
    target_user_id: users.C.id,
    new_role: 'admin'
  });
  assert(oldOwnerErr !== null, 'Previous Owner A can no longer manage roles (REJECTED: no longer owner).');

  // ==========================================================================
  // TEST 7: LEAVE GROUP & MEMBER REMOVAL ACCESS REVOCATION
  // ==========================================================================
  console.log('\n--- 10. Testing Leave Group & Access Revocation ---');
  // Member C leaves Group G1
  const { error: cLeaveErr } = await clients.C.rpc('leave_group', { conv_id: g1Id });
  assert(!cLeaveErr, 'Member C voluntarily left Group G1 via leave_group.');

  // Verify removed User C immediately loses access to read messages
  const { data: cMsgReadAfterLeave } = await clients.C.from('messages').select('*').eq('conversation_id', g1Id);
  assert(cMsgReadAfterLeave?.length === 0, 'Removed User C cannot read Group G1 messages (0 rows returned / RLS enforced).');

  // Verify removed User C cannot insert messages into Group G1
  const { error: cInsAfterLeaveErr } = await clients.C.from('messages').insert({
    conversation_id: g1Id,
    sender_id: users.C.id,
    content: 'Attempting to send after leaving'
  });
  assert(cInsAfterLeaveErr !== null, 'Removed User C cannot insert messages into Group G1 (REJECTED by RLS).');

  // Verify removed User C cannot read Group G1 reactions
  const { data: cReactAfterLeave } = await clients.C.from('message_reactions').select('*').eq('message_id', msg1.id);
  assert(cReactAfterLeave?.length === 0, 'Removed User C cannot read Group G1 reactions (0 rows returned / RLS enforced).');

  // ==========================================================================
  // TEST 8: NON-MEMBER SECURITY ATTACK TESTS (USER E)
  // ==========================================================================
  console.log('\n--- 11. Testing Non-Member Security Attacks (User E) ---');
  // E reads G1 messages -> 0 rows
  const { data: eReadMsgs } = await clients.E.from('messages').select('*').eq('conversation_id', g1Id);
  assert(eReadMsgs?.length === 0, 'Attack 1: Non-member User E reading G1 messages -> 0 rows returned.');

  // E inserts into G1 -> Rejected
  const { error: eInsMsgErr } = await clients.E.from('messages').insert({
    conversation_id: g1Id,
    sender_id: users.E.id,
    content: 'Attack message from Echo'
  });
  assert(eInsMsgErr !== null, 'Attack 2: Non-member User E inserting into G1 -> REJECTED by RLS.');

  // E reads G1 reactions -> 0 rows
  const { data: eReadReactions } = await clients.E.from('message_reactions').select('*').eq('message_id', msg1.id);
  assert(eReadReactions?.length === 0, 'Attack 3: Non-member User E reading G1 reactions -> 0 rows returned.');

  // E reads G1 conversation members -> 0 rows
  const { data: eReadMembers } = await clients.E.from('conversation_members').select('*').eq('conversation_id', g1Id);
  assert(eReadMembers?.length === 0, 'Attack 4: Non-member User E reading G1 members -> 0 rows returned.');

  // ==========================================================================
  // TEST 9: GROUP DETAILS UPDATE
  // ==========================================================================
  console.log('\n--- 12. Testing Group Details Update ---');
  const updatedGroupName = 'Alpha & Beta Elite Group';
  const { error: renameErr } = await clients.B.rpc('update_group_details', {
    conv_id: g1Id,
    new_name: updatedGroupName,
    new_avatar_url: 'https://example.com/new-avatar.png'
  });
  assert(!renameErr, 'New Owner B updated group name and avatar.');

  const { data: g1Renamed } = await clients.A.from('conversations').select('name, avatar_url').eq('id', g1Id).single();
  assert(g1Renamed.name === updatedGroupName, 'Group name successfully updated to "Alpha & Beta Elite Group".');

  // ==========================================================================
  // TEST 10: REALTIME 3-USER BROADCAST SYNCHRONIZATION
  // ==========================================================================
  console.log('\n--- 13. Testing Realtime 3-User Broadcast Synchronization ---');
  let bReceivedG1Msg = false;
  let aReceivedG1Msg = false;

  const channelB = clients.B.channel(`rt-g1-b-${g1Id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${g1Id}` }, () => {
      bReceivedG1Msg = true;
    })
    .subscribe();

  const channelA = clients.A.channel(`rt-g1-a-${g1Id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${g1Id}` }, () => {
      aReceivedG1Msg = true;
    })
    .subscribe();

  await new Promise(r => setTimeout(r, 2000));

  // User B sends message msg2 to Group G1
  await clients.B.from('messages').insert({
    conversation_id: g1Id,
    sender_id: users.B.id,
    content: 'Broadcast test message from Beta',
    message_type: 'text'
  });

  await new Promise(r => setTimeout(r, 2500));
  await channelA.unsubscribe();
  await channelB.unsubscribe();

  assert(aReceivedG1Msg === true, 'Member A received realtime message INSERT from Member B in Group G1.');

  // ==========================================================================
  // TEST 11: DIRECT MESSAGING REGRESSION TEST
  // ==========================================================================
  console.log('\n--- 14. Testing Direct Messaging Regression ---');
  const { data: directConvId, error: directErr } = await clients.A.rpc('get_or_create_direct_conversation', {
    target_user_id: users.B.id
  });
  assert(!directErr && directConvId, 'get_or_create_direct_conversation still works identically for direct chats.');

  const { data: dmMsg, error: dmErr } = await clients.A.from('messages').insert({
    conversation_id: directConvId,
    sender_id: users.A.id,
    content: 'Direct regression test message',
    message_type: 'text'
  }).select().single();
  assert(!dmErr && dmMsg?.id, 'User A sent direct message to User B.');

  const { data: dmRead } = await clients.B.from('messages').select('*').eq('id', dmMsg.id).single();
  assert(dmRead.content === 'Direct regression test message', 'User B read direct message (no regression).');

  // ==========================================================================
  // TEST 12: CLEANUP TEST DATA
  // ==========================================================================
  console.log('\n--- 15. Cleaning Up Test Data ---');
  await clients.B.from('messages').delete().eq('conversation_id', g1Id);
  await clients.A.from('messages').delete().eq('conversation_id', g2Id);
  await clients.A.from('messages').delete().eq('conversation_id', directConvId);
  await clients.B.from('conversations').delete().eq('id', g1Id);
  await clients.A.from('conversations').delete().eq('id', g2Id);
  await clients.A.from('conversations').delete().eq('id', directConvId);

  for (const [u1, u2] of friendPairs) {
    await clients[u1].from('friendships').delete().eq('user_id', users[u1].id).eq('friend_id', users[u2].id);
  }
  console.log('  ✅ Test conversations, groups, messages, reactions, and friendships purged.');

  console.log('\n================================================================');
  console.log('🎉 ALL PHASE 7 GROUP CHATS LIVE BACKEND & SECURITY TESTS PASSED!');
  console.log('================================================================\n');
}

runPhase7MasterVerification().catch(err => {
  console.error('\n❌ PHASE 7 VERIFICATION FAILED:', err.message);
  process.exit(1);
});
