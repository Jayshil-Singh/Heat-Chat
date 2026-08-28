"use client";

import * as React from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMessages } from "@/hooks/use-messages";
import { useTyping } from "@/hooks/use-typing";
import { usePresence } from "@/hooks/use-presence";
import { useSearch } from "@/hooks/use-search";
import { useStarredMessages } from "@/hooks/use-starred-messages";
import { ChatHeader } from "./chat-header";
import { MessageFeed, type MessageFeedHandle } from "./message-feed";
import { MessageComposer } from "./message-composer";
import { InChatSearch } from "./in-chat-search";
import { StarredMessagesDialog } from "./starred-messages-dialog";
import { useNotificationContext } from "@/components/notifications/notification-provider";
import type { ConversationWithDetails, ChatMessage, ReplyPreviewData } from "@/types/chat";
import type { ReactionType } from "@/types/database";

const REPLY_PREVIEW_TRUNCATE = 100;

interface ActiveChatProps {
  conversation: ConversationWithDetails;
  onBack?: () => void;
}

export function ActiveChat({ conversation, onBack }: ActiveChatProps) {
  const { user } = useAuth();
  const { setActiveConversationId } = useNotificationContext();

  React.useEffect(() => {
    setActiveConversationId(conversation.id);
    return () => setActiveConversationId(null);
  }, [conversation.id, setActiveConversationId]);

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

  // ── Starred messages ──────────────────────────────────────────────────────
  const {
    starredMessages,
    starredMessageIds,
    isLoading: isStarredLoading,
    toggleStar,
  } = useStarredMessages(conversation.id);

  const [showStarredDialog, setShowStarredDialog] = React.useState(false);

  // ── In-Chat Search ────────────────────────────────────────────────────────
  const [showInChatSearch, setShowInChatSearch] = React.useState(false);
  const {
    inChatQuery,
    inChatResults,
    currentMatchIndex,
    currentMatch,
    isInChatSearching,
    searchInChat,
    nextMatch,
    prevMatch,
    clearInChatSearch,
  } = useSearch();

  // ── Reply state ───────────────────────────────────────────────────────────
  const [replyTo, setReplyTo] = React.useState<ReplyPreviewData | null>(null);

  // ── Edit state ────────────────────────────────────────────────────────────
  const [editingMessage, setEditingMessage] =
    React.useState<ChatMessage | null>(null);

  // ── Feed ref for scrollToMessage ─────────────────────────────────────────
  const feedRef = React.useRef<MessageFeedHandle>(null);

  // ── Keyboard shortcut: Ctrl+F / Cmd+F to open search ─────────────────────
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setShowInChatSearch((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ── Jump to search match automatically when currentMatch changes ─────────
  React.useEffect(() => {
    if (currentMatch?.id && feedRef.current) {
      feedRef.current.scrollToMessage(currentMatch.id);
    }
  }, [currentMatch?.id]);

  // Jump to message (e.g. from Starred Messages dialog or reply quote)
  const handleJumpToMessage = (convId: string, msgId: string) => {
    if (convId === conversation.id && feedRef.current) {
      feedRef.current.scrollToMessage(msgId);
    }
  };

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
    if (message.sender_id !== user?.id) return;
    if (message.deleted_at) return;
    setReplyTo(null);
    setEditingMessage(message);
  };

  /** Soft-delete a message */
  const handleDeleteMessage = async (messageId: string) => {
    await deleteMessage(messageId);
  };

  /** Toggle reaction */
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
        onToggleSearch={() => setShowInChatSearch((prev) => !prev)}
        onOpenStarred={() => setShowStarredDialog(true)}
      />

      {/* In-Chat Search Overlay Banner */}
      <InChatSearch
        isOpen={showInChatSearch}
        query={inChatQuery}
        results={inChatResults}
        currentIndex={currentMatchIndex}
        isLoading={isInChatSearching}
        onSearch={(q) => searchInChat(conversation.id, q)}
        onNext={nextMatch}
        onPrev={prevMatch}
        onClose={() => {
          setShowInChatSearch(false);
          clearInChatSearch();
        }}
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
        starredMessageIds={starredMessageIds}
        onLoadOlder={loadOlderMessages}
        onRetryMessage={retryMessage}
        onReplyToMessage={handleReplyToMessage}
        onToggleReaction={handleToggleReaction}
        onEditMessage={handleEditMessage}
        onDeleteMessage={handleDeleteMessage}
        onToggleStar={toggleStar}
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

      {/* Starred Messages Modal Dialog */}
      <StarredMessagesDialog
        isOpen={showStarredDialog}
        onClose={() => setShowStarredDialog(false)}
        starredMessages={starredMessages}
        isLoading={isStarredLoading}
        activeConversationId={conversation.id}
        onUnstar={toggleStar}
        onJumpToMessage={handleJumpToMessage}
      />
    </div>
  );
}
