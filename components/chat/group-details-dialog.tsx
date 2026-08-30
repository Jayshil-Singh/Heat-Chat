"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Users,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserPlus,
  UserMinus,
  ArrowRightLeft,
  LogOut,
  Edit2,
  Check,
  Loader2,
  Crown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import { useFriendsContext } from "@/hooks/use-friends-context";
import { usePresence } from "@/hooks/use-presence";
import { useGroupManagement } from "@/hooks/use-group-management";
import type { ConversationWithDetails, ConversationMemberWithProfile } from "@/types/chat";
import type { MemberRole } from "@/types/database";

interface GroupDetailsDialogProps {
  conversation: ConversationWithDetails;
  isOpen: boolean;
  onClose: () => void;
  onRefreshConversation?: () => void;
}

export function GroupDetailsDialog({
  conversation,
  isOpen,
  onClose,
  onRefreshConversation,
}: GroupDetailsDialogProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { isUserOnline } = usePresence();
  const { friends } = useFriendsContext();
  const {
    isLoading: isActionLoading,
    error: actionError,
    addMembers,
    removeMember,
    updateMemberRole,
    updateGroupDetails,
    leaveGroup,
  } = useGroupManagement(conversation.id);

  const [isEditingName, setIsEditingName] = React.useState(false);
  const [editedName, setEditedName] = React.useState(conversation.name || "");
  const [isAddMemberOpen, setIsAddMemberOpen] = React.useState(false);
  const [selectedFriendIds, setSelectedFriendIds] = React.useState<string[]>([]);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const currentMember = (conversation.memberDetails || []).find((m) => m.userId === user?.id);
  const currentRole: MemberRole = currentMember?.role || "member";
  const isOwner = currentRole === "owner";
  const isAdmin = currentRole === "admin" || isOwner;

  React.useEffect(() => {
    if (isOpen) {
      setIsEditingName(false);
      setEditedName(conversation.name || "");
      setIsAddMemberOpen(false);
      setSelectedFriendIds([]);
      setErrorMessage(null);
    }
  }, [isOpen, conversation.name]);

  // Handle ESC
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isActionLoading) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isActionLoading, onClose]);

  // Friends who are not already in this group
  const eligibleFriends = React.useMemo(() => {
    const existingMemberIds = (conversation.memberDetails || []).map((m) => m.userId);
    return friends.filter((f) => !existingMemberIds.includes(f.friendId));
  }, [friends, conversation.memberDetails]);

  const handleSaveName = async () => {
    const trimmed = editedName.trim();
    if (!trimmed) return;
    setErrorMessage(null);
    const res = await updateGroupDetails(trimmed);
    if (!res.success) {
      setErrorMessage(res.error || "Failed to update group name");
    } else {
      setIsEditingName(false);
      onRefreshConversation?.();
    }
  };

  const handleAddSelectedMembers = async () => {
    if (selectedFriendIds.length === 0) return;
    setErrorMessage(null);
    const res = await addMembers(selectedFriendIds);
    if (!res.success) {
      setErrorMessage(res.error || "Failed to add members");
    } else {
      setIsAddMemberOpen(false);
      setSelectedFriendIds([]);
      onRefreshConversation?.();
    }
  };

  const handleRemoveMember = async (targetUserId: string) => {
    if (!confirm("Are you sure you want to remove this member from the group?")) return;
    setErrorMessage(null);
    const res = await removeMember(targetUserId);
    if (!res.success) {
      setErrorMessage(res.error || "Failed to remove member");
    } else {
      onRefreshConversation?.();
    }
  };

  const handleRoleChange = async (targetUserId: string, newRole: MemberRole) => {
    setErrorMessage(null);
    const res = await updateMemberRole(targetUserId, newRole);
    if (!res.success) {
      setErrorMessage(res.error || "Failed to update member role");
    } else {
      onRefreshConversation?.();
    }
  };

  const handleTransferOwnership = async (targetUserId: string) => {
    if (!confirm("Transfer group ownership? You will be demoted to admin.")) return;
    setErrorMessage(null);
    const res = await updateMemberRole(targetUserId, "owner");
    if (!res.success) {
      setErrorMessage(res.error || "Failed to transfer ownership");
    } else {
      onRefreshConversation?.();
    }
  };

  const handleLeaveGroup = async () => {
    if (isOwner && (conversation.memberDetails || []).length > 1) {
      alert("As the owner, you must transfer ownership to another member before leaving.");
      return;
    }
    if (!confirm("Are you sure you want to leave this group chat?")) return;
    setErrorMessage(null);
    const res = await leaveGroup();
    if (!res.success) {
      setErrorMessage(res.error || "Failed to leave group");
    } else {
      onClose();
      router.push("/chat");
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="group-details-title"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/80 px-5 py-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <Avatar
              src={conversation.avatar_url}
              name={conversation.name || "Group"}
              size="default"
            />
            <div className="min-w-0">
              {isEditingName ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    className="h-8 text-xs max-w-[180px]"
                    autoFocus
                  />
                  <Button
                    size="icon-sm"
                    variant="heat"
                    onClick={handleSaveName}
                    disabled={isActionLoading || !editedName.trim()}
                    className="h-7 w-7"
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => {
                      setIsEditingName(false);
                      setEditedName(conversation.name || "");
                    }}
                    className="h-7 w-7"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <h2
                    id="group-details-title"
                    className="truncate text-base font-bold text-zinc-900 dark:text-white"
                  >
                    {conversation.name || "Group Chat"}
                  </h2>
                  {isAdmin && (
                    <button
                      onClick={() => setIsEditingName(true)}
                      className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded"
                      title="Rename group"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {(conversation.memberDetails || []).length} members
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

        {/* Body Content */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Error Message */}
          {(errorMessage || actionError) && (
            <div
              className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300"
              role="alert"
            >
              {errorMessage || actionError}
            </div>
          )}

          {/* Add Members Section */}
          {isAdmin && (
            <div>
              {isAddMemberOpen ? (
                <div className="rounded-xl border border-heat-200 bg-heat-50/50 p-3 dark:border-heat-900/40 dark:bg-heat-950/20 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-900 dark:text-white">
                      Add Friends to Group
                    </span>
                    <button
                      onClick={() => {
                        setIsAddMemberOpen(false);
                        setSelectedFriendIds([]);
                      }}
                      className="text-xs text-zinc-400 hover:text-zinc-600"
                    >
                      Cancel
                    </button>
                  </div>

                  {eligibleFriends.length === 0 ? (
                    <p className="text-xs text-zinc-400 py-1">
                      All your friends are already in this group!
                    </p>
                  ) : (
                    <div className="max-h-32 overflow-y-auto space-y-1 divide-y divide-zinc-100 dark:divide-zinc-800/40">
                      {eligibleFriends.map((f) => {
                        const isSel = selectedFriendIds.includes(f.friendId);
                        return (
                          <div
                            key={f.friendId}
                            onClick={() =>
                              setSelectedFriendIds((prev) =>
                                isSel
                                  ? prev.filter((id) => id !== f.friendId)
                                  : [...prev, f.friendId]
                              )
                            }
                            className="flex items-center justify-between p-1.5 rounded cursor-pointer hover:bg-white/60 dark:hover:bg-zinc-900/40"
                          >
                            <div className="flex items-center gap-2">
                              <Avatar
                                src={f.profile.avatar_url}
                                name={f.profile.display_name}
                                size="sm"
                              />
                              <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                                {f.profile.display_name}
                              </span>
                            </div>
                            <div
                              className={`h-4 w-4 rounded border flex items-center justify-center ${
                                isSel
                                  ? "bg-heat-500 border-heat-500 text-white"
                                  : "border-zinc-300 dark:border-zinc-700"
                              }`}
                            >
                              {isSel && <Check className="h-3 w-3" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {eligibleFriends.length > 0 && (
                    <Button
                      size="sm"
                      variant="heat"
                      onClick={handleAddSelectedMembers}
                      disabled={isActionLoading || selectedFriendIds.length === 0}
                      className="w-full text-xs h-8 gap-1.5"
                    >
                      {isActionLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <UserPlus className="h-3.5 w-3.5" />
                      )}
                      <span>Add Selected ({selectedFriendIds.length})</span>
                    </Button>
                  )}
                </div>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsAddMemberOpen(true)}
                  className="w-full text-xs h-8 gap-1.5"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  <span>Add Friends</span>
                </Button>
              )}
            </div>
          )}

          {/* Members List */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider px-1">
              Members ({(conversation.memberDetails || []).length})
            </h3>

            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800/60 overflow-hidden">
              {(conversation.memberDetails || []).map((member) => {
                const isThisUser = member.userId === user?.id;
                const online = isUserOnline(member.userId);
                return (
                  <div
                    key={member.userId}
                    className="flex items-center justify-between p-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar
                        src={member.profile.avatar_url}
                        name={member.profile.display_name}
                        size="sm"
                        status={online ? "online" : "offline"}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-xs font-semibold text-zinc-900 dark:text-white">
                            {member.profile.display_name}
                            {isThisUser && (
                              <span className="text-zinc-400 font-normal"> (You)</span>
                            )}
                          </p>
                          {member.role === "owner" && (
                            <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-50 px-1.5 py-0.2 text-[9px] font-bold text-amber-700 border border-amber-200/60 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/40">
                              <Crown className="h-2.5 w-2.5 text-amber-500" />
                              Owner
                            </span>
                          )}
                          {member.role === "admin" && (
                            <span className="inline-flex items-center gap-0.5 rounded-md bg-zinc-100 px-1.5 py-0.2 text-[9px] font-bold text-zinc-600 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700">
                              <ShieldCheck className="h-2.5 w-2.5 text-heat-500" />
                              Admin
                            </span>
                          )}
                        </div>
                        <p className="truncate text-[10px] text-zinc-400">
                          @{member.profile.username}
                        </p>
                      </div>
                    </div>

                    {/* Member Actions */}
                    {!isThisUser && (
                      <div className="flex items-center gap-1">
                        {isOwner && (
                          <>
                            {member.role === "member" && (
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                title="Promote to Admin"
                                onClick={() => handleRoleChange(member.userId, "admin")}
                                disabled={isActionLoading}
                                className="h-7 w-7"
                              >
                                <Shield className="h-3.5 w-3.5 text-zinc-400 hover:text-zinc-700" />
                              </Button>
                            )}
                            {member.role === "admin" && (
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                title="Demote to Member"
                                onClick={() => handleRoleChange(member.userId, "member")}
                                disabled={isActionLoading}
                                className="h-7 w-7"
                              >
                                <ShieldAlert className="h-3.5 w-3.5 text-zinc-400 hover:text-amber-600" />
                              </Button>
                            )}
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              title="Transfer Ownership"
                              onClick={() => handleTransferOwnership(member.userId)}
                              disabled={isActionLoading}
                              className="h-7 w-7"
                            >
                              <ArrowRightLeft className="h-3.5 w-3.5 text-zinc-400 hover:text-heat-500" />
                            </Button>
                          </>
                        )}

                        {(isOwner || (isAdmin && member.role === "member")) && (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            title="Remove Member"
                            onClick={() => handleRemoveMember(member.userId)}
                            disabled={isActionLoading}
                            className="h-7 w-7"
                          >
                            <UserMinus className="h-3.5 w-3.5 text-zinc-400 hover:text-red-500" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer: Leave Group */}
        <div className="border-t border-zinc-100 dark:border-zinc-800/80 px-5 py-3.5 shrink-0 bg-zinc-50/50 dark:bg-zinc-900/30 flex justify-between items-center">
          <p className="text-[11px] text-zinc-400">
            Created on {new Date(conversation.created_at).toLocaleDateString()}
          </p>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleLeaveGroup}
            disabled={isActionLoading}
            className="text-xs h-8 gap-1.5"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Leave Group</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
