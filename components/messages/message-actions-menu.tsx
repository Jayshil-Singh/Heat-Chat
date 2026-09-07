"use client";

import * as React from "react";
import { createPortal } from "react-dom";
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
  Bookmark,
  BookmarkCheck,
  EyeOff,
  X,
} from "lucide-react";
import { ReactionPicker } from "@/components/chat/reaction-picker";
import type { ReactionType } from "@/types/database";

const QUICK_REACTIONS: ReactionType[] = ["❤️", "😂", "👍", "🔥", "😮", "😢", "👏"];

export interface MessageActionsMenuProps {
  messageId: string;
  isCurrentUser: boolean;
  isDeleted: boolean;
  isPinned?: boolean;
  isStarred?: boolean;
  content: string;
  currentUserReactions: ReactionType[];
  isMobileSheetOpen?: boolean;
  onMobileSheetClose?: () => void;
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
  isMobileSheetOpen = false,
  onMobileSheetClose,
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
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const menuRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const reactBtnRef = React.useRef<HTMLButtonElement>(null);

  const [menuCoords, setMenuCoords] = React.useState<{ top: number; left: number } | null>(null);
  const [pickerCoords, setPickerCoords] = React.useState<{ top: number; left: number } | null>(null);

  // Dynamic collision-aware calculation for menu positioning
  const updateMenuPosition = React.useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const menuWidth = Math.min(208, viewportWidth - 16);
    // Estimated height based on whether delete choices are displayed
    const menuHeight = showDeleteChoices ? 160 : 310;

    const idealLeft = isCurrentUser ? rect.right - menuWidth : rect.left;
    // Strictly clamp horizontal position with 8px margin
    const left = Math.max(8, Math.min(viewportWidth - menuWidth - 8, idealLeft));

    const spaceAbove = rect.top;
    const spaceBelow = viewportHeight - rect.bottom;

    let top: number;
    if (spaceAbove >= menuHeight + 12) {
      top = rect.top - menuHeight - 6;
    } else if (spaceBelow >= menuHeight + 12) {
      top = rect.bottom + 6;
    } else if (spaceAbove >= spaceBelow) {
      top = Math.max(8, rect.top - menuHeight - 6);
    } else {
      top = Math.min(viewportHeight - menuHeight - 8, rect.bottom + 6);
    }

