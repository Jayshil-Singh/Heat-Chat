"use client";

import * as React from "react";
import {
  MoreHorizontal,
  Reply,
  Smile,
  Copy,
  Link as LinkIcon,
  Pencil,
  Trash2,
  Share2,
  Pin,
  PinOff,
  Flag,
  Check,
  Star,
  EyeOff,
} from "lucide-react";
import { ReactionPicker } from "@/components/chat/reaction-picker";
import type { ReactionType } from "@/types/database";

interface MessageActionsMenuProps {
  messageId: string;
  isCurrentUser: boolean;
  isDeleted: boolean;
  isPinned?: boolean;
  isStarred?: boolean;
  content: string;
  currentUserReactions: ReactionType[];
  onReply: () => void;
  onReact: (reaction: ReactionType) => void;
  onEdit: () => void;
  onDeleteForMe: () => void;
  onDeleteForEveryone?: () => void;
  onForward: () => void;
  onTogglePin: () => void;
  onToggleStar?: () => void;
  onReport: () => void;
}

export function MessageActionsMenu({
  messageId,
  isCurrentUser,
  isDeleted,
  isPinned = false,
  isStarred = false,
  content,
  currentUserReactions,
  onReply,
  onReact,
  onEdit,
  onDeleteForMe,
  onDeleteForEveryone,
  onForward,
  onTogglePin,
  onToggleStar,
  onReport,
}: MessageActionsMenuProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [showReactionPicker, setShowReactionPicker] = React.useState(false);
  const [showDeleteChoices, setShowDeleteChoices] = React.useState(false);
  const [copySuccess, setCopySuccess] = React.useState(false);
  const [linkCopied, setLinkCopied] = React.useState(false);

  const menuRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const reactBtnRef = React.useRef<HTMLButtonElement>(null);

  // Close on outside click
  React.useEffect(() => {
    if (!menuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setShowDeleteChoices(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [menuOpen]);

  // Keyboard accessibility: Escape to close
  React.useEffect(() => {
    if (!menuOpen && !showReactionPicker) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setMenuOpen(false);
        setShowDeleteChoices(false);
        setShowReactionPicker(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [menuOpen, showReactionPicker]);

  const handleCopyText = () => {
    if (!isDeleted) {
      navigator.clipboard.writeText(content);
      setCopySuccess(true);
      setMenuOpen(false);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const handleCopyLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("messageId", messageId);
    navigator.clipboard.writeText(url.toString());
    setLinkCopied(true);
    setMenuOpen(false);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  return (
    <div className="flex shrink-0 items-center gap-0.5" role="toolbar" aria-label="Message actions">
      {/* Quick Reaction button */}
      {!isDeleted && (
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
                onReact={(r) => {
                  onReact(r);
                  setShowReactionPicker(false);
                }}
                onClose={() => {
                  setShowReactionPicker(false);
                  reactBtnRef.current?.focus();
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Reply Quick Button */}
      {!isDeleted && (
        <button
          type="button"
          aria-label="Reply to message"
          onClick={(e) => {
            e.stopPropagation();
            onReply();
          }}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 shadow-sm transition-colors hover:border-zinc-300 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-200"
        >
          <Reply className="h-3.5 w-3.5" />
        </button>
      )}

      {/* More actions dropdown menu */}
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
            setShowDeleteChoices(false);
            setShowReactionPicker(false);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 shadow-sm transition-colors hover:border-zinc-300 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-200"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>

        {menuOpen && (
          <div
            role="menu"
            aria-orientation="vertical"
            className={`absolute bottom-9 z-50 w-52 rounded-2xl border border-zinc-200 bg-white py-1.5 shadow-xl dark:border-zinc-700 dark:bg-zinc-850 dark:shadow-black/50 ${
              isCurrentUser ? "right-0" : "left-0"
            }`}
          >
            {showDeleteChoices ? (
              <div className="p-2 space-y-1">
                <p className="px-2 py-1 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                  Delete Message
                </p>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onDeleteForMe();
                    setMenuOpen(false);
                    setShowDeleteChoices(false);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700/60 transition-colors text-left"
                >
                  <EyeOff className="h-3.5 w-3.5 text-zinc-500" />
                  <span>Delete for me</span>
                </button>

                {isCurrentUser && onDeleteForEveryone && !isDeleted && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onDeleteForEveryone();
                      setMenuOpen(false);
                      setShowDeleteChoices(false);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 transition-colors text-left font-medium"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    <span>Delete for everyone</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowDeleteChoices(false)}
                  className="w-full text-center py-1 text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                {!isDeleted && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onReply();
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700/60 transition-colors"
                  >
                    <Reply className="h-3.5 w-3.5 text-zinc-400" />
                    <span>Reply</span>
                  </button>
                )}

                {!isDeleted && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onForward();
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700/60 transition-colors"
                  >
                    <Share2 className="h-3.5 w-3.5 text-zinc-400" />
                    <span>Forward</span>
                  </button>
                )}

                {!isDeleted && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onTogglePin();
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700/60 transition-colors"
                  >
                    {isPinned ? (
                      <>
                        <PinOff className="h-3.5 w-3.5 text-amber-500" />
                        <span>Unpin message</span>
                      </>
                    ) : (
                      <>
                        <Pin className="h-3.5 w-3.5 text-zinc-400" />
                        <span>Pin message</span>
                      </>
                    )}
                  </button>
                )}

                {onToggleStar && !isDeleted && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onToggleStar();
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700/60 transition-colors"
                  >
                    <Star
                      className={`h-3.5 w-3.5 ${
                        isStarred
                          ? "fill-amber-400 text-amber-400"
                          : "text-zinc-400"
                      }`}
                    />
                    <span>{isStarred ? "Unstar message" : "Star message"}</span>
                  </button>
                )}

                {!isDeleted && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleCopyText}
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700/60 transition-colors"
                  >
                    {copySuccess ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          Copied!
                        </span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-zinc-400" />
                        <span>Copy text</span>
                      </>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  role="menuitem"
                  onClick={handleCopyLink}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700/60 transition-colors"
                >
                  {linkCopied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        Link copied!
                      </span>
                    </>
                  ) : (
                    <>
                      <LinkIcon className="h-3.5 w-3.5 text-zinc-400" />
                      <span>Copy link</span>
                    </>
                  )}
                </button>

                {isCurrentUser && !isDeleted && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onEdit();
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700/60 transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5 text-zinc-400" />
                    <span>Edit message</span>
                  </button>
                )}

                <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />

                {!isCurrentUser && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onReport();
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700/60 transition-colors"
                  >
                    <Flag className="h-3.5 w-3.5 text-zinc-400" />
                    <span>Report message</span>
                  </button>
                )}

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setShowDeleteChoices(true)}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  <span>Delete...</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
