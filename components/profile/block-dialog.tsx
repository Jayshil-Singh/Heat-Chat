"use client";

import * as React from "react";
import { ShieldAlert, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BlockDialogProps {
  isOpen: boolean;
  onClose: () => void;
  targetUserId: string;
  targetUsername: string;
  targetDisplayName: string;
  isCurrentlyBlocked?: boolean;
  onSuccess: (isBlocked: boolean) => void;
}

export function BlockDialog({
  isOpen,
  onClose,
  targetUserId,
  targetUsername,
  targetDisplayName,
  isCurrentlyBlocked = false,
  onSuccess,
}: BlockDialogProps) {
  const [reason, setReason] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isLoading) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  const handleAction = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/users/${targetUserId}/block`, {
        method: isCurrentlyBlocked ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: !isCurrentlyBlocked && reason.trim() ? JSON.stringify({ reason: reason.trim() }) : undefined,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || "Action failed.");
      }

      onSuccess(data.blocked);
      onClose();
    } catch (err: any) {
      console.error("[Heat Chat] Block action error:", err);
      setError(err.message || "Failed to update block state.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 cursor-pointer"
      onClick={() => {
        if (!isLoading) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 space-y-6 cursor-default"
        role="dialog"
        aria-modal="true"
        aria-labelledby="block-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          <div
            className={`p-3 rounded-2xl ${
              isCurrentlyBlocked
                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                : "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"
            }`}
          >
            <ShieldAlert className="h-6 w-6" />
          </div>

          <div className="space-y-1 flex-1">
            <h2 id="block-dialog-title" className="text-base font-bold text-zinc-900 dark:text-white">
              {isCurrentlyBlocked ? `Unblock ${targetDisplayName}?` : `Block ${targetDisplayName}?`}
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {isCurrentlyBlocked
                ? `Unblocking @${targetUsername} will allow them to send you messages and view your presence according to your privacy settings.`
                : `Blocking @${targetUsername} will immediately prevent new direct messages, calls, friend requests, and presence visibility. Existing chat history will remain safe.`}
            </p>
          </div>
        </div>

        {!isCurrentlyBlocked && (
          <div className="space-y-1.5">
            <label htmlFor="block-reason" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Reason (optional, for your records)
            </label>
            <textarea
              id="block-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Spam, harassment, unfamiliar contact..."
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-heat-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
            />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-600 dark:bg-red-950/50 dark:text-red-400 border border-red-200 dark:border-red-900/50">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>

          <Button
            type="button"
            variant={isCurrentlyBlocked ? "heat" : "destructive"}
            size="sm"
            onClick={handleAction}
            disabled={isLoading}
            className="gap-2"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            <span>{isCurrentlyBlocked ? "Unblock User" : "Block User"}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
