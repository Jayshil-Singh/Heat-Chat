"use client";

import * as React from "react";
import {
  BarChart2,
  CheckCircle2,
  Circle,
  Square,
  CheckSquare,
  Lock,
  Users,
  EyeOff,
  Sparkles,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import type { PollDto } from "@/types/chat";

interface PollCardProps {
  poll: PollDto;
  onVote: (pollId: string, optionIds: string[]) => Promise<{ success: boolean; error?: string }>;
  onClosePoll?: (pollId: string) => Promise<{ success: boolean; error?: string }>;
  canClose?: boolean;
}

export function PollCard({
  poll,
  onVote,
  onClosePoll,
  canClose = false,
}: PollCardProps) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const hasVoted = poll.options.some((o) => o.isVotedByMe);
  const isClosed = poll.isClosed;

  const handleToggleOption = async (optionId: string) => {
    if (isClosed || isSubmitting) return;

    setIsSubmitting(true);
    let newSelected: string[] = [];

    if (poll.isMultipleChoice) {
      const currentSelected = poll.options.filter((o) => o.isVotedByMe).map((o) => o.id);
      if (currentSelected.includes(optionId)) {
        newSelected = currentSelected.filter((id) => id !== optionId);
      } else {
        newSelected = [...currentSelected, optionId];
      }
    } else {
      const currentlyVoted = poll.options.find((o) => o.isVotedByMe);
      if (currentlyVoted?.id === optionId) {
        if (poll.allowVoteChange) newSelected = [];
        else newSelected = [optionId];
      } else {
        newSelected = [optionId];
      }
    }

    await onVote(poll.id, newSelected);
    setIsSubmitting(false);
  };

  const handleClose = async () => {
    if (!confirm("Are you sure you want to close this poll? Voting will be disabled for all members.")) return;
    if (onClosePoll) {
      await onClosePoll(poll.id);
    }
  };

  return (
    <div className="w-full max-w-sm rounded-2xl border border-zinc-200/80 bg-white/90 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90 backdrop-blur-sm space-y-3.5">
      {/* Poll Header */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-heat-600 dark:text-heat-400">
            <BarChart2 className="h-3.5 w-3.5" />
            <span>Poll</span>
          </span>

          <div className="flex items-center gap-1.5">
            {isClosed ? (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                <Lock className="h-2.5 w-2.5" />
                Closed
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Active
              </span>
            )}

            {poll.isAnonymous && (
              <span
                className="inline-flex items-center gap-0.5 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                title="Anonymous poll"
              >
                <EyeOff className="h-2.5 w-2.5" />
                Anon
              </span>
            )}
          </div>
        </div>

        <h3 className="text-sm font-bold text-zinc-900 dark:text-white leading-snug">
          {poll.question}
        </h3>
        <p className="text-[11px] text-zinc-400">
          {poll.isMultipleChoice ? "Select one or more options" : "Select one option"}
        </p>
      </div>

      {/* Options */}
      <div className="space-y-2">
        {poll.options.map((opt) => {
          const pct = poll.totalVotes > 0 ? Math.round((opt.voteCount / poll.totalVotes) * 100) : 0;
          const isSelected = opt.isVotedByMe;

          return (
            <div
              key={opt.id}
              onClick={() => handleToggleOption(opt.id)}
              className={`relative overflow-hidden rounded-xl border p-2.5 transition-all cursor-pointer select-none ${
                isSelected
                  ? "border-heat-500 bg-heat-500/5 dark:bg-heat-500/10 shadow-sm"
                  : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-950/40"
              } ${isClosed ? "cursor-default" : ""}`}
            >
              {/* Progress bar fill */}
              <div
                className={`absolute inset-y-0 left-0 transition-all duration-500 ${
                  isSelected
                    ? "bg-heat-500/20 dark:bg-heat-500/25"
                    : "bg-zinc-200/50 dark:bg-zinc-800/50"
                }`}
                style={{ width: `${pct}%` }}
              />

              <div className="relative z-10 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {poll.isMultipleChoice ? (
                    isSelected ? (
                      <CheckSquare className="h-4 w-4 text-heat-500 shrink-0" />
                    ) : (
                      <Square className="h-4 w-4 text-zinc-400 shrink-0" />
                    )
                  ) : isSelected ? (
                    <CheckCircle2 className="h-4 w-4 text-heat-500 shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-zinc-400 shrink-0" />
                  )}

                  <span
                    className={`text-xs font-semibold truncate ${
                      isSelected
                        ? "text-heat-700 dark:text-heat-300"
                        : "text-zinc-800 dark:text-zinc-200"
                    }`}
                  >
                    {opt.optionText}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 text-right">
                  <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                    {pct}%
                  </span>
                  <span className="text-[10px] text-zinc-400">
                    ({opt.voteCount})
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer info & Actions */}
      <div className="flex items-center justify-between pt-1 border-t border-zinc-100 dark:border-zinc-800/60 text-[11px] text-zinc-400">
        <span>{poll.totalVotes} {poll.totalVotes === 1 ? "vote" : "votes"}</span>

        {canClose && !isClosed && (
          <button
            type="button"
            onClick={handleClose}
            className="text-[11px] font-semibold text-zinc-500 hover:text-red-500 dark:text-zinc-400 dark:hover:text-red-400 transition-colors"
          >
            Close Poll
          </button>
        )}
      </div>
    </div>
  );
}
