"use client";

import * as React from "react";
import Link from "next/link";
import {
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  RotateCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface DeletionOperation {
  id: string;
  target_user_id: string;
  target_email: string | null;
  target_username: string | null;
  target_display_name: string | null;
  actor_user_id: string;
  reason: string;
  state: string;
  last_error: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
  is_stuck: boolean;
}

interface Summary {
  total: number;
  stuck: number;
  failed: number;
  in_progress: number;
  timeoutMinutes: number;
}

export default function AdminDeletionOperationsPage() {
  const [operations, setOperations] = React.useState<DeletionOperation[]>([]);
  const [summary, setSummary] = React.useState<Summary | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = React.useState(false);
  const [reconcilingId, setReconcilingId] = React.useState<string | null>(null);
  const [actionMessage, setActionMessage] = React.useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchOperations = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [opsRes, meRes] = await Promise.all([
        fetch("/api/admin/users/deletions?timeoutMinutes=5"),
        fetch("/api/admin/auth/me"),
      ]);

      if (opsRes.ok) {
        const data = await opsRes.json();
        setOperations(data.operations || []);
        setSummary(data.summary || null);
      }
      if (meRes.ok) {
        const meData = await meRes.json();
        setIsSuperAdmin(Boolean(meData.user?.isSuperAdmin));
      }
    } catch (err) {
      console.error("Failed to load deletion operations:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchOperations();
  }, [fetchOperations]);

  const handleReconcile = async (operationId: string) => {
    setReconcilingId(operationId);
    setActionMessage(null);

    try {
      const res = await fetch(`/api/admin/users/deletions/${operationId}/reconcile`, {
        method: "POST",
      });

      const data = await res.json();
      if (!res.ok) {
        setActionMessage({
          type: "error",
          text: data.error || "Failed to reconcile deletion operation.",
        });
        return;
      }

      setActionMessage({
        type: "success",
        text: `Operation ${operationId.slice(0, 8)}... successfully reconciled and completed.`,
      });
      fetchOperations();
    } catch (err) {
      console.error("Reconciliation error:", err);
      setActionMessage({
        type: "error",
        text: "Network error during reconciliation.",
      });
    } finally {
      setReconcilingId(null);
    }
  };

  const getStateBadge = (state: string, isStuck: boolean) => {
    if (state === "COMPLETED") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-[11px] font-bold text-green-700 dark:bg-green-950/60 dark:text-green-400">
          <CheckCircle2 className="h-3 w-3" />
          COMPLETED
        </span>
      );
    }
    if (state === "FAILED_REQUIRES_RECONCILIATION" || isStuck) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-bold text-red-700 dark:bg-red-950/60 dark:text-red-400">
          <AlertTriangle className="h-3 w-3" />
          {state === "FAILED_REQUIRES_RECONCILIATION" ? "FAILED (NEEDS RECONCILIATION)" : `STUCK (${state})`}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
        <RotateCw className="h-3 w-3 animate-spin" />
        {state}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/users"
              className="inline-flex items-center text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            >
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              Users
            </Link>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white mt-1">
            User Deletion Operations
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Audit durable deletion state machine executions, inspect stuck tasks, and reconcile failed operations.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchOperations}
          disabled={isLoading}
          className="gap-2 text-xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Summary Stat Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
            <span className="text-xs font-semibold text-zinc-500">Total Operations</span>
            <div className="mt-2 text-2xl font-black text-zinc-900 dark:text-white">{summary.total}</div>
            <p className="mt-1 text-[11px] text-zinc-400">All-time tracked deletions</p>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
            <span className="text-xs font-semibold text-zinc-500">Stuck Deletions</span>
            <div
              className={`mt-2 text-2xl font-black ${
                summary.stuck > 0 ? "text-red-600 dark:text-red-400" : "text-zinc-900 dark:text-white"
              }`}
            >
              {summary.stuck}
            </div>
            <p className="mt-1 text-[11px] text-zinc-400">&gt; {summary.timeoutMinutes}m without progress</p>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
            <span className="text-xs font-semibold text-zinc-500">Requires Reconciliation</span>
            <div
              className={`mt-2 text-2xl font-black ${
                summary.failed > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
              }`}
            >
              {summary.failed}
            </div>
            <p className="mt-1 text-[11px] text-zinc-400">Actionable failure states</p>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
            <span className="text-xs font-semibold text-zinc-500">Active Pipeline</span>
            <div className="mt-2 text-2xl font-black text-zinc-900 dark:text-white">{summary.in_progress}</div>
            <p className="mt-1 text-[11px] text-zinc-400">Currently executing stages</p>
          </div>
        </div>
      )}

      {/* Alert Messages */}
      {actionMessage && (
        <div
          className={`rounded-2xl p-4 text-xs font-semibold border flex items-center justify-between ${
            actionMessage.type === "success"
              ? "bg-green-500/10 text-green-700 border-green-500/20 dark:text-green-400"
              : "bg-red-500/10 text-red-700 border-red-500/20 dark:text-red-400"
          }`}
        >
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="opacity-70 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {/* Operations Table */}
      <div className="rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-100 bg-zinc-50/50 text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900">
              <tr>
                <th className="px-5 py-3.5">Operation ID</th>
                <th className="px-5 py-3.5">Target User</th>
                <th className="px-5 py-3.5">Current State</th>
                <th className="px-5 py-3.5">Retry Count</th>
                <th className="px-5 py-3.5">Last Error</th>
                <th className="px-5 py-3.5">Timestamps</th>
                <th className="px-5 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {isLoading && operations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-zinc-400">
                    Loading deletion operations...
                  </td>
                </tr>
              ) : operations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-zinc-400">
                    No user deletion operations on record.
                  </td>
                </tr>
              ) : (
                operations.map((op) => (
                  <tr key={op.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                    <td className="px-5 py-4 font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                      {op.id.slice(0, 8)}...
                    </td>
                    <td className="px-5 py-4">
                      <div className="space-y-0.5">
                        <p className="font-bold text-zinc-900 dark:text-white">
                          {op.target_display_name || op.target_username || op.target_user_id.slice(0, 8)}
                        </p>
                        <p className="text-[11px] text-zinc-400">{op.target_email || `@${op.target_username}`}</p>
                      </div>
                    </td>
                    <td className="px-5 py-4">{getStateBadge(op.state, op.is_stuck)}</td>
                    <td className="px-5 py-4 font-mono">{op.retry_count}</td>
                    <td className="px-5 py-4 max-w-xs truncate text-[11px] text-red-600 dark:text-red-400">
                      {op.last_error || "—"}
                    </td>
                    <td className="px-5 py-4 text-[11px] text-zinc-500">
                      <div>Created: {new Date(op.created_at).toLocaleTimeString()}</div>
                      <div>Updated: {new Date(op.updated_at).toLocaleTimeString()}</div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      {(op.state === "FAILED_REQUIRES_RECONCILIATION" || op.is_stuck) && isSuperAdmin && (
                        <Button
                          variant="heat"
                          size="sm"
                          disabled={reconcilingId === op.id}
                          onClick={() => handleReconcile(op.id)}
                          className="h-7 text-xs font-bold"
                        >
                          {reconcilingId === op.id ? "Reconciling..." : "Reconcile"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
