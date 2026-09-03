"use client";

import * as React from "react";
import { useConversations } from "@/hooks/use-conversations";
import { ChatShell } from "@/components/chat/chat-shell";

interface ChatConversationPageProps {
  params: Promise<{
    conversationId: string;
  }>;
}

export default function ChatConversationPage({ params }: ChatConversationPageProps) {
  const unwrappedParams = React.use(params);
  const conversationId = unwrappedParams.conversationId;
  const {
    conversations,
    isLoading,
    markConversationUnread,
    markConversationRead,
    refreshConversations,
  } = useConversations();

  return (
    <div className="h-[calc(100vh-4rem)] md:h-screen w-full">
      <ChatShell
        conversations={conversations}
        isLoading={isLoading}
        activeConversationId={conversationId}
        onMarkUnread={markConversationUnread}
        onMarkRead={markConversationRead}
        onRefreshConversations={refreshConversations}
      />
    </div>
  );
}
