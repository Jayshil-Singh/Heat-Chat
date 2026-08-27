"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Users, Sparkles, ShieldCheck } from "lucide-react";
import { ConversationList } from "./conversation-list";
import { ChatHeader } from "./chat-header";
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
        className={`flex-1 h-full flex flex-col min-w-0 bg-zinc-50/50 dark:bg-zinc-900/20 ${
          !activeConversationId ? "hidden md:flex" : "flex"
        }`}
      >
        {activeConversation ? (
          <div className="flex flex-1 flex-col h-full overflow-hidden">
            {/* Chat Header */}
            <ChatHeader
              conversation={activeConversation}
              onBack={() => router.push("/chat")}
            />

            {/* Conversation Feed Placeholder for Phase 4 */}
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center overflow-y-auto">
              <div className="max-w-sm space-y-4">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-heat-50 text-heat-600 dark:bg-heat-950/50 dark:text-heat-400">
                  <MessageSquare className="h-7 w-7" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                    Start the conversation
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    Direct conversation with{" "}
                    <span className="font-semibold text-zinc-900 dark:text-zinc-200">
                      {activeConversation.otherMember?.display_name || "your friend"}
                    </span>{" "}
                    is established and secured with Row Level Security.
                  </p>
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Realtime messaging will be enabled in Phase 5</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center p-8">
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
