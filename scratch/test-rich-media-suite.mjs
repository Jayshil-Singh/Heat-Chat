/**
 * Heat Chat — Phase 4 Rich Media & Attachment Test Suite
 * Validates:
 * 1. File-only send (PDF without caption) -> content="", message_type="file", 1 attachment
 * 2. File + caption (PDF + "Here is the report.") -> content="Here is the report.", message_type="file"
 * 3. Image-only send -> content="", message_type="image", 1 attachment
 * 4. Image + caption -> content="Test image", message_type="image"
 * 5. Video-only send -> content="", message_type="video"
 * 6. Video + caption -> content="Test video", message_type="video"
 * 7. Audio-only send -> content="", message_type="audio"
 * 8. Audio + caption -> content="Test audio", message_type="audio"
 * 9. Voice note send -> content="", message_type="voice", duration_seconds tracked
 * 10. Pure text message empty rejection (MESSAGE_EMPTY)
 * 11. Oversized caption rejection (> 4000 characters)
 * 12. Constraint check: message_content_length logic for all message types
 * 13. Idempotency & retry with client_message_id
 * 14. Message deletion (Delete for me / Delete for everyone)
 * 15. Forwarding media message
 * 16. Reporting media attachment
 * 17. Blocking enforcement on media sending
 * 18. Supported document formats (PDF, ZIP, TXT, DOCX, XLSX)
 */

