"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Filter,
  Shield,
  User,
  MessageSquare,
  Paperclip,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ModerationReport } from "@/types/admin";

export default function AdminReportsPage() {
  const [reports, setReports] = React.useState<ModerationReport[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [isLoading, setIsLoading] = React.useState(true);

  // Resolution Modal State
  const [activeReport, setActiveReport] = React.useState<ModerationReport | null>(null);
  const [newStatus, setNewStatus] = React.useState<string>("Resolved");
  const [actionTaken, setActionTaken] = React.useState("Content reviewed - no violation found");
  const [resolutionNotes, setResolutionNotes] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [resolveError, setResolveError] = React.useState<string | null>(null);

  const fetchReports = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "15",
        status: statusFilter,
        type: typeFilter,
      });

      const res = await fetch(`/api/admin/reports?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      }
    } catch (err) {
      console.error("Failed to load reports:", err);
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter, typeFilter]);

  React.useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleResolve = async () => {
    if (!activeReport) return;

    setIsSubmitting(true);
    setResolveError(null);

    try {
      const res = await fetch(`/api/admin/reports/${activeReport.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          actionTaken,
          resolutionNotes: resolutionNotes.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setResolveError(data.error || "Failed to update report.");
        return;
      }

      setActiveReport(null);
      setResolutionNotes("");
      fetchReports();
    } catch (err) {
      console.error("Resolve error:", err);
      setResolveError("Unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
            Moderation Reports
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {total} reports submitted by platform members. Resolve flags and maintain community safety.
          </p>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
        >
          <option value="all">All Statuses</option>
          <option value="New">New / Unassigned</option>
          <option value="Assigned">Assigned</option>
          <option value="Investigating">Investigating</option>
          <option value="Resolved">Resolved</option>
          <option value="Closed">Closed</option>
        </select>

        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
        >
          <option value="all">All Target Types</option>
          <option value="user">User</option>
          <option value="message">Message</option>
          <option value="conversation">Conversation</option>
          <option value="attachment">Attachment</option>
        </select>
      </div>

      {/* Reports Table */}
      <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-100 bg-zinc-50/75 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
              <tr>
                <th className="px-5 py-3.5">Target</th>
                <th className="px-4 py-3.5">Reason</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Reported By</th>
                <th className="px-4 py-3.5">Date</th>
                <th className="px-5 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-zinc-400">
                    Loading reports inbox...
                  </td>
                </tr>
              ) : reports.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-zinc-400">
                    No moderation reports matching criteria.
                  </td>
                </tr>
              ) : (
                reports.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40 transition-colors">
                    <td className="px-5 py-3.5 font-semibold">
                      <div className="flex items-center gap-2">
                        {r.target_type === "user" && <User className="h-3.5 w-3.5 text-heat-500" />}
                        {r.target_type === "message" && <MessageSquare className="h-3.5 w-3.5 text-amber-500" />}
                        {r.target_type === "attachment" && <Paperclip className="h-3.5 w-3.5 text-blue-500" />}
                        <span className="capitalize text-zinc-900 dark:text-white">
                          {r.target_type}: {r.target_id.slice(0, 8)}...
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <span className="font-bold text-zinc-900 dark:text-white">{r.reason}</span>
                      {r.description && (
                        <p className="text-[11px] text-zinc-400 line-clamp-1">{r.description}</p>
                      )}
                    </td>

                    <td className="px-4 py-3.5">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          r.status === "New"
                            ? "bg-red-500/10 text-red-600 dark:text-red-400"
                            : r.status === "Investigating"
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            : "bg-green-500/10 text-green-600 dark:text-green-400"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-zinc-500 dark:text-zinc-400">
                      @{r.reporter_username || r.reporter_id.slice(0, 8)}
                    </td>

                    <td className="px-4 py-3.5 text-zinc-400">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>

                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/admin/reports/${r.id}`}
                          className="inline-flex h-8 items-center rounded-xl px-2.5 text-xs font-semibold text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors gap-1"
                          title="View full report detail"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Detail
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setActiveReport(r);
                            setNewStatus(r.status === "New" ? "Investigating" : "Resolved");
                            setResolutionNotes(r.resolution_notes || "");
                            setResolveError(null);
                          }}
                          className="h-8 px-2 text-xs font-semibold text-heat-600 hover:text-heat-700"
                        >
                          Review
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex items-center justify-between border-t border-zinc-100 px-5 py-3 dark:border-zinc-800 text-xs text-zinc-500">
          <span>
            Page {page} of {totalPages} ({total} total)
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="h-8 px-2"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="h-8 px-2"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Resolution Dialog Modal */}
      {activeReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-heat-500/10 text-heat-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-zinc-900 dark:text-white">
                  Review Report #{activeReport.id.slice(0, 8)}
                </h3>
                <p className="text-[11px] text-zinc-400 capitalize">
                  Target: {activeReport.target_type} ({activeReport.target_id})
                </p>
              </div>
            </div>

            {resolveError && (
              <div className="rounded-xl bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{resolveError}</span>
              </div>
            )}

            <div className="rounded-2xl bg-zinc-50 p-3 dark:bg-zinc-800 text-xs space-y-1">
              <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                Reported Reason: {activeReport.reason}
              </span>
              <p className="text-zinc-500 dark:text-zinc-400">{activeReport.description || "No extra text provided."}</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">Update Status</label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
              >
                <option value="Investigating">Investigating</option>
                <option value="ActionTaken">Action Taken</option>
                <option value="Resolved">Resolved</option>
                <option value="Closed">Closed (Dismissed)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">Action Taken Summary</label>
              <input
                type="text"
                value={actionTaken}
                onChange={(e) => setActionTaken(e.target.value)}
                placeholder="e.g. Warning issued, user suspended, message deleted..."
                className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">Resolution Notes</label>
              <textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Internal notes on resolution steps taken..."
                className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
                rows={2}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveReport(null)}
              >
                Cancel
              </Button>
              <Button
                variant="heat"
                size="sm"
                disabled={isSubmitting}
                onClick={handleResolve}
              >
                {isSubmitting ? "Saving..." : "Save Resolution"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
