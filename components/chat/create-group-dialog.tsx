"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { X, Users, Search, Check, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { useFriendsContext } from "@/hooks/use-friends-context";
import { useConversations } from "@/hooks/use-conversations";

interface CreateGroupDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onGroupCreated?: (conversationId: string) => void;
}

export function CreateGroupDialog({
  isOpen,
  onClose,
  onGroupCreated,
}: CreateGroupDialogProps) {
  const router = useRouter();
  const { friends, isLoading: isFriendsLoading } = useFriendsContext();
  const { createGroup } = useConversations();

  const [groupName, setGroupName] = React.useState("");
  const [avatarUrl, setAvatarUrl] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedFriendIds, setSelectedFriendIds] = React.useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Reset form when opened
  React.useEffect(() => {
    if (isOpen) {
      setGroupName("");
      setAvatarUrl("");
      setSearchQuery("");
      setSelectedFriendIds([]);
      setErrorMessage(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  // Handle ESC key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  const filteredFriends = React.useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return friends;
    return friends.filter(
      (f) =>
        f.profile.display_name.toLowerCase().includes(query) ||
        f.profile.username.toLowerCase().includes(query)
    );
  }, [friends, searchQuery]);

  const toggleFriend = (friendId: string) => {
    setSelectedFriendIds((prev) =>
      prev.includes(friendId)
        ? prev.filter((id) => id !== friendId)
        : [...prev, friendId]
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = groupName.trim();
    if (!trimmedName) {
      setErrorMessage("Please enter a group name");
      return;
    }
    if (trimmedName.length > 100) {
      setErrorMessage("Group name must be 100 characters or fewer");
      return;
    }
    if (selectedFriendIds.length === 0) {
      setErrorMessage("Please select at least one friend to add to the group");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await createGroup(trimmedName, selectedFriendIds, avatarUrl.trim() || undefined);

    if (res.error || !res.conversationId) {
      setErrorMessage(res.error || "Failed to create group");
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    onClose();
    if (onGroupCreated) {
      onGroupCreated(res.conversationId);
    } else {
      router.push(`/chat/${res.conversationId}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200 cursor-pointer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-group-title"
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
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="create-group-title"
                className="text-base font-bold text-zinc-900 dark:text-white"
              >
                Create Group Chat
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Chat with multiple friends together
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Content */}
        <form onSubmit={handleCreate} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-5 space-y-4 overflow-y-auto flex-1">
            {/* Error banner */}
            {errorMessage && (
              <div
                className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300 animate-in fade-in"
                role="alert"
              >
                {errorMessage}
              </div>
            )}

            {/* Group Name Input */}
            <div className="space-y-1.5">
              <label
                htmlFor="group-name-input"
                className="text-xs font-semibold text-zinc-700 dark:text-zinc-300"
              >
                Group Name <span className="text-heat-500">*</span>
              </label>
              <Input
                id="group-name-input"
                placeholder="e.g. Design Team, Weekend Hangout"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                maxLength={100}
                required
                autoFocus
                disabled={isSubmitting}
                className="h-10 text-sm"
              />
            </div>

            {/* Optional Avatar URL Input */}
            <div className="space-y-1.5">
              <label
                htmlFor="group-avatar-input"
                className="text-xs font-semibold text-zinc-700 dark:text-zinc-300"
              >
                Group Avatar URL <span className="text-zinc-400 font-normal">(Optional)</span>
              </label>
              <Input
                id="group-avatar-input"
                placeholder="https://example.com/avatar.png"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                disabled={isSubmitting}
                className="h-10 text-xs"
              />
            </div>

            {/* Friends Selector Header */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Select Friends <span className="text-heat-500">*</span>
                </label>
                <span className="rounded-full bg-heat-100 px-2.5 py-0.5 text-[11px] font-semibold text-heat-700 dark:bg-heat-950/60 dark:text-heat-300">
                  {selectedFriendIds.length} selected
                </span>
              </div>

              {/* Friend Search Input */}
              <div className="relative">
                <Input
                  placeholder="Filter friends..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  leftIcon={<Search className="h-4 w-4 text-zinc-400" />}
                  disabled={isSubmitting}
                  className="h-9 text-xs bg-zinc-50 dark:bg-zinc-900"
                />
              </div>

              {/* Friend Checkbox List */}
              <div className="max-h-48 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-800 p-1 divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {isFriendsLoading ? (
                  <div className="p-4 text-center text-xs text-zinc-400">Loading friends...</div>
                ) : filteredFriends.length === 0 ? (
                  <div className="p-4 text-center text-xs text-zinc-400">
                    {searchQuery ? "No matching friends found." : "No accepted friends yet."}
                  </div>
                ) : (
                  filteredFriends.map((friend) => {
                    const isSelected = selectedFriendIds.includes(friend.friendId);
                    return (
                      <div
                        key={friend.friendId}
                        onClick={() => !isSubmitting && toggleFriend(friend.friendId)}
                        className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-heat-50 dark:bg-heat-950/30"
                            : "hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
                        }`}
                        role="checkbox"
                        aria-checked={isSelected}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleFriend(friend.friendId);
                          }
                        }}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar
                            src={friend.profile.avatar_url}
                            name={friend.profile.display_name}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-zinc-900 dark:text-white">
                              {friend.profile.display_name}
                            </p>
                            <p className="truncate text-[10px] text-zinc-400">
                              @{friend.profile.username}
                            </p>
                          </div>
                        </div>

                        <div
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all ${
                            isSelected
                              ? "border-heat-500 bg-heat-500 text-white"
                              : "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                          }`}
                        >
                          {isSelected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                        </div>
                      </div>
                    );
                  })
                )}
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
              disabled={isSubmitting || !groupName.trim() || selectedFriendIds.length === 0}
              className="gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Create Group</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
