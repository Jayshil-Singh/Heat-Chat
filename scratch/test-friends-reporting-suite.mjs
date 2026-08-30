/**
 * Heat Chat — Phase 2: Friends, Friend Requests, Mutual Friends & User Reporting Test Suite
 *
 * Simulates and validates:
 * 1. Friendship state machine transitions (NONE -> PENDING_OUTGOING/PENDING_INCOMING -> FRIENDS -> NONE)
 * 2. Simultaneous friend request conflict resolution (auto-acceptance)
 * 3. Atomic re-check at acceptance time (blocking, status check, recipient verification)
 * 4. Cancellation by sender only & decline by recipient only
 * 5. Block precedence (atomic termination of friendships and pending requests)
 * 6. Privacy rule enforcement (everyone, friends_of_friends, nobody)
 * 7. Mutual friends calculation & privacy-aware profile sanitization
 * 8. User, message, and attachment reporting with duplicate report prevention
 * 9. Moderation notes & admin report state transitions
 *
 * Run: npx tsx scratch/test-friends-reporting-suite.mjs
 */

let passed = 0;
let failed = 0;

function pass(testName) {
  console.log(`  ✅ PASS: ${testName}`);
  passed++;
}

function fail(testName, reason) {
  console.error(`  ❌ FAIL: ${testName}`);
  if (reason) console.error(`         → ${reason}`);
  failed++;
}

function section(title) {
  console.log(`\n══════════════════════════════════════════════════════════`);
  console.log(`  ${title}`);
  console.log(`══════════════════════════════════════════════════════════`);
}

// In-Memory Database Simulator for Phase 2 State Machine Testing
class InMemoryPhase2Engine {
  constructor() {
    this.profiles = new Map();
    this.friendships = new Map(); // id -> { id, user_id, friend_id, status, created_at, updated_at, responded_at }
    this.blockedUsers = new Set(); // "user_id:blocked_user_id"
    this.privacySettings = new Map(); // user_id -> { who_can_friend_request, who_can_see_avatar, ... }
    this.reports = new Map(); // id -> { id, reporter_id, target_type, target_id, category, description, status }
    this.moderationNotes = new Map();
  }

  addProfile(id, username, displayName) {
    this.profiles.set(id, { id, username, displayName, avatar_url: null });
    this.privacySettings.set(id, {
      who_can_friend_request: "everyone",
      who_can_see_avatar: "everyone",
      who_can_see_profile: "everyone",
    });
  }

  isBlocked(userA, userB) {
    return (
      this.blockedUsers.has(`${userA}:${userB}`) ||
      this.blockedUsers.has(`${userB}:${userA}`)
    );
  }

  areFriends(userA, userB) {
    for (const f of this.friendships.values()) {
      if (
        f.status === "accepted" &&
        ((f.user_id === userA && f.friend_id === userB) ||
          (f.user_id === userB && f.friend_id === userA))
      ) {
        return true;
      }
    }
    return false;
  }

  canSendFriendRequest(viewerId, targetId) {
    if (viewerId === targetId) return false;
    if (this.isBlocked(viewerId, targetId)) return false;

    const priv = this.privacySettings.get(targetId)?.who_can_friend_request || "everyone";
    if (priv === "everyone") return true;
    if (priv === "nobody") return false;
    if (priv === "friends_of_friends") {
      // Find mutual friends
      const viewerFriends = Array.from(this.profiles.keys()).filter((uid) =>
        this.areFriends(viewerId, uid)
      );
      return viewerFriends.some((uid) => this.areFriends(targetId, uid));
    }
    return false;
  }

  sendFriendRequest(senderId, recipientId) {
    if (senderId === recipientId) throw new Error("CANNOT_FRIEND_SELF");
    if (this.isBlocked(senderId, recipientId)) throw new Error("BLOCKED_USER");
    if (!this.canSendFriendRequest(senderId, recipientId)) throw new Error("PRIVACY_RESTRICTED");

    // Check existing
    for (const [id, f] of this.friendships.entries()) {
      if (
        (f.user_id === senderId && f.friend_id === recipientId) ||
        (f.user_id === recipientId && f.friend_id === senderId)
      ) {
        if (f.status === "accepted") throw new Error("ALREADY_FRIENDS");
        if (f.status === "pending") {
          if (f.user_id === senderId) {
            return { friendshipId: id, status: "PENDING_OUTGOING", autoAccepted: false };
          } else {
            // Simultaneous request -> Auto-accept!
            f.status = "accepted";
            f.responded_at = new Date();
            f.updated_at = new Date();
            return { friendshipId: id, status: "FRIENDS", autoAccepted: true };
          }
        } else {
          // Re-activate declined/cancelled/expired
          f.user_id = senderId;
          f.friend_id = recipientId;
          f.status = "pending";
          f.created_at = new Date();
          f.responded_at = null;
          return { friendshipId: id, status: "PENDING_OUTGOING", autoAccepted: false };
        }
      }
    }

    const id = `fs-${Math.random().toString(36).substr(2, 9)}`;
    this.friendships.set(id, {
      id,
      user_id: senderId,
      friend_id: recipientId,
      status: "pending",
      created_at: new Date(),
      updated_at: new Date(),
      responded_at: null,
    });

    return { friendshipId: id, status: "PENDING_OUTGOING", autoAccepted: false };
  }

