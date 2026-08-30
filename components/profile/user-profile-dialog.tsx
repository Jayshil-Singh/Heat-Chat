"use client";

import * as React from "react";
import {
  MessageSquare,
  ShieldCheck,
  ShieldAlert,
  MoreVertical,
  Flag,
  Ban,
  Loader2,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { BlockDialog } from "@/components/profile/block-dialog";
import { ReportDialog } from "@/components/reports/report-dialog";
import { RelationshipActionButton } from "@/components/friends/relationship-action-button";
import { useAuth } from "@/hooks/use-auth";
import type { PublicUserProfile, UserSearchResult } from "@/types/user";
import type { RelationshipStateDto } from "@/types/database";

interface UserProfileDialogProps {
  user: PublicUserProfile | UserSearchResult | null;
  isOpen: boolean;
  onClose: () => void;
  onStartChat?: (user: PublicUserProfile | UserSearchResult) => void;
}

export function UserProfileDialog({
  user,
  isOpen,
  onClose,
  onStartChat,
}: UserProfileDialogProps) {
  const { user: currentUser } = useAuth();

  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [relationship, setRelationship] = React.useState<RelationshipStateDto | null>(null);
  const [isLoadingRel, setIsLoadingRel] = React.useState(false);
  const [showBlockDialog, setShowBlockDialog] = React.useState(false);
  const [showReportDialog, setShowReportDialog] = React.useState(false);

  const menuRef = React.useRef<HTMLDivElement>(null);
  const moreButtonRef = React.useRef<HTMLButtonElement>(null);

  const isSelf = Boolean(
    currentUser &&
      user &&
      (currentUser.id === user.id ||
        (currentUser.user_metadata?.username &&
          currentUser.user_metadata.username.toLowerCase() === user.username.toLowerCase()))
  );

  const fetchRelationship = React.useCallback(async () => {
    if (!user || isSelf) return;
    setIsLoadingRel(true);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(user.username)}/relationship`);
      if (res.ok) {
        const data: RelationshipStateDto = await res.json();
        setRelationship(data);
      }
    } catch (err) {
      console.error("[UserProfileDialog] Failed to fetch relationship:", err);
    } finally {
      setIsLoadingRel(false);
    }
  }, [user, isSelf]);

  React.useEffect(() => {
    if (isOpen && user) {
      setIsMenuOpen(false);
      fetchRelationship();
    } else {
      setRelationship(null);
      setIsMenuOpen(false);
    }
  }, [isOpen, user, fetchRelationship]);

  // Click outside and escape handler for 3-dots more menu
  React.useEffect(() => {
    if (!isMenuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        moreButtonRef.current &&
        !moreButtonRef.current.contains(e.target as Node)
      ) {
        setIsMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setIsMenuOpen(false);
        moreButtonRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isMenuOpen]);

  if (!user) return null;

  const isBlocked = relationship?.isBlocked ?? false;

  const handleBlockSuccess = (blocked: boolean) => {
    setRelationship((prev) =>
      prev
        ? {
            ...prev,
            isBlocked: blocked,
            friendship: blocked ? "NONE" : prev.friendship,
            canMessage: !blocked,
            canFriendRequest: !blocked,
          }
        : {
            friendship: "NONE",
            requestId: null,
            createdAt: null,
            isBlocked: blocked,
            hasBlockedViewer: false,
            canMessage: !blocked,
            canFriendRequest: !blocked,
          }
    );
    fetchRelationship();
  };

  const headerAction = !isSelf ? (
    <div className="relative">
      <button
        ref={moreButtonRef}
        type="button"
        onClick={() => setIsMenuOpen((prev) => !prev)}
        className="rounded-xl p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
        aria-label="More actions"
        aria-expanded={isMenuOpen}
        aria-haspopup="true"
        id="profile-more-menu-button"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {isMenuOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="profile-more-menu-button"
          className="absolute right-0 top-full mt-1.5 w-44 rounded-2xl border border-zinc-200 bg-white p-1 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 z-50 animate-in fade-in-50 zoom-in-95 duration-100"
        >
          {isBlocked ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsMenuOpen(false);
                setShowBlockDialog(true);
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors text-left"
            >
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span>Unblock User</span>
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsMenuOpen(false);
                setShowBlockDialog(true);
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 transition-colors text-left"
            >
              <ShieldAlert className="h-4 w-4 text-red-500" />
              <span>Block User</span>
            </button>
          )}

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setIsMenuOpen(false);
              setShowReportDialog(true);
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors text-left"
          >
            <Flag className="h-4 w-4 text-amber-500" />
            <span>Report User</span>
          </button>
        </div>
      )}
    </div>
  ) : null;

  return (
    <>
      <Dialog
        isOpen={isOpen}
        onClose={onClose}
        title="User Profile"
        headerAction={headerAction}
        className="max-w-md"
      >
        <div className="space-y-6">
          {/* Header with Avatar & Names */}
          <div className="flex flex-col items-center text-center space-y-3 pt-2">
            <Avatar
              src={user.avatar_url}
              name={user.display_name || user.username}
              size="xl"
              status={user.status}
            />
            <div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                {user.display_name}
              </h3>
              <p className="text-xs font-semibold text-heat-600 dark:text-heat-400">
                @{user.username}
              </p>
            </div>
          </div>

          {/* Bio */}
          {user.bio ? (
            <div className="rounded-xl bg-zinc-50 p-3.5 text-xs text-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-300 leading-relaxed text-center">
              {user.bio}
            </div>
          ) : (
            <p className="text-center text-xs italic text-zinc-400">
              No bio provided yet.
            </p>
          )}

          {/* Details list */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border border-zinc-100 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
              <span className="text-zinc-400 block text-[11px]">Presence</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400 capitalize mt-0.5 inline-block">
                {user.status || "Online"}
              </span>
            </div>

            <div className="rounded-xl border border-zinc-100 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
              <span className="text-zinc-400 block text-[11px]">Verified Profile</span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1 mt-0.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                Heat Chat User
              </span>
            </div>
          </div>

          {/* Blocked notice if currently blocked */}
          {isBlocked && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-center text-xs font-medium text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400 flex items-center justify-center gap-1.5">
              <Ban className="h-3.5 w-3.5" />
              <span>You have blocked this user</span>
            </div>
          )}

          {/* Friendship Action Button if applicable */}
          {!isSelf && relationship && !isBlocked && (
            <div className="flex justify-center">
              <RelationshipActionButton
                userId={user.id}
                relationship={relationship}
                onStateChanged={fetchRelationship}
                size="default"
                className="w-full justify-center"
              />
            </div>
          )}

          {/* Primary Action Buttons */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="secondary"
              size="default"
              onClick={onClose}
              className="flex-1"
            >
              Close
            </Button>

            {isBlocked ? (
              <Button
                variant="secondary"
                size="default"
                disabled
                className="flex-1 gap-2 opacity-60 cursor-not-allowed text-zinc-500 dark:text-zinc-400"
              >
                <Ban className="h-4 w-4" />
                <span>Blocked</span>
              </Button>
            ) : (
              <Button
                variant="heat"
                size="default"
                onClick={() => {
                  if (onStartChat) onStartChat(user);
                }}
                disabled={relationship ? !relationship.canMessage : false}
                className="flex-1 gap-2"
              >
                <MessageSquare className="h-4 w-4" />
                <span>Start Chat</span>
              </Button>
            )}
          </div>
        </div>
      </Dialog>

      {/* Block/Unblock Confirmation Dialog */}
      {showBlockDialog && (
        <BlockDialog
          isOpen={showBlockDialog}
          onClose={() => setShowBlockDialog(false)}
          targetUserId={user.id}
          targetUsername={user.username}
          targetDisplayName={user.display_name || user.username}
          isCurrentlyBlocked={isBlocked}
          onSuccess={handleBlockSuccess}
        />
      )}

      {/* Report User Dialog */}
      {showReportDialog && (
        <ReportDialog
          isOpen={showReportDialog}
          onClose={() => setShowReportDialog(false)}
          targetType="user"
          targetId={user.id}
          targetName={user.display_name || user.username}
        />
      )}
    </>
  );
}