    setMenuCoords({ top, left });
  }, [isCurrentUser, showDeleteChoices]);

  // Dynamic collision-aware calculation for ReactionPicker
  const updatePickerPosition = React.useCallback(() => {
    if (!reactBtnRef.current) return;
    const rect = reactBtnRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const pickerWidth = Math.min(246, viewportWidth - 16);
    const pickerHeight = 48;

    const idealLeft = isCurrentUser ? rect.right - pickerWidth : rect.left;
    const left = Math.max(8, Math.min(viewportWidth - pickerWidth - 8, idealLeft));

    let top: number;
    if (rect.top >= pickerHeight + 12) {
      top = rect.top - pickerHeight - 8;
    } else {
      top = Math.min(viewportHeight - pickerHeight - 8, rect.bottom + 8);
    }

    setPickerCoords({ top, left });
  }, [isCurrentUser]);

  React.useEffect(() => {
    if (menuOpen) {
      updateMenuPosition();
      const handleReposition = () => updateMenuPosition();
      window.addEventListener("resize", handleReposition, { passive: true });
      window.addEventListener("scroll", handleReposition, { passive: true });
      return () => {
        window.removeEventListener("resize", handleReposition);
        window.removeEventListener("scroll", handleReposition);
      };
    }
  }, [menuOpen, updateMenuPosition]);

  React.useEffect(() => {
    if (showReactionPicker) {
      updatePickerPosition();
      const handleReposition = () => updatePickerPosition();
      window.addEventListener("resize", handleReposition, { passive: true });
      window.addEventListener("scroll", handleReposition, { passive: true });
      return () => {
        window.removeEventListener("resize", handleReposition);
        window.removeEventListener("scroll", handleReposition);
      };
    }
  }, [showReactionPicker, updatePickerPosition]);

  // Close on outside click
  React.useEffect(() => {
    if (!menuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
        setShowDeleteChoices(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [menuOpen]);

  // Keyboard accessibility: Escape to close and focus restoration
  React.useEffect(() => {
    if (!menuOpen && !showReactionPicker && !isMobileSheetOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (menuOpen) {
          setMenuOpen(false);
          setShowDeleteChoices(false);
          triggerRef.current?.focus();
        }
        if (showReactionPicker) {
          setShowReactionPicker(false);
          reactBtnRef.current?.focus();
        }
        if (isMobileSheetOpen && onMobileSheetClose) {
          onMobileSheetClose();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [menuOpen, showReactionPicker, isMobileSheetOpen, onMobileSheetClose]);

  // Arrow key navigation inside menu
  React.useEffect(() => {
    if (!menuOpen || !menuRef.current) return;
    const handleMenuKeys = (e: KeyboardEvent) => {
      const items = Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>('button[role="menuitem"], button') || []
      );
      if (items.length === 0) return;
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIndex = (currentIndex + 1) % items.length;
        items[nextIndex]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prevIndex = (currentIndex - 1 + items.length) % items.length;
        items[prevIndex]?.focus();
      }
    };

    document.addEventListener("keydown", handleMenuKeys);
    return () => document.removeEventListener("keydown", handleMenuKeys);
  }, [menuOpen]);

  const handleCopyText = () => {
    if (!isDeleted) {
      navigator.clipboard.writeText(content);
      setCopySuccess(true);
      setMenuOpen(false);
      triggerRef.current?.focus();
      if (onMobileSheetClose) onMobileSheetClose();
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const handleCopyLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("messageId", messageId);
    navigator.clipboard.writeText(url.toString());
    setLinkCopied(true);
    setMenuOpen(false);
    triggerRef.current?.focus();
    if (onMobileSheetClose) onMobileSheetClose();
    setTimeout(() => setLinkCopied(false), 2000);
  };

  return (
    <>
      {/* ── ACTION TOOLBAR ────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-0.5" role="toolbar" aria-label="Message actions">
        {/* Quick Reaction button — visible on sm+, on mobile accessible via ... menu */}
        {!isDeleted && (
          <div className="relative hidden sm:block">
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
              className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 shadow-xs transition-colors hover:border-zinc-300 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-200"
            >
              <Smile className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Portal-rendered ReactionPicker */}
        {mounted && showReactionPicker && pickerCoords && createPortal(
          <div
            style={{
              position: "fixed",
              top: `${pickerCoords.top}px`,
              left: `${pickerCoords.left}px`,
              maxWidth: "calc(100vw - 16px)",
            }}
            className="z-50 animate-in fade-in zoom-in-95 duration-100"
          >
            <ReactionPicker
              activeReactions={currentUserReactions}
              onReact={(r) => {
                onReact(r);
                setShowReactionPicker(false);
                reactBtnRef.current?.focus();
              }}
              onClose={() => {
                setShowReactionPicker(false);
                reactBtnRef.current?.focus();
              }}
            />
          </div>,
          document.body
        )}

        {/* Reply Quick Button — visible on sm+ */}
        {!isDeleted && (
          <button
            type="button"
            aria-label="Reply to message"
            onClick={(e) => {
              e.stopPropagation();
              onReply();
            }}
            className="hidden sm:flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 shadow-xs transition-colors hover:border-zinc-300 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-200"
          >
            <Reply className="h-3.5 w-3.5" />
          </button>
        )}

        {/* More actions dropdown trigger */}
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
          className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 shadow-xs transition-colors hover:border-zinc-300 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-200"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>

        {/* Portal-rendered collision-aware dropdown menu */}
        {mounted && menuOpen && menuCoords && createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-orientation="vertical"
            style={{
              position: "fixed",
              top: `${menuCoords.top}px`,
              left: `${menuCoords.left}px`,
              maxWidth: "calc(100vw - 16px)",
            }}
            className="z-50 w-52 rounded-2xl border border-zinc-200 bg-white py-1.5 shadow-xl dark:border-zinc-700 dark:bg-zinc-850 dark:shadow-black/50 animate-in fade-in zoom-in-95 duration-100"
          >
            {/* Quick Reactions bar inside menu on mobile */}
            {!isDeleted && !showDeleteChoices && (
              <div className="flex sm:hidden items-center justify-around px-2 py-1.5 border-b border-zinc-100 dark:border-zinc-800">
                {QUICK_REACTIONS.slice(0, 5).map((emoji) => {
                  const isActive = currentUserReactions.includes(emoji);
                  return (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        onReact(emoji);
                        setMenuOpen(false);
                        triggerRef.current?.focus();
                      }}
                      className={`text-lg p-1 rounded-lg transition-transform active:scale-125 hover:scale-110 ${
                        isActive ? "bg-heat-100 dark:bg-heat-950/50" : ""
                      }`}
                      aria-label={`React with ${emoji}`}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
            )}

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
                    triggerRef.current?.focus();
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
                      triggerRef.current?.focus();
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
                      triggerRef.current?.focus();
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
                      triggerRef.current?.focus();
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
                      triggerRef.current?.focus();
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
                      triggerRef.current?.focus();
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700/60 transition-colors"
                  >
                    <Bookmark
                      className={`h-3.5 w-3.5 ${
                        isStarred
                          ? "fill-amber-400 text-amber-400"
                          : "text-zinc-400"
                      }`}
                    />
                    <span>{isStarred ? "Remove from saved" : "Save message"}</span>
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
                      triggerRef.current?.focus();
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
                      triggerRef.current?.focus();
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
          </div>,
          document.body
        )}
      </div>

      {/* ── MOBILE LONG-PRESS BOTTOM SHEET (PORTAL) ─────────────────────────────── */}
      {mounted && isMobileSheetOpen && createPortal(
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={onMobileSheetClose}
        >
          <div
            className="w-full max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-zinc-200 bg-white p-4 shadow-2xl safe-bottom dark:border-zinc-800 dark:bg-zinc-900 animate-in slide-in-from-bottom duration-200 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Grab Handle */}
            <div className="w-12 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700 mx-auto" />

            {/* Quick Reactions Bar on Mobile */}
            {!isDeleted && (
              <div className="flex items-center justify-around py-2 border-b border-zinc-100 dark:border-zinc-800">
                {QUICK_REACTIONS.map((emoji) => {
                  const isActive = currentUserReactions.includes(emoji);
                  return (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        onReact(emoji);
                        onMobileSheetClose?.();
                      }}
                      className={`flex h-10 w-10 items-center justify-center rounded-full text-xl transition-transform active:scale-125 ${
                        isActive
                          ? "bg-heat-100 ring-2 ring-heat-500 dark:bg-heat-950/50"
                          : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      }`}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Action Items List */}
            <div className="space-y-1 py-1">
              {!isDeleted && (
                <button
                  type="button"
                  onClick={() => {
                    onReply();
                    onMobileSheetClose?.();
                  }}
                  className="flex w-full items-center gap-3.5 rounded-2xl px-4 py-3 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                >
                  <Reply className="h-4 w-4 text-zinc-500" />
                  <span>Reply</span>
                </button>
              )}

              {!isDeleted && (
                <button
                  type="button"
                  onClick={() => {
                    onForward();
                    onMobileSheetClose?.();
                  }}
                  className="flex w-full items-center gap-3.5 rounded-2xl px-4 py-3 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                >
                  <Share2 className="h-4 w-4 text-zinc-500" />
                  <span>Forward</span>
                </button>
              )}

              {!isDeleted && (
                <button
                  type="button"
                  onClick={() => {
                    onTogglePin();
                    onMobileSheetClose?.();
                  }}
                  className="flex w-full items-center gap-3.5 rounded-2xl px-4 py-3 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                >
                  {isPinned ? (
                    <>
                      <PinOff className="h-4 w-4 text-amber-500" />
                      <span>Unpin message</span>
                    </>
                  ) : (
                    <>
                      <Pin className="h-4 w-4 text-zinc-500" />
                      <span>Pin message</span>
                    </>
                  )}
                </button>
              )}

              {onToggleStar && !isDeleted && (
                <button
                  type="button"
                  onClick={() => {
                    onToggleStar();
                    onMobileSheetClose?.();
                  }}
                  className="flex w-full items-center gap-3.5 rounded-2xl px-4 py-3 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                >
                  <Bookmark
                    className={`h-4 w-4 ${
                      isStarred ? "fill-amber-400 text-amber-400" : "text-zinc-500"
                    }`}
                  />
                  <span>{isStarred ? "Remove from saved" : "Save message"}</span>
                </button>
              )}

              {!isDeleted && (
                <button
                  type="button"
                  onClick={handleCopyText}
                  className="flex w-full items-center gap-3.5 rounded-2xl px-4 py-3 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                >
                  <Copy className="h-4 w-4 text-zinc-500" />
                  <span>Copy text</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleCopyLink}
                className="flex w-full items-center gap-3.5 rounded-2xl px-4 py-3 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
              >
                <LinkIcon className="h-4 w-4 text-zinc-500" />
                <span>Copy link</span>
              </button>

              {isCurrentUser && !isDeleted && (
                <button
                  type="button"
                  onClick={() => {
                    onEdit();
                    onMobileSheetClose?.();
                  }}
                  className="flex w-full items-center gap-3.5 rounded-2xl px-4 py-3 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                >
                  <Pencil className="h-4 w-4 text-zinc-500" />
                  <span>Edit message</span>
                </button>
              )}

              {!isCurrentUser && (
                <button
                  type="button"
                  onClick={() => {
                    onReport();
                    onMobileSheetClose?.();
                  }}
                  className="flex w-full items-center gap-3.5 rounded-2xl px-4 py-3 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                >
                  <Flag className="h-4 w-4 text-zinc-500" />
                  <span>Report message</span>
                </button>
              )}

              <div className="my-2 border-t border-zinc-100 dark:border-zinc-800" />

              <button
                type="button"
                onClick={() => {
                  onDeleteForMe();
                  onMobileSheetClose?.();
                }}
                className="flex w-full items-center gap-3.5 rounded-2xl px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
              >
                <EyeOff className="h-4 w-4 text-zinc-500" />
                <span>Delete for me</span>
              </button>

              {isCurrentUser && onDeleteForEveryone && !isDeleted && (
                <button
                  type="button"
                  onClick={() => {
                    onDeleteForEveryone();
                    onMobileSheetClose?.();
                  }}
                  className="flex w-full items-center gap-3.5 rounded-2xl px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 transition-colors"
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                  <span>Delete for everyone</span>
                </button>
              )}
            </div>

            {/* Cancel / Close Button */}
            <button
              type="button"
              onClick={onMobileSheetClose}
              className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 py-3 text-center text-sm font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-850 dark:text-zinc-300"
            >
              Cancel
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