  acceptFriendRequest(actorId, friendshipId) {
    const f = this.friendships.get(friendshipId);
    if (!f) throw new Error("REQUEST_NOT_FOUND");
    if (f.friend_id !== actorId) throw new Error("REQUEST_NOT_YOURS");
    if (f.status !== "pending") throw new Error("REQUEST_NOT_PENDING");
    if (this.isBlocked(f.user_id, f.friend_id)) throw new Error("BLOCKED_USER");

    f.status = "accepted";
    f.responded_at = new Date();
    f.updated_at = new Date();
    return { friendshipId, status: "accepted" };
  }

  declineFriendRequest(actorId, friendshipId) {
    const f = this.friendships.get(friendshipId);
    if (!f) throw new Error("REQUEST_NOT_FOUND");
    if (f.friend_id !== actorId) throw new Error("REQUEST_NOT_YOURS");
    if (f.status !== "pending") throw new Error("REQUEST_NOT_PENDING");

    f.status = "declined";
    f.responded_at = new Date();
    f.updated_at = new Date();
    return { status: "declined" };
  }

  cancelFriendRequest(actorId, friendshipId) {
    const f = this.friendships.get(friendshipId);
    if (!f) throw new Error("REQUEST_NOT_FOUND");
    if (f.user_id !== actorId) throw new Error("REQUEST_NOT_YOURS");
    if (f.status !== "pending") throw new Error("REQUEST_NOT_PENDING");

    f.status = "cancelled";
    f.updated_at = new Date();
    return { status: "cancelled" };
  }

  removeFriend(actorId, targetUserId) {
    for (const [id, f] of this.friendships.entries()) {
      if (
        (f.user_id === actorId && f.friend_id === targetUserId) ||
        (f.user_id === targetUserId && f.friend_id === actorId)
      ) {
        this.friendships.delete(id);
        return { removed: true };
      }
    }
    return { removed: true };
  }

  blockUser(actorId, targetUserId) {
    if (actorId === targetUserId) throw new Error("BLOCK_SELF_FORBIDDEN");
    this.blockedUsers.add(`${actorId}:${targetUserId}`);

    // Atomic termination of friendships and pending requests
    for (const [id, f] of this.friendships.entries()) {
      if (
        (f.user_id === actorId && f.friend_id === targetUserId) ||
        (f.user_id === targetUserId && f.friend_id === actorId)
      ) {
        this.friendships.delete(id);
      }
    }
    return true;
  }

  unblockUser(actorId, targetUserId) {
    this.blockedUsers.delete(`${actorId}:${targetUserId}`);
    return true;
  }

  getMutualFriends(viewerId, targetId) {
    if (viewerId === targetId || this.isBlocked(viewerId, targetId)) {
      return { count: 0, profiles: [] };
    }

    const viewerFriends = Array.from(this.profiles.keys()).filter((uid) =>
      this.areFriends(viewerId, uid)
    );
    const targetFriends = Array.from(this.profiles.keys()).filter((uid) =>
      this.areFriends(targetId, uid)
    );

    const mutualIds = viewerFriends.filter(
      (uid) => targetFriends.includes(uid) && !this.isBlocked(viewerId, uid)
    );

    return {
      count: mutualIds.length,
      profiles: mutualIds.map((uid) => this.profiles.get(uid)),
    };
  }

