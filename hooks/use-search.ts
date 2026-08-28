"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./use-auth";
import type { InChatSearchResult, GlobalSearchResult } from "@/types/chat";

export function useSearch() {
  const { user } = useAuth();
  const supabase = React.useMemo(() => createClient(), []);

  // ── In-Chat Search State ──────────────────────────────────────────────────
  const [inChatQuery, setInChatQuery] = React.useState("");
  const [inChatResults, setInChatResults] = React.useState<InChatSearchResult[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = React.useState(0);
  const [isInChatSearching, setIsInChatSearching] = React.useState(false);

  // ── Global Search State ───────────────────────────────────────────────────
  const [globalQuery, setGlobalQuery] = React.useState("");
  const [globalResults, setGlobalResults] = React.useState<GlobalSearchResult[]>([]);
  const [isGlobalSearching, setIsGlobalSearching] = React.useState(false);

  // Execute in-chat search
  const searchInChat = React.useCallback(
    async (conversationId: string, query: string) => {
      setInChatQuery(query);
      const trimmed = query.trim();
      if (!trimmed || !user?.id) {
        setInChatResults([]);
        setCurrentMatchIndex(0);
        setIsInChatSearching(false);
        return;
      }

      setIsInChatSearching(true);
      try {
        const { data, error } = await (supabase.rpc as any)("search_conversation_messages", {
          p_conv_id: conversationId,
          p_query: trimmed,
          p_limit: 50,
        });

        if (error) throw error;
        const results = (data || []) as InChatSearchResult[];
        setInChatResults(results);
        setCurrentMatchIndex(0);
      } catch (err) {
        console.warn("In-chat search error:", err);
        setInChatResults([]);
      } finally {
        setIsInChatSearching(false);
      }
    },
    [user?.id, supabase]
  );

  const nextMatch = React.useCallback(() => {
    if (inChatResults.length === 0) return;
    setCurrentMatchIndex((prev) => (prev + 1) % inChatResults.length);
  }, [inChatResults.length]);

  const prevMatch = React.useCallback(() => {
    if (inChatResults.length === 0) return;
    setCurrentMatchIndex((prev) =>
      prev - 1 < 0 ? inChatResults.length - 1 : prev - 1
    );
  }, [inChatResults.length]);

  const clearInChatSearch = React.useCallback(() => {
    setInChatQuery("");
    setInChatResults([]);
    setCurrentMatchIndex(0);
    setIsInChatSearching(false);
  }, []);

  // Execute global search (debounced at call-site or directly)
  const searchGlobal = React.useCallback(
    async (query: string) => {
      setGlobalQuery(query);
      const trimmed = query.trim();
      if (!trimmed || !user?.id) {
        setGlobalResults([]);
        setIsGlobalSearching(false);
        return;
      }

      setIsGlobalSearching(true);
      try {
        const { data, error } = await (supabase.rpc as any)("search_global_messages", {
          p_query: trimmed,
          p_limit: 50,
        });

        if (error) throw error;
        setGlobalResults((data || []) as GlobalSearchResult[]);
      } catch (err) {
        console.warn("Global search error:", err);
        setGlobalResults([]);
      } finally {
        setIsGlobalSearching(false);
      }
    },
    [user?.id, supabase]
  );

  const clearGlobalSearch = React.useCallback(() => {
    setGlobalQuery("");
    setGlobalResults([]);
    setIsGlobalSearching(false);
  }, []);

  return {
    // In-chat
    inChatQuery,
    inChatResults,
    currentMatchIndex,
    currentMatch: inChatResults[currentMatchIndex] || null,
    isInChatSearching,
    searchInChat,
    nextMatch,
    prevMatch,
    clearInChatSearch,
    // Global
    globalQuery,
    globalResults,
    isGlobalSearching,
    searchGlobal,
    clearGlobalSearch,
  };
}
