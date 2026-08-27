"use client";

import * as React from "react";
import { Check, CheckCheck, Clock, AlertCircle, RotateCcw } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import type { ChatMessage } from "@/types/chat";

interface MessageItemProps {
  message: ChatMessage;
  isCurrentUser: boolean;
  showSenderInfo?: boolean;
  onRetry?: (message: ChatMessage) => void;
}

function formatMessageTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function MessageItem({
  message,
  isCurrentUser,
  showSenderInfo = false,
  onRetry,
}: MessageItemProps) {
  const timeFormatted = formatMessageTime(message.created_at);
  const isFailed = message.status === "failed";
  const isSending = message.status === "sending";
  const isRead = (message.readBy || []).length > 0;

  return (
    <div
      className={`flex w-full flex-col ${
        isCurrentUser ? "items-end" : "items-start"
      } mb-2.5 px-4 group`}
    >
      {/* Sender name for incoming messages in group / first message */}
      {!isCurrentUser && showSenderInfo && message.sender && (
        <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1 ml-1">
          {message.sender.display_name}
        </span>
      )}

      <div
        className={`relative flex max-w-[82%] sm:max-w-[70%] md:max-w-[65%] flex-col rounded-2xl px-4 py-2.5 shadow-sm text-sm ${
          isCurrentUser
            ? "bg-heat-500 text-white rounded-br-xs"
            : "bg-white text-zinc-900 border border-zinc-200/80 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-100 rounded-bl-xs"
        } ${isFailed ? "border-2 border-red-500 bg-red-50 text-red-900 dark:bg-red-950/50 dark:text-red-200" : ""}`}
      >
        {/* Message Content (Pure text, XSS-safe, preserving whitespace and newlines) */}
        <p className="whitespace-pre-wrap break-words leading-relaxed select-text">
          {message.content}
        </p>

        {/* Footer: Time + Receipt Status */}
        <div
          className={`flex items-center justify-end gap-1 text-[10px] mt-1 select-none ${
            isCurrentUser
              ? "text-white/80"
              : "text-zinc-400 dark:text-zinc-500"
          }`}
        >
          <span>{timeFormatted}</span>

          {isCurrentUser && (
            <span className="inline-flex items-center ml-0.5">
              {isSending && (
                <span title="Sending...">
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

      {/* Failed message retry prompt */}
      {isCurrentUser && isFailed && (
        <button
          onClick={() => onRetry && onRetry(message)}
          className="flex items-center gap-1 text-[11px] font-medium text-red-600 hover:text-red-700 dark:text-red-400 mt-1 mr-1"
        >
          <RotateCcw className="h-3 w-3" />
          <span>Message failed to send. Tap to retry.</span>
        </button>
      )}
    </div>
  );
}
