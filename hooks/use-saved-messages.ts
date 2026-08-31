"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./use-auth";
import type { SavedMessageDto, StarredMessageWithDetails } from "@/types/chat";

interface UseSavedMessagesOptions {
  conversationId?: string | null;
  initialCategory?: string;
}

export function useSavedMessages(options?: UseSavedMessagesOptions | string | null) {
  const conversationId = typeof options === "string" ? options : options?.conversationId || null;
  const { user } = useAuth();
  const supabase = React.useMemo(() => createClient(), []);

  const [savedMessages, setSavedMessages] = React.useState<SavedMessageDto[]>([]);
  const [savedMessageIds, setSavedMessageIds] = React.useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState<string>("all");
  const [hasMore, setHasMore] = React.useState(false);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);

  // Fetch saved messages from server API
  const fetchSavedMessages = React.useCallback(
    async (cursor?: string | null, append = false) => {
      if (!user?.id) {
        setSavedMessages([]);
        setSavedMessageIds(new Set());
        setIsLoading(false);
        return;
      }

      if (!append) setIsLoading(true);

      try {
        const params = new URLSearchParams();
        if (searchQuery.trim()) params.set("q", searchQuery.trim());
        if (conversationId) params.set("conversationId", conversationId);
        if (categoryFilter && categoryFilter !== "all") params.set("type", categoryFilter);
        if (cursor) params.set("before", cursor);
        params.set("limit", "30");

        const res = await fetch(`/api/saved?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch saved messages");

        const json = await res.json();
        if (json.ok) {
          const items: SavedMessageDto[] = json.data.items || [];
          setHasMore(Boolean(json.data.hasMore));
          setNextCursor(json.data.nextCursor || null);

          setSavedMessages((prev) => (append ? [...prev, ...items] : items));

          setSavedMessageIds((prev) => {
            const next = append ? new Set(prev) : new Set<string>();
            items.forEach((item) => next.add(item.messageId));
            return next;
          });
        }
      } catch (err) {
        console.warn("Failed to load saved messages:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [user?.id, searchQuery, conversationId, categoryFilter]
  );

  React.useEffect(() => {
    fetchSavedMessages();
  }, [fetchSavedMessages]);

  const loadMore = React.useCallback(() => {
    if (!hasMore || isLoading || !nextCursor) return;
    fetchSavedMessages(nextCursor, true);
  }, [hasMore, isLoading, nextCursor, fetchSavedMessages]);

  // Save message
  const saveMessage = React.useCallback(
    async (messageId: string): Promise<boolean> => {
      if (!user?.id) return false;

      // Optimistic update
      setSavedMessageIds((prev) => new Set(prev).add(messageId));

      try {
        const res = await fetch(`/api/messages/${messageId}/save`, { method: "POST" });
        if (!res.ok) throw new Error("Failed to save message");
        fetchSavedMessages();
        return true;
      } catch (err) {
        console.error("Save error:", err);
        setSavedMessageIds((prev) => {
          const next = new Set(prev);
          next.delete(messageId);
          return next;
        });
        return false;
      }
    },
    [user?.id, fetchSavedMessages]
  );

  // Unsave message
  const unsaveMessage = React.useCallback(
    async (messageId: string): Promise<boolean> => {
      if (!user?.id) return false;

      const prevIds = new Set(savedMessageIds);
      const prevList = [...savedMessages];

      // Optimistic update
      setSavedMessageIds((prev) => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
      setSavedMessages((prev) => prev.filter((m) => m.messageId !== messageId));

      try {
        const res = await fetch(`/api/messages/${messageId}/save`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to unsave message");
        return true;
      } catch (err) {
        console.error("Unsave error:", err);
        // Rollback
        setSavedMessageIds(prevIds);
        setSavedMessages(prevList);
        return false;
      }
    },
    [user?.id, savedMessageIds, savedMessages]
  );

  // Toggle save status
  const toggleSave = React.useCallback(
    async (messageId: string): Promise<boolean> => {
      const isSaved = savedMessageIds.has(messageId);
      if (isSaved) {
        const success = await unsaveMessage(messageId);
        return !success;
      } else {
        return await saveMessage(messageId);
      }
    },
    [savedMessageIds, unsaveMessage, saveMessage]
  );

  const isMessageSaved = React.useCallback(
    (messageId: string) => savedMessageIds.has(messageId),
    [savedMessageIds]
  );

  // Backward compatibility adapters for StarredMessagesDialog / existing code
  const starredMessages: StarredMessageWithDetails[] = React.useMemo(() => {
    return savedMessages.map((sm) => ({
      id: sm.savedId,
      userId: user?.id || "",
      messageId: sm.messageId,
      createdAt: sm.savedAt,
      message: {
        id: sm.messageId,
        conversationId: sm.conversationId,
        senderId: sm.senderId,
        content: sm.content,
        messageType: sm.messageType,
        createdAt: sm.createdAt,
        sender: sm.senderId
          ? ({
              id: sm.senderId,
              username: sm.senderUsername,
              display_name: sm.senderName,
              avatar_url: sm.senderAvatar,
              status: "offline",
              status_message: null,
              status_emoji: null,
              last_seen_at: null,
              timezone: null,
              language: null,
              cover_url: null,
              bio: null,
              created_at: sm.createdAt,
              updated_at: sm.createdAt,
            } as any)
          : null,
        conversationName: sm.conversationName,
        conversationType: sm.conversationType,
        attachments: sm.attachments,
      },
    }));
  }, [savedMessages, user?.id]);

  return {
    savedMessages,
    savedMessageIds,
    isLoading,
    hasMore,
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    loadMore,
    saveMessage,
    unsaveMessage,
    toggleSave,
    isMessageSaved,
    refreshSaved: fetchSavedMessages,
    // Backward compatibility aliases
    starredMessages,
    conversationStarredMessages: starredMessages,
    starredMessageIds: savedMessageIds,
    toggleStar: toggleSave,
    isMessageStarred: isMessageSaved,
    refreshStarred: fetchSavedMessages,
  };
}
