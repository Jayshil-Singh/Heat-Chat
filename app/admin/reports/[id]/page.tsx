"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ChevronLeft,
  Flag,
  User,
  MessageSquare,
  Paperclip,
  AlertTriangle,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Clock,
  StickyNote,
  Send,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReportCategory, ReportStatus } from "@/types/database";

interface AdminReport {
  id: string;
  category: ReportCategory;
  target_type: string;
  target_id: string;
  target_user_id: string | null;
  target_message_id: string | null;
  target_attachment_id: string | null;
  target_conversation_id: string | null;
  reason: string;
  description: string | null;
  status: ReportStatus;
  action_taken: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  reporter_id: string;
  assigned_to: string | null;
  reporter: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
  target_user: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
}

interface ModerationNote {
  id: string;
  report_id: string;
  note: string;
  created_at: string;
  author: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
}

const CATEGORY_LABELS: Record<ReportCategory, string> = {
  SPAM: "Spam",
  HARASSMENT: "Harassment",
  BULLYING: "Bullying",
  IMPERSONATION: "Impersonation",
  THREATS: "Threats",
  INAPPROPRIATE_CONTENT: "Inappropriate Content",
  SCAM: "Scam",
  FRAUD: "Fraud",
  ILLEGAL_CONTENT: "Illegal Content",
  SELF_HARM: "Self-Harm",
  OTHER: "Other",
};

const STATUS_OPTIONS: Array<{ value: ReportStatus; label: string }> = [
  { value: "Assigned", label: "Assign to Me" },
  { value: "Investigating", label: "Mark Investigating" },
  { value: "ActionTaken", label: "Action Taken" },
  { value: "Resolved", label: "Resolve" },
  { value: "Closed", label: "Dismiss (Close)" },
];

