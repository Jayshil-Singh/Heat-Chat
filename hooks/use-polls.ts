"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./use-auth";
import type { PollDto } from "@/types/chat";

export function usePolls(conversationId: string | null) {
  const { user } = useAuth();
  const [polls, setPolls] = React.useState<PollDto[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const supabase = React.useMemo(() => createClient(), []);

  const fetchPolls = React.useCallback(async (isSilent = false) => {
    if (!conversationId || !user?.id) return;

    if (!isSilent) setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${conversationId}/polls`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error?.message || "Failed to fetch polls");
      }
      const json = await res.json();
      if (json.ok && Array.isArray(json.data?.polls)) {
        setPolls(json.data.polls);
      }
    } catch (err: any) {
      console.warn("usePolls fetch error:", err);
      setError(err.message || "Failed to load polls");
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  }, [conversationId, user?.id]);

  const fetchPollsRef = React.useRef(fetchPolls);
  React.useEffect(() => {
    fetchPollsRef.current = fetchPolls;
  });

  // Initial fetch
  React.useEffect(() => {
    fetchPolls();
  }, [fetchPolls]);

  // Single-owner realtime channel listener for polls & votes
  React.useEffect(() => {
    if (!conversationId || !user?.id) return;

    const channelName = `polls:${conversationId}`;
    const channel = supabase.channel(channelName);

    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "polls",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          fetchPollsRef.current(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, user?.id, supabase]);

  const createPoll = async (
    question: string,
    options: string[],
    isMultipleChoice = false,
    isAnonymous = false,
    allowVoteChange = true
  ): Promise<{ success: boolean; pollId?: string; error?: string }> => {
    if (!conversationId || !user?.id) {
      return { success: false, error: "Not authenticated" };
    }

    try {
      const res = await fetch(`/api/groups/${conversationId}/polls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          options,
          isMultipleChoice,
          isAnonymous,
          allowVoteChange,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        return { success: false, error: json.error?.message || "Failed to create poll" };
      }

      await fetchPolls();
      return { success: true, pollId: json.data?.pollId };
    } catch (err: any) {
      return { success: false, error: err.message || "Failed to create poll" };
    }
  };

  const votePoll = async (
    pollId: string,
    optionIds: string[]
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user?.id) return { success: false, error: "Not authenticated" };

    // Optimistic UI update
    setPolls((prev) =>
      prev.map((poll) => {
        if (poll.id !== pollId) return poll;

        const updatedOptions = poll.options.map((opt) => {
          const wasVoted = opt.isVotedByMe;
          const isNowVoted = optionIds.includes(opt.id);
          let voteCount = opt.voteCount;
          if (!wasVoted && isNowVoted) voteCount += 1;
          if (wasVoted && !isNowVoted) voteCount = Math.max(0, voteCount - 1);

          return {
            ...opt,
            voteCount,
            isVotedByMe: isNowVoted,
          };
        });

        const totalVotes = updatedOptions.reduce((sum, o) => sum + o.voteCount, 0);

        return {
          ...poll,
          totalVotes,
          options: updatedOptions,
        };
      })
    );

    try {
      const res = await fetch(`/api/polls/${pollId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionIds }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        // Roll back on failure
        await fetchPolls();
        return { success: false, error: json.error?.message || "Failed to vote" };
      }

      return { success: true };
    } catch (err: any) {
      await fetchPolls();
      return { success: false, error: err.message || "Failed to vote" };
    }
  };

  const closePoll = async (pollId: string): Promise<{ success: boolean; error?: string }> => {
    if (!user?.id) return { success: false, error: "Not authenticated" };

    try {
      const res = await fetch(`/api/polls/${pollId}/close`, {
        method: "POST",
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        return { success: false, error: json.error?.message || "Failed to close poll" };
      }

      await fetchPolls();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || "Failed to close poll" };
    }
  };

  const getPollByMessageId = React.useCallback(
    (messageId: string): PollDto | undefined => {
      return polls.find((p) => p.messageId === messageId);
    },
    [polls]
  );

  return {
    polls,
    isLoading,
    error,
    createPoll,
    votePoll,
    closePoll,
    getPollByMessageId,
    refreshPolls: fetchPolls,
  };
}
