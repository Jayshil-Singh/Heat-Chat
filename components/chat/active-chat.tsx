"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useMessages } from "@/hooks/use-messages";
import { useTyping } from "@/hooks/use-typing";
import { usePresence } from "@/hooks/use-presence";
import { ChatHeader } from "./chat-header";
import { MessageFeed } from "./message-feed";
import { MessageComposer } from "./message-composer";
import type { ConversationWithDetails } from "@/types/chat";

interface ActiveChatProps {
  conversation: ConversationWithDetails;
  onBack?: () => void;
}

export function ActiveChat({ conversation, onBack }: ActiveChatProps) {
  const { user } = useAuth();
  const router = useRouter();

  const {
    messages,
    isLoading: isMessagesLoading,
    isLoadingOlder,
    hasMore,
    connectionStatus,
    sendMessage,
    retryMessage,
    loadOlderMessages,
  } = useMessages(conversation.id);

  const { typingUsers, sendTyping, stopTyping } = useTyping(conversation.id);
  const { isUserOnline } = usePresence();

  const otherMemberId = conversation.otherMember?.id;
  const isRecipientOnline = otherMemberId ? isUserOnline(otherMemberId) : false;

  const handleSendMessage = async (content: string) => {
    stopTyping();
    return await sendMessage(content);
  };

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
        messages={messages}
        currentUserId={user?.id || ""}
        recipientName={conversation.otherMember?.display_name || conversation.name || "your friend"}
        isLoading={isMessagesLoading}
        isLoadingOlder={isLoadingOlder}
        hasMore={hasMore}
        typingUsers={typingUsers}
        onLoadOlder={loadOlderMessages}
        onRetryMessage={retryMessage}
      />

      {/* Message Composer */}
      <MessageComposer
        onSendMessage={handleSendMessage}
        onTyping={sendTyping}
      />
    </div>
  );
}
