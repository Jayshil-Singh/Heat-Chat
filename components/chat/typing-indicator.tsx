"use client";

import * as React from "react";
import type { TypingUser } from "@/types/chat";

interface TypingIndicatorProps {
  typingUsers: TypingUser[];
}

export function TypingIndicator({ typingUsers }: TypingIndicatorProps) {
  if (!typingUsers || typingUsers.length === 0) return null;

  let text = "";
  if (typingUsers.length === 1) {
    text = `${typingUsers[0].displayName} is typing...`;
  } else if (typingUsers.length === 2) {
    text = `${typingUsers[0].displayName} and ${typingUsers[1].displayName} are typing...`;
  } else {
    const remaining = typingUsers.length - 2;
    text = `${typingUsers[0].displayName}, ${typingUsers[1].displayName}, and ${remaining} other${remaining > 1 ? "s" : ""} are typing...`;
  }

  return (
    <div
      className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 animate-in fade-in duration-200"
      aria-live="polite"
    >
      <div className="flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-heat-500 animate-bounce [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 rounded-full bg-heat-500 animate-bounce [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 rounded-full bg-heat-500 animate-bounce" />
      </div>
      <span className="truncate">{text}</span>
    </div>
  );
}
