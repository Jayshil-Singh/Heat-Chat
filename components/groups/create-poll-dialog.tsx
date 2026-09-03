"use client";

import * as React from "react";
import {
  X,
  BarChart2,
  Plus,
  Trash2,
  Loader2,
  Sparkles,
  CheckSquare,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CreatePollDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (
    question: string,
    options: string[],
    isMultipleChoice: boolean,
    isAnonymous: boolean,
    allowVoteChange: boolean
  ) => Promise<{ success: boolean; error?: string }>;
}

export function CreatePollDialog({
  isOpen,
  onClose,
  onSubmit,
}: CreatePollDialogProps) {
  const [question, setQuestion] = React.useState("");
  const [options, setOptions] = React.useState<string[]>(["", ""]);
  const [isMultipleChoice, setIsMultipleChoice] = React.useState(false);
  const [isAnonymous, setIsAnonymous] = React.useState(false);
  const [allowVoteChange, setAllowVoteChange] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setQuestion("");
      setOptions(["", ""]);
      setIsMultipleChoice(false);
      setIsAnonymous(false);
      setAllowVoteChange(true);
      setErrorMessage(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleAddOption = () => {
    if (options.length < 10) {
      setOptions((prev) => [...prev, ""]);
    }
  };

  const handleRemoveOption = (index: number) => {
    if (options.length > 2) {
      setOptions((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const handleOptionChange = (index: number, val: string) => {
    setOptions((prev) => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedQ = question.trim();
    if (!trimmedQ) {
      setErrorMessage("Please enter a poll question");
      return;
    }

    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (cleanOptions.length < 2) {
      setErrorMessage("Please provide at least 2 non-empty options");
      return;
    }

    // Check for duplicate options
    const uniqueOptions = new Set(cleanOptions.map((o) => o.toLowerCase()));
    if (uniqueOptions.size !== cleanOptions.length) {
      setErrorMessage("Options must all be unique");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await onSubmit(
      trimmedQ,
      cleanOptions,
      isMultipleChoice,
      isAnonymous,
      allowVoteChange
    );

    if (!res.success) {
      setErrorMessage(res.error || "Failed to create poll");
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    onClose();
  };

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200 cursor-pointer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-poll-title"
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 flex flex-col max-h-[90vh] overflow-hidden cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/80 px-5 py-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-heat-500/10 text-heat-600 dark:text-heat-400">
              <BarChart2 className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="create-poll-title"
                className="text-base font-bold text-zinc-900 dark:text-white"
              >
                Create a Poll
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Ask a question and gather group opinions
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-5 space-y-4 overflow-y-auto flex-1">
            {errorMessage && (
              <div
                className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300"
                role="alert"
              >
                {errorMessage}
              </div>
            )}

            {/* Question Input */}
            <div className="space-y-1.5">
              <label
                htmlFor="poll-question-input"
                className="text-xs font-semibold text-zinc-700 dark:text-zinc-300"
              >
                Question <span className="text-heat-500">*</span>
              </label>
              <Input
                id="poll-question-input"
                placeholder="e.g. Where should we go for team dinner?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={300}
                required
                autoFocus
                disabled={isSubmitting}
                className="h-10 text-sm"
              />
            </div>

            {/* Options List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Options ({options.length}/10) <span className="text-heat-500">*</span>
                </label>
                {options.length < 10 && (
                  <button
                    type="button"
                    onClick={handleAddOption}
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-heat-600 hover:text-heat-700 dark:text-heat-400"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Option</span>
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {options.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      placeholder={`Option ${idx + 1}`}
                      value={opt}
                      onChange={(e) => handleOptionChange(idx, e.target.value)}
                      maxLength={100}
                      required
                      disabled={isSubmitting}
                      className="h-9 text-xs flex-1"
                    />
                    {options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOption(idx)}
                        disabled={isSubmitting}
                        className="text-zinc-400 hover:text-red-500 p-1.5 rounded transition-colors"
                        title="Remove option"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Poll Configuration Switches */}
            <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">
                Poll Settings
              </label>

              {/* Multiple Choice */}
              <div
                onClick={() => !isSubmitting && setIsMultipleChoice((p) => !p)}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900/50 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <CheckSquare className="h-4 w-4 text-zinc-400" />
                  <div>
                    <p className="text-xs font-medium text-zinc-900 dark:text-white">
                      Multiple answers
                    </p>
                    <p className="text-[10px] text-zinc-400">
                      Allow voters to select more than one option
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={isMultipleChoice}
                  onChange={() => {}}
                  className="h-4 w-4 rounded text-heat-500 accent-heat-500"
                />
              </div>

              {/* Anonymous Voting */}
              <div
                onClick={() => !isSubmitting && setIsAnonymous((p) => !p)}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900/50 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <EyeOff className="h-4 w-4 text-zinc-400" />
                  <div>
                    <p className="text-xs font-medium text-zinc-900 dark:text-white">
                      Anonymous voting
                    </p>
                    <p className="text-[10px] text-zinc-400">
                      Hide voter identities from results
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={() => {}}
                  className="h-4 w-4 rounded text-heat-500 accent-heat-500"
                />
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 border-t border-zinc-100 dark:border-zinc-800/80 px-5 py-3.5 shrink-0 bg-zinc-50/50 dark:bg-zinc-900/30">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="heat"
              size="sm"
              disabled={isSubmitting || !question.trim() || options.filter((o) => o.trim()).length < 2}
              className="gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Creating Poll...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Post Poll</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
