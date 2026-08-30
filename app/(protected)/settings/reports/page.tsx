"use client";

import * as React from "react";
import {
  Flag,
  ChevronLeft,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Clock,
  Search,
} from "lucide-react";
import Link from "next/link";
import type { ReportCategory, ReportStatus } from "@/types/database";

interface ReportHistoryItem {
  id: string;
  category: ReportCategory;
  target_type: string;
  created_at: string;
  status: ReportStatus;
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

const TARGET_TYPE_LABELS: Record<string, string> = {
  user: "User",
  message: "Message",
  attachment: "Attachment",
  conversation: "Conversation",
};

const STATUS_CONFIG: Record<
  ReportStatus,
  { label: string; className: string }
> = {
  New: {
    label: "New",
    className:
      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900",
  },
  Assigned: {
    label: "Assigned",
    className:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900",
  },
  Investigating: {
    label: "Investigating",
    className:
      "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-400 dark:border-violet-900",
  },
  ActionTaken: {
    label: "Action Taken",
    className:
      "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-900",
  },
  Resolved: {
    label: "Resolved",
    className:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900",
  },
  Closed: {
    label: "Closed",
    className:
      "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700",
  },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MyReportsPage() {
  const [reports, setReports] = React.useState<ReportHistoryItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");

  const loadReports = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reports/history");
      if (!res.ok) throw new Error("Failed to load reports");
      const data = await res.json();
      setReports(data.reports ?? []);
    } catch (err: any) {
      setError(err.message || "Could not load your reports.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadReports();
  }, [loadReports]);

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return reports;
    return reports.filter(
      (r) =>
        r.id.toLowerCase().includes(q) ||
        CATEGORY_LABELS[r.category]?.toLowerCase().includes(q) ||
        (TARGET_TYPE_LABELS[r.target_type] ?? r.target_type)
          .toLowerCase()
          .includes(q) ||
        r.status.toLowerCase().includes(q)
    );
  }, [reports, search]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <Link
          href="/settings"
          className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300 transition-colors"
          title="Back to Settings"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            My Reports
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            View the status of reports you have submitted
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 px-3 py-1.5">
          <Search className="h-3.5 w-3.5 text-zinc-400" />
          <input
            type="search"
            placeholder="Filter reports…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none w-32"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-900/50 animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50 p-12 text-center">
          {reports.length === 0 ? (
            <>
              <Flag className="mx-auto h-10 w-10 text-zinc-300 dark:text-zinc-700 mb-3" />
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                No reports submitted
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                When you report a user, message, or attachment, it will appear
                here
              </p>
            </>
          ) : (
            <>
              <Search className="mx-auto h-8 w-8 text-zinc-300 dark:text-zinc-700 mb-3" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No reports match &ldquo;{search}&rdquo;
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-3xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50 overflow-hidden">
          {/* Table header */}
          <div className="hidden sm:grid grid-cols-[1fr_120px_120px_120px] gap-4 px-5 py-3 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
              Category
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
              Target
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
              Date
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
              Status
            </span>
          </div>

          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {filtered.map((report) => {
              const statusConf = STATUS_CONFIG[report.status] ?? {
                label: report.status,
                className:
                  "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700",
              };
              return (
                <div
                  key={report.id}
                  className="grid sm:grid-cols-[1fr_120px_120px_120px] gap-2 sm:gap-4 items-center px-5 py-4"
                >
                  {/* Category */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-1.5 shrink-0">
                      <Flag className="h-3.5 w-3.5 text-red-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                        {CATEGORY_LABELS[report.category] ?? report.category}
                      </p>
                      <p className="text-[10px] text-zinc-400 truncate font-mono">
                        #{report.id.slice(0, 8)}
                      </p>
                    </div>
                  </div>

                  {/* Target type */}
                  <div className="sm:block">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 capitalize">
                      {TARGET_TYPE_LABELS[report.target_type] ??
                        report.target_type}
                    </span>
                  </div>

                  {/* Date */}
                  <div className="sm:block">
                    <div className="flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                      <Clock className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        {formatDate(report.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Status */}
                  <div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${statusConf.className}`}
                    >
                      {["Resolved", "Closed"].includes(report.status) && (
                        <CheckCircle2 className="h-2.5 w-2.5" />
                      )}
                      {statusConf.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-center text-[11px] text-zinc-400">
        Showing {filtered.length} of {reports.length} report
        {reports.length !== 1 ? "s" : ""} &mdash; moderator notes and internal
        details are not shown here
      </p>
    </div>
  );
}
