"use client";

import * as React from "react";
import Link from "next/link";
import {
  Lock,
  ShieldAlert,
  AlertTriangle,
  Radio,
  UserX,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AdminSecurityEvent } from "@/types/admin";

export default function AdminSecurityPage() {
  const [events, setEvents] = React.useState<AdminSecurityEvent[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchEvents = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "15",
        type: typeFilter,
      });

      const res = await fetch(`/api/admin/security/events?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      }
    } catch (err) {
      console.error("Failed to load security events:", err);
    } finally {
      setIsLoading(false);
    }
  }, [page, typeFilter]);

  React.useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
            Security Operations Center
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Realtime security telemetry, authentication anomalies, force lockouts, and break-glass events.
          </p>
        </div>
      </div>

      {/* Security Health Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500">Security Events</span>
            <ShieldCheck className="h-4 w-4 text-green-500" />
          </div>
          <div className="mt-2 text-2xl font-black text-zinc-900 dark:text-white">{total}</div>
          <p className="mt-1 text-[11px] text-zinc-400">Monitored 24/7</p>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500">Email Verification Guard</span>
            <ShieldCheck className="h-4 w-4 text-green-500" />
          </div>
          <div className="mt-2 text-sm font-bold text-green-600 dark:text-green-400">Mandatory & Active</div>
          <p className="mt-1 text-[11px] text-zinc-400">Zero unverified leakage</p>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500">Zero-Trust Boundaries</span>
            <Lock className="h-4 w-4 text-heat-500" />
          </div>
          <div className="mt-2 text-sm font-bold text-heat-600 dark:text-heat-400">Postgres RLS Enforced</div>
          <p className="mt-1 text-[11px] text-zinc-400">Server-side verified</p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex items-center gap-2">
        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
        >
          <option value="all">All Event Types</option>
          <option value="LOGIN_SUCCESS">Login Success</option>
          <option value="LOGIN_FAILED">Login Failed</option>
          <option value="FORCE_LOGOUT">Force Logout</option>
          <option value="LOCKOUT">Lockout</option>
          <option value="SUSPICIOUS_ACTIVITY">Suspicious Activity</option>
          <option value="BREAK_GLASS_ACCESS">Break-Glass Access</option>
        </select>
      </div>

      {/* Events Table */}
      <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-100 bg-zinc-50/75 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
              <tr>
                <th className="px-5 py-3.5">Event Type</th>
                <th className="px-4 py-3.5">Severity</th>
                <th className="px-4 py-3.5">User ID / Email</th>
                <th className="px-4 py-3.5">IP Address</th>
                <th className="px-5 py-3.5 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-zinc-400">
                    Loading security event stream...
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-zinc-400">
                    No security events recorded.
                  </td>
                </tr>
              ) : (
                events.map((e) => (
                  <tr key={e.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40 transition-colors">
                    <td className="px-5 py-3.5">
                      <span className="font-bold text-zinc-900 dark:text-white font-mono">
                        {e.event_type}
                      </span>
                    </td>

                    <td className="px-4 py-3.5">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                          e.severity === "critical"
                            ? "bg-red-500/10 text-red-600 dark:text-red-400"
                            : e.severity === "warning"
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        }`}
                      >
                        {e.severity}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 font-mono text-[11px] text-zinc-600 dark:text-zinc-300">
                      {e.email || e.user_id || "Anonymous"}
                    </td>

                    <td className="px-4 py-3.5 text-zinc-400 font-mono text-[11px]">
                      {e.ip_address || "—"}
                    </td>

                    <td className="px-5 py-3.5 text-right text-zinc-400">
                      {new Date(e.created_at).toLocaleString()}
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
    </div>
  );
}
