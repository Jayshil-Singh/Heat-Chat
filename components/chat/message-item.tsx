"use client";

import * as React from "react";
import {
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  RotateCcw,
  Pencil,
  Star,
  Bookmark,
  Share2,
  Pin,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { MessageActionsMenu } from "@/components/messages/message-actions-menu";
import { MessageForwardDialog } from "@/components/messages/message-forward-dialog";
import { ReportDialog } from "@/components/reports/report-dialog";
import { MessageReactions } from "./message-reactions";
import { ReplyPreview } from "./reply-preview";
import { MessageAttachment } from "./message-attachment";
import { MentionText } from "@/components/mentions/mention-text";
import type { ChatMessage } from "@/types/chat";
import type { ReactionType } from "@/types/database";

interface MessageItemProps {
  message: ChatMessage;
  isCurrentUser: boolean;
  currentUserId: string;
  isGroupChat?: boolean;
  showSenderInfo?: boolean;
  isHighlighted?: boolean;
  isStarred?: boolean;
  isPinned?: boolean;
  onRetry?: (message: ChatMessage) => void;
  onReply?: (message: ChatMessage) => void;
  onToggleReaction?: (messageId: string, reaction: ReactionType) => void;
  onEdit?: (message: ChatMessage) => void;
  onDeleteForMe?: (messageId: string) => void;
  onDeleteForEveryone?: (messageId: string) => void;
  onForward?: (message: ChatMessage) => void;
  onTogglePin?: (messageId: string) => void;
  onToggleStar?: (messageId: string) => void;
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

function isMessageEdited(message: ChatMessage): boolean {
  if (message.deleted_at) return false;
  if (message.edited_at) return true;
  if (!message.updated_at || !message.created_at) return false;
  const updatedMs = new Date(message.updated_at).getTime();
  const createdMs = new Date(message.created_at).getTime();
  return updatedMs - createdMs > 1000;
}

export function MessageItem({
  message,
  isCurrentUser,
  currentUserId,
  isGroupChat = false,
  showSenderInfo = false,
  isHighlighted = false,
  isStarred = false,
  isPinned = false,
  onRetry,
  onReply,
  onToggleReaction,
  onEdit,
  onDeleteForMe,
  onDeleteForEveryone,
  onForward,
  onTogglePin,
  onToggleStar,
  onScrollToMessage,
}: MessageItemProps) {
  const [showReportDialog, setShowReportDialog] = React.useState(false);
  const timeFormatted = formatMessageTime(message.created_at);
  const isFailed = message.status === "failed";
  const isSending = message.status === "sending";
  const isDeleted = !!message.deleted_at;
  const isRead = (message.readBy || []).length > 0;
  const isDelivered = (message.deliveredTo || []).length > 0 || message.status === "delivered";
  const edited = isMessageEdited(message);
  const isTemp = !!message.tempId;
  const isForwarded = !!message.forwarded_from_message_id;

  const [isMobileSheetOpen, setIsMobileSheetOpen] = React.useState(false);
  const touchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPosRef = React.useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isTemp) return;
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };

    touchTimerRef.current = setTimeout(() => {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        try {
          navigator.vibrate(40);
        } catch {}
      }
      setIsMobileSheetOpen(true);
    }, 450);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPosRef.current || !touchTimerRef.current) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);
    if (dx > 10 || dy > 10) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  };

  const handleTouchEnd = () => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (isTemp) return;
    e.preventDefault();
    setIsMobileSheetOpen(true);
  };

  const currentUserReactions = React.useMemo(
    () =>
      (message.reactions || [])
        .filter((r) => r.userIds.includes(currentUserId))
        .map((r) => r.reaction),
    [message.reactions, currentUserId]
  );

  const senderDisplayName = message.sender?.display_name || "Unknown User";

  return (
    <div
      data-message-id={message.id}
      className={`flex w-full flex-col ${
        isCurrentUser ? "items-end" : "items-start"
      } mb-1.5 transition-colors duration-500 ${
        isHighlighted ? "bg-heat-100/60 dark:bg-heat-900/30 rounded-xl" : ""
      }`}
    >
      {/* Sender name for group chats */}
      {isGroupChat && !isCurrentUser && showSenderInfo && (
        <span
          className="mb-1 ml-11 text-[11px] font-bold text-zinc-600 dark:text-zinc-300"
          aria-label={`Sender: ${senderDisplayName}`}
        >
          {senderDisplayName}
        </span>
      )}

      {/* Bubble row: avatar + bubble + actions */}
      <div
        className={`group flex w-full items-end gap-2 px-3 ${
          isCurrentUser ? "flex-row-reverse" : "flex-row"
        }`}
      >
        {/* Group incoming message avatar */}
        {isGroupChat && !isCurrentUser && (
          <div className="shrink-0 w-7 mb-0.5">
            {showSenderInfo ? (
              <Avatar
                src={message.sender?.avatar_url}
                name={senderDisplayName}
                size="sm"
                className="h-7 w-7 text-[10px]"
              />
            ) : (
              <div className="w-7 h-7" />
            )}
          </div>
        )}

        {/* Message Bubble */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          onContextMenu={handleContextMenu}
          className={`relative flex max-w-[78%] sm:max-w-[68%] md:max-w-[62%] flex-col rounded-2xl px-4 py-2.5 shadow-sm text-sm select-none sm:select-text cursor-pointer sm:cursor-default ${
            isCurrentUser
              ? "bg-heat-500 text-white rounded-br-sm"
              : "bg-white text-zinc-900 border border-zinc-200/80 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-100 rounded-bl-sm"
          } ${
            isFailed
              ? "border-2 border-red-500 bg-red-50 text-red-900 dark:bg-red-950/50 dark:text-red-200"
              : ""
          }`}
        >
          {/* Forwarded Header */}
          {isForwarded && !isDeleted && (
            <div
              className={`mb-1 flex items-center gap-1 text-[11px] font-medium italic ${
                isCurrentUser ? "text-white/80" : "text-zinc-500 dark:text-zinc-400"
              }`}
            >
              <Share2 className="h-3 w-3" />
              <span>Forwarded</span>
            </div>
          )}

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

              {/* Media Attachments */}
              {message.attachments && message.attachments.length > 0 && (
                <MessageAttachment
                  attachments={message.attachments}
                  isCurrentUser={isCurrentUser}
                />
              )}

              {/* Message content */}
              {message.content &&
                !(
                  message.attachments &&
                  message.attachments.length > 0 &&
                  (message.content === "Photo" ||
                    message.content === "[Image]" ||
                    message.content === "📷 Photo")
                ) && (
                  <p className="whitespace-pre-wrap break-words leading-relaxed select-text">
                    <MentionText content={message.content} isCurrentUser={isCurrentUser} />
                  </p>
                )}
            </>
          )}

          {/* Footer: timestamp + edit indicator + pin indicator + saved indicator + receipts */}
          <div
            className={`mt-1 flex items-center justify-end gap-1 text-[10px] select-none ${
              isCurrentUser ? "text-white/70" : "text-zinc-400 dark:text-zinc-500"
            }`}
          >
            {isPinned && !isDeleted && (
              <span
                title="Pinned message"
                className="flex items-center text-amber-400 dark:text-amber-400 mr-0.5"
              >
                <Pin className="h-2.5 w-2.5 fill-current" />
              </span>
            )}
            {isStarred && !isDeleted && (
              <span
                title="Saved message"
                className="flex items-center text-amber-400 dark:text-amber-400 mr-0.5"
              >
                <Bookmark className="h-2.5 w-2.5 fill-current" />
              </span>
            )}
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
                  <span title={`Read by ${message.readBy?.length || 1}`}>
                    <CheckCheck className="h-3.5 w-3.5 text-white" />
                  </span>
                )}
                {!isSending && !isFailed && !isRead && isDelivered && (
                  <span title="Delivered">
                    <CheckCheck className="h-3.5 w-3.5 text-white/70" />
                  </span>
                )}
                {!isSending && !isFailed && !isRead && !isDelivered && (
                  <span title="Sent">
                    <Check className="h-3 w-3 text-white/90" />
                  </span>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Message action buttons */}
        {!isTemp && (
          <div
            className="shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100 sm:opacity-0 max-sm:opacity-60 max-sm:group-focus-within:opacity-100"
            aria-label="Message actions"
          >
            <MessageActionsMenu
              messageId={message.id}
              isCurrentUser={isCurrentUser}
              isDeleted={isDeleted}
              isPinned={isPinned}
              isStarred={isStarred}
              content={message.content}
              currentUserReactions={currentUserReactions}
              isMobileSheetOpen={isMobileSheetOpen}
              onMobileSheetClose={() => setIsMobileSheetOpen(false)}
              onReply={() => onReply && onReply(message)}
              onReact={(reaction) =>
                onToggleReaction && onToggleReaction(message.id, reaction)
              }
              onEdit={() => onEdit && onEdit(message)}
              onDeleteForMe={() => onDeleteForMe && onDeleteForMe(message.id)}
              onDeleteForEveryone={
                isCurrentUser && onDeleteForEveryone
                  ? () => onDeleteForEveryone(message.id)
                  : undefined
              }
              onForward={() => onForward && onForward(message)}
              onTogglePin={() => onTogglePin && onTogglePin(message.id)}
              onToggleStar={() => onToggleStar && onToggleStar(message.id)}
              onReport={() => setShowReportDialog(true)}
            />
          </div>
        )}
      </div>

      {/* Reactions below bubble */}
      {!isDeleted && (message.reactions || []).length > 0 && (
        <div className={`${isGroupChat && !isCurrentUser ? "ml-9" : ""}`}>
          <MessageReactions
            reactions={message.reactions || []}
            currentUserId={currentUserId}
            isCurrentUser={isCurrentUser}
            onToggleReaction={(reaction) =>
              onToggleReaction && onToggleReaction(message.id, reaction)
            }
          />
        </div>
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

      {/* Report Message Modal */}
      <ReportDialog
        isOpen={showReportDialog}
        onClose={() => setShowReportDialog(false)}
        targetType="message"
        targetId={message.id}
        targetName={`Message from ${senderDisplayName}`}
      />
    </div>
  );
}
