"use client";

import * as React from "react";
import { AlertTriangle, Trash2, X, ShieldAlert, Lock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminUserSummary } from "@/types/admin";

interface DeleteUserDialogProps {
  user: AdminUserSummary;
  userEmail?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function DeleteUserDialog({
  user,
  userEmail,
  isOpen,
  onClose,
  onSuccess,
}: DeleteUserDialogProps) {
  const [confirmationInput, setConfirmationInput] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const targetIdentifier = userEmail || user.username || user.id;
  const expectedPhrase = `DELETE ${targetIdentifier}`;

  React.useEffect(() => {
    if (isOpen) {
      setConfirmationInput("");
      setReason("");
      setError(null);
    }
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const isConfirmed = confirmationInput.trim() === expectedPhrase;
  const isReasonValid = reason.trim().length >= 3;

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConfirmed) {
      setError(`Please type '${expectedPhrase}' exactly to confirm.`);
      return;
    }
    if (!isReasonValid) {
      setError("A justification reason (minimum 3 characters) is required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmation: confirmationInput.trim(),
          reason: reason.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === "MFA_REAUTH_REQUIRED") {
          throw new Error("Your MFA verification has expired (>10 minutes). Please re-authenticate your MFA session.");
        }
        throw new Error(data.message || data.error || "Failed to initiate user deletion.");
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("[Heat Admin] User deletion error:", err);
      setError(err.message || "An unexpected error occurred during user deletion.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150 cursor-pointer"
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
    >
      <div
        className="w-full max-w-lg rounded-3xl border border-red-500/30 bg-white p-6 sm:p-8 shadow-2xl dark:bg-zinc-950 dark:border-red-950/80 space-y-6 cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400 border border-red-500/20">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight text-zinc-900 dark:text-white">
                Permanently Delete User
              </h3>
              <p className="text-xs text-red-600 dark:text-red-400 font-semibold">
                SuperAdmin Destructive Action
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Warning Banner */}
        <div className="rounded-2xl bg-red-50 p-4 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-900/50 space-y-2">
          <div className="flex items-center gap-2 font-bold text-red-900 dark:text-red-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>WARNING: This action is permanent and irreversible.</span>
          </div>
          <p className="leading-relaxed text-[11px]">
            Permanently deleting <span className="font-bold">{user.display_name}</span> (@{user.username}) will destroy their authentication identity, purge their private conversations, attachments, notification preferences, and invalidate all active sessions immediately.
          </p>
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/10 p-3 text-xs font-semibold text-red-600 dark:text-red-400 border border-red-500/20 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleDelete} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
              To confirm, type <span className="font-mono text-red-600 dark:text-red-400 select-all">{expectedPhrase}</span>
            </label>
            <Input
              type="text"
              placeholder={expectedPhrase}
              value={confirmationInput}
              onChange={(e) => setConfirmationInput(e.target.value)}
              className="text-xs font-mono"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Justification Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Legal compliance request / fraudulent abusive account..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-2xl border border-zinc-200 bg-white p-3 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              size="default"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              size="default"
              className="gap-2 font-bold bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/30"
              disabled={!isConfirmed || !isReasonValid || isSubmitting}
            >
              {isSubmitting ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  <span>Delete User Permanently</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
