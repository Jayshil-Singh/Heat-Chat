"use client";

import * as React from "react";
import {
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  RotateCcw,
  Pencil,
} from "lucide-react";
import { MessageActions } from "./message-actions";
import { MessageReactions } from "./message-reactions";
import { ReplyPreview } from "./reply-preview";
import type { ChatMessage, ReplyPreviewData } from "@/types/chat";
import type { ReactionType } from "@/types/database";

interface MessageItemProps {
  message: ChatMessage;
  isCurrentUser: boolean;
  currentUserId: string;
  showSenderInfo?: boolean;
  isHighlighted?: boolean;
  onRetry?: (message: ChatMessage) => void;
  onReply?: (message: ChatMessage) => void;
  onToggleReaction?: (messageId: string, reaction: ReactionType) => void;
  onEdit?: (message: ChatMessage) => void;
  onDelete?: (messageId: string) => void;
  onScrollToMessage?: (messageId: string) => boolean | void;
}

function formatMessageTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

/**
 * Reliable "was edited" check.
 * Condition: message has been updated (updated_at > created_at by more than
 * 1 second to avoid microsecond timestamp noise) AND is not soft-deleted.
 * Our DB trigger bumps updated_at on every UPDATE, so this is reliable
 * given the only UPDATEs we perform are content edits and soft-deletes.
 * Deleted messages explicitly exclude the (edited) indicator.
 */
function isMessageEdited(message: ChatMessage): boolean {
  if (message.deleted_at) return false;
  if (!message.updated_at || !message.created_at) return false;
  const updatedMs = new Date(message.updated_at).getTime();
  const createdMs = new Date(message.created_at).getTime();
  return updatedMs - createdMs > 1000; // >1 second diff
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // Fallback for environments where clipboard API is unavailable
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textarea);
    return success;
  } catch {
    return false;
  }
}

