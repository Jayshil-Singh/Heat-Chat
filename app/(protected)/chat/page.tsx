"use client";

import * as React from "react";
import { useConversations } from "@/hooks/use-conversations";
import { ChatShell } from "@/components/chat/chat-shell";

export default function ChatIndexPage() {
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
        activeConversationId={null}
        onMarkUnread={markConversationUnread}
        onMarkRead={markConversationRead}
        onRefreshConversations={refreshConversations}
      />
    </div>
  );
}
