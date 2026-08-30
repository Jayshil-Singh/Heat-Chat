"use client";

import * as React from "react";
import { Pin, X, ChevronRight, PinOff, MessageSquare } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";

export interface PinnedMessageItem {
  pinId: string;
  pinnedAt: string;
  pinnedBy: string;
  message: {
    id: string;
    content: string;
    createdAt: string;
    isDeleted: boolean;
    sender?: {
      id: string;
      username: string;
      display_name: string;
      avatar_url: string | null;
    } | null;
  };
}

interface PinnedMessagesPanelProps {
  conversationId: string;
  pins: PinnedMessageItem[];
  isLoading?: boolean;
  onJumpToMessage: (messageId: string) => void;
  onUnpinMessage?: (messageId: string) => void;
  onClose?: () => void;
}

export function PinnedMessagesPanel({
  conversationId,
  pins,
  isLoading = false,
  onJumpToMessage,
  onUnpinMessage,
  onClose,
}: PinnedMessagesPanelProps) {
  if (pins.length === 0 && !isLoading) {
    return null;
  }

  return (
    <div className="border-b border-zinc-200/80 bg-zinc-50/90 px-4 py-2.5 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90 transition-all">
      <div className="flex items-center justify-between pb-1.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-white">
          <Pin className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
          <span>Pinned Messages ({pins.length})</span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close pinned panel"
            className="rounded-full p-1 text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 dark:text-zinc-500"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 [scrollbar-width:thin]">
        {pins.map((pin) => {
          const senderName =
            pin.message.sender?.display_name ||
            pin.message.sender?.username ||
            "Unknown";
          return (
            <div
              key={pin.pinId}
              onClick={() => onJumpToMessage(pin.message.id)}
              className="group flex cursor-pointer items-center justify-between gap-2.5 rounded-xl border border-zinc-200/60 bg-white p-2 text-xs shadow-2xs hover:border-amber-400/50 hover:bg-amber-50/20 dark:border-zinc-800 dark:bg-zinc-850 dark:hover:border-amber-600/40 dark:hover:bg-amber-950/10 transition-all"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Avatar
                  src={pin.message.sender?.avatar_url}
                  name={senderName}
                  size="sm"
                  className="shrink-0 h-6 w-6"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-zinc-800 dark:text-zinc-200 truncate text-[11px]">
                    {senderName}
                  </p>
                  <p className="text-zinc-500 dark:text-zinc-400 truncate text-[11px] italic">
                    {pin.message.isDeleted ? "This message was deleted" : pin.message.content}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {onUnpinMessage && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnpinMessage(pin.message.id);
                    }}
                    title="Unpin message"
                    className="opacity-0 group-hover:opacity-100 rounded p-1 text-zinc-400 hover:text-red-500 transition-opacity"
                  >
                    <PinOff className="h-3.5 w-3.5" />
                  </button>
                )}
                <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
