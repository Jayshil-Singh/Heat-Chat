"use client";

import * as React from "react";
import {
  MoreHorizontal,
  Reply,
  Smile,
  Copy,
  Pencil,
  Trash2,
  Check,
} from "lucide-react";
import { ReactionPicker } from "./reaction-picker";
import type { ReactionType } from "@/types/database";

interface MessageActionsProps {
  isCurrentUser: boolean;
  /** If true, hide Edit and do not allow Copy of original content */
  isDeleted: boolean;
  /** Reactions the current user already has on this message */
  currentUserReactions: ReactionType[];
  onReply: () => void;
  onReact: (reaction: ReactionType) => void;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function MessageActions({
  isCurrentUser,
  isDeleted,
  currentUserReactions,
  onReply,
  onReact,
  onCopy,
  onEdit,
  onDelete,
}: MessageActionsProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [showReactionPicker, setShowReactionPicker] = React.useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [copySuccess, setCopySuccess] = React.useState(false);

  const menuRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const reactBtnRef = React.useRef<HTMLButtonElement>(null);

  // Close menu on outside click
  React.useEffect(() => {
    if (!menuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setShowDeleteConfirm(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [menuOpen]);

  // Close everything on Escape, restore focus
  React.useEffect(() => {
    if (!menuOpen && !showReactionPicker) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setMenuOpen(false);
        setShowDeleteConfirm(false);
        setShowReactionPicker(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [menuOpen, showReactionPicker]);

  const handleCopy = () => {
    onCopy();
    setCopySuccess(true);
    setMenuOpen(false);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleDeleteConfirm = () => {
    onDelete();
    setMenuOpen(false);
    setShowDeleteConfirm(false);
  };

  return (
    <div
      className="flex shrink-0 items-center gap-0.5"
      // Actions are hidden by default; parent group-hover / focus-within reveals them
    >
      {/* Quick React button */}
      <div className="relative">
        <button
          ref={reactBtnRef}
          type="button"
          aria-label="Add reaction"
          aria-expanded={showReactionPicker}
          aria-haspopup="dialog"
          onClick={(e) => {
            e.stopPropagation();
            setShowReactionPicker((v) => !v);
            setMenuOpen(false);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 shadow-sm transition-colors hover:border-zinc-300 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-200"
        >
          <Smile className="h-3.5 w-3.5" />
        </button>
        {showReactionPicker && (
          <div
            className={`absolute bottom-9 z-50 ${
              isCurrentUser ? "right-0" : "left-0"
            }`}
          >
            <ReactionPicker
              activeReactions={currentUserReactions}
              onReact={onReact}
              onClose={() => {
                setShowReactionPicker(false);
                reactBtnRef.current?.focus();
              }}
            />
          </div>
        )}
      </div>

      {/* More actions menu */}
      <div className="relative" ref={menuRef}>
        <button
          ref={triggerRef}
          type="button"
          aria-label="More message actions"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
            setShowDeleteConfirm(false);
            setShowReactionPicker(false);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 shadow-sm transition-colors hover:border-zinc-300 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-200"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>

        {menuOpen && (
          <div
            role="menu"
            aria-label="Message actions"
            className={`absolute bottom-9 z-50 min-w-[152px] rounded-xl border border-zinc-200 bg-white py-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-800 animate-in zoom-in-95 fade-in duration-100 ${
              isCurrentUser ? "right-0" : "left-0"
            }`}
          >
            {/* Reply — always available */}
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                onReply();
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-700/50 focus-visible:outline-none focus-visible:bg-zinc-50"
            >
              <Reply className="h-3.5 w-3.5" aria-hidden="true" />
              Reply
            </button>

            {/* Copy — disabled for deleted messages */}
            <button
              role="menuitem"
              type="button"
              onClick={handleCopy}
              disabled={isDeleted}
              aria-disabled={isDeleted}
              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-700/50 focus-visible:outline-none focus-visible:bg-zinc-50"
            >
              {copySuccess ? (
                <Check className="h-3.5 w-3.5 text-green-500" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {copySuccess ? "Copied!" : "Copy"}
            </button>

            {/* Edit — own messages, not deleted */}
            {isCurrentUser && !isDeleted && (
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  onEdit();
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-700/50 focus-visible:outline-none focus-visible:bg-zinc-50"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                Edit
              </button>
            )}

            {/* Delete — own messages only */}
            {isCurrentUser && (
              <>
                <div
                  className="mx-2 my-1 h-px bg-zinc-100 dark:bg-zinc-700"
                  role="separator"
                />
                {showDeleteConfirm ? (
                  <div className="px-3 py-2">
                    <p className="mb-2 text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                      Delete for everyone?
                    </p>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(false)}
                        className="flex-1 rounded-lg border border-zinc-200 px-2 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteConfirm}
                        className="flex-1 rounded-lg bg-red-500 px-2 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 focus-visible:outline-none focus-visible:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Delete
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
