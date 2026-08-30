"use client";

import * as React from "react";
import {
  ShieldAlert,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Flag,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ReportCategory } from "@/types/database";

interface ReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: "user" | "message" | "attachment";
  targetId: string;
  targetName?: string;
}

const REPORT_CATEGORIES: { value: ReportCategory; label: string; description: string }[] = [
  { value: "SPAM", label: "Spam", description: "Unwanted promotions, repetitive spam, or bot activity" },
  { value: "HARASSMENT", label: "Harassment", description: "Targeted insults, persistent harassment, or hate speech" },
  { value: "BULLYING", label: "Bullying", description: "Intimidation, shaming, or abusive behavior" },
  { value: "IMPERSONATION", label: "Impersonation", description: "Pretending to be someone else or deceptive profile" },
  { value: "THREATS", label: "Threats / Violence", description: "Threats of harm, violence, or dangerous behavior" },
  { value: "INAPPROPRIATE_CONTENT", label: "Inappropriate Content", description: "Sexually explicit or offensive material" },
  { value: "SCAM", label: "Scam / Fraud", description: "Phishing, financial scams, or deceptive links" },
  { value: "OTHER", label: "Other", description: "Other violations of community guidelines" },
];

export function ReportDialog({
  isOpen,
  onClose,
  targetType,
  targetId,
  targetName,
}: ReportDialogProps) {
  const [selectedCategory, setSelectedCategory] = React.useState<ReportCategory>("SPAM");
  const [description, setDescription] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setSelectedCategory("SPAM");
      setDescription("");
      setErrorMessage(null);
      setSuccessMessage(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    setIsSubmitting(true);

    try {
      let endpoint = "/api/reports/user";
      let payload: Record<string, any> = {
        category: selectedCategory,
        description: description.trim() || null,
      };

      if (targetType === "user") {
        endpoint = "/api/reports/user";
        payload.targetUserId = targetId;
      } else if (targetType === "message") {
        endpoint = "/api/reports/message";
        payload.messageId = targetId;
      } else if (targetType === "attachment") {
        endpoint = "/api/reports/attachment";
        payload.attachmentId = targetId;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.message || data.error || "Failed to submit report.");
        return;
      }

      if (data.duplicate) {
        setSuccessMessage("An active report has already been received for this item. Our moderation team is reviewing it.");
      } else {
        setSuccessMessage("Your report has been submitted for review. Thank you for keeping our community safe.");
      }

      setTimeout(() => {
        onClose();
      }, 1800);
    } catch (err: any) {
      setErrorMessage("A network error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const titleText = `Report ${targetType === "user" ? (targetName ? `@${targetName}` : "User") : targetType === "message" ? "Message" : "Attachment"}`;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={titleText}
      description="Help us understand the issue. Reports are reviewed by our moderation team in accordance with platform policies."
      className="max-w-lg"
      footer={
        <div className="flex w-full flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
          <Button
            type="button"
            variant="secondary"
            size="default"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="report-form"
            variant="destructive"
            size="default"
            disabled={isSubmitting}
            className="w-full sm:w-auto gap-2 font-semibold shadow-sm"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Submitting...</span>
              </>
            ) : (
              <>
                <Flag className="h-4 w-4" />
                <span>Submit Report</span>
              </>
            )}
          </Button>
        </div>
      }
    >
      <form id="report-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
        {successMessage && (
          <div
            className="flex items-start gap-2.5 rounded-2xl bg-emerald-50 p-4 text-xs font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50"
            role="status"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
            <span>{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div
            className="flex items-center gap-2.5 rounded-2xl bg-red-50 p-3.5 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-900/50"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Reason / Category Radio Selection */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-zinc-800 dark:text-zinc-200">
            Why are you reporting this {targetType}?
          </label>
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1 [scrollbar-width:thin]">
            {REPORT_CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat.value;
              return (
                <button
                  type="button"
                  key={cat.value}
                  onClick={() => setSelectedCategory(cat.value)}
                  className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-all ${
                    isSelected
                      ? "border-red-500 bg-red-50/70 dark:bg-red-950/30 ring-1 ring-red-500/30"
                      : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                      isSelected
                        ? "border-red-500 bg-red-500 text-white"
                        : "border-zinc-300 dark:border-zinc-600"
                    }`}
                  >
                    {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-zinc-900 dark:text-white">
                      {cat.label}
                    </p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      {cat.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Additional Details Textarea */}
        <div className="space-y-1.5 pt-2">
          <div className="flex items-center justify-between">
            <label
              htmlFor="report-description"
              className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300"
            >
              Additional details (optional)
            </label>
            <span className="text-[10px] text-zinc-400">
              {description.length}/1000
            </span>
          </div>
          <textarea
            id="report-description"
            rows={3}
            placeholder="Provide any relevant context to assist moderators..."
            value={description}
            maxLength={1000}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isSubmitting}
            className="flex w-full rounded-2xl border border-zinc-200 bg-white p-3 text-xs text-zinc-900 placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-100 dark:placeholder:text-zinc-500 transition-colors"
          />
        </div>
      </form>
    </Dialog>
  );
}
