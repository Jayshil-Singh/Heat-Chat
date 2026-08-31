"use client";

import * as React from "react";
import type { MentionCandidate } from "@/types/chat";

interface UseMentionsOptions {
  conversationId: string;
}

export function useMentions({ conversationId }: UseMentionsOptions) {
  const [candidates, setCandidates] = React.useState<MentionCandidate[]>([]);
  const [isOpen, setIsOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [cursorPosition, setCursorPosition] = React.useState<{ start: number; end: number }>({
    start: 0,
    end: 0,
  });

  const cacheRef = React.useRef<Map<string, MentionCandidate[]>>(new Map());

  // Detect `@username` trigger near cursor in textarea
  const handleTextChange = React.useCallback(
    (text: string, selectionStart: number) => {
      const textBeforeCursor = text.substring(0, selectionStart);
      const atMatch = textBeforeCursor.match(/(?:^|\s)@([a-zA-Z0-9_]*)$/);

      if (atMatch) {
        const queryText = atMatch[1] || "";
        const triggerIndex = textBeforeCursor.lastIndexOf("@");
        setQuery(queryText);
        setCursorPosition({
          start: triggerIndex,
          end: selectionStart,
        });
        setIsOpen(true);
        setSelectedIndex(0);
      } else {
        setIsOpen(false);
        setQuery("");
      }
    },
    []
  );

  // Fetch candidates when query changes
  React.useEffect(() => {
    if (!isOpen || !conversationId) {
      setCandidates([]);
      return;
    }

    const cacheKey = `${conversationId}:${query.toLowerCase()}`;
    if (cacheRef.current.has(cacheKey)) {
      setCandidates(cacheRef.current.get(cacheKey) || []);
      return;
    }

    let isCurrent = true;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/mentions/candidates?conversationId=${encodeURIComponent(
            conversationId
          )}&q=${encodeURIComponent(query)}&limit=10`
        );
        if (!res.ok) throw new Error("Failed to fetch candidates");
        const json = await res.json();
        if (isCurrent && json.ok) {
          const list = json.data.candidates || [];
          cacheRef.current.set(cacheKey, list);
          setCandidates(list);
        }
      } catch (err) {
        console.warn("Mention candidate fetch error:", err);
      }
    }, 150);

    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [isOpen, conversationId, query]);

  // Insert mention into text
  const selectCandidate = React.useCallback(
    (candidate: MentionCandidate, currentText: string): { newText: string; newCursor: number } => {
      const before = currentText.substring(0, cursorPosition.start);
      const after = currentText.substring(cursorPosition.end);
      const insertion = `@${candidate.username} `;
      const newText = before + insertion + after;
      const newCursor = before.length + insertion.length;

      setIsOpen(false);
      setQuery("");
      return { newText, newCursor };
    },
    [cursorPosition]
  );

  const closeAutocomplete = React.useCallback(() => {
    setIsOpen(false);
    setQuery("");
  }, []);

  return {
    isOpen: isOpen && candidates.length > 0,
    candidates,
    selectedIndex,
    setSelectedIndex,
    query,
    handleTextChange,
    selectCandidate,
    closeAutocomplete,
  };
}