export function MessageItem({
  message,
  isCurrentUser,
  currentUserId,
  showSenderInfo = false,
  isHighlighted = false,
  onRetry,
  onReply,
  onToggleReaction,
  onEdit,
  onDelete,
  onScrollToMessage,
}: MessageItemProps) {
  const timeFormatted = formatMessageTime(message.created_at);
  const isFailed = message.status === "failed";
  const isSending = message.status === "sending";
  const isDeleted = !!message.deleted_at;
  const isRead = (message.readBy || []).length > 0;
  const edited = isMessageEdited(message);
  const isTemp = !!message.tempId;

  const currentUserReactions = React.useMemo(
    () =>
      (message.reactions || [])
        .filter((r) => r.userIds.includes(currentUserId))
        .map((r) => r.reaction),
    [message.reactions, currentUserId]
  );

  const handleCopy = async () => {
    // Never copy deleted message content
    if (isDeleted) return;
    await copyToClipboard(message.content);
  };

  return (
    <div
      data-message-id={message.id}
      className={`flex w-full flex-col ${
        isCurrentUser ? "items-end" : "items-start"
      } mb-2 transition-colors duration-500 ${
        isHighlighted
          ? "bg-heat-100/60 dark:bg-heat-900/30 rounded-xl"
          : ""
      }`}
    >
      {/* Sender name for incoming group messages */}
      {!isCurrentUser && showSenderInfo && message.sender && (
        <span className="mb-1 ml-[3.5rem] text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
          {message.sender.display_name}
        </span>
      )}

      {/* Bubble row: actions beside bubble */}
      <div
        className={`group flex w-full items-end gap-1.5 px-4 ${
          isCurrentUser ? "flex-row-reverse" : "flex-row"
        }`}
      >
        {/* Bubble */}
        <div
          className={`relative flex max-w-[78%] sm:max-w-[68%] md:max-w-[62%] flex-col rounded-2xl px-4 py-2.5 shadow-sm text-sm ${
            isCurrentUser
              ? "bg-heat-500 text-white rounded-br-sm"
              : "bg-white text-zinc-900 border border-zinc-200/80 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-100 rounded-bl-sm"
          } ${
            isFailed
              ? "border-2 border-red-500 bg-red-50 text-red-900 dark:bg-red-950/50 dark:text-red-200"
              : ""
          }`}
        >
          {/* Deleted message placeholder */}
          {isDeleted ? (
            <p
              className={`italic text-sm leading-relaxed ${
                isCurrentUser
                  ? "text-white/60"
                  : "text-zinc-400 dark:text-zinc-500"
              }`}
              aria-label="This message was deleted"
            >
              This message was deleted
            </p>
          ) : (
            <>
              {/* Reply preview (quoted block) */}
              {message.replyPreview && (
                <ReplyPreview
                  replyPreview={message.replyPreview}
                  isCurrentUser={isCurrentUser}
                  onScrollToOriginal={onScrollToMessage || (() => {})}
                />
              )}

              {/* Message content — XSS-safe plain text */}
              <p className="whitespace-pre-wrap break-words leading-relaxed select-text">
                {message.content}
              </p>
            </>
          )}

          {/* Footer: timestamp + edit indicator + receipts */}
          <div
            className={`mt-1 flex items-center justify-end gap-1 text-[10px] select-none ${
              isCurrentUser ? "text-white/70" : "text-zinc-400 dark:text-zinc-500"
            }`}
          >
            {edited && !isDeleted && (
              <span
                className={`flex items-center gap-0.5 ${
                  isCurrentUser ? "text-white/50" : "text-zinc-400"
                }`}
                title="Edited"
              >
                <Pencil className="h-2.5 w-2.5" aria-hidden="true" />
                <span className="text-[9px]">edited</span>
              </span>
            )}
            <span>{timeFormatted}</span>

            {isCurrentUser && (
              <span className="ml-0.5 inline-flex items-center">
                {isSending && (
                  <span title="Sending…">
                    <Clock className="h-3 w-3 animate-pulse opacity-70" />
                  </span>
                )}
                {isFailed && (
                  <span title="Failed to send">
                    <AlertCircle className="h-3 w-3 text-red-500" />
                  </span>
                )}
                {!isSending && !isFailed && isRead && (
                  <span title="Read">
                    <CheckCheck className="h-3.5 w-3.5 text-white" />
                  </span>
                )}
                {!isSending && !isFailed && !isRead && (
                  <span title="Sent">
                    <Check className="h-3 w-3 text-white/90" />
                  </span>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Message action buttons — hidden until hover/focus, always visible on mobile */}
        {!isTemp && (
          <div
            className={`shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100 sm:opacity-0 max-sm:opacity-60 max-sm:group-focus-within:opacity-100`}
            aria-label="Message actions"
          >
            <MessageActions
              isCurrentUser={isCurrentUser}
              isDeleted={isDeleted}
              currentUserReactions={currentUserReactions}
              onReply={() => onReply && onReply(message)}
              onReact={(reaction) =>
                onToggleReaction && onToggleReaction(message.id, reaction)
              }
              onCopy={handleCopy}
              onEdit={() => onEdit && onEdit(message)}
              onDelete={() => onDelete && onDelete(message.id)}
            />
          </div>
        )}
      </div>

      {/* Reactions below bubble */}
      {!isDeleted && (message.reactions || []).length > 0 && (
        <MessageReactions
          reactions={message.reactions || []}
          currentUserId={currentUserId}
          isCurrentUser={isCurrentUser}
          onToggleReaction={(reaction) =>
            onToggleReaction && onToggleReaction(message.id, reaction)
          }
        />
      )}

      {/* Failed message retry prompt */}
      {isCurrentUser && isFailed && (
        <button
          onClick={() => onRetry && onRetry(message)}
          className="mt-1 flex items-center gap-1 px-4 text-[11px] font-medium text-red-600 hover:text-red-700 dark:text-red-400"
        >
          <RotateCcw className="h-3 w-3" />
          <span>Failed to send. Tap to retry.</span>
        </button>
      )}
    </div>
  );
}
