"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./use-auth";
import type {
  InChatSearchResult,
  GlobalSearchResult,
  SearchCategory,
  SearchMessageResult,
  SearchPeopleResult,
  SearchMediaResult,
  SavedMessageDto,
} from "@/types/chat";

export interface SearchFiltersState {
  conversationId?: string | null;
  senderId?: string | null;
  messageType?: string | null;
  dateRange?: "all" | "today" | "yesterday" | "week" | "month" | null;
}

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
  const [activeCategory, setActiveCategory] = React.useState<SearchCategory>("all");
  const [filters, setFilters] = React.useState<SearchFiltersState>({
    conversationId: null,
    senderId: null,
    messageType: null,
    dateRange: "all",
  });

  const [messageResults, setMessageResults] = React.useState<SearchMessageResult[]>([]);
  const [peopleResults, setPeopleResults] = React.useState<SearchPeopleResult[]>([]);
  const [mediaResults, setMediaResults] = React.useState<SearchMediaResult[]>([]);
  const [savedResults, setSavedResults] = React.useState<SavedMessageDto[]>([]);
  const [isGlobalSearching, setIsGlobalSearching] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(false);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);

  // Active query ref to avoid stale closure races
  const currentQueryRef = React.useRef(globalQuery);
  currentQueryRef.current = globalQuery;

  const activeCategoryRef = React.useRef(activeCategory);
  activeCategoryRef.current = activeCategory;

  const filtersRef = React.useRef(filters);
  filtersRef.current = filters;

  // Calculate timestamp range boundary
  const getDateRangeBounds = React.useCallback((range?: string | null): { after?: string } => {
    if (!range || range === "all") return {};
    const now = new Date();
    if (range === "today") {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { after: today.toISOString() };
    }
    if (range === "yesterday") {
      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      return { after: yesterday.toISOString() };
    }
    if (range === "week") {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { after: weekAgo.toISOString() };
    }
    if (range === "month") {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { after: monthAgo.toISOString() };
    }
    return {};
  }, []);

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

  // Multi-category Global Search Execution
  const executeGlobalSearch = React.useCallback(
    async (
      query: string,
      category: SearchCategory = activeCategoryRef.current,
      activeFilters: SearchFiltersState = filtersRef.current,
      cursor?: string | null,
      append = false
    ) => {
      const trimmed = query.trim();

      // Clear search when query is empty and no conversation filter is active
      if (!user?.id || (!trimmed && !activeFilters.conversationId)) {
        if (!append) {
          setMessageResults([]);
          setPeopleResults([]);
          setMediaResults([]);
          setSavedResults([]);
          setHasMore(false);
          setNextCursor(null);
        }
        setIsGlobalSearching(false);
        return;
      }

      // Guard: Messages and People search require at least 2 characters unless scoped to a conversation or saved
      const canSearchMessages = trimmed.length >= 2 || Boolean(activeFilters.conversationId);
      const canSearchPeople = trimmed.length >= 2;

      if (!append) setIsGlobalSearching(true);

      const dateBounds = getDateRangeBounds(activeFilters.dateRange);

      try {
        const promises: Promise<void>[] = [];

        // 1. Search Messages (if 'all' or 'messages')
        if ((category === "all" || category === "messages") && canSearchMessages) {
          promises.push(
            (async () => {
              const params = new URLSearchParams();
              if (trimmed) params.set("q", trimmed);
              if (activeFilters.conversationId) params.set("conversationId", activeFilters.conversationId);
              if (activeFilters.senderId) params.set("senderId", activeFilters.senderId);
              if (activeFilters.messageType) params.set("type", activeFilters.messageType);
              if (dateBounds.after) params.set("after", dateBounds.after);
              if (cursor) params.set("before", cursor);
              params.set("limit", category === "all" ? "10" : "30");

              const res = await fetch(`/api/search/messages?${params.toString()}`);
              if (res.ok) {
                const json = await res.json();
                if (json.ok) {
                  const items: SearchMessageResult[] = json.data.items || [];
                  setMessageResults((prev) => (append ? [...prev, ...items] : items));
                  if (category === "messages") {
                    setHasMore(Boolean(json.data.hasMore));
                    setNextCursor(json.data.nextCursor || null);
                  }
                }
              }
            })()
          );
        } else if (!append && !canSearchMessages && (category === "all" || category === "messages")) {
          setMessageResults([]);
        }

        // 2. Search People (if 'all' or 'people')
        if ((category === "all" || category === "people") && canSearchPeople && !append) {
          promises.push(
            (async () => {
              const res = await fetch(
                `/api/search/people?q=${encodeURIComponent(trimmed)}&limit=${category === "all" ? "5" : "20"}`
              );
              if (res.ok) {
                const json = await res.json();
                if (json.ok) {
                  setPeopleResults(json.data.items || []);
                }
              }
            })()
          );
        } else if (!append && !canSearchPeople && (category === "all" || category === "people")) {
          setPeopleResults([]);
        }

        // 3. Search Media / Files (if 'all', 'media', or 'files')
        if (category === "all" || category === "media" || category === "files") {
          promises.push(
            (async () => {
              const params = new URLSearchParams();
              if (trimmed) params.set("q", trimmed);
              if (activeFilters.conversationId) params.set("conversationId", activeFilters.conversationId);
              params.set("category", category === "files" ? "files" : category === "media" ? "media" : "all");
              if (cursor) params.set("before", cursor);
              params.set("limit", category === "all" ? "10" : "30");

              const res = await fetch(`/api/search/media?${params.toString()}`);
              if (res.ok) {
                const json = await res.json();
                if (json.ok) {
                  const items: SearchMediaResult[] = json.data.items || [];
                  setMediaResults((prev) => (append ? [...prev, ...items] : items));
                  if (category === "media" || category === "files") {
                    setHasMore(Boolean(json.data.hasMore));
                    setNextCursor(json.data.nextCursor || null);
                  }
                }
              }
            })()
          );
        }

        // 4. Search Saved Messages (if 'saved')
        if (category === "saved") {
          promises.push(
            (async () => {
              const params = new URLSearchParams();
              if (trimmed) params.set("q", trimmed);
              if (activeFilters.conversationId) params.set("conversationId", activeFilters.conversationId);
              if (activeFilters.messageType) params.set("type", activeFilters.messageType);
              if (cursor) params.set("before", cursor);
              params.set("limit", "30");

              const res = await fetch(`/api/saved?${params.toString()}`);
              if (res.ok) {
                const json = await res.json();
                if (json.ok) {
                  const items: SavedMessageDto[] = json.data.items || [];
                  setSavedResults((prev) => (append ? [...prev, ...items] : items));
                  setHasMore(Boolean(json.data.hasMore));
                  setNextCursor(json.data.nextCursor || null);
                }
              }
            })()
          );
        }

        await Promise.all(promises);
      } catch (err) {
        console.warn("Global search execution error:", err);
      } finally {
        setIsGlobalSearching(false);
      }
    },
    [user?.id, getDateRangeBounds]
  );

  // Debounced search trigger for typing
  const searchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  const searchGlobal = React.useCallback(
    (query: string, category?: SearchCategory, newFilters?: SearchFiltersState) => {
      setGlobalQuery(query);
      const cat = category !== undefined ? category : activeCategoryRef.current;
      const fil = newFilters !== undefined ? newFilters : filtersRef.current;

      if (category !== undefined) setActiveCategory(category);
      if (newFilters !== undefined) setFilters(newFilters);

      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

      searchTimeoutRef.current = setTimeout(() => {
        executeGlobalSearch(query, cat, fil);
      }, 300);
    },
    [executeGlobalSearch]
  );

  const handleSetActiveCategory = React.useCallback(
    (cat: SearchCategory) => {
      setActiveCategory(cat);
      executeGlobalSearch(currentQueryRef.current, cat, filtersRef.current);
    },
    [executeGlobalSearch]
  );

  const handleSetFilters = React.useCallback(
    (newFilters: Partial<SearchFiltersState>) => {
      setFilters((prev) => {
        const merged = { ...prev, ...newFilters };
        executeGlobalSearch(currentQueryRef.current, activeCategoryRef.current, merged);
        return merged;
      });
    },
    [executeGlobalSearch]
  );

  const loadMore = React.useCallback(() => {
    if (!hasMore || isGlobalSearching || !nextCursor) return;
    executeGlobalSearch(globalQuery, activeCategory, filters, nextCursor, true);
  }, [hasMore, isGlobalSearching, nextCursor, globalQuery, activeCategory, filters, executeGlobalSearch]);

  const clearGlobalSearch = React.useCallback(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    setGlobalQuery("");
    setMessageResults([]);
    setPeopleResults([]);
    setMediaResults([]);
    setSavedResults([]);
    setIsGlobalSearching(false);
    setHasMore(false);
    setNextCursor(null);
  }, []);

  // Backward compatibility adapter for legacy GlobalSearchResult[]
  const legacyGlobalResults: GlobalSearchResult[] = React.useMemo(() => {
    return messageResults.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      conversationName: m.conversationName,
      conversationType: m.conversationType,
      senderId: m.senderId,
      senderName: m.senderName,
      senderAvatar: m.senderAvatar,
      content: m.content,
      messageType: m.messageType,
      createdAt: m.createdAt,
      rank: m.rank,
    }));
  }, [messageResults]);

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
    setGlobalQuery,
    activeCategory,
    setActiveCategory: handleSetActiveCategory,
    filters,
    setFilters: handleSetFilters,
    messageResults,
    peopleResults,
    mediaResults,
    savedResults,
    isGlobalSearching,
    hasMore,
    searchGlobal,
    loadMore,
    clearGlobalSearch,
    // Backward compatibility
    globalResults: legacyGlobalResults,
  };
}
