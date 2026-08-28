"use client";

import * as React from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMessages } from "@/hooks/use-messages";
import { useTyping } from "@/hooks/use-typing";
import { usePresence } from "@/hooks/use-presence";
import { ChatHeader } from "./chat-header";
import { MessageFeed, type MessageFeedHandle } from "./message-feed";
import { MessageComposer } from "./message-composer";
import type { ConversationWithDetails, ChatMessage, ReplyPreviewData } from "@/types/chat";
import type { ReactionType } from "@/types/database";

const REPLY_PREVIEW_TRUNCATE = 100;

interface ActiveChatProps {
  conversation: ConversationWithDetails;
  onBack?: () => void;
}

export function ActiveChat({ conversation, onBack }: ActiveChatProps) {
  const { user } = useAuth();

  // ── Message state + actions ───────────────────────────────────────────────
  const {
    messages,
    isLoading: isMessagesLoading,
    isLoadingOlder,
    hasMore,
    connectionStatus,
    sendMessage,
    sendReply,
    retryMessage,
    editMessage,
    deleteMessage,
    addReaction,
    removeReaction,
    loadOlderMessages,
  } = useMessages(conversation.id);

  // ── Typing + presence ─────────────────────────────────────────────────────
  const { typingUsers, sendTyping, stopTyping } = useTyping(conversation.id);
  const { isUserOnline } = usePresence();

  const otherMemberId = conversation.otherMember?.id;
  const isRecipientOnline = otherMemberId ? isUserOnline(otherMemberId) : false;

  // ── Reply state ───────────────────────────────────────────────────────────
  const [replyTo, setReplyTo] = React.useState<ReplyPreviewData | null>(null);

  // ── Edit state ────────────────────────────────────────────────────────────
  const [editingMessage, setEditingMessage] =
    React.useState<ChatMessage | null>(null);

  // ── Feed ref for scrollToMessage ─────────────────────────────────────────
  const feedRef = React.useRef<MessageFeedHandle>(null);

  // ── Action handlers ───────────────────────────────────────────────────────

  /** Send (or reply) — called by MessageComposer */
  const handleSendMessage = async (
    content: string,
    stagedAttachments?: import("@/hooks/use-media-upload").PendingAttachment[]
  ): Promise<{ success: boolean; error?: string }> => {
    stopTyping();
    if (replyTo) {
      const res = await sendReply(content, replyTo.messageId, stagedAttachments);
      if (res.success) setReplyTo(null);
      return res;
    }
    return sendMessage(content, null, stagedAttachments);
  };

  /** Save an edit — called by MessageComposer in edit mode */
  const handleSaveEdit = async (
    messageId: string,
    newContent: string
  ): Promise<{ success: boolean; error?: string }> => {
    const res = await editMessage(messageId, newContent);
    if (res.success) setEditingMessage(null);
    return res;
  };

  /** Enter reply mode */
  const handleReplyToMessage = (message: ChatMessage) => {
    // Exit edit mode if active
    setEditingMessage(null);
    setReplyTo({
      messageId: message.id,
      senderName:
        message.sender?.display_name ||
        (message.sender_id === user?.id ? "You" : "Unknown"),
      content: message.deleted_at
        ? ""
        : message.content.slice(0, REPLY_PREVIEW_TRUNCATE),
      isDeleted: !!message.deleted_at,
    });
  };

  /** Enter edit mode */
  const handleEditMessage = (message: ChatMessage) => {
    if (message.sender_id !== user?.id) return; // guard — not enforced by UI
    if (message.deleted_at) return;
    // Exit reply mode if active
    setReplyTo(null);
    setEditingMessage(message);
  };

  /** Soft-delete a message */
  const handleDeleteMessage = async (messageId: string) => {
    await deleteMessage(messageId);
  };

  /**
   * Toggle reaction — checks if user already reacted and calls
   * addReaction or removeReaction accordingly.
   * The current `messages` state is read here where it's fresh.
   */
  const handleToggleReaction = async (
    messageId: string,
    reaction: ReactionType
  ) => {
    const msg = messages.find((m) => m.id === messageId);
    const userReacted = msg?.reactions
      ?.find((r) => r.reaction === reaction)
      ?.userIds.includes(user?.id || "");

    if (userReacted) {
      await removeReaction(messageId, reaction);
    } else {
      await addReaction(messageId, reaction);
    }
  };

  const handleCancelReply = () => setReplyTo(null);
  const handleCancelEdit = () => setEditingMessage(null);

  return (
    <div className="flex flex-1 flex-col h-full overflow-hidden bg-zinc-50/50 dark:bg-zinc-950">
      {/* Header */}
      <ChatHeader
        conversation={conversation}
        connectionStatus={connectionStatus}
        isOnline={isRecipientOnline}
        onBack={onBack}
      />

      {/* Message Feed */}
      <MessageFeed
        ref={feedRef}
        messages={messages}
        currentUserId={user?.id || ""}
        isGroupChat={conversation.type === "group"}
        recipientName={
          conversation.otherMember?.display_name ||
          conversation.name ||
          "your friend"
        }
        isLoading={isMessagesLoading}
        isLoadingOlder={isLoadingOlder}
        hasMore={hasMore}
        typingUsers={typingUsers}
        onLoadOlder={loadOlderMessages}
        onRetryMessage={retryMessage}
        onReplyToMessage={handleReplyToMessage}
        onToggleReaction={handleToggleReaction}
        onEditMessage={handleEditMessage}
        onDeleteMessage={handleDeleteMessage}
      />

      {/* Message Composer (handles reply banner + edit mode) */}
      <MessageComposer
        onSendMessage={handleSendMessage}
        onTyping={sendTyping}
        replyTo={replyTo}
        onCancelReply={handleCancelReply}
        editingMessage={editingMessage}
        onSaveEdit={handleSaveEdit}
        onCancelEdit={handleCancelEdit}
      />
    </div>
  );
}