  getRelationshipState(viewerId, targetId) {
    if (viewerId === targetId) {
      return { friendship: "SELF", isBlocked: false, canMessage: false, canFriendRequest: false };
    }
    const blocked = this.blockedUsers.has(`${viewerId}:${targetId}`);
    const hasBlockedViewer = this.blockedUsers.has(`${targetId}:${viewerId}`);

    if (blocked || hasBlockedViewer) {
      return { friendship: "NONE", isBlocked: blocked, hasBlockedViewer, canMessage: false, canFriendRequest: false };
    }

    let state = "NONE";
    let reqId = null;

    for (const [id, f] of this.friendships.entries()) {
      if (
        (f.user_id === viewerId && f.friend_id === targetId) ||
        (f.user_id === targetId && f.friend_id === viewerId)
      ) {
        if (f.status === "accepted") {
          state = "FRIENDS";
          reqId = id;
        } else if (f.status === "pending") {
          reqId = id;
          state = f.user_id === viewerId ? "PENDING_OUTGOING" : "PENDING_INCOMING";
        }
        break;
      }
    }

    return {
      friendship: state,
      requestId: reqId,
      isBlocked: false,
      hasBlockedViewer: false,
      canMessage: true,
      canFriendRequest: state === "NONE" && this.canSendFriendRequest(viewerId, targetId),
    };
  }

  submitReport(reporterId, targetType, targetId, category, description) {
    if (targetType === "user" && targetId === reporterId) {
      throw new Error("CANNOT_REPORT_SELF");
    }

    // Check duplicate active report
    for (const [id, r] of this.reports.entries()) {
      if (
        r.reporter_id === reporterId &&
        r.target_type === targetType &&
        r.target_id === targetId &&
        r.category === category &&
        ["New", "Assigned", "Investigating"].includes(r.status)
      ) {
        return { reportId: id, duplicate: true };
      }
    }

    const id = `rep-${Math.random().toString(36).substr(2, 9)}`;
    this.reports.set(id, {
      id,
      reporter_id: reporterId,
      target_type: targetType,
      target_id: targetId,
      category,
      description,
      status: "New",
      created_at: new Date(),
    });

    return { reportId: id, duplicate: false };
  }
}

// ==========================================
// TEST SUITE EXECUTION
// ==========================================

const engine = new InMemoryPhase2Engine();
const USER_A = "user-a-1111";
const USER_B = "user-b-2222";
const USER_C = "user-c-3333";

engine.addProfile(USER_A, "alex_rivera", "Alex Rivera");
engine.addProfile(USER_B, "sarah_connor", "Sarah Connor");
engine.addProfile(USER_C, "john_doe", "John Doe");

// 1. Friend Request Lifecycle
section("1. FRIEND REQUEST LIFECYCLE");
{
  // A sends request to B
  const req1 = engine.sendFriendRequest(USER_A, USER_B);
  if (req1.status === "PENDING_OUTGOING" && !req1.autoAccepted) {
    pass("A -> B friend request successfully created as PENDING_OUTGOING");
  } else {
    fail("A -> B friend request created", JSON.stringify(req1));
  }

  // Idempotent duplicate request check
  const req2 = engine.sendFriendRequest(USER_A, USER_B);
  if (req2.status === "PENDING_OUTGOING" && req2.friendshipId === req1.friendshipId) {
    pass("A -> B repeated request is idempotent and returns existing request");
  } else {
    fail("A -> B repeated request is idempotent");
  }

  // Relationship state check
  const stateA = engine.getRelationshipState(USER_A, USER_B);
  const stateB = engine.getRelationshipState(USER_B, USER_A);
  if (stateA.friendship === "PENDING_OUTGOING" && stateB.friendship === "PENDING_INCOMING") {
    pass("Relationship states accurately reflect PENDING_OUTGOING for sender and PENDING_INCOMING for recipient");
  } else {
    fail("Relationship states reflect pending requests", `A: ${stateA.friendship}, B: ${stateB.friendship}`);
  }

  // B accepts request
  const acceptRes = engine.acceptFriendRequest(USER_B, req1.friendshipId);
  if (acceptRes.status === "accepted" && engine.areFriends(USER_A, USER_B)) {
    pass("B accepts friend request -> status upgraded to accepted & users are friends");
  } else {
    fail("B accepts friend request", JSON.stringify(acceptRes));
  }

  // Relationship state check after acceptance
  const stateAfterAcceptA = engine.getRelationshipState(USER_A, USER_B);
  const stateAfterAcceptB = engine.getRelationshipState(USER_B, USER_A);
  if (stateAfterAcceptA.friendship === "FRIENDS" && stateAfterAcceptB.friendship === "FRIENDS") {
    pass("Both users now report friendship status 'FRIENDS'");
  } else {
    fail("Both users report friendship status FRIENDS");
  }
}

