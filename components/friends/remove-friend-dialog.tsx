"use client";

import * as React from "react";
import { UserMinus, AlertCircle } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { FriendItem } from "@/types/chat";

interface RemoveFriendDialogProps {
  friend: FriendItem | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (friend: FriendItem) => Promise<void>;
}

export function RemoveFriendDialog({
  friend,
  isOpen,
  onClose,
  onConfirm,
}: RemoveFriendDialogProps) {
  const [isRemoving, setIsRemoving] = React.useState(false);

  if (!friend) return null;

  const handleConfirm = async () => {
    setIsRemoving(true);
    try {
      await onConfirm(friend);
      onClose();
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={`Remove ${friend.profile.display_name}?`}
      description={`You will no longer be friends with ${friend.profile.display_name} (@${friend.profile.username}). Existing conversation history will be preserved.`}
      className="max-w-md"
    >
      <div className="space-y-4 pt-2">
        <div className="flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
          <span>You can send another friend request anytime in the future.</span>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="secondary"
            size="default"
            onClick={onClose}
            disabled={isRemoving}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="default"
            onClick={handleConfirm}
            disabled={isRemoving}
            className="gap-2"
          >
            <UserMinus className="h-4 w-4" />
            <span>{isRemoving ? "Removing..." : "Remove Friend"}</span>
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
