"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { tokenizeMentions } from "@/lib/mentions/mention-parser";

interface MentionTextProps {
  content: string;
  isCurrentUser?: boolean;
  className?: string;
  onMentionClick?: (username: string) => void;
}

export function MentionText({
  content,
  isCurrentUser = false,
  className = "",
  onMentionClick,
}: MentionTextProps) {
  const router = useRouter();
  const tokens = React.useMemo(() => tokenizeMentions(content), [content]);

  const handleMentionClick = (username: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onMentionClick) {
      onMentionClick(username);
    } else {
      router.push(`/profile/${username}`);
    }
  };

  return (
    <span className={className}>
      {tokens.map((token, idx) => {
        if (token.type === "mention" && token.username) {
          return (
            <button
              key={idx}
              type="button"
              onClick={(e) => handleMentionClick(token.username!, e)}
              className={`inline-flex items-center rounded px-1 py-0.5 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-heat-500 cursor-pointer ${
                isCurrentUser
                  ? "bg-white/20 text-white hover:bg-white/30"
                  : "bg-heat-50 text-heat-600 hover:bg-heat-100 dark:bg-heat-950/60 dark:text-heat-400 dark:hover:bg-heat-900/80"
              }`}
              title={`View profile for @${token.username}`}
            >
              {token.value}
            </button>
          );
        }
        return <span key={idx}>{token.value}</span>;
      })}
    </span>
  );
}
