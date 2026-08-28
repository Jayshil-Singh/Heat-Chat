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

let testIndex = 1;
function assert(condition, message) {
  if (!condition) {
    console.error(`\n❌ [TEST ${testIndex} FAILED]: ${message}`);
    throw new Error(`Assertion failed at Test ${testIndex}: ${message}`);
  }
  console.log(`  ✅ [Test ${testIndex}] ${message}`);
  testIndex++;
}

async function runPhase7MasterVerification() {
  console.log('================================================================');
  console.log('HEAT CHAT — PHASE 7 GROUP CHATS 45-POINT MASTER VERIFICATION');
  console.log('================================================================\n');

  const anonClient = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchWithRetry }
  });

  // ==========================================================================
  // 1. VERIFY REMOTE SCHEMA OBJECTS & RPCS
  // ==========================================================================
  console.log('--- SECTION 1: Verifying Remote Database Schema Objects & RPCs ---');

  // Verify all 6 RPCs exist
  const rpcChecks = [
    { name: 'create_group_conversation', args: { group_name: 't', member_user_ids: [] } },
    { name: 'add_group_members', args: { conv_id: '00000000-0000-0000-0000-000000000000', new_user_ids: [] } },
    { name: 'remove_group_member', args: { conv_id: '00000000-0000-0000-0000-000000000000', target_user_id: '00000000-0000-0000-0000-000000000000' } },
    { name: 'update_group_member_role', args: { conv_id: '00000000-0000-0000-0000-000000000000', target_user_id: '00000000-0000-0000-0000-000000000000', new_role: 'admin' } },
    { name: 'update_group_details', args: { conv_id: '00000000-0000-0000-0000-000000000000', new_name: 't' } },
    { name: 'leave_group', args: { conv_id: '00000000-0000-0000-0000-000000000000' } },
  ];

  for (const rpc of rpcChecks) {
    const res = await anonClient.rpc(rpc.name, rpc.args);
    const notFound = res.error && (res.error.message.includes('Could not find the function') || res.error.code === 'PGRST202');
    assert(!notFound, `RPC "${rpc.name}" is present and recognized in remote Supabase schema.`);
  }

  // ==========================================================================
  // 2. SETUP 5 AUTHENTICATED TEST USERS (A, B, C, D, E)
  // ==========================================================================
  console.log('\n--- SECTION 2: Registering & Authenticating 5 Test Users (A, B, C, D, E) ---');
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
    assert(!authErr && authData?.user?.id && authData?.session?.access_token, `User ${cfg.key} (${cfg.name}) registered & authenticated.`);
    users[cfg.key] = authData.user;
    tokens[cfg.key] = authData.session.access_token;
    clients[cfg.key] = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
      global: { fetch: fetchWithRetry, headers: { Authorization: `Bearer ${authData.session.access_token}` } }
    });
    // Explicitly set JWT on Realtime socket for authenticated WAL replication
    clients[cfg.key].realtime.setAuth(authData.session.access_token);
  }

  // ==========================================================================
  // 3. ESTABLISH FRIENDSHIPS
  // A-B (accepted), A-C (accepted), A-D (accepted), B-D (accepted), B-C (accepted)
  // E is NOT a friend of anyone
  // ==========================================================================
  console.log('\n--- SECTION 3: Establishing Accepted Friendships ---');
  const friendPairs = [
    ['A', 'B'],
    ['A', 'C'],
    ['A', 'D'],
    ['B', 'D'],
    ['B', 'C']
  ];

  for (const [u1, u2] of friendPairs) {
    const { error: fErr } = await clients[u1].from('friendships').insert({
      user_id: users[u1].id,
      friend_id: users[u2].id,
      status: 'accepted'
    });
    assert(!fErr, `Friendship ${u1}-${u2} established as accepted.`);
  }

  // ==========================================================================
  // 4. GROUP CREATION & OWNERSHIP INVARIANTS
  // ==========================================================================
  console.log('\n--- SECTION 4: Group Creation & Ownership Invariants ---');

  // 4.1 Friendship restriction: User A attempts to create group with non-friend User E -> REJECTED
  const { error: nonFriendErr } = await clients.A.rpc('create_group_conversation', {
    group_name: 'Illegal Group with E',
    member_user_ids: [users.E.id]
  });
  assert(nonFriendErr !== null, 'create_group_conversation REJECTED adding non-friend User E.');

  // 4.2 Empty name validation -> REJECTED
  const { error: emptyNameErr } = await clients.A.rpc('create_group_conversation', {
    group_name: '   ',
    member_user_ids: [users.B.id]
  });
  assert(emptyNameErr !== null, 'create_group_conversation REJECTED blank group name.');

  // 4.3 Successful creation of Group G1 ("Alpha Super Team") with User B and User C
  const { data: g1Id, error: g1Err } = await clients.A.rpc('create_group_conversation', {
    group_name: 'Alpha Super Team',
    member_user_ids: [users.B.id, users.C.id],
    group_avatar_url: 'https://example.com/alpha-team.png'
  });
  assert(!g1Err && g1Id, 'User A created Group G1 ("Alpha Super Team") with User B and User C.');

  // 4.4 Verify Group G1 row in DB
  const { data: g1Row } = await clients.A.from('conversations').select('*').eq('id', g1Id).single();
  assert(g1Row?.type === 'group' && g1Row?.created_by === users.A.id && g1Row?.name === 'Alpha Super Team',
    'Group G1 row created with type="group", name="Alpha Super Team", and created_by=User A.');

  // 4.5 Verify single-owner invariant and member roles
  const { data: g1Members } = await clients.A.from('conversation_members')
    .select('user_id, role')
    .eq('conversation_id', g1Id);
  const roleMap = {};
  g1Members.forEach(m => { roleMap[m.user_id] = m.role; });

  const ownerCount = g1Members.filter(m => m.role === 'owner').length;
  assert(ownerCount === 1, 'Exactly one owner exists in Group G1.');
  assert(roleMap[users.A.id] === 'owner', 'User A has role="owner".');
  assert(roleMap[users.B.id] === 'member', 'User B has role="member".');
  assert(roleMap[users.C.id] === 'member', 'User C has role="member".');
  assert(!roleMap[users.D.id] && !roleMap[users.E.id], 'Non-invited Users D and E are not members of Group G1.');

  // ==========================================================================
  // 5. GROUP MESSAGING & SENDER DISPLAY
  // ==========================================================================
  console.log('\n--- SECTION 5: Group Messaging & Multi-Member Read Access ---');
  const { data: msg1, error: msg1Err } = await clients.A.from('messages').insert({
    conversation_id: g1Id,
    sender_id: users.A.id,
    content: 'Welcome everyone to Alpha Super Team!',
    message_type: 'text'
  }).select().single();
  assert(!msg1Err && msg1?.id, 'User A sent message msg1 to Group G1.');

  // User B and User C read message
  const { data: bMsg1 } = await clients.B.from('messages').select('*').eq('id', msg1.id).single();
  const { data: cMsg1 } = await clients.C.from('messages').select('*').eq('id', msg1.id).single();
  assert(bMsg1?.content === msg1.content, 'Member B retrieved message msg1 from Group G1.');
  assert(cMsg1?.content === msg1.content, 'Member C retrieved message msg1 from Group G1.');

  // User B sends message msg2
  const { data: msg2, error: msg2Err } = await clients.B.from('messages').insert({
    conversation_id: g1Id,
    sender_id: users.B.id,
    content: 'Thanks Alpha, glad to be here!',
    message_type: 'text'
  }).select().single();
  assert(!msg2Err && msg2?.id, 'User B sent message msg2 to Group G1.');

  // ==========================================================================
  // 6. GROUP REPLIES & CROSS-CONVERSATION REJECTIONS
  // ==========================================================================
  console.log('\n--- SECTION 6: Group Replies & Cross-Conversation Rejection ---');
  // 6.1 User C replies to msg1 within Group G1 -> SUCCESS
  const { data: replyMsg, error: replyErr } = await clients.C.from('messages').insert({
    conversation_id: g1Id,
    sender_id: users.C.id,
    content: 'Charlie replying to Alpha in G1',
    reply_to_message_id: msg1.id,
    message_type: 'text'
  }).select().single();
  assert(!replyErr && replyMsg?.reply_to_message_id === msg1.id, 'User C replied to msg1 within Group G1.');

  // Create isolated Group G2 = User A and User D
  const { data: g2Id } = await clients.A.rpc('create_group_conversation', {
    group_name: 'Alpha and Delta Project',
    member_user_ids: [users.D.id]
  });
  assert(g2Id && g2Id !== g1Id, 'Created isolated Group G2 (User A and User D).');

  // Create Direct Conversation D1 between User A and User B
  const { data: directConvId } = await clients.A.rpc('get_or_create_direct_conversation', {
    target_user_id: users.B.id
  });
  assert(directConvId, 'Created direct conversation D1 (User A and User B).');

  const { data: directMsg } = await clients.A.from('messages').insert({
    conversation_id: directConvId,
    sender_id: users.A.id,
    content: 'Direct message in D1',
    message_type: 'text'
  }).select().single();

  // 6.2 Cross-conversation reply: Group G2 -> Group G1 message -> MUST FAIL
  const { error: crossG2G1Err } = await clients.A.from('messages').insert({
    conversation_id: g2Id,
    sender_id: users.A.id,
    content: 'Illegal cross-group reply G2 -> G1',
    reply_to_message_id: msg1.id,
    message_type: 'text'
  });
  assert(crossG2G1Err !== null, 'validate_reply_same_conversation trigger REJECTED cross-group reply (G2 -> G1).');

  // 6.3 Cross-conversation reply: Group G1 -> Group G2 message -> MUST FAIL
  const { data: g2Msg } = await clients.A.from('messages').insert({
    conversation_id: g2Id,
    sender_id: users.A.id,
    content: 'Message in G2',
    message_type: 'text'
  }).select().single();

  const { error: crossG1G2Err } = await clients.A.from('messages').insert({
    conversation_id: g1Id,
    sender_id: users.A.id,
    content: 'Illegal cross-group reply G1 -> G2',
    reply_to_message_id: g2Msg.id,
    message_type: 'text'
  });
  assert(crossG1G2Err !== null, 'validate_reply_same_conversation trigger REJECTED cross-group reply (G1 -> G2).');

  // 6.4 Cross-conversation reply: Direct D1 -> Group G1 message -> MUST FAIL
  const { error: crossDirectGroupErr } = await clients.A.from('messages').insert({
    conversation_id: directConvId,
    sender_id: users.A.id,
    content: 'Illegal reply Direct -> Group',
    reply_to_message_id: msg1.id,
    message_type: 'text'
  });
  assert(crossDirectGroupErr !== null, 'validate_reply_same_conversation trigger REJECTED cross-conversation reply (Direct -> Group).');

  // ==========================================================================
  // 7. GROUP REACTIONS & DEDUPLICATION
  // ==========================================================================
  console.log('\n--- SECTION 7: Group Reactions & Deduplication ---');
  // Users A, B, C react to msg1
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
  assert(dupReactErr !== null, 'unique_message_user_reaction constraint REJECTED duplicate reaction.');

  // Reaction removal
  const { error: remReactErr } = await clients.C.from('message_reactions').delete()
    .eq('message_id', msg1.id).eq('user_id', users.C.id).eq('reaction', '👍');
  assert(!remReactErr, 'User C successfully toggled/removed reaction 👍.');

  const { data: g1ReactionsAfterDel } = await clients.A.from('message_reactions').select('*').eq('message_id', msg1.id);
  assert(g1ReactionsAfterDel?.length === 2, 'Reactions count decremented to 2 after removal.');

  // ==========================================================================
  // 8. GROUP EDITING & SOFT DELETION
  // ==========================================================================
  console.log('\n--- SECTION 8: Group Editing & Soft Deletion ---');
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

  // Verify actual DB content remained untampered
  const { data: untamperedCheck } = await clients.A.from('messages').select('content').eq('id', msg1.id).single();
  assert(untamperedCheck.content === editedContent, 'Follow-up SELECT confirms message content remained untampered.');

  // User A soft-deletes msg1
  await clients.A.from('messages').update({ deleted_at: new Date().toISOString() }).eq('id', msg1.id);
  const { data: delCheck } = await clients.C.from('messages').select('deleted_at').eq('id', msg1.id).single();
  assert(delCheck.deleted_at !== null, 'User C observes deleted_at timestamp populated on group message.');

  // ==========================================================================
  // 9. ADMIN PERMISSIONS & RESTRICTIONS
  // ==========================================================================
  console.log('\n--- SECTION 9: Admin Permissions & Role Restrictions ---');
  // 9.1 Owner A promotes Member B to Admin
  const { error: promErr } = await clients.A.rpc('update_group_member_role', {
    conv_id: g1Id,
    target_user_id: users.B.id,
    new_role: 'admin'
  });
  assert(!promErr, 'Owner A promoted Member B to "admin".');

  const { data: bRoleCheck } = await clients.A.from('conversation_members')
    .select('role').eq('conversation_id', g1Id).eq('user_id', users.B.id).single();
  assert(bRoleCheck.role === 'admin', 'User B confirmed role="admin" in database.');

  // 9.2 Admin B adds accepted friend User D to Group G1
  const { error: addDErr } = await clients.B.rpc('add_group_members', {
    conv_id: g1Id,
    new_user_ids: [users.D.id]
  });
  assert(!addDErr, 'Admin B added friend User D to Group G1.');

  const { data: dInG1 } = await clients.A.from('conversation_members')
    .select('*').eq('conversation_id', g1Id).eq('user_id', users.D.id).single();
  assert(dInG1?.role === 'member', 'User D successfully joined Group G1 as role="member".');

  // 9.3 Duplicate membership protection: Admin B attempts to add User D again -> SKIPPED / NO DUPLICATES
  await clients.B.rpc('add_group_members', { conv_id: g1Id, new_user_ids: [users.D.id] });
  const { data: dDupCheck } = await clients.A.from('conversation_members')
    .select('*').eq('conversation_id', g1Id).eq('user_id', users.D.id);
  assert(dDupCheck.length === 1, 'Duplicate protection: User D exists exactly once in conversation_members.');

  // 9.4 Admin B attempts to promote self to owner -> MUST FAIL
  const { error: bSelfPromoteErr } = await clients.B.rpc('update_group_member_role', {
    conv_id: g1Id,
    target_user_id: users.B.id,
    new_role: 'owner'
  });
  assert(bSelfPromoteErr !== null, 'Admin B cannot manage roles or promote self to owner (REJECTED: only owner can manage roles).');

  // 9.5 Admin B attempts to remove Owner A -> MUST FAIL
  const { error: bRemoveOwnerErr } = await clients.B.rpc('remove_group_member', {
    conv_id: g1Id,
    target_user_id: users.A.id
  });
  assert(bRemoveOwnerErr !== null, 'Admin B cannot remove Owner A (REJECTED by remove_group_member).');

  // Owner A promotes Member C to Admin
  await clients.A.rpc('update_group_member_role', { conv_id: g1Id, target_user_id: users.C.id, new_role: 'admin' });

  // 9.6 Admin B attempts to remove Admin C -> MUST FAIL
  const { error: bRemoveAdminCErr } = await clients.B.rpc('remove_group_member', {
    conv_id: g1Id,
    target_user_id: users.C.id
  });
  assert(bRemoveAdminCErr !== null, 'Admin B cannot remove another Admin C (REJECTED: admins cannot remove other admins).');

  // Demote C back to member for subsequent tests
  await clients.A.rpc('update_group_member_role', { conv_id: g1Id, target_user_id: users.C.id, new_role: 'member' });

  // 9.7 Admin B removes regular Member D -> SUCCESS
  const { error: bRemoveDErr } = await clients.B.rpc('remove_group_member', {
    conv_id: g1Id,
    target_user_id: users.D.id
  });
  assert(!bRemoveDErr, 'Admin B removed regular Member D from Group G1.');

  const { data: dRemovedCheck } = await clients.A.from('conversation_members')
    .select('*').eq('conversation_id', g1Id).eq('user_id', users.D.id);
  assert(dRemovedCheck.length === 0, 'User D confirmed removed from Group G1 in database.');

  // ==========================================================================
  // 10. ATOMIC OWNERSHIP TRANSFER
  // ==========================================================================
  console.log('\n--- SECTION 10: Atomic Ownership Transfer & Permissions ---');
  // 10.1 Owner A transfers ownership to User B
  const { error: transferErr } = await clients.A.rpc('update_group_member_role', {
    conv_id: g1Id,
    target_user_id: users.B.id,
    new_role: 'owner'
  });
  assert(!transferErr, 'Owner A transferred group ownership to User B.');

  // 10.2 Verify ownership transfer atomicity
  const { data: g1MembersAfterTransfer } = await clients.B.from('conversation_members')
    .select('user_id, role').eq('conversation_id', g1Id);
  const transferRoleMap = {};
  g1MembersAfterTransfer.forEach(m => { transferRoleMap[m.user_id] = m.role; });

  const newOwnerCount = g1MembersAfterTransfer.filter(m => m.role === 'owner').length;
  assert(newOwnerCount === 1, 'Exactly one owner exists after transfer.');
  assert(transferRoleMap[users.B.id] === 'owner', 'User B is now role="owner".');
  assert(transferRoleMap[users.A.id] === 'admin', 'Previous Owner A is now role="admin".');

  const { data: g1ConvAfterTransfer } = await clients.B.from('conversations').select('created_by').eq('id', g1Id).single();
  assert(g1ConvAfterTransfer.created_by === users.B.id, 'conversations.created_by atomically updated to User B.');

  // 10.3 Old Owner A attempts owner-only operation -> MUST FAIL
  const { error: oldOwnerErr } = await clients.A.rpc('update_group_member_role', {
    conv_id: g1Id,
    target_user_id: users.C.id,
    new_role: 'admin'
  });
  assert(oldOwnerErr !== null, 'Previous Owner A can no longer manage roles (REJECTED: no longer owner).');

  // 10.4 New Owner B can manage roles -> SUCCESS
  const { error: newOwnerRoleErr } = await clients.B.rpc('update_group_member_role', {
    conv_id: g1Id,
    target_user_id: users.C.id,
    new_role: 'admin'
  });
  assert(!newOwnerRoleErr, 'New Owner B successfully promoted Member C to "admin".');

  // ==========================================================================
  // 11. LEAVE GROUP & ACCESS REVOCATION
  // ==========================================================================
  console.log('\n--- SECTION 11: Leave Group & Access Revocation ---');
  // 11.1 Owner B attempts to leave while others exist -> MUST FAIL
  const { error: ownerLeaveErr } = await clients.B.rpc('leave_group', { conv_id: g1Id });
  assert(ownerLeaveErr !== null, 'Owner B cannot leave without transferring ownership first (REJECTED).');

  // 11.2 Admin C demoted back to member and voluntarily leaves Group G1
  await clients.B.rpc('update_group_member_role', { conv_id: g1Id, target_user_id: users.C.id, new_role: 'member' });
  const { error: cLeaveErr } = await clients.C.rpc('leave_group', { conv_id: g1Id });
  assert(!cLeaveErr, 'Member C voluntarily left Group G1 via leave_group.');

  // 11.3 Removed/Departed User C access revocation tests
  const { data: cMsgReadAfterLeave } = await clients.C.from('messages').select('*').eq('conversation_id', g1Id);
  assert(cMsgReadAfterLeave?.length === 0, 'Departed User C cannot read Group G1 messages (0 rows returned / RLS enforced).');

  const { error: cInsAfterLeaveErr } = await clients.C.from('messages').insert({
    conversation_id: g1Id,
    sender_id: users.C.id,
    content: 'Attempting to send after leaving'
  });
  assert(cInsAfterLeaveErr !== null, 'Departed User C cannot insert messages into Group G1 (REJECTED by RLS).');

  const { data: cReactAfterLeave } = await clients.C.from('message_reactions').select('*').eq('message_id', msg1.id);
  assert(cReactAfterLeave?.length === 0, 'Departed User C cannot read Group G1 reactions (0 rows returned / RLS enforced).');

  const { data: cMembersAfterLeave } = await clients.C.from('conversation_members').select('*').eq('conversation_id', g1Id);
  assert(cMembersAfterLeave?.length === 0, 'Departed User C cannot read Group G1 conversation_members (0 rows returned / RLS enforced).');

  const { data: cConvAfterLeave } = await clients.C.from('conversations').select('*').eq('id', g1Id);
  assert(cConvAfterLeave?.length === 0, 'Departed User C cannot read Group G1 conversation details (0 rows returned / RLS enforced).');

  // ==========================================================================
  // 12. NON-MEMBER (USER E) SECURITY ATTACK TESTS
  // ==========================================================================
  console.log('\n--- SECTION 12: Non-Member Security Attacks (User E) ---');
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

  // E reads G1 conversation -> 0 rows
  const { data: eReadConv } = await clients.E.from('conversations').select('*').eq('id', g1Id);
  assert(eReadConv?.length === 0, 'Attack 5: Non-member User E reading G1 conversation -> 0 rows returned.');

  // E attempts RPC calls -> Rejected
  const { error: eAddMemberErr } = await clients.E.rpc('add_group_members', { conv_id: g1Id, new_user_ids: [users.E.id] });
  assert(eAddMemberErr !== null, 'Attack 6: Non-member User E calling add_group_members -> REJECTED.');

  // ==========================================================================
  // 13. GROUP DETAILS UPDATE (RENAME & AVATAR)
  // ==========================================================================
  console.log('\n--- SECTION 13: Group Details Update ---');
  const updatedGroupName = 'Alpha & Beta Elite Group';
  const { error: renameErr } = await clients.B.rpc('update_group_details', {
    conv_id: g1Id,
    new_name: updatedGroupName,
    new_avatar_url: 'https://example.com/new-avatar.png'
  });
  assert(!renameErr, 'Owner B updated group name and avatar.');

  const { data: g1Renamed } = await clients.A.from('conversations').select('name, avatar_url').eq('id', g1Id).single();
  assert(g1Renamed.name === updatedGroupName, 'Group name confirmed updated to "Alpha & Beta Elite Group" in database.');

  // ==========================================================================
  // 14. REALTIME 3-USER BROADCAST SYNCHRONIZATION
  // ==========================================================================
  console.log('\n--- SECTION 14: Realtime 3-User Broadcast Synchronization ---');
  // Re-add User D to Group G1 so we have 3 members: B (owner), A (admin), D (member)
  await clients.B.rpc('add_group_members', { conv_id: g1Id, new_user_ids: [users.D.id] });

  let bReceivedG1Msg = false;
  let aReceivedG1Msg = false;
  let dReceivedG1Msg = false;

  const channelB = clients.B.channel(`rt-g1-b-${ts}`);
  const channelA = clients.A.channel(`rt-g1-a-${ts}`);
  const channelD = clients.D.channel(`rt-g1-d-${ts}`);

  channelB.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${g1Id}` }, () => {
    bReceivedG1Msg = true;
  });

  channelA.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${g1Id}` }, () => {
    aReceivedG1Msg = true;
  });

  channelD.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${g1Id}` }, () => {
    dReceivedG1Msg = true;
  });

  // Subscribe all 3 channels and await SUBSCRIBED status
  await Promise.all([
    new Promise(resolve => channelB.subscribe(status => { if (status === 'SUBSCRIBED') resolve(); })),
    new Promise(resolve => channelA.subscribe(status => { if (status === 'SUBSCRIBED') resolve(); })),
    new Promise(resolve => channelD.subscribe(status => { if (status === 'SUBSCRIBED') resolve(); })),
  ]);

  await new Promise(r => setTimeout(r, 1000));

  // User B sends broadcast message
  const { data: rtMsg } = await clients.B.from('messages').insert({
    conversation_id: g1Id,
    sender_id: users.B.id,
    content: 'Broadcast test message to 3 members',
    message_type: 'text'
  }).select().single();

  await new Promise(r => setTimeout(r, 3000));
  await channelA.unsubscribe();
  await channelB.unsubscribe();
  await channelD.unsubscribe();

  assert(aReceivedG1Msg === true, 'Realtime: Member A received message INSERT event from Member B.');
  assert(dReceivedG1Msg === true, 'Realtime: Member D received message INSERT event from Member B.');

  // ==========================================================================
  // 15. DIRECT MESSAGING REGRESSION TEST
  // ==========================================================================
  console.log('\n--- SECTION 15: Direct Messaging Regression Verification ---');
  const { data: dmCheckMsg, error: dmCheckErr } = await clients.A.from('messages').insert({
    conversation_id: directConvId,
    sender_id: users.A.id,
    content: 'Direct regression test message final',
    message_type: 'text'
  }).select().single();
  assert(!dmCheckErr && dmCheckMsg?.id, 'User A sent direct message to User B (direct messaging unaffected).');

  const { data: dmRead } = await clients.B.from('messages').select('*').eq('id', dmCheckMsg.id).single();
  assert(dmRead.content === 'Direct regression test message final', 'User B read direct message successfully.');

  // ==========================================================================
  // 16. CLEANUP TEST DATA
  // ==========================================================================
  console.log('\n--- SECTION 16: Cleaning Up Test Data ---');
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
  console.log(`🎉 ALL ${testIndex - 1} PHASE 7 MASTER VERIFICATION TESTS PASSED WITH ZERO ERRORS!`);
  console.log('================================================================\n');
}

runPhase7MasterVerification().catch(err => {
  console.error('\n❌ PHASE 7 VERIFICATION FAILED:', err.message);
  process.exit(1);
});