const STATUS_BADGE: Record<ReportStatus, string> = {
  New: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900",
  Assigned:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900",
  Investigating:
    "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-400 dark:border-violet-900",
  ActionTaken:
    "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-900",
  Resolved:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900",
  Closed:
    "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminReportDetailPage() {
  const { id: reportId } = useParams<{ id: string }>();

  const [report, setReport] = React.useState<AdminReport | null>(null);
  const [notes, setNotes] = React.useState<ModerationNote[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Status update
  const [selectedStatus, setSelectedStatus] =
    React.useState<ReportStatus>("Investigating");
  const [actionTaken, setActionTaken] = React.useState("");
  const [resolutionNotes, setResolutionNotes] = React.useState("");
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [updateError, setUpdateError] = React.useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = React.useState(false);

  // Notes
  const [newNote, setNewNote] = React.useState("");
  const [isAddingNote, setIsAddingNote] = React.useState(false);
  const [noteError, setNoteError] = React.useState<string | null>(null);

  const notesEndRef = React.useRef<HTMLDivElement>(null);

  const loadData = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [reportRes, notesRes] = await Promise.all([
        fetch(`/api/admin/reports/${reportId}`),
        fetch(`/api/admin/reports/${reportId}/notes`),
      ]);

      if (!reportRes.ok) {
        const d = await reportRes.json().catch(() => ({}));
        throw new Error(d.error || "Failed to load report");
      }

      const reportData = await reportRes.json();
      const notesData = notesRes.ok ? await notesRes.json() : { notes: [] };

      setReport(reportData.report);
      setNotes(notesData.notes ?? []);
      setSelectedStatus(
        reportData.report.status === "New"
          ? "Investigating"
          : reportData.report.status
      );
      setActionTaken(reportData.report.action_taken ?? "");
      setResolutionNotes(reportData.report.resolution_notes ?? "");
    } catch (err: any) {
      setError(err.message || "Could not load report.");
    } finally {
      setIsLoading(false);
    }
  }, [reportId]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpdateStatus = async () => {
    setIsUpdating(true);
    setUpdateError(null);
    setUpdateSuccess(false);
    try {
      const res = await fetch(`/api/admin/reports/${reportId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: selectedStatus,
          actionTaken: actionTaken.trim() || null,
          resolutionNotes: resolutionNotes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      setReport((prev) =>
        prev
          ? {
              ...prev,
              status: selectedStatus,
              action_taken: actionTaken.trim() || null,
              resolution_notes: resolutionNotes.trim() || null,
            }
          : prev
      );
      setUpdateSuccess(true);
      setTimeout(() => setUpdateSuccess(false), 3000);
    } catch (err: any) {
      setUpdateError(err.message || "Failed to update status.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setIsAddingNote(true);
    setNoteError(null);
    try {
      const res = await fetch(`/api/admin/reports/${reportId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: newNote.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add note");
      setNotes((prev) => [...prev, data.note]);
      setNewNote("");
      setTimeout(
        () => notesEndRef.current?.scrollIntoView({ behavior: "smooth" }),
        100
      );
    } catch (err: any) {
      setNoteError(err.message || "Could not add note.");
    } finally {
      setIsAddingNote(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-heat-500" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="mx-auto max-w-3xl p-8 text-center space-y-4">
        <AlertCircle className="mx-auto h-10 w-10 text-red-400" />
        <p className="text-sm text-red-500">{error ?? "Report not found."}</p>
        <Link
          href="/admin/reports"
          className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back to Reports
        </Link>
      </div>
    );
  }

  const statusBadgeCls = STATUS_BADGE[report.status] ?? STATUS_BADGE.New;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <Link
          href="/admin/reports"
          className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300 transition-colors"
          title="Back to Reports Inbox"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-black tracking-tight text-zinc-900 dark:text-white">
              Report{" "}
              <span className="font-mono text-base text-zinc-400">
                #{report.id.slice(0, 8)}
              </span>
            </h1>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${statusBadgeCls}`}
            >
              {report.status}
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Submitted {formatDate(report.created_at)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: Report Info */}
        <div className="lg:col-span-2 space-y-4">
          {/* Report Details Card */}
          <div className="rounded-3xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50 p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Flag className="h-4 w-4 text-heat-500" />
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                Report Details
              </h2>
            </div>

            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                  Category
                </dt>
                <dd className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 mt-0.5">
                  {CATEGORY_LABELS[report.category] ?? report.category}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                  Target Type
                </dt>
                <dd className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200 mt-0.5">
                  {report.target_type === "user" && (
                    <User className="h-3.5 w-3.5 text-heat-500" />
                  )}
                  {report.target_type === "message" && (
                    <MessageSquare className="h-3.5 w-3.5 text-amber-500" />
                  )}
                  {report.target_type === "attachment" && (
                    <Paperclip className="h-3.5 w-3.5 text-blue-500" />
                  )}
                  <span className="capitalize">{report.target_type}</span>
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                  Target ID
                </dt>
                <dd className="text-xs font-mono text-zinc-600 dark:text-zinc-400 mt-0.5 break-all">
                  {report.target_id}
                </dd>
              </div>
              {report.description && (
                <div className="col-span-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                    Reporter Description
                  </dt>
                  <dd className="text-xs text-zinc-700 dark:text-zinc-300 mt-0.5 whitespace-pre-wrap">
                    {report.description}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Reporter & Target Profiles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Reporter */}
            <div className="rounded-3xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50 p-4 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                Reported By
              </p>
              {report.reporter ? (
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden shrink-0">
                    {report.reporter.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={report.reporter.avatar_url}
                        alt={report.reporter.display_name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-bold text-zinc-400">
                        {report.reporter.display_name[0].toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-zinc-900 dark:text-white truncate">
                      {report.reporter.display_name}
                    </p>
                    <p className="text-[11px] text-zinc-400 truncate">
                      @{report.reporter.username}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-zinc-400 font-mono">
                  {report.reporter_id.slice(0, 12)}…
                </p>
              )}
            </div>

            {/* Target User */}
            <div className="rounded-3xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50 p-4 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                Reported User
              </p>
              {report.target_user ? (
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden shrink-0">
                    {report.target_user.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={report.target_user.avatar_url}
                        alt={report.target_user.display_name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-bold text-zinc-400">
                        {report.target_user.display_name[0].toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-zinc-900 dark:text-white truncate">
                      {report.target_user.display_name}
                    </p>
                    <p className="text-[11px] text-zinc-400 truncate">
                      @{report.target_user.username}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-zinc-400">
                  {report.target_type !== "user"
                    ? `N/A (${report.target_type} report)`
                    : "User not found"}
                </p>
              )}
            </div>
          </div>

          {/* Moderation Notes */}
          <div className="rounded-3xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
              <StickyNote className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                Internal Moderation Notes
              </h2>
              <span className="ml-auto rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold text-zinc-500">
                Admin only
              </span>
            </div>

            <div className="p-4 space-y-3 min-h-[100px] max-h-64 overflow-y-auto">
              {notes.length === 0 ? (
                <p className="text-center text-xs text-zinc-400 py-4">
                  No internal notes yet
                </p>
              ) : (
                notes.map((n) => (
                  <div
                    key={n.id}
                    className="rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 p-3 space-y-1"
                  >
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-3 w-3 text-violet-500 shrink-0" />
                      <span className="text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">
                        {n.author?.display_name ?? "Admin"}
                      </span>
                      <span className="ml-auto text-[10px] text-zinc-400 flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        {formatDate(n.created_at)}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap pl-5">
                      {n.note}
                    </p>
                  </div>
                ))
              )}
              <div ref={notesEndRef} />
            </div>

            {/* Add Note */}
            <div className="border-t border-zinc-100 dark:border-zinc-800 p-4 space-y-2">
              {noteError && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {noteError}
                </p>
              )}
              <div className="flex gap-2">
                <textarea
                  placeholder="Add an internal moderation note… (admin eyes only)"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  maxLength={2000}
                  rows={2}
                  className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleAddNote();
                    }
                  }}
                />
                <button
                  onClick={handleAddNote}
                  disabled={isAddingNote || !newNote.trim()}
                  className="self-end rounded-xl bg-amber-500 p-2.5 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
                  title="Add note (Ctrl+Enter)"
                >
                  {isAddingNote ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-[10px] text-zinc-400">
                {newNote.length}/2000 — Ctrl+Enter to submit
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT: Status Management */}
        <div className="space-y-4">
          <div className="rounded-3xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50 p-5 space-y-4 sticky top-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-heat-500" />
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                Update Status
              </h2>
            </div>

            <div className="space-y-3">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSelectedStatus(opt.value)}
                  className={`w-full rounded-2xl border px-4 py-2.5 text-left text-xs font-semibold transition-all ${
                    selectedStatus === opt.value
                      ? "border-heat-500 bg-heat-50 text-heat-700 dark:bg-heat-950/40 dark:text-heat-400"
                      : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                Action Taken Summary
              </label>
              <input
                type="text"
                value={actionTaken}
                onChange={(e) => setActionTaken(e.target.value)}
                placeholder="e.g. Warning issued, content removed…"
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-heat-400"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                Resolution Notes (optional)
              </label>
              <textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Internal resolution context…"
                rows={3}
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-heat-400 resize-none"
              />
            </div>

            {updateError && (
              <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2 flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                <p className="text-xs text-red-600 dark:text-red-400">
                  {updateError}
                </p>
              </div>
            )}

            {updateSuccess && (
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 px-3 py-2 flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  Status updated successfully
                </p>
              </div>
            )}

            <Button
              variant="heat"
              className="w-full"
              onClick={handleUpdateStatus}
              disabled={isUpdating}
            >
              {isUpdating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Save Decision
                </>
              )}
            </Button>

            {/* Report timestamps */}
            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-1">
              <div className="flex items-center justify-between text-[10px] text-zinc-400">
                <span>Created</span>
                <span>{formatDate(report.created_at)}</span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-zinc-400">
                <span>Last updated</span>
                <span>{formatDate(report.updated_at)}</span>
              </div>
              {report.resolved_at && (
                <div className="flex items-center justify-between text-[10px] text-emerald-500">
                  <span>Resolved</span>
                  <span>{formatDate(report.resolved_at)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
