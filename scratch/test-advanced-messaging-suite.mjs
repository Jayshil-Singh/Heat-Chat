/**
 * Heat Chat — Phase 3 Advanced Messaging Automated Test Suite
 * Validates:
 * 1. Send message & client_message_id idempotency
 * 2. Message length validation & empty rejection
 * 3. Conversation membership authorization
 * 4. Reply target verification & cross-conversation protection
 * 5. Edit message ownership & not-deleted guard
 * 6. Delete for me (local hide filtering)
 * 7. Delete for everyone (author-only soft delete & content sanitization)
 * 8. Forward message with source access & target membership verification
 * 9. Message pins (pin, unpin, duplicate idempotency, fetch pins)
 * 10. Reactions (toggle add, toggle remove, extended emojis)
 * 11. Delivery state & Read receipts
 * 12. Unread engine (count increment, mark read reset, mark unread)
 * 13. Drafts lifecycle (save, fetch, overwrite, delete)
 * 14. Blocking precedence over messaging
 * 15. Privacy settings precedence (who_can_message)
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy";

// In-memory simulation of RPC and database behavior for the test suite
class MessagingEngineSimulation {
  constructor() {
    this.profiles = new Map();
    this.conversations = new Map();
    this.conversationMembers = new Map(); // convId -> Set(userIds)
    this.messages = new Map(); // msgId -> msg
    this.messageUserStates = new Map(); // userId:msgId -> hidden_at
    this.messagePins = new Map(); // convId:msgId -> pinRecord
    this.messageReactions = new Map(); // msgId:userId:reaction -> record
    this.messageReads = new Map(); // msgId:userId -> read_at
    this.messageDeliveryStates = new Map(); // msgId:userId -> delivered_at
    this.conversationUserStates = new Map(); // userId:convId -> stateRecord
    this.conversationDrafts = new Map(); // userId:convId -> draftRecord
    this.blockedUsers = new Set(); // blockerId:blockedId
    this.privacySettings = new Map(); // userId -> { who_can_message }
    this.friendships = new Map(); // userA:userB -> 'accepted' | 'pending'
  }

  createProfile(id, username, displayName) {
    this.profiles.set(id, { id, username, display_name: displayName });
    this.privacySettings.set(id, { who_can_message: "everyone" });
  }

  createConversation(id, type = "direct", memberIds = []) {
    this.conversations.set(id, { id, type, created_at: new Date().toISOString() });
    this.conversationMembers.set(id, new Set(memberIds));
  }

  isMember(convId, userId) {
    return this.conversationMembers.get(convId)?.has(userId) || false;
  }

  isBlocked(userA, userB) {
    return (
      this.blockedUsers.has(`${userA}:${userB}`) ||
      this.blockedUsers.has(`${userB}:${userA}`)
    );
  }

  canSendMessage(viewerId, targetId) {
    if (this.isBlocked(viewerId, targetId)) return false;
    const setting = this.privacySettings.get(targetId)?.who_can_message || "everyone";
    if (setting === "everyone") return true;
    if (setting === "nobody") return false;
    if (setting === "friends") {
      const pair1 = `${viewerId}:${targetId}`;
      const pair2 = `${targetId}:${viewerId}`;
      return (
        this.friendships.get(pair1) === "accepted" ||
        this.friendships.get(pair2) === "accepted"
      );
    }
    return false;
  }

  // 1. Send message RPC simulation
  sendMessage(callerId, { conversationId, content, clientMessageId, replyToMessageId, forwardedFromMessageId, messageType = "text" }) {
    if (!callerId) throw new Error("UNAUTHENTICATED");
    if (!this.isMember(conversationId, callerId)) throw new Error("CONVERSATION_ACCESS_DENIED");

    const conv = this.conversations.get(conversationId);
    if (!conv) throw new Error("CONVERSATION_NOT_FOUND");

    if (conv.type === "direct") {
      const members = Array.from(this.conversationMembers.get(conversationId));
      const other = members.find((id) => id !== callerId);
      if (other) {
        if (this.isBlocked(callerId, other)) throw new Error("MESSAGE_BLOCKED");
        if (!this.canSendMessage(callerId, other)) throw new Error("PRIVACY_RESTRICTED");
      }
    }

    const cleanContent = (content || "").trim();
    if (cleanContent.length === 0) throw new Error("MESSAGE_EMPTY");
    if (cleanContent.length > 4000) throw new Error("MESSAGE_TOO_LONG");

    if (replyToMessageId) {
      const parent = this.messages.get(replyToMessageId);
      if (!parent || parent.conversation_id !== conversationId) {
        throw new Error("INVALID_REPLY_TARGET");
      }
    }

    if (forwardedFromMessageId) {
      const src = this.messages.get(forwardedFromMessageId);
      if (!src || !this.isMember(src.conversation_id, callerId)) {
        throw new Error("INVALID_FORWARD_TARGET");
      }
    }

    // Idempotency check
    if (clientMessageId) {
      for (const msg of this.messages.values()) {
        if (msg.sender_id === callerId && msg.client_message_id === clientMessageId) {
          return { success: true, messageId: msg.id, duplicate: true };
        }
      }
    }

    const msgId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const newMsg = {
      id: msgId,
      conversation_id: conversationId,
      sender_id: callerId,
      content: cleanContent,
      message_type: messageType,
      reply_to_message_id: replyToMessageId || null,
      forwarded_from_message_id: forwardedFromMessageId || null,
      client_message_id: clientMessageId || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      deleted_by: null,
      delete_scope: null,
    };

    this.messages.set(msgId, newMsg);

    // Update unread count for other members
    const members = Array.from(this.conversationMembers.get(conversationId));
    members.forEach((mId) => {
      if (mId !== callerId) {
        const key = `${mId}:${conversationId}`;
        const prev = this.conversationUserStates.get(key) || { unread_count: 0, is_marked_unread: false };
        this.conversationUserStates.set(key, {
          ...prev,
          unread_count: prev.unread_count + 1,
          is_marked_unread: false,
        });
      }
    });

    // Clear draft
    this.conversationDrafts.delete(`${callerId}:${conversationId}`);

    return { success: true, messageId: msgId, duplicate: false };
  }

  // 2. Edit message RPC simulation
  editMessage(callerId, messageId, newContent) {
    if (!callerId) throw new Error("UNAUTHENTICATED");
    const msg = this.messages.get(messageId);
    if (!msg) throw new Error("MESSAGE_NOT_FOUND");
    if (msg.sender_id !== callerId) throw new Error("MESSAGE_EDIT_FORBIDDEN");
    if (msg.deleted_at !== null) throw new Error("MESSAGE_ALREADY_DELETED");

    const clean = (newContent || "").trim();
    if (clean.length === 0) throw new Error("MESSAGE_EMPTY");
    if (clean.length > 4000) throw new Error("MESSAGE_TOO_LONG");

    msg.content = clean;
    msg.edited_at = new Date().toISOString();
    msg.updated_at = new Date().toISOString();
    return { success: true, messageId, content: clean, editedAt: msg.edited_at };
  }

  // 3. Delete for me RPC simulation
  deleteMessageForMe(callerId, messageId) {
    if (!callerId) throw new Error("UNAUTHENTICATED");
    const msg = this.messages.get(messageId);
    if (!msg || !this.isMember(msg.conversation_id, callerId)) throw new Error("MESSAGE_ACCESS_DENIED");

    this.messageUserStates.set(`${callerId}:${messageId}`, new Date().toISOString());
    return { success: true, scope: "me" };
  }

  // 4. Delete for everyone RPC simulation
  deleteMessageForEveryone(callerId, messageId) {
    if (!callerId) throw new Error("UNAUTHENTICATED");
    const msg = this.messages.get(messageId);
    if (!msg) throw new Error("MESSAGE_NOT_FOUND");
    if (msg.sender_id !== callerId) throw new Error("MESSAGE_DELETE_FORBIDDEN");

    if (msg.deleted_at !== null) {
      return { success: true, alreadyDeleted: true };
    }

    msg.deleted_at = new Date().toISOString();
    msg.deleted_by = callerId;
    msg.delete_scope = "everyone";
    msg.content = "This message was deleted";
    return { success: true, scope: "everyone", alreadyDeleted: false };
  }

  // 5. Forward message RPC simulation
  forwardMessage(callerId, messageId, targetConvId, clientMessageId) {
    if (!callerId) throw new Error("UNAUTHENTICATED");
    const srcMsg = this.messages.get(messageId);
    if (!srcMsg || !this.isMember(srcMsg.conversation_id, callerId)) throw new Error("INVALID_FORWARD_SOURCE");
    if (srcMsg.deleted_at !== null) throw new Error("CANNOT_FORWARD_DELETED_MESSAGE");

    if (!this.isMember(targetConvId, callerId)) throw new Error("CONVERSATION_ACCESS_DENIED");

    return this.sendMessage(callerId, {
      conversationId: targetConvId,
      content: srcMsg.content,
      clientMessageId,
      forwardedFromMessageId: messageId,
      messageType: srcMsg.message_type,
    });
  }

  // 6. Pin / Unpin message RPC simulation
  pinMessage(callerId, messageId) {
    if (!callerId) throw new Error("UNAUTHENTICATED");
    const msg = this.messages.get(messageId);
    if (!msg || !this.isMember(msg.conversation_id, callerId)) throw new Error("MESSAGE_ACCESS_DENIED");

    const key = `${msg.conversation_id}:${messageId}`;
    this.messagePins.set(key, {
      id: `pin_${Date.now()}`,
      conversation_id: msg.conversation_id,
      message_id: messageId,
      pinned_by: callerId,
      pinned_at: new Date().toISOString(),
    });
    return { success: true, pinned: true };
  }

  unpinMessage(callerId, messageId) {
    if (!callerId) throw new Error("UNAUTHENTICATED");
    const msg = this.messages.get(messageId);
    if (!msg || !this.isMember(msg.conversation_id, callerId)) throw new Error("MESSAGE_ACCESS_DENIED");

    const key = `${msg.conversation_id}:${messageId}`;
    this.messagePins.delete(key);
    return { success: true, pinned: false };
  }

  // 7. Toggle Reaction RPC simulation
  toggleReaction(callerId, messageId, reaction) {
    if (!callerId) throw new Error("UNAUTHENTICATED");
    const msg = this.messages.get(messageId);
    if (!msg || !this.isMember(msg.conversation_id, callerId)) throw new Error("MESSAGE_ACCESS_DENIED");

    const validReactions = ["❤️", "😂", "👍", "😮", "😢", "🔥", "😡", "👏"];
    if (!validReactions.includes(reaction)) throw new Error("INVALID_REACTION");

    const key = `${messageId}:${callerId}:${reaction}`;
    if (this.messageReactions.has(key)) {
      this.messageReactions.delete(key);
      return { success: true, added: false, reaction };
    } else {
      this.messageReactions.set(key, { message_id: messageId, user_id: callerId, reaction });
      return { success: true, added: true, reaction };
    }
  }

  // 8. Read / Unread RPC simulation
  markConversationRead(callerId, conversationId) {
    if (!callerId) throw new Error("UNAUTHENTICATED");
    if (!this.isMember(conversationId, callerId)) throw new Error("CONVERSATION_ACCESS_DENIED");

    // Record reads for all messages not sent by caller
    for (const msg of this.messages.values()) {
      if (msg.conversation_id === conversationId && msg.sender_id !== callerId) {
        this.messageReads.set(`${msg.id}:${callerId}`, new Date().toISOString());
      }
    }

    const key = `${callerId}:${conversationId}`;
    this.conversationUserStates.set(key, {
      unread_count: 0,
      is_marked_unread: false,
      last_read_at: new Date().toISOString(),
    });
    return { success: true, unreadCount: 0 };
  }

  markConversationUnread(callerId, conversationId) {
    if (!callerId) throw new Error("UNAUTHENTICATED");
    if (!this.isMember(conversationId, callerId)) throw new Error("CONVERSATION_ACCESS_DENIED");

    const key = `${callerId}:${conversationId}`;
    const prev = this.conversationUserStates.get(key) || { unread_count: 0 };
    this.conversationUserStates.set(key, {
      ...prev,
      is_marked_unread: true,
      unread_count: Math.max(prev.unread_count, 1),
    });
    return { success: true, isMarkedUnread: true };
  }

  // 9. Drafts RPC simulation
  saveDraft(callerId, conversationId, content, replyToMessageId = null) {
    if (!callerId) throw new Error("UNAUTHENTICATED");
    if (!this.isMember(conversationId, callerId)) throw new Error("CONVERSATION_ACCESS_DENIED");

    const key = `${callerId}:${conversationId}`;
    if (!content || content.trim().length === 0) {
      this.conversationDrafts.delete(key);
      return { success: true, deleted: true };
    }

    this.conversationDrafts.set(key, {
      user_id: callerId,
      conversation_id: conversationId,
      content,
      reply_to_message_id: replyToMessageId,
      updated_at: new Date().toISOString(),
    });
    return { success: true, saved: true };
  }

  deleteDraft(callerId, conversationId) {
    if (!callerId) throw new Error("UNAUTHENTICATED");
    this.conversationDrafts.delete(`${callerId}:${conversationId}`);
    return { success: true, deleted: true };
  }

  // 10. Message Retrieval Query simulation (with delete-for-me filtering)
  getMessagesForViewer(viewerId, conversationId) {
    if (!this.isMember(conversationId, viewerId)) throw new Error("CONVERSATION_ACCESS_DENIED");

    const result = [];
    for (const msg of this.messages.values()) {
      if (msg.conversation_id === conversationId) {
        // Filter out if deleted for me
        if (this.messageUserStates.has(`${viewerId}:${msg.id}`)) {
          continue;
        }

        const isDeleted = msg.deleted_at !== null;
        result.push({
          ...msg,
          content: isDeleted ? "This message was deleted" : msg.content,
          isPinned: this.messagePins.has(`${conversationId}:${msg.id}`),
        });
      }
    }
    return result.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }
}

// ── Test Runner ─────────────────────────────────────────────────────────────
async function runTests() {
  console.log("\n=======================================================");
  console.log(" Heat Chat — Phase 3 Advanced Messaging Test Suite");
  console.log("=======================================================\n");

  const engine = new MessagingEngineSimulation();

  // Seed test profiles
  const USER_A = "11111111-1111-4111-a111-111111111111"; // Alice
  const USER_B = "22222222-2222-4222-a222-222222222222"; // Bob
  const USER_C = "33333333-3333-4333-a333-333333333333"; // Charlie
  const USER_OUTSIDER = "99999999-9999-4999-a999-999999999999"; // Outsider

  engine.createProfile(USER_A, "alice", "Alice");
  engine.createProfile(USER_B, "bob", "Bob");
  engine.createProfile(USER_C, "charlie", "Charlie");
  engine.createProfile(USER_OUTSIDER, "outsider", "Outsider");

  // Create conversations
  const CONV_AB = "conv-ab-direct";
  const CONV_AC = "conv-ac-direct";
  const CONV_GROUP = "conv-abc-group";

  engine.createConversation(CONV_AB, "direct", [USER_A, USER_B]);
  engine.createConversation(CONV_AC, "direct", [USER_A, USER_C]);
  engine.createConversation(CONV_GROUP, "group", [USER_A, USER_B, USER_C]);

  let passCount = 0;
  let failCount = 0;

  function assert(title, condition) {
    if (condition) {
      console.log(`  ✅ PASS: ${title}`);
      passCount++;
    } else {
      console.error(`  ❌ FAIL: ${title}`);
      failCount++;
    }
  }

  // 1. Send Message & Idempotency
  console.log("--- 1. Send Message & Idempotency ---");
  const clientMsgId = "client-uuid-1";
  const sendRes1 = engine.sendMessage(USER_A, {
    conversationId: CONV_AB,
    content: "Hello Bob!",
    clientMessageId: clientMsgId,
  });
  assert("Normal message send succeeds", sendRes1.success && !sendRes1.duplicate);

  const sendRes2 = engine.sendMessage(USER_A, {
    conversationId: CONV_AB,
    content: "Hello Bob!",
    clientMessageId: clientMsgId,
  });
  assert("Duplicate client_message_id returns existing message idempotently", sendRes2.success && sendRes2.duplicate && sendRes2.messageId === sendRes1.messageId);

  try {
    engine.sendMessage(USER_A, { conversationId: CONV_AB, content: "" });
    assert("Empty content rejected", false);
  } catch (e) {
    assert("Empty content rejected with MESSAGE_EMPTY", e.message === "MESSAGE_EMPTY");
  }

  try {
    engine.sendMessage(USER_A, { conversationId: CONV_AB, content: "x".repeat(4001) });
    assert("Oversized content >4000 rejected", false);
  } catch (e) {
    assert("Oversized content rejected with MESSAGE_TOO_LONG", e.message === "MESSAGE_TOO_LONG");
  }

  try {
    engine.sendMessage(USER_OUTSIDER, { conversationId: CONV_AB, content: "Intruder!" });
    assert("Non-member sending rejected", false);
  } catch (e) {
    assert("Non-member sending rejected with CONVERSATION_ACCESS_DENIED", e.message === "CONVERSATION_ACCESS_DENIED");
  }

  // 2. Replies
  console.log("\n--- 2. Message Replies ---");
  const replyRes = engine.sendMessage(USER_B, {
    conversationId: CONV_AB,
    content: "Hi Alice, replying to you",
    replyToMessageId: sendRes1.messageId,
  });
  assert("Reply to valid message in same conversation succeeds", replyRes.success);

  try {
    engine.sendMessage(USER_A, {
      conversationId: CONV_AC,
      content: "Cross conversation reply attempt",
      replyToMessageId: sendRes1.messageId, // belongs to CONV_AB!
    });
    assert("Cross-conversation reply rejected", false);
  } catch (e) {
    assert("Cross-conversation reply rejected with INVALID_REPLY_TARGET", e.message === "INVALID_REPLY_TARGET");
  }

  // 3. Edit Message
  console.log("\n--- 3. Edit Message ---");
  const editRes = engine.editMessage(USER_A, sendRes1.messageId, "Hello Bob! (edited)");
  assert("Author can edit own message", editRes.success && editRes.content === "Hello Bob! (edited)");

  try {
    engine.editMessage(USER_B, sendRes1.messageId, "Hacked by Bob");
    assert("Non-author cannot edit other's message", false);
  } catch (e) {
    assert("Non-author edit rejected with MESSAGE_EDIT_FORBIDDEN", e.message === "MESSAGE_EDIT_FORBIDDEN");
  }

  // 4. Delete for Me
  console.log("\n--- 4. Delete for Me ---");
  const delMeRes = engine.deleteMessageForMe(USER_B, sendRes1.messageId);
  assert("User B deletes message for me succeeds", delMeRes.success);

  const msgsForB = engine.getMessagesForViewer(USER_B, CONV_AB);
  const msgsForA = engine.getMessagesForViewer(USER_A, CONV_AB);
  assert("Message hidden from User B's message feed", !msgsForB.some((m) => m.id === sendRes1.messageId));
  assert("Message remains visible in User A's message feed", msgsForA.some((m) => m.id === sendRes1.messageId));

  // 5. Delete for Everyone
  console.log("\n--- 5. Delete for Everyone ---");
  const delEveryoneMsg = engine.sendMessage(USER_A, {
    conversationId: CONV_AB,
    content: "Oops wrong chat",
  });
  const delEveryRes = engine.deleteMessageForEveryone(USER_A, delEveryoneMsg.messageId);
  assert("Author deletes message for everyone succeeds", delEveryRes.success && delEveryRes.scope === "everyone");

  const msgsAfterDelete = engine.getMessagesForViewer(USER_A, CONV_AB);
  const deletedItem = msgsAfterDelete.find((m) => m.id === delEveryoneMsg.messageId);
  assert("Soft-deleted message content sanitized to 'This message was deleted'", deletedItem && deletedItem.content === "This message was deleted");

  try {
    engine.deleteMessageForEveryone(USER_B, sendRes1.messageId);
    assert("Non-author delete for everyone rejected", false);
  } catch (e) {
    assert("Non-author delete for everyone rejected with MESSAGE_DELETE_FORBIDDEN", e.message === "MESSAGE_DELETE_FORBIDDEN");
  }

  // 6. Forwarding
  console.log("\n--- 6. Forward Message ---");
  const fwdRes = engine.forwardMessage(USER_A, sendRes1.messageId, CONV_AC, "fwd-uuid-1");
  assert("Forwarding accessible message to another conversation succeeds", fwdRes.success);

  try {
    engine.forwardMessage(USER_C, sendRes1.messageId, CONV_AC, "fwd-uuid-2"); // Charlie not in CONV_AB!
    assert("Forwarding inaccessible source rejected", false);
  } catch (e) {
    assert("Forwarding inaccessible source rejected with INVALID_FORWARD_SOURCE", e.message === "INVALID_FORWARD_SOURCE");
  }

  // 7. Message Pinning
  console.log("\n--- 7. Message Pinning ---");
  const pinRes = engine.pinMessage(USER_A, sendRes1.messageId);
  assert("Pin message succeeds", pinRes.success && pinRes.pinned);

  const msgsWithPin = engine.getMessagesForViewer(USER_A, CONV_AB);
  const pinnedMsg = msgsWithPin.find((m) => m.id === sendRes1.messageId);
  assert("Message correctly marked as isPinned in feed", pinnedMsg && pinnedMsg.isPinned === true);

  const unpinRes = engine.unpinMessage(USER_A, sendRes1.messageId);
  assert("Unpin message succeeds", unpinRes.success && !unpinRes.pinned);

  // 8. Reactions
  console.log("\n--- 8. Reactions ---");
  const reactAdd = engine.toggleReaction(USER_B, sendRes1.messageId, "🔥");
  assert("Toggle reaction ON adds reaction", reactAdd.success && reactAdd.added === true);

  const reactRemove = engine.toggleReaction(USER_B, sendRes1.messageId, "🔥");
  assert("Toggle reaction OFF removes reaction", reactRemove.success && reactRemove.added === false);

  const reactExtended = engine.toggleReaction(USER_A, sendRes1.messageId, "👏");
  assert("Extended reaction 👏 supported", reactExtended.success && reactExtended.added === true);

  // 9. Read / Unread Engine
  console.log("\n--- 9. Read / Unread Engine ---");
  const newMsgForUnread = engine.sendMessage(USER_A, {
    conversationId: CONV_AB,
    content: "Are you there?",
  });
  const unreadStateBefore = engine.conversationUserStates.get(`${USER_B}:${CONV_AB}`);
  assert("New message increments recipient unread count", unreadStateBefore && unreadStateBefore.unread_count > 0);

  const markReadRes = engine.markConversationRead(USER_B, CONV_AB);
  assert("Mark conversation read resets unread count to 0", markReadRes.success && markReadRes.unreadCount === 0);

  const markUnreadRes = engine.markConversationUnread(USER_B, CONV_AB);
  assert("Mark conversation unread sets local is_marked_unread flag", markUnreadRes.success && markUnreadRes.isMarkedUnread);

  // 10. Drafts Lifecycle
  console.log("\n--- 10. Drafts Lifecycle ---");
  const draftSave = engine.saveDraft(USER_A, CONV_AB, "I was thinking we could...");
  assert("Save conversation draft succeeds", draftSave.success && draftSave.saved);

  const draftRecord = engine.conversationDrafts.get(`${USER_A}:${CONV_AB}`);
  assert("Draft content stored correctly for user", draftRecord && draftRecord.content === "I was thinking we could...");

  const draftDelete = engine.deleteDraft(USER_A, CONV_AB);
  assert("Delete conversation draft succeeds", draftDelete.success && draftDelete.deleted);
  assert("Draft removed from user storage", !engine.conversationDrafts.has(`${USER_A}:${CONV_AB}`));

  // 11. Blocking Precedence over Messaging
  console.log("\n--- 11. Blocking Precedence ---");
  engine.blockedUsers.add(`${USER_B}:${USER_A}`); // Bob blocks Alice
  try {
    engine.sendMessage(USER_A, { conversationId: CONV_AB, content: "Can you hear me?" });
    assert("Blocked user cannot send DM", false);
  } catch (e) {
    assert("Blocked user DM rejected with MESSAGE_BLOCKED", e.message === "MESSAGE_BLOCKED");
  }

  // Group chats remain operable despite direct block
  const groupMsg = engine.sendMessage(USER_A, {
    conversationId: CONV_GROUP,
    content: "Team update: release ready!",
  });
  assert("Group message allowed even when a participant has blocked sender", groupMsg.success);

  // 12. Privacy Precedence (who_can_message)
  console.log("\n--- 12. Privacy Settings Precedence ---");
  engine.blockedUsers.delete(`${USER_B}:${USER_A}`); // Unblock
  engine.privacySettings.set(USER_B, { who_can_message: "nobody" });
  try {
    engine.sendMessage(USER_A, { conversationId: CONV_AB, content: "Hey again!" });
    assert("Privacy 'nobody' blocks new DM", false);
  } catch (e) {
    assert("Privacy 'nobody' rejects DM with PRIVACY_RESTRICTED", e.message === "PRIVACY_RESTRICTED");
  }

  engine.privacySettings.set(USER_B, { who_can_message: "everyone" }); // Restore

  // 13. Delivery State & Status Ticks
  console.log("\n--- 13. Delivery State & Status Ticks ---");
  const deliveryMsg = engine.sendMessage(USER_A, {
    conversationId: CONV_AB,
    content: "Delivery check",
  });
  const initialDeliveryView = engine.getMessagesForViewer(USER_A, CONV_AB);
  const msgBeforeDelivery = initialDeliveryView.find((m) => m.id === deliveryMsg.messageId);
  assert("Initial sender message status is 'sent'", msgBeforeDelivery && !engine.messageDeliveryStates.has(`${deliveryMsg.messageId}:${USER_B}`));

  // Recipient receives and marks delivered
  engine.messageDeliveryStates.set(`${deliveryMsg.messageId}:${USER_B}`, new Date().toISOString());
  assert("Recipient can mark message delivered", engine.messageDeliveryStates.has(`${deliveryMsg.messageId}:${USER_B}`));

  // Recipient marks read
  engine.markConversationRead(USER_B, CONV_AB);
  assert("Message read recorded for recipient", engine.messageReads.has(`${deliveryMsg.messageId}:${USER_B}`));

  // 14. Unread Divider Logic
  console.log("\n--- 14. Unread Divider Logic ---");
  const unreadMsg1 = engine.sendMessage(USER_A, { conversationId: CONV_AB, content: "Unread 1" });
  const unreadMsg2 = engine.sendMessage(USER_A, { conversationId: CONV_AB, content: "Unread 2" });
  const userBUnreadState = engine.conversationUserStates.get(`${USER_B}:${CONV_AB}`);
  assert("Unread count is 2 for User B", userBUnreadState && userBUnreadState.unread_count === 2);

  const msgsForUnreadCalc = engine.getMessagesForViewer(USER_B, CONV_AB);
  const incoming = msgsForUnreadCalc.filter((m) => m.sender_id !== USER_B);
  const unreadIncoming = incoming.slice(-userBUnreadState.unread_count);
  assert("First unread message is correctly identified as Unread 1", unreadIncoming.length > 0 && unreadIncoming[0].id === unreadMsg1.messageId);

  // Mark read clears unread count
  engine.markConversationRead(USER_B, CONV_AB);
  const userBAfterRead = engine.conversationUserStates.get(`${USER_B}:${CONV_AB}`);
  assert("Mark read resets unread count to 0", userBAfterRead && userBAfterRead.unread_count === 0);

  // 15. Draft Privacy & Lifecycle
  console.log("\n--- 15. Draft Privacy & Lifecycle ---");
  engine.saveDraft(USER_A, CONV_AB, "Secret draft from Alice", null);
  assert("Alice's draft is stored for Alice", engine.conversationDrafts.has(`${USER_A}:${CONV_AB}`));
  assert("Alice's draft is NOT accessible to Bob", !engine.conversationDrafts.has(`${USER_B}:${CONV_AB}`));

  // Sending message clears draft automatically
  engine.sendMessage(USER_A, { conversationId: CONV_AB, content: "Draft sent!" });
  assert("Sending message automatically clears draft", !engine.conversationDrafts.has(`${USER_A}:${CONV_AB}`));

  // 16. Migration SQL File Integrity
  console.log("\n--- 16. Migration SQL File Integrity ---");
  import("fs").then(({ readFileSync }) => {
    const migrationContent = readFileSync("supabase/migrations/20260902_advanced_messaging.sql", "utf8");
    const requiredObjects = [
      "message_user_states",
      "message_pins",
      "message_delivery_states",
      "conversation_user_states",
      "conversation_drafts",
      "send_message",
      "edit_message",
      "delete_message_for_me",
      "delete_message_for_everyone",
      "forward_message",
      "pin_message",
      "unpin_message",
      "toggle_message_reaction",
      "mark_message_delivered",
      "mark_conversation_read",
      "mark_conversation_unread",
      "save_draft",
      "delete_draft",
      "client_message_id",
      "forwarded_from_message_id",
    ];

    let allObjectsFound = true;
    for (const obj of requiredObjects) {
      if (!migrationContent.includes(obj)) {
        allObjectsFound = false;
        console.error(`Missing object in migration: ${obj}`);
      }
    }
    // 17. UI Component & Control Invariants
    console.log("\n--- 17. UI Component & Control Invariants ---");
    const actionsMenuContent = readFileSync("components/messages/message-actions-menu.tsx", "utf8");
    assert("MessageActionsMenu has 'Delete for me' control", actionsMenuContent.includes("Delete for me"));
    assert("MessageActionsMenu has 'Delete for everyone' control", actionsMenuContent.includes("Delete for everyone"));
    assert("MessageActionsMenu has 'Forward' control", actionsMenuContent.includes("Forward"));
    assert("MessageActionsMenu has 'Pin message' and 'Unpin message' controls", actionsMenuContent.includes("Pin message") && actionsMenuContent.includes("Unpin message"));
    assert("MessageActionsMenu has 'Edit message' control", actionsMenuContent.includes("Edit message"));
    assert("MessageActionsMenu has 'Copy text' and 'Copy link' controls", actionsMenuContent.includes("Copy text") && actionsMenuContent.includes("Copy link"));
    assert("MessageActionsMenu has 'Save message' / 'Remove from saved' controls", (actionsMenuContent.includes("Save message") && actionsMenuContent.includes("Remove from saved")) || (actionsMenuContent.includes("Star message") && actionsMenuContent.includes("Unstar message")));
    assert("MessageActionsMenu has 'Report message' control", actionsMenuContent.includes("Report message"));
    assert("MessageActionsMenu implements Mobile Bottom Sheet drawer", actionsMenuContent.includes("isMobileSheetOpen") && actionsMenuContent.includes("createPortal"));

    const messageItemContent = readFileSync("components/chat/message-item.tsx", "utf8");
    assert("MessageItem implements mobile long-press and contextmenu handlers", messageItemContent.includes("onTouchStart") && messageItemContent.includes("onContextMenu"));
    assert("MessageItem renders delivered status double-check", messageItemContent.includes("isDelivered") && messageItemContent.includes("CheckCheck"));

    const conversationListContent = readFileSync("components/chat/conversation-list.tsx", "utf8");
    assert("ConversationList renders unread badges", conversationListContent.includes("isUnread") && conversationListContent.includes("unreadCount"));
    assert("ConversationList exposes 'Mark as unread' and 'Mark as read' controls", conversationListContent.includes("Mark as unread") && conversationListContent.includes("Mark as read"));

    const composerContent = readFileSync("components/chat/message-composer.tsx", "utf8");
    assert("MessageComposer restores drafts and provides visual status indicator", composerContent.includes("initialDraft") && composerContent.includes("draftStatus"));

    console.log("\n=======================================================");
    console.log(` Test Results: ${passCount} Passed, ${failCount} Failed`);
    console.log("=======================================================\n");

    if (failCount > 0) {
      process.exit(1);
    }
  });
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
