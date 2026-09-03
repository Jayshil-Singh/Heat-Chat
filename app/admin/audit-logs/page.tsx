"use client";

import * as React from "react";
import {
  ScrollText,
  Search,
  Download,
  Filter,
  Eye,
  ChevronLeft,
  ChevronRight,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminAuditLog } from "@/types/admin";

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = React.useState<AdminAuditLog[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [actionFilter, setActionFilter] = React.useState("all");
  const [targetType, setTargetType] = React.useState("all");
  const [isLoading, setIsLoading] = React.useState(true);

  // Inspector modal state
  const [activeLog, setActiveLog] = React.useState<AdminAuditLog | null>(null);

  const fetchLogs = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
        action: actionFilter,
        targetType: targetType,
      });
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/admin/audit-logs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      }
    } catch (err) {
      console.error("Failed to load audit logs:", err);
    } finally {
      setIsLoading(false);
    }
  }, [page, search, actionFilter, targetType]);

  React.useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleExportCSV = () => {
    window.open("/api/admin/audit-logs?format=csv", "_blank");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
            Immutable Administrative Audit Logs
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {total} immutable audit records. Database-enforced append-only audit trail.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCSV}
          className="gap-1.5 text-xs font-semibold"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Export CSV</span>
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            placeholder="Search by reason or target ID..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
          >
            <option value="all">All Actions</option>
            <option value="USER_CREATED">USER_CREATED</option>
            <option value="USER_SUSPENDED">USER_SUSPENDED</option>
            <option value="USER_RESTORED">USER_RESTORED</option>
            <option value="USER_DELETED">USER_DELETED</option>
            <option value="ROLE_ASSIGNED">ROLE_ASSIGNED</option>
            <option value="ROLE_REMOVED">ROLE_REMOVED</option>
            <option value="REPORT_RESOLVED">REPORT_RESOLVED</option>
            <option value="PRIVATE_CONTENT_ACCESSED">PRIVATE_CONTENT_ACCESSED</option>
            <option value="SETTING_CHANGED">SETTING_CHANGED</option>
          </select>

          <select
            value={targetType}
            onChange={(e) => {
              setTargetType(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
          >
            <option value="all">All Targets</option>
            <option value="user">User</option>
            <option value="role">Role</option>
            <option value="report">Report</option>
            <option value="message">Message</option>
            <option value="conversation">Conversation</option>
            <option value="setting">Setting</option>
          </select>
        </div>
      </div>

      {/* Audit Logs Table */}
      <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-100 bg-zinc-50/75 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
              <tr>
                <th className="px-5 py-3.5">Action / Actor</th>
                <th className="px-4 py-3.5">Target</th>
                <th className="px-4 py-3.5">Reason / Justification</th>
                <th className="px-4 py-3.5">Result</th>
                <th className="px-4 py-3.5">Timestamp</th>
                <th className="px-5 py-3.5 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-zinc-400">
                    Loading audit trail...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-zinc-400">
                    No audit records matching criteria.
                  </td>
                </tr>
              ) : (
                logs.map((l) => (
                  <tr key={l.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="space-y-0.5">
                        <span className="font-bold text-heat-600 dark:text-heat-400 font-mono">
                          {l.action}
                        </span>
                        <p className="text-[10px] text-zinc-400">
                          @{l.actor_username || "Admin"} ({l.actor_role})
                        </p>
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <span className="capitalize font-semibold text-zinc-800 dark:text-zinc-200">
                        {l.target_type}
                      </span>
                      <p className="text-[10px] text-zinc-400 font-mono">
                        {l.target_id.slice(0, 10)}...
                      </p>
                    </td>

                    <td className="px-4 py-3.5 text-zinc-600 dark:text-zinc-300 max-w-xs truncate">
                      {l.reason}
                    </td>

                    <td className="px-4 py-3.5">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          l.result === "SUCCESS"
                            ? "bg-green-500/10 text-green-600 dark:text-green-400"
                            : "bg-red-500/10 text-red-600 dark:text-red-400"
                        }`}
                      >
                        {l.result}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-zinc-400">
                      {new Date(l.created_at).toLocaleString()}
                    </td>

                    <td className="px-5 py-3.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setActiveLog(l)}
                        className="h-8 px-2 text-xs"
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        <span>Diff</span>
                      </Button>
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

      {/* Audit Log Detail Diff Modal */}
      {activeLog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 backdrop-blur-sm p-4 cursor-pointer"
          onClick={() => setActiveLog(null)}
        >
          <div
            className="w-full max-w-2xl rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 space-y-4 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3 dark:border-zinc-800">
              <div>
                <h3 className="font-bold text-sm text-zinc-900 dark:text-white">
                  Audit Entry: {activeLog.action}
                </h3>
                <p className="text-[11px] text-zinc-400 font-mono">ID: {activeLog.id}</p>
              </div>
              <span className="text-xs text-zinc-400">
                {new Date(activeLog.created_at).toLocaleString()}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950 space-y-2">
                <span className="font-bold text-zinc-700 dark:text-zinc-300">Previous State</span>
                <pre className="text-[11px] font-mono text-zinc-500 overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(activeLog.old_value, null, 2) || "None"}
                </pre>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950 space-y-2">
                <span className="font-bold text-zinc-700 dark:text-zinc-300">New State</span>
                <pre className="text-[11px] font-mono text-green-600 dark:text-green-400 overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(activeLog.new_value, null, 2) || "None"}
                </pre>
              </div>
            </div>

            <div className="rounded-2xl bg-zinc-50 p-3 dark:bg-zinc-800 text-xs">
              <span className="font-semibold text-zinc-700 dark:text-zinc-300">Recorded Reason:</span>
              <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">{activeLog.reason}</p>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outline" size="sm" onClick={() => setActiveLog(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