import fs from "node:fs";

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${message}`);
  }
}

console.log("=======================================================");
console.log(" Heat Chat — Phase 4 Rich Media & Attachment Test Suite");
console.log("=======================================================\n");

// ── In-memory Media & Messaging Engine Simulator ──────────────────────────────

class RichMediaMessagingEngine {
  constructor() {
    this.profiles = new Map();
    this.conversations = new Map();
    this.conversationMembers = new Map(); // convId -> Set(userIds)
    this.messages = new Map(); // msgId -> message
    this.attachments = new Map(); // attId -> attachment
    this.messageUserStates = new Map(); // userId:msgId -> { hidden: true }
    this.blockedUsers = new Set(); // blockerId:blockedId
    this.reports = [];
  }

  createProfile(id, username, displayName) {
    this.profiles.set(id, { id, username, display_name: displayName });
  }

  createConversation(id, type = "direct", memberIds = []) {
    this.conversations.set(id, { id, type, created_at: new Date().toISOString() });
    this.conversationMembers.set(id, new Set(memberIds));
  }

  isMember(convId, userId) {
    return this.conversationMembers.get(convId)?.has(userId) || false;
  }

  isBlocked(userA, userB) {
    return this.blockedUsers.has(`${userA}:${userB}`) || this.blockedUsers.has(`${userB}:${userA}`);
  }

  blockUser(blockerId, blockedId) {
    this.blockedUsers.add(`${blockerId}:${blockedId}`);
  }

  /**
   * Evaluates the Postgres message_content_length constraint:
   * check (char_length(content) <= 5000 and (message_type <> 'text' or char_length(trim(content)) > 0))
   */
  evaluateDbConstraint(content, messageType) {
    if (typeof content !== "string") return false;
    if (content.length > 5000) return false;
    if (messageType === "text") {
      return content.trim().length > 0;
    }
    // For media messages (image, video, audio, voice, file), empty content is valid
    return true;
  }

  /**
   * Simulates the full send path: client validation -> DB insert -> attachment insert
   */
  sendMessage({
    senderId,
    conversationId,
    content = "",
    messageType = "text",
    clientMessageId = null,
    replyToMessageId = null,
    forwardedFromMessageId = null,
    attachments = [],
  }) {
    if (!this.isMember(conversationId, senderId)) {
      return { success: false, error: "CONVERSATION_ACCESS_DENIED" };
    }

    const conv = this.conversations.get(conversationId);
    if (conv.type === "direct") {
      for (const memberId of this.conversationMembers.get(conversationId)) {
        if (memberId !== senderId && this.isBlocked(senderId, memberId)) {
          return { success: false, error: "MESSAGE_BLOCKED" };
        }
      }
    }

    const cleanContent = content.trim();

    // Text messages cannot be empty
    if (messageType === "text" && cleanContent.length === 0 && attachments.length === 0) {
      return { success: false, error: "MESSAGE_EMPTY" };
    }

    // Captions / text cannot exceed 4000 characters
    if (cleanContent.length > 4000) {
      return { success: false, error: "MESSAGE_TOO_LONG" };
    }

    // Evaluate DB Check Constraint
    if (!this.evaluateDbConstraint(cleanContent, messageType)) {
      return { success: false, error: "check constraint 'message_content_length' violated" };
    }

    // Idempotency check
    if (clientMessageId) {
      for (const msg of this.messages.values()) {
        if (msg.sender_id === senderId && msg.client_message_id === clientMessageId) {
          return { success: true, messageId: msg.id, duplicate: true };
        }
      }
    }

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newMsg = {
      id: messageId,
      conversation_id: conversationId,
      sender_id: senderId,
      content: cleanContent,
      message_type: messageType,
      reply_to_message_id: replyToMessageId,
      forwarded_from_message_id: forwardedFromMessageId,
      client_message_id: clientMessageId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    };

    this.messages.set(messageId, newMsg);

    // Insert attachments
    const savedAttachments = [];
    for (const att of attachments) {
      const attId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const attRecord = {
        id: attId,
        message_id: messageId,
        storage_path: `${conversationId}/${messageId}/${att.fileName}`,
        file_name: att.fileName,
        file_type: att.fileType,
        file_size: att.fileSize,
        width: att.width || null,
        height: att.height || null,
        duration_seconds: att.durationSeconds || null,
        created_at: new Date().toISOString(),
      };
      this.attachments.set(attId, attRecord);
      savedAttachments.push(attRecord);
    }

    return {
      success: true,
      messageId,
      message: newMsg,
      attachments: savedAttachments,
      duplicate: false,
    };
  }

  deleteForMe(userId, messageId) {
    this.messageUserStates.set(`${userId}:${messageId}`, { hidden: true });
    return { success: true };
  }

  deleteForEveryone(userId, messageId) {
    const msg = this.messages.get(messageId);
    if (!msg) return { success: false, error: "NOT_FOUND" };
    if (msg.sender_id !== userId) return { success: false, error: "FORBIDDEN" };
    msg.deleted_at = new Date().toISOString();
    msg.content = "This message was deleted";
    // Attachments are hidden when deleted
    return { success: true };
  }

  getFeed(conversationId, viewerId) {
    const msgs = [];
    for (const msg of this.messages.values()) {
      if (msg.conversation_id !== conversationId) continue;
      if (this.messageUserStates.get(`${viewerId}:${msg.id}`)?.hidden) continue;

      const atts = msg.deleted_at
        ? []
        : Array.from(this.attachments.values()).filter((a) => a.message_id === msg.id);

      msgs.push({ ...msg, attachments: atts });
    }
    return msgs;
  }

  reportAttachment(reporterId, attachmentId, reason, description) {
    const att = this.attachments.get(attachmentId);
    if (!att) return { success: false, error: "ATTACHMENT_NOT_FOUND" };
    const report = {
      id: `rep_${Date.now()}`,
      reporter_id: reporterId,
      target_type: "attachment",
      target_id: attachmentId,
      reason,
      description,
      status: "pending",
      created_at: new Date().toISOString(),
    };
    this.reports.push(report);
    return { success: true, reportId: report.id };
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

const engine = new RichMediaMessagingEngine();
engine.createProfile("user_a", "alice", "Alice Walker");
engine.createProfile("user_b", "bob", "Bob Jones");
engine.createProfile("user_c", "charlie", "Charlie Brown");

engine.createConversation("conv_1", "direct", ["user_a", "user_b"]);
engine.createConversation("conv_2", "direct", ["user_a", "user_c"]);

// ── 1. File-only send (Report.pdf without caption) ────────────────────────────
console.log("--- 1. File-Only Send (PDF Without Caption) ---");
{
  const res = engine.sendMessage({
    senderId: "user_a",
    conversationId: "conv_1",
    content: "",
    messageType: "file",
    attachments: [
      { fileName: "Report.pdf", fileType: "application/pdf", fileSize: 245000 },
    ],
  });

  assert(res.success === true, "File-only message created successfully without check constraint error");
  assert(res.message.content === "", "messages.content is empty string for file without caption");
  assert(res.message.message_type === "file", "message_type is 'file'");
  assert(res.attachments.length === 1, "Attachment record created");
  assert(res.attachments[0].file_name === "Report.pdf", "Attachment fileName is 'Report.pdf'");
  assert(res.attachments[0].file_type === "application/pdf", "Attachment fileType is 'application/pdf'");
}

// ── 2. File + caption (Report.pdf + "Here is the report.") ────────────────────
console.log("\n--- 2. File + Caption ---");
{
  const res = engine.sendMessage({
    senderId: "user_a",
    conversationId: "conv_1",
    content: "Here is the report.",
    messageType: "file",
    attachments: [
      { fileName: "Report.pdf", fileType: "application/pdf", fileSize: 245000 },
    ],
  });

  assert(res.success === true, "File with caption succeeds");
  assert(res.message.content === "Here is the report.", "messages.content contains caption text");
  assert(res.message.message_type === "file", "message_type is 'file'");
  assert(res.attachments.length === 1, "Attachment record created and linked");
}

// ── 3. Image-only send ────────────────────────────────────────────────────────
console.log("\n--- 3. Image-Only Send ---");
{
  const res = engine.sendMessage({
    senderId: "user_a",
    conversationId: "conv_1",
    content: "",
    messageType: "image",
    attachments: [
      { fileName: "photo.jpg", fileType: "image/jpeg", fileSize: 104500, width: 1920, height: 1080 },
    ],
  });

  assert(res.success === true, "Image without caption succeeds");
  assert(res.message.content === "", "messages.content is empty string for image-only");
  assert(res.message.message_type === "image", "message_type is 'image'");
  assert(res.attachments[0].width === 1920, "Image width stored in attachment metadata");
}

// ── 4. Image + caption ────────────────────────────────────────────────────────
console.log("\n--- 4. Image + Caption ---");
{
  const res = engine.sendMessage({
    senderId: "user_b",
    conversationId: "conv_1",
    content: "Sunset at the beach 🌅",
    messageType: "image",
    attachments: [
      { fileName: "sunset.png", fileType: "image/png", fileSize: 320000, width: 1200, height: 800 },
    ],
  });

  assert(res.success === true, "Image with caption succeeds");
  assert(res.message.content === "Sunset at the beach 🌅", "Caption preserved in content");
  assert(res.message.message_type === "image", "message_type is 'image'");
}

// ── 5. Video-only and Video + caption ─────────────────────────────────────────
console.log("\n--- 5. Video Messages ---");
{
  const res1 = engine.sendMessage({
    senderId: "user_a",
    conversationId: "conv_1",
    content: "",
    messageType: "video",
    attachments: [
      { fileName: "clip.mp4", fileType: "video/mp4", fileSize: 5000000, durationSeconds: 45 },
    ],
  });
  assert(res1.success === true, "Video without caption succeeds");
  assert(res1.message.message_type === "video", "message_type is 'video'");
  assert(res1.attachments[0].duration_seconds === 45, "Video duration stored");

  const res2 = engine.sendMessage({
    senderId: "user_a",
    conversationId: "conv_1",
    content: "Check this out!",
    messageType: "video",
    attachments: [
      { fileName: "demo.mp4", fileType: "video/mp4", fileSize: 3000000, durationSeconds: 12 },
    ],
  });
  assert(res2.success === true, "Video with caption succeeds");
  assert(res2.message.content === "Check this out!", "Video caption preserved");
}

// ── 6. Audio and Voice Messages ───────────────────────────────────────────────
console.log("\n--- 6. Audio & Voice Notes ---");
{
  const resAudio = engine.sendMessage({
    senderId: "user_a",
    conversationId: "conv_1",
    content: "",
    messageType: "audio",
    attachments: [
      { fileName: "song.mp3", fileType: "audio/mpeg", fileSize: 4000000, durationSeconds: 210 },
    ],
  });
  assert(resAudio.success === true, "Audio message succeeds");
  assert(resAudio.message.message_type === "audio", "message_type is 'audio'");

  const resVoice = engine.sendMessage({
    senderId: "user_b",
    conversationId: "conv_1",
    content: "",
    messageType: "voice",
    attachments: [
      { fileName: "voice_message.webm", fileType: "audio/webm", fileSize: 45000, durationSeconds: 7 },
    ],
  });
  assert(resVoice.success === true, "Voice note without caption succeeds");
  assert(resVoice.message.message_type === "voice", "message_type is 'voice'");
  assert(resVoice.attachments[0].duration_seconds === 7, "Voice duration (7s) preserved");
}

// ── 7. Text validation and empty text rejection ───────────────────────────────
console.log("\n--- 7. Text Validation Invariants ---");
{
  const resEmptyText = engine.sendMessage({
    senderId: "user_a",
    conversationId: "conv_1",
    content: "   ",
    messageType: "text",
    attachments: [],
  });
  assert(resEmptyText.success === false, "Empty text message is rejected with MESSAGE_EMPTY");
  assert(resEmptyText.error === "MESSAGE_EMPTY", "Error code is MESSAGE_EMPTY");

  const longCaption = "A".repeat(4001);
  const resOversized = engine.sendMessage({
    senderId: "user_a",
    conversationId: "conv_1",
    content: longCaption,
    messageType: "file",
    attachments: [{ fileName: "test.pdf", fileType: "application/pdf", fileSize: 1000 }],
  });
  assert(resOversized.success === false, "Oversized caption (>4000 chars) is rejected");
  assert(resOversized.error === "MESSAGE_TOO_LONG", "Error code is MESSAGE_TOO_LONG");
}

// ── 8. Constraint evaluation matrix ───────────────────────────────────────────
console.log("\n--- 8. Database Check Constraint Matrix ---");
{
  assert(engine.evaluateDbConstraint("", "file") === true, "Constraint allows content='' for message_type='file'");
  assert(engine.evaluateDbConstraint("", "image") === true, "Constraint allows content='' for message_type='image'");
  assert(engine.evaluateDbConstraint("", "video") === true, "Constraint allows content='' for message_type='video'");
  assert(engine.evaluateDbConstraint("", "audio") === true, "Constraint allows content='' for message_type='audio'");
  assert(engine.evaluateDbConstraint("", "voice") === true, "Constraint allows content='' for message_type='voice'");
  assert(engine.evaluateDbConstraint("Valid caption", "file") === true, "Constraint allows non-empty caption for file");
  assert(engine.evaluateDbConstraint("", "text") === false, "Constraint rejects content='' for message_type='text'");
  assert(engine.evaluateDbConstraint("   ", "text") === false, "Constraint rejects whitespace-only for message_type='text'");
  assert(engine.evaluateDbConstraint("Hello", "text") === true, "Constraint allows valid text for message_type='text'");
  assert(engine.evaluateDbConstraint("A".repeat(5001), "file") === false, "Constraint rejects content > 5000 chars");
}

// ── 9. Idempotency & Retry ───────────────────────────────────────────────────
console.log("\n--- 9. Idempotency & Retry ---");
{
  const clientMsgId = "c1111111-2222-3333-4444-555555555555";
  const res1 = engine.sendMessage({
    senderId: "user_a",
    conversationId: "conv_1",
    content: "First attempt",
    messageType: "file",
    clientMessageId: clientMsgId,
    attachments: [{ fileName: "data.csv", fileType: "text/csv", fileSize: 500 }],
  });
  assert(res1.success === true && !res1.duplicate, "First send creates message");

  const res2 = engine.sendMessage({
    senderId: "user_a",
    conversationId: "conv_1",
    content: "First attempt",
    messageType: "file",
    clientMessageId: clientMsgId,
    attachments: [{ fileName: "data.csv", fileType: "text/csv", fileSize: 500 }],
  });
  assert(res2.success === true && res2.duplicate, "Duplicate clientMessageId returns existing message idempotently");
  assert(res1.messageId === res2.messageId, "Same message ID returned on duplicate");
}

// ── 10. Deletion Semantics ───────────────────────────────────────────────────
console.log("\n--- 10. Deletion of Media Messages ---");
{
  const res = engine.sendMessage({
    senderId: "user_a",
    conversationId: "conv_1",
    content: "Will delete this",
    messageType: "image",
    attachments: [{ fileName: "temp.png", fileType: "image/png", fileSize: 1000 }],
  });
  const msgId = res.messageId;

  // Delete for me
  engine.deleteForMe("user_b", msgId);
  const feedB = engine.getFeed("conv_1", "user_b");
  assert(!feedB.some((m) => m.id === msgId), "Message hidden in User B's feed after Delete for Me");
  const feedA = engine.getFeed("conv_1", "user_a");
  assert(feedA.some((m) => m.id === msgId), "Message still visible in author User A's feed");

  // Delete for everyone
  engine.deleteForEveryone("user_a", msgId);
  const feedAAfter = engine.getFeed("conv_1", "user_a");
  const deletedMsg = feedAAfter.find((m) => m.id === msgId);
  assert(deletedMsg.deleted_at !== null, "Message marked as deleted");
  assert(deletedMsg.content === "This message was deleted", "Content sanitized to 'This message was deleted'");
  assert(deletedMsg.attachments.length === 0, "Attachments cleared from deleted message feed");
}

// ── 11. Forwarding Media Message ─────────────────────────────────────────────
console.log("\n--- 11. Forwarding Media Message ---");
{
  const orig = engine.sendMessage({
    senderId: "user_a",
    conversationId: "conv_1",
    content: "Original PDF",
    messageType: "file",
    attachments: [{ fileName: "Document.pdf", fileType: "application/pdf", fileSize: 50000 }],
  });

  // Forward to conv_2 (User A and User C)
  const forwarded = engine.sendMessage({
    senderId: "user_a",
    conversationId: "conv_2",
    content: "Original PDF",
    messageType: "file",
    forwardedFromMessageId: orig.messageId,
    attachments: [{ fileName: "Document.pdf", fileType: "application/pdf", fileSize: 50000 }],
  });

  assert(forwarded.success === true, "Forwarding media message succeeds");
  assert(forwarded.message.forwarded_from_message_id === orig.messageId, "forwarded_from_message_id is tracked");
}

// ── 12. Reporting Media Attachment ───────────────────────────────────────────
console.log("\n--- 12. Reporting Media Attachment ---");
{
  const msg = engine.sendMessage({
    senderId: "user_a",
    conversationId: "conv_1",
    content: "Image to report",
    messageType: "image",
    attachments: [{ fileName: "flagged.jpg", fileType: "image/jpeg", fileSize: 80000 }],
  });

  const attId = msg.attachments[0].id;
  const repRes = engine.reportAttachment("user_b", attId, "inappropriate_content", "Offensive photo");
  assert(repRes.success === true, "Reporting attachment succeeds");
  assert(engine.reports.some((r) => r.target_id === attId), "Report stored with target_type='attachment'");
}

// ── 13. Blocking Enforcement ─────────────────────────────────────────────────
console.log("\n--- 13. Blocking Enforcement on Media Send ---");
{
  engine.blockUser("user_b", "user_a");
  const resBlocked = engine.sendMessage({
    senderId: "user_a",
    conversationId: "conv_1",
    content: "",
    messageType: "file",
    attachments: [{ fileName: "blocked.pdf", fileType: "application/pdf", fileSize: 1000 }],
  });

  assert(resBlocked.success === false, "Blocked user cannot send file in direct conversation");
  assert(resBlocked.error === "MESSAGE_BLOCKED", "Error is MESSAGE_BLOCKED");
}

// ── 14. Document Format Support (PDF, ZIP, TXT, DOCX, XLSX) ───────────────────
console.log("\n--- 14. Document Format Support ---");
{
  const formats = [
    { ext: ".pdf", mime: "application/pdf" },
    { ext: ".zip", mime: "application/zip" },
    { ext: ".txt", mime: "text/plain" },
    { ext: ".docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
    { ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  ];

  for (const fmt of formats) {
    const res = engine.sendMessage({
      senderId: "user_a",
      conversationId: "conv_2",
      content: "",
      messageType: "file",
      attachments: [{ fileName: `sample${fmt.ext}`, fileType: fmt.mime, fileSize: 12000 }],
    });
    assert(res.success === true, `File send supported for ${fmt.ext} (${fmt.mime})`);
  }
}

// ── 15. Source Code Invariant Checks ──────────────────────────────────────────
console.log("\n--- 15. Source Code & Schema Invariants ---");
{
  const migrationSql = fs.readFileSync("supabase/migrations/20260905_media_message_content_constraint.sql", "utf-8");
  assert(migrationSql.includes("message_content_length"), "Migration updates message_content_length constraint");
  assert(migrationSql.includes("message_type <> 'text' or char_length(trim(content)) > 0"), "Constraint permits empty content for non-text messages");
  assert(migrationSql.includes("char_length(content) <= 5000"), "Constraint enforces <= 5000 character limit");

  const useMessagesSrc = fs.readFileSync("hooks/use-messages.ts", "utf-8");
  assert(useMessagesSrc.includes("trimmedContent ||"), "use-messages preserves empty string for media without caption");
  assert(!useMessagesSrc.includes("insertError?.message || \"Failed to send message.\""), "Raw DB constraint error is sanitized in use-messages.ts");

  const routeSrc = fs.readFileSync("app/api/conversations/[id]/messages/route.ts", "utf-8");
  assert(routeSrc.includes("message_content_length"), "API route handles message_content_length error gracefully");
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log("\n=======================================================");
console.log(` Results: ${passed} Passed, ${failed} Failed`);
console.log("=======================================================");

if (failed > 0) {
  process.exit(1);
} else {
  console.log("🎉 ALL RICH MEDIA SEND & ATTACHMENT TESTS PASSED!\n");
}
