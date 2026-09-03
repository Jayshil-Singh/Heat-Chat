"use client";

import * as React from "react";
import {
  X,
  Link as LinkIcon,
  Copy,
  Check,
  UserPlus,
  RefreshCw,
  Clock,
  Users,
  Shield,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { useFriendsContext } from "@/hooks/use-friends-context";
import type { GroupInviteLinkDto } from "@/types/chat";

interface GroupInviteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  groupName: string;
  existingMemberIds?: string[];
  onDirectInvite?: (friendId: string) => Promise<{ success: boolean; error?: string }>;
}

export function GroupInviteDialog({
  isOpen,
  onClose,
  conversationId,
  groupName,
  existingMemberIds = [],
  onDirectInvite,
}: GroupInviteDialogProps) {
  const { friends } = useFriendsContext();
  const [inviteLinks, setInviteLinks] = React.useState<GroupInviteLinkDto[]>([]);
  const [isLoadingLinks, setIsLoadingLinks] = React.useState(false);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [copiedToken, setCopiedToken] = React.useState<string | null>(null);
  const [invitingFriendId, setInvitingFriendId] = React.useState<string | null>(null);
  const [invitedFriendIds, setInvitedFriendIds] = React.useState<string[]>([]);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const fetchInviteLinks = React.useCallback(async () => {
    if (!conversationId) return;
    setIsLoadingLinks(true);
    try {
      const res = await fetch(`/api/groups/${conversationId}/invite-links`);
      const json = await res.json();
      if (json.ok && Array.isArray(json.data?.inviteLinks)) {
        setInviteLinks(json.data.inviteLinks);
      }
    } catch (err) {
      console.warn("Error fetching invite links:", err);
    } finally {
      setIsLoadingLinks(false);
    }
  }, [conversationId]);

  React.useEffect(() => {
    if (isOpen) {
      fetchInviteLinks();
      setCopiedToken(null);
      setErrorMessage(null);
    }
  }, [isOpen, fetchInviteLinks]);

  const handleGenerateLink = async () => {
    setIsGenerating(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/groups/${conversationId}/invite-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresInDays: 7 }),
      });
      const json = await res.json();
      if (json.ok && json.data?.inviteLink) {
        setInviteLinks((prev) => [json.data.inviteLink, ...prev]);
      } else {
        setErrorMessage(json.error?.message || "Failed to generate invite link");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to generate invite link");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyLink = (url: string, token: string) => {
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2500);
  };

  const handleRevokeLink = async (linkId: string) => {
    if (!confirm("Revoke this invite link? Anyone who has not already joined with it will not be able to use it.")) return;
    try {
      const res = await fetch(`/api/groups/${conversationId}/invite-links?linkId=${linkId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.ok) {
        setInviteLinks((prev) => prev.filter((l) => l.id !== linkId));
      }
    } catch (err) {
      console.warn("Revoke error:", err);
    }
  };

  const handleInviteFriend = async (friendId: string) => {
    if (!onDirectInvite) return;
    setInvitingFriendId(friendId);
    setErrorMessage(null);
    const res = await onDirectInvite(friendId);
    setInvitingFriendId(null);
    if (res.success) {
      setInvitedFriendIds((prev) => [...prev, friendId]);
    } else {
      setErrorMessage(res.error || "Failed to invite friend");
    }
  };

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isLoadingLinks && !isGenerating) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isLoadingLinks, isGenerating, onClose]);

  const eligibleFriends = React.useMemo(() => {
    return friends.filter((f) => !existingMemberIds.includes(f.friendId));
  }, [friends, existingMemberIds]);

  if (!isOpen) return null;

  const primaryLink = inviteLinks[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200 cursor-pointer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="group-invite-title"
      onClick={() => {
        if (!isLoadingLinks && !isGenerating) onClose();
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
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="group-invite-title"
                className="text-base font-bold text-zinc-900 dark:text-white"
              >
                Invite to {groupName}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Share an invite link or invite friends directly
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {errorMessage && (
            <div
              className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300"
              role="alert"
            >
              {errorMessage}
            </div>
          )}

          {/* Section 1: Invite Link */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
              <LinkIcon className="h-3.5 w-3.5 text-heat-500" />
              <span>Group Invite Link</span>
            </label>

            {primaryLink ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={primaryLink.inviteUrl}
                    className="h-9 text-xs font-mono bg-zinc-50 dark:bg-zinc-900"
                  />
                  <Button
                    size="sm"
                    variant={copiedToken === primaryLink.token ? "secondary" : "heat"}
                    onClick={() => handleCopyLink(primaryLink.inviteUrl, primaryLink.token)}
                    className="h-9 shrink-0 gap-1 text-xs"
                  >
                    {copiedToken === primaryLink.token ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </Button>
                </div>

                <div className="flex items-center justify-between text-[11px] text-zinc-400 px-0.5">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Expires in 7 days
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRevokeLink(primaryLink.id)}
                    className="text-red-500 hover:text-red-600 font-medium"
                  >
                    Revoke Link
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 p-4 text-center space-y-2">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  No active invite links. Generate one to allow new members to join via URL.
                </p>
                <Button
                  size="sm"
                  variant="heat"
                  onClick={handleGenerateLink}
                  disabled={isGenerating || isLoadingLinks}
                  className="gap-1.5 text-xs"
                >
                  {isGenerating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <LinkIcon className="h-3.5 w-3.5" />
                  )}
                  <span>Generate Invite Link</span>
                </Button>
              </div>
            )}
          </div>

          {/* Section 2: Direct Friend Invites */}
          <div className="space-y-2.5 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
            <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-heat-500" />
              <span>Invite Friends</span>
            </label>

            {eligibleFriends.length === 0 ? (
              <p className="text-xs text-zinc-400 p-2 text-center bg-zinc-50 dark:bg-zinc-900 rounded-xl">
                All your accepted friends are already in this group.
              </p>
            ) : (
              <div className="max-h-48 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800/60 overflow-hidden">
                {eligibleFriends.map((f) => {
                  const isInvited = invitedFriendIds.includes(f.friendId);
                  const isInviting = invitingFriendId === f.friendId;

                  return (
                    <div
                      key={f.friendId}
                      className="flex items-center justify-between p-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar
                          src={f.profile.avatar_url}
                          name={f.profile.display_name}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-zinc-900 dark:text-white">
                            {f.profile.display_name}
                          </p>
                          <p className="truncate text-[10px] text-zinc-400">
                            @{f.profile.username}
                          </p>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant={isInvited ? "secondary" : "heat"}
                        disabled={isInvited || isInviting}
                        onClick={() => handleInviteFriend(f.friendId)}
                        className="h-7 text-xs px-2.5 gap-1"
                      >
                        {isInviting ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : isInvited ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-500" />
                            <span>Invited</span>
                          </>
                        ) : (
                          <span>Invite</span>
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-zinc-100 dark:border-zinc-800/80 px-5 py-3.5 shrink-0 bg-zinc-50/50 dark:bg-zinc-900/30">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
