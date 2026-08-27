"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Users } from "lucide-react";
import { ConversationList } from "./conversation-list";
import { ActiveChat } from "./active-chat";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import type { ConversationWithDetails } from "@/types/chat";

interface ChatShellProps {
  conversations: ConversationWithDetails[];
  activeConversationId?: string | null;
  isLoading: boolean;
}

export function ChatShell({
  conversations,
  activeConversationId,
  isLoading,
}: ChatShellProps) {
  const router = useRouter();

  const activeConversation = React.useMemo(() => {
    if (!activeConversationId) return null;
    return conversations.find((c) => c.id === activeConversationId) || null;
  }, [conversations, activeConversationId]);

  return (
    <div className="flex h-full w-full overflow-hidden bg-white dark:bg-zinc-950">
      {/* Master Column: Conversation List */}
      <div
        className={`h-full w-full md:w-80 lg:w-96 shrink-0 ${
          activeConversationId ? "hidden md:flex flex-col" : "flex flex-col"
        }`}
      >
        <ConversationList
          conversations={conversations}
          isLoading={isLoading}
          activeConversationId={activeConversationId}
          onSelectConversation={(id) => {
            router.push(`/chat/${id}`);
          }}
        />
      </div>

      {/* Detail Column: Active Chat Area or Desktop Placeholder */}
      <div
        className={`flex-1 h-full flex flex-col min-w-0 ${
          !activeConversationId ? "hidden md:flex" : "flex"
        }`}
      >
        {activeConversation ? (
          <ActiveChat
            conversation={activeConversation}
            onBack={() => router.push("/chat")}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 bg-zinc-50/50 dark:bg-zinc-900/20">
            <EmptyState
              icon={<MessageSquare className="h-8 w-8 text-heat-500" />}
              title="Select a conversation"
              description="Choose a conversation from the list on the left or find a friend to start chatting."
              action={
                <Button
                  variant="heat"
                  size="default"
                  onClick={() => router.push("/friends")}
                  className="gap-2 text-xs"
                >
                  <Users className="h-4 w-4" />
                  <span>Find Friends</span>
                </Button>
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
