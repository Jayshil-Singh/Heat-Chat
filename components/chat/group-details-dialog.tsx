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
  Lock,
  Globe,
  Trash2,
  Link as LinkIcon,
  Image as ImageIcon,
  Settings,
  AlertTriangle,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import { useFriendsContext } from "@/hooks/use-friends-context";
import { usePresence } from "@/hooks/use-presence";
import { useGroupManagement } from "@/hooks/use-group-management";
import { GroupInviteDialog } from "@/components/groups/group-invite-dialog";
import type { ConversationWithDetails, ConversationMemberWithProfile, GroupPermissions } from "@/types/chat";
import type { MemberRole } from "@/types/database";

interface GroupDetailsDialogProps {
  conversation: ConversationWithDetails;
  isOpen: boolean;
  onClose: () => void;
  onRefreshConversation?: () => void;
  onOpenGallery?: () => void;
}

type TabType = "overview" | "members" | "permissions" | "invites" | "danger";

export function GroupDetailsDialog({
  conversation,
  isOpen,
  onClose,
  onRefreshConversation,
  onOpenGallery,
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
    updateGroupMetadata,
    sendDirectInvitation,
    leaveGroup,
    deleteGroup,
  } = useGroupManagement(conversation.id);

  const [activeTab, setActiveTab] = React.useState<TabType>("overview");
  const [isEditingOverview, setIsEditingOverview] = React.useState(false);
  const [editedName, setEditedName] = React.useState(conversation.name || "");
  const [editedDescription, setEditedDescription] = React.useState(conversation.description || "");
  const [editedAvatar, setEditedAvatar] = React.useState(conversation.avatar_url || "");
  const [editedCover, setEditedCover] = React.useState(conversation.cover_url || "");
  const [editedPrivacy, setEditedPrivacy] = React.useState<"public" | "private">(conversation.privacy === "public" ? "public" : "private");
  const [memberSearchQuery, setMemberSearchQuery] = React.useState("");
  const [isAddMemberOpen, setIsAddMemberOpen] = React.useState(false);
  const [selectedFriendIds, setSelectedFriendIds] = React.useState<string[]>([]);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const currentMember = (conversation.memberDetails || []).find((m) => m.userId === user?.id);
  const currentRole: MemberRole = currentMember?.role || "member";
  const isOwner = currentRole === "owner";
  const isAdmin = currentRole === "admin" || isOwner;
  const isModerator = currentRole === "moderator" || isAdmin;

  React.useEffect(() => {
    if (isOpen) {
      setActiveTab("overview");
      setIsEditingOverview(false);
      setEditedName(conversation.name || "");
      setEditedDescription(conversation.description || "");
      setEditedAvatar(conversation.avatar_url || "");
      setEditedCover(conversation.cover_url || "");
      setEditedPrivacy(conversation.privacy === "public" ? "public" : "private");
      setMemberSearchQuery("");
      setIsAddMemberOpen(false);
      setSelectedFriendIds([]);
      setErrorMessage(null);
    }
  }, [isOpen, conversation]);

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

  // Filtered member list for search
  const filteredMembers = React.useMemo(() => {
    const q = memberSearchQuery.toLowerCase().trim();
    if (!q) return conversation.memberDetails || [];
    return (conversation.memberDetails || []).filter(
      (m) =>
        m.profile.display_name.toLowerCase().includes(q) ||
        m.profile.username.toLowerCase().includes(q)
    );
  }, [conversation.memberDetails, memberSearchQuery]);

  const handleSaveOverview = async () => {
    const trimmed = editedName.trim();
    if (!trimmed) {
      setErrorMessage("Group name cannot be empty");
      return;
    }
    setErrorMessage(null);
    const res = await updateGroupMetadata({
      name: trimmed,
      description: editedDescription.trim(),
      avatarUrl: editedAvatar.trim() || null,
      coverUrl: editedCover.trim() || null,
      privacy: editedPrivacy,
    });

    if (!res.success) {
      setErrorMessage(res.error || "Failed to update group overview");
    } else {
      setIsEditingOverview(false);
      onRefreshConversation?.();
    }
  };

  const handleUpdatePermission = async (key: keyof GroupPermissions, value: "anyone" | "admin_only") => {
    const currentPerms = (conversation.permissions as GroupPermissions) || {};
    const updated = { ...currentPerms, [key]: value };
    const res = await updateGroupMetadata({ permissions: updated });
    if (!res.success) {
      setErrorMessage(res.error || "Failed to update permissions");
    } else {
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
    const isSelf = targetUserId === user?.id;
    const res = await removeMember(targetUserId);
    if (!res.success) {
      setErrorMessage(res.error || "Failed to remove member");
    } else {
      onRefreshConversation?.();
      if (isSelf) {
        onClose();
        router.push("/chat");
      }
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
      onRefreshConversation?.();
      router.push("/chat");
    }
  };

  const handleDeleteGroup = async () => {
    if (!confirm("Delete this group permanently? All messages, media, polls, and invitations will be erased.")) return;
    setErrorMessage(null);
    const res = await deleteGroup();
    if (!res.success) {
      setErrorMessage(res.error || "Failed to delete group");
    } else {
      onClose();
      onRefreshConversation?.();
      router.push("/chat");
    }
  };

  if (!isOpen) return null;

  const permissions = (conversation.permissions as GroupPermissions) || {};

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200 cursor-pointer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-details-title"
        onClick={() => {
          if (!isActionLoading) onClose();
        }}
      >
        <div
          className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 flex flex-col max-h-[90vh] overflow-hidden cursor-default"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/80 px-5 py-4 shrink-0">
            <div className="flex items-center gap-3">
              <Avatar
                src={conversation.avatar_url}
                name={conversation.name || "Group"}
                size="default"
              />
              <div className="min-w-0">
                <h2
                  id="group-details-title"
                  className="truncate text-base font-bold text-zinc-900 dark:text-white"
                >
                  {conversation.name || "Group Chat"}
                </h2>
                <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <span>{(conversation.memberDetails || []).length} members</span>
                  <span>•</span>
                  <span className="capitalize">{conversation.privacy || "private"}</span>
                </div>
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

          {/* Tab Navigation */}
          <div className="flex items-center border-b border-zinc-100 dark:border-zinc-800/80 px-4 bg-zinc-50/50 dark:bg-zinc-900/30 overflow-x-auto shrink-0">
            {[
              { id: "overview", label: "Overview" },
              { id: "members", label: `Members (${(conversation.memberDetails || []).length})` },
              ...(isAdmin ? [{ id: "permissions", label: "Permissions" }] : []),
              { id: "invites", label: "Invites" },
              { id: "danger", label: "Danger Zone" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? "border-heat-500 text-heat-600 dark:text-heat-400"
                    : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
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

            {/* TAB 1: OVERVIEW */}
            {activeTab === "overview" && (
              <div className="space-y-4">
                {isEditingOverview ? (
                  <div className="space-y-3.5 bg-zinc-50 dark:bg-zinc-900/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        Group Name
                      </label>
                      <Input
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        className="h-9 text-xs"
                        maxLength={100}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        Description
                      </label>
                      <textarea
                        value={editedDescription}
                        onChange={(e) => setEditedDescription(e.target.value)}
                        rows={2}
                        maxLength={500}
                        className="w-full text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-heat-500"
                        placeholder="What is this group about?"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        Avatar URL
                      </label>
                      <Input
                        value={editedAvatar}
                        onChange={(e) => setEditedAvatar(e.target.value)}
                        className="h-9 text-xs"
                        placeholder="https://..."
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        Cover URL
                      </label>
                      <Input
                        value={editedCover}
                        onChange={(e) => setEditedCover(e.target.value)}
                        className="h-9 text-xs"
                        placeholder="https://..."
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        Privacy
                      </label>
                      <select
                        value={editedPrivacy}
                        onChange={(e) => setEditedPrivacy(e.target.value as any)}
                        className="w-full h-9 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 text-zinc-900 dark:text-white focus:outline-none"
                      >
                        <option value="private">Private (Invitation / Link required)</option>
                        <option value="public">Public (Open to friends)</option>
                      </select>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setIsEditingOverview(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="heat"
                        onClick={handleSaveOverview}
                        disabled={isActionLoading || !editedName.trim()}
                      >
                        Save Changes
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Cover / Banner */}
                    {conversation.cover_url && (
                      <div className="h-24 w-full rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={conversation.cover_url}
                          alt="Group Cover"
                          className="h-full w-full object-cover"
                        />
                      </div>
                    )}

                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                          {conversation.name || "Group"}
                        </h3>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {conversation.description || "No description set."}
                        </p>
                      </div>

                      {isAdmin && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setIsEditingOverview(true)}
                          className="h-8 text-xs gap-1"
                        >
                          <Edit2 className="h-3 w-3" />
                          <span>Edit</span>
                        </Button>
                      )}
                    </div>

                    {/* Quick Media Link */}
                    {onOpenGallery && (
                      <div className="pt-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            onClose();
                            onOpenGallery();
                          }}
                          className="w-full text-xs h-9 gap-1.5 justify-start"
                        >
                          <ImageIcon className="h-4 w-4 text-heat-500" />
                          <span>View Shared Photos, Videos & Files</span>
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: MEMBERS */}
            {activeTab === "members" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Input
                      placeholder="Search members..."
                      value={memberSearchQuery}
                      onChange={(e) => setMemberSearchQuery(e.target.value)}
                      leftIcon={<Search className="h-3.5 w-3.5 text-zinc-400" />}
                      className="h-8 text-xs bg-zinc-50 dark:bg-zinc-900"
                    />
                  </div>

                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="heat"
                      onClick={() => setIsInviteDialogOpen(true)}
                      className="h-8 text-xs gap-1 shrink-0"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      <span>Invite</span>
                    </Button>
                  )}
                </div>

                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800/60 overflow-hidden">
                  {filteredMembers.map((member) => {
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
                              {member.role === "moderator" && (
                                <span className="inline-flex items-center gap-0.5 rounded-md bg-blue-50 px-1.5 py-0.2 text-[9px] font-bold text-blue-600 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900/40">
                                  <ShieldAlert className="h-2.5 w-2.5 text-blue-500" />
                                  Moderator
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
                                    title="Promote to Moderator"
                                    onClick={() => handleRoleChange(member.userId, "moderator")}
                                    disabled={isActionLoading}
                                    className="h-7 w-7"
                                  >
                                    <Shield className="h-3.5 w-3.5 text-zinc-400 hover:text-blue-500" />
                                  </Button>
                                )}
                                {member.role === "moderator" && (
                                  <>
                                    <Button
                                      size="icon-sm"
                                      variant="ghost"
                                      title="Promote to Admin"
                                      onClick={() => handleRoleChange(member.userId, "admin")}
                                      disabled={isActionLoading}
                                      className="h-7 w-7"
                                    >
                                      <ShieldCheck className="h-3.5 w-3.5 text-zinc-400 hover:text-heat-500" />
                                    </Button>
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
                                  </>
                                )}
                                {member.role === "admin" && (
                                  <Button
                                    size="icon-sm"
                                    variant="ghost"
                                    title="Demote to Moderator"
                                    onClick={() => handleRoleChange(member.userId, "moderator")}
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

                            {(isOwner ||
                              (isAdmin && (member.role === "member" || member.role === "moderator")) ||
                              (isModerator && member.role === "member")) && (
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
            )}

            {/* TAB 3: PERMISSIONS */}
            {activeTab === "permissions" && isAdmin && (
              <div className="space-y-3">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Configure group permissions and member privileges.
                </p>

                <div className="space-y-2 rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800/60 overflow-hidden">
                  {[
                    { key: "who_can_add_members", label: "Who can add members" },
                    { key: "who_can_send_messages", label: "Who can send messages" },
                    { key: "who_can_pin_messages", label: "Who can pin messages" },
                    { key: "who_can_create_polls", label: "Who can create polls" },
                    { key: "who_can_invite", label: "Who can send invite links" },
                  ].map((item) => {
                    const val = (permissions as any)[item.key] || "anyone";
                    return (
                      <div key={item.key} className="flex items-center justify-between p-3">
                        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                          {item.label}
                        </span>
                        <select
                          value={val}
                          onChange={(e) => handleUpdatePermission(item.key as any, e.target.value as any)}
                          className="text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 py-1 text-zinc-900 dark:text-white"
                        >
                          <option value="anyone">All Members</option>
                          <option value="admin_only">Admins Only</option>
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 4: INVITES */}
            {activeTab === "invites" && (
              <div className="space-y-3">
                <Button
                  variant="heat"
                  size="sm"
                  onClick={() => setIsInviteDialogOpen(true)}
                  className="w-full text-xs h-9 gap-1.5"
                >
                  <LinkIcon className="h-4 w-4" />
                  <span>Generate / View Group Invite Links</span>
                </Button>
              </div>
            )}

            {/* TAB 5: DANGER ZONE */}
            {activeTab === "danger" && (
              <div className="space-y-4">
                <div className="rounded-xl border border-red-200/80 bg-red-50/50 p-4 dark:border-red-900/40 dark:bg-red-950/20 space-y-3">
                  <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">
                      Leave Group
                    </span>
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    You will no longer receive messages or be able to participate in this group.
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

                {isOwner && (
                  <div className="rounded-xl border border-red-200/80 bg-red-50/50 p-4 dark:border-red-900/40 dark:bg-red-950/20 space-y-3">
                    <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                      <Trash2 className="h-4 w-4" />
                      <span className="text-xs font-bold uppercase tracking-wider">
                        Delete Group
                      </span>
                    </div>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                      Permanently delete this group and all its messages, attachments, polls, and invite links for all members.
                    </p>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleDeleteGroup}
                      disabled={isActionLoading}
                      className="text-xs h-8 gap-1.5"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete Group Permanently</span>
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Invite Modal */}
      {isInviteDialogOpen && (
        <GroupInviteDialog
          isOpen={isInviteDialogOpen}
          onClose={() => setIsInviteDialogOpen(false)}
          conversationId={conversation.id}
          groupName={conversation.name || "Group"}
          existingMemberIds={(conversation.memberDetails || []).map((m) => m.userId)}
          onDirectInvite={sendDirectInvitation}
        />
      )}
    </>
  );
}