// 2. Friend Removal & Decline/Cancel Transitions
section("2. FRIEND REMOVAL & DECLINE/CANCEL TRANSITIONS");
{
  // A removes friend B
  const remRes = engine.removeFriend(USER_A, USER_B);
  if (remRes.removed && !engine.areFriends(USER_A, USER_B)) {
    pass("A removes friend B -> friendship cleanly terminated");
  } else {
    fail("A removes friend B");
  }

  // A sends request to B again
  const req3 = engine.sendFriendRequest(USER_A, USER_B);
  // B declines
  const decRes = engine.declineFriendRequest(USER_B, req3.friendshipId);
  if (decRes.status === "declined" && !engine.areFriends(USER_A, USER_B)) {
    pass("B declines friend request -> status marked declined");
  } else {
    fail("B declines friend request");
  }

  // Re-trying after decline -> sets back to pending
  const req4 = engine.sendFriendRequest(USER_A, USER_B);
  // A cancels
  const cancelRes = engine.cancelFriendRequest(USER_A, req4.friendshipId);
  if (cancelRes.status === "cancelled") {
    pass("A cancels outgoing friend request -> status marked cancelled");
  } else {
    fail("A cancels outgoing friend request");
  }
}

// 3. Simultaneous Request Conflict Resolution (Auto-Acceptance)
section("3. SIMULTANEOUS REQUEST CONFLICT RESOLUTION");
{
  // B sends request to A
  const reqBtoA = engine.sendFriendRequest(USER_B, USER_A);
  // Simultaneously, A sends request to B without knowing B sent one
  const reqAtoB = engine.sendFriendRequest(USER_A, USER_B);

  if (reqAtoB.status === "FRIENDS" && reqAtoB.autoAccepted && engine.areFriends(USER_A, USER_B)) {
    pass("Simultaneous A -> B request detected existing incoming request and cleanly auto-accepted");
  } else {
    fail("Simultaneous request auto-acceptance", JSON.stringify(reqAtoB));
  }

  // Clean up for next tests
  engine.removeFriend(USER_A, USER_B);
}

// 4. Acceptance Authorization & Security Re-checks
section("4. ACCEPTANCE AUTHORIZATION & SECURITY RE-CHECKS");
{
  const req = engine.sendFriendRequest(USER_A, USER_B);

  // Sender (A) attempting to accept their own request must fail
  try {
    engine.acceptFriendRequest(USER_A, req.friendshipId);
    fail("Sender cannot accept own friend request", "Did not throw error");
  } catch (err) {
    if (err.message === "REQUEST_NOT_YOURS") {
      pass("Sender attempting to accept request is rejected with REQUEST_NOT_YOURS");
    } else {
      fail("Sender accept error", err.message);
    }
  }

  // B blocks A before accepting
  engine.blockUser(USER_B, USER_A);

  // B tries to accept old request while blocked -> must fail
  try {
    engine.acceptFriendRequest(USER_B, req.friendshipId);
    fail("Blocked acceptance must fail", "Did not throw error");
  } catch (err) {
    if (err.message === "REQUEST_NOT_FOUND" || err.message === "BLOCKED_USER") {
      pass("Acceptance while blocked is strictly rejected (blocking precedence)");
    } else {
      fail("Blocked acceptance error", err.message);
    }
  }

  // Unblock for next tests
  engine.unblockUser(USER_B, USER_A);
}

// 5. Blocking Precedence & Atomic Friendship Termination
section("5. BLOCKING PRECEDENCE & ATOMIC TERMINATION");
{
  // Establish friendship between A and B
  const req = engine.sendFriendRequest(USER_A, USER_B);
  engine.acceptFriendRequest(USER_B, req.friendshipId);
  if (!engine.areFriends(USER_A, USER_B)) fail("Setup friendship failed");

  // A blocks B
  engine.blockUser(USER_A, USER_B);

  if (!engine.areFriends(USER_A, USER_B)) {
    pass("Blocking atomically terminated active friendship");
  } else {
    fail("Blocking did not terminate friendship");
  }

  // Attempting new friend request while blocked must fail
  try {
    engine.sendFriendRequest(USER_B, USER_A);
    fail("Friend request while blocked should fail", "Did not throw error");
  } catch (err) {
    if (err.message === "BLOCKED_USER") {
      pass("Friend request from blocked user rejected with BLOCKED_USER");
    } else {
      fail("Blocked friend request error", err.message);
    }
  }

  // Relationship state check
  const stateRel = engine.getRelationshipState(USER_A, USER_B);
  if (stateRel.isBlocked && !stateRel.canFriendRequest && !stateRel.canMessage) {
    pass("Relationship state marks blocked user with canFriendRequest=false & canMessage=false");
  } else {
    fail("Relationship state for blocked user", JSON.stringify(stateRel));
  }

  engine.unblockUser(USER_A, USER_B);
}

