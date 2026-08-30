"use client";

import * as React from "react";
import { Search, Share2, Loader2, CheckCircle2, AlertCircle, Users, MessageSquare } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { useConversations } from "@/hooks/use-conversations";
import type { ConversationWithDetails } from "@/types/chat";

interface MessageForwardDialogProps {
  isOpen: boolean;
  onClose: () => void;
  messageId: string;
  messageContent?: string;
  onForwardSuccess?: () => void;
}

export function MessageForwardDialog({
  isOpen,
  onClose,
  messageId,
  messageContent,
  onForwardSuccess,
}: MessageForwardDialogProps) {
  const { conversations, isLoading: isConversationsLoading } = useConversations();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedConvId, setSelectedConvId] = React.useState<string | null>(null);
  const [isForwarding, setIsForwarding] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      setSelectedConvId(null);
      setErrorMessage(null);
      setSuccessMessage(null);
      setIsForwarding(false);
    }
  }, [isOpen]);

  const filteredConversations = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const name = c.type === "group" ? c.name : c.otherMember?.display_name || c.otherMember?.username;
      return name?.toLowerCase().includes(q);
    });
  }, [conversations, searchQuery]);

  const handleForward = async () => {
    if (!selectedConvId) return;
    setIsForwarding(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/messages/${messageId}/forward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetConversationId: selectedConvId,
          clientMessageId: crypto.randomUUID(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.message || data.error || "Failed to forward message.");
        return;
      }

      setSuccessMessage("Message forwarded successfully.");
      onForwardSuccess?.();
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMessage("Network error while forwarding message.");
    } finally {
      setIsForwarding(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Forward Message"
      description="Choose a conversation to forward this message to."
      className="max-w-md"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={isForwarding}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="heat"
            size="sm"
            disabled={!selectedConvId || isForwarding}
            onClick={handleForward}
            className="gap-2 font-semibold shadow-sm"
          >
            {isForwarding ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Forwarding...</span>
              </>
            ) : (
              <>
                <Share2 className="h-4 w-4" />
                <span>Forward</span>
              </>
            )}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Preview of message to forward */}
        {messageContent && (
          <div className="rounded-2xl bg-zinc-50 p-3 text-xs text-zinc-600 dark:bg-zinc-900/50 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 line-clamp-2 italic">
            &ldquo;{messageContent}&rdquo;
          </div>
        )}

        {successMessage && (
          <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 p-3 text-xs font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="flex items-center gap-2 rounded-2xl bg-red-50 p-3 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-900/50">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Search input */}
        <Input
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          leftIcon={<Search className="h-4 w-4 text-zinc-400" />}
          className="h-10 text-xs rounded-xl"
        />

        {/* Conversations List */}
        <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1 [scrollbar-width:thin]">
          {isConversationsLoading ? (
            <div className="py-8 text-center text-xs text-zinc-400">Loading conversations...</div>
          ) : filteredConversations.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-400">No conversations found.</div>
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = selectedConvId === conv.id;
              const title =
                conv.type === "group"
                  ? conv.name || "Group Chat"
                  : conv.otherMember?.display_name || conv.otherMember?.username || "Chat";
              const avatar =
                conv.type === "group" ? conv.avatar_url : conv.otherMember?.avatar_url;

              return (
                <button
                  type="button"
                  key={conv.id}
                  onClick={() => setSelectedConvId(conv.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition-all border ${
                    isSelected
                      ? "border-heat-500 bg-heat-50/60 dark:bg-heat-950/30 ring-1 ring-heat-500/30"
                      : "border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
                  }`}
                >
                  <Avatar
                    src={avatar}
                    name={title}
                    size="default"
                    className="shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-zinc-900 dark:text-white">
                      {title}
                    </p>
                    <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                      {conv.type === "group" ? `${conv.memberCount || 0} members` : "Direct message"}
                    </p>
                  </div>
                  <div
                    className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                      isSelected
                        ? "border-heat-500 bg-heat-500 text-white"
                        : "border-zinc-300 dark:border-zinc-600"
                    }`}
                  >
                    {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </Dialog>
  );
}