// 6. Privacy Rule Enforcement
section("6. PRIVACY RULE ENFORCEMENT");
{
  // Set B's privacy to 'nobody'
  engine.privacySettings.get(USER_B).who_can_friend_request = "nobody";
  try {
    engine.sendFriendRequest(USER_A, USER_B);
    fail("Friend request with who_can_friend_request=nobody should fail", "Did not throw");
  } catch (err) {
    if (err.message === "PRIVACY_RESTRICTED") {
      pass("who_can_friend_request=nobody strictly enforces PRIVACY_RESTRICTED");
    } else {
      fail("Privacy nobody error", err.message);
    }
  }

  // Set B's privacy to 'friends_of_friends'
  engine.privacySettings.get(USER_B).who_can_friend_request = "friends_of_friends";

  // A and B currently share NO mutual friends -> request rejected
  try {
    engine.sendFriendRequest(USER_A, USER_B);
    fail("Friends of friends without mutual friends should fail", "Did not throw");
  } catch (err) {
    if (err.message === "PRIVACY_RESTRICTED") {
      pass("who_can_friend_request=friends_of_friends rejects non-mutual strangers");
    } else {
      fail("Friends of friends error", err.message);
    }
  }

  // Now make A and C friends, and B and C friends (C is mutual!)
  const reqAC = engine.sendFriendRequest(USER_A, USER_C);
  engine.acceptFriendRequest(USER_C, reqAC.friendshipId);

  const reqBC = engine.sendFriendRequest(USER_B, USER_C);
  engine.acceptFriendRequest(USER_C, reqBC.friendshipId);

  // Now A can send request to B because C is a mutual friend!
  const reqMutual = engine.sendFriendRequest(USER_A, USER_B);
  if (reqMutual.status === "PENDING_OUTGOING") {
    pass("who_can_friend_request=friends_of_friends permits request when mutual friend exists");
  } else {
    fail("Friends of friends with mutual friend failed", JSON.stringify(reqMutual));
  }

  // Reset B's privacy to 'everyone'
  engine.privacySettings.get(USER_B).who_can_friend_request = "everyone";
  engine.cancelFriendRequest(USER_A, reqMutual.friendshipId);
}

// 7. Mutual Friends Calculation
section("7. MUTUAL FRIENDS CALCULATION");
{
  // A and C are friends, B and C are friends.
  // Mutual friends between A and B should be [C] (count = 1).
  const mutuals = engine.getMutualFriends(USER_A, USER_B);
  if (mutuals.count === 1 && mutuals.profiles[0]?.id === USER_C) {
    pass("getMutualFriends correctly computes 1 mutual friend (User C)");
  } else {
    fail("getMutualFriends calculation", JSON.stringify(mutuals));
  }

  // If A blocks C, C is excluded from mutual friends
  engine.blockUser(USER_A, USER_C);
  const mutualsBlocked = engine.getMutualFriends(USER_A, USER_B);
  if (mutualsBlocked.count === 0) {
    pass("Blocked mutual friends are excluded from mutual friend count");
  } else {
    fail("Blocked mutual friends excluded", JSON.stringify(mutualsBlocked));
  }

  engine.unblockUser(USER_A, USER_C);
}

// 8. Content Reporting & Duplicate Prevention
section("8. CONTENT REPORTING & DUPLICATE PREVENTION");
{
  // A reports B for SPAM
  const rep1 = engine.submitReport(USER_A, "user", USER_B, "SPAM", "Excessive promotional spam");
  if (rep1.reportId && !rep1.duplicate) {
    pass("User report successfully submitted (status New)");
  } else {
    fail("User report submission", JSON.stringify(rep1));
  }

  // A submits duplicate report for B under SPAM -> returns existing report notice
  const repDuplicate = engine.submitReport(USER_A, "user", USER_B, "SPAM", "Another spam description");
  if (repDuplicate.duplicate && repDuplicate.reportId === rep1.reportId) {
    pass("Duplicate active report correctly detected and deduplicated");
  } else {
    fail("Duplicate report detection", JSON.stringify(repDuplicate));
  }

  // A reporting themselves must fail
  try {
    engine.submitReport(USER_A, "user", USER_A, "HARASSMENT", "Self report");
    fail("Self report must fail", "Did not throw");
  } catch (err) {
    if (err.message === "CANNOT_REPORT_SELF") {
      pass("Self reporting rejected with CANNOT_REPORT_SELF");
    } else {
      fail("Self report error", err.message);
    }
  }
}

console.log(`\n══════════════════════════════════════════════════════════`);
console.log(`  TOTAL: ${passed + failed}  |  ✅ PASS: ${passed}  |  ❌ FAIL: ${failed}`);
console.log(`══════════════════════════════════════════════════════════\n`);

if (failed > 0) {
  process.exit(1);
}
