"use client";

import * as React from "react";
import Link from "next/link";
import {
  Users,
  MessageSquare,
  Paperclip,
  AlertTriangle,
  Lock,
  Activity,
  UserCheck,
  TrendingUp,
  RefreshCw,
  Plus,
  Shield,
  Search,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AdminDashboardMetrics } from "@/types/admin";

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = React.useState<AdminDashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [lastRefreshed, setLastRefreshed] = React.useState<Date>(new Date());

  const fetchMetrics = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/metrics");
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
        setLastRefreshed(new Date());
      }
    } catch (err) {
      console.error("Failed to load metrics:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000); // 30s auto-refresh
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  return (
    <div className="space-y-6">
      {/* Header & Quick Action Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
            Administrative Control Center
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Realtime platform telemetry, moderation, and security operations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-zinc-400">
            Updated {lastRefreshed.toLocaleTimeString()}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchMetrics}
            disabled={isLoading}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>

          <Link href="/admin/users">
            <Button variant="heat" size="sm" className="gap-1.5 text-xs shadow-sm shadow-heat-500/20">
              <Plus className="h-3.5 w-3.5" />
              <span>Manage Users</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Primary KPI Metrics Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Users */}
        <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Total Users</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-heat-500/10 text-heat-600 dark:text-heat-400">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
              {metrics?.total_users ?? "—"}
            </span>
            <span className="text-[11px] font-semibold text-green-600 dark:text-green-400">
              {metrics?.verified_users ?? 0} verified
            </span>
          </div>
          <p className="mt-1 text-[11px] text-zinc-400">
            {metrics?.suspended_users ?? 0} suspended
          </p>
        </div>

        {/* Active Conversations */}
        <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Conversations</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <MessageSquare className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
              {metrics?.total_conversations ?? "—"}
            </span>
            <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
              Active Rooms
            </span>
          </div>
          <p className="mt-1 text-[11px] text-zinc-400">Direct & Group channels</p>
        </div>

        {/* Messages Volume */}
        <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Total Messages</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
              {metrics?.total_messages ?? "—"}
            </span>
            <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
              +{metrics?.messages_today ?? 0} today
            </span>
          </div>
          <p className="mt-1 text-[11px] text-zinc-400">Encrypted transmission</p>
        </div>

        {/* Pending Moderation Reports */}
        <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Pending Reports</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-red-500/10 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
              {metrics?.pending_reports ?? 0}
            </span>
            <span className="text-[11px] font-semibold text-red-600 dark:text-red-400">
              Requires review
            </span>
          </div>
          <p className="mt-1 text-[11px] text-zinc-400">
            {metrics?.security_events_today ?? 0} security events (24h)
          </p>
        </div>
      </div>

      {/* Quick Access Operational Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Moderation & Safety Hub */}
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-heat-500" />
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Moderation & Safety Hub</h2>
            </div>
            <Link
              href="/admin/reports"
              className="text-xs font-semibold text-heat-600 hover:text-heat-500 dark:text-heat-400 flex items-center gap-1"
            >
              <span>View Reports Inbox</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link
              href="/admin/reports?status=New"
              className="rounded-2xl border border-zinc-100 bg-zinc-50/50 p-4 transition-all hover:border-heat-500/30 hover:bg-heat-500/5 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <span className="text-[11px] font-medium text-zinc-500">Unassigned Reports</span>
              <div className="mt-2 text-xl font-bold text-zinc-900 dark:text-white">
                {metrics?.pending_reports ?? 0}
              </div>
            </Link>

            <Link
              href="/admin/users?status=suspended"
              className="rounded-2xl border border-zinc-100 bg-zinc-50/50 p-4 transition-all hover:border-heat-500/30 hover:bg-heat-500/5 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <span className="text-[11px] font-medium text-zinc-500">Suspended Users</span>
              <div className="mt-2 text-xl font-bold text-zinc-900 dark:text-white">
                {metrics?.suspended_users ?? 0}
              </div>
            </Link>

            <Link
              href="/admin/security"
              className="rounded-2xl border border-zinc-100 bg-zinc-50/50 p-4 transition-all hover:border-heat-500/30 hover:bg-heat-500/5 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <span className="text-[11px] font-medium text-zinc-500">Security Events</span>
              <div className="mt-2 text-xl font-bold text-zinc-900 dark:text-white">
                {metrics?.security_events_today ?? 0}
              </div>
            </Link>
          </div>

          <div className="rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-900/80 text-xs text-zinc-600 dark:text-zinc-400 space-y-1">
            <span className="font-semibold text-zinc-900 dark:text-white">Privacy Guard Active:</span>
            <p className="leading-relaxed">
              Administrative access is limited to message and conversation metadata. Private message bodies require explicit break-glass authorization with recorded justification.
            </p>
          </div>
        </div>

        {/* System Operations & Quick Tools */}
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 space-y-4">
          <div className="flex items-center gap-2 border-b border-zinc-100 pb-3 dark:border-zinc-800">
            <Activity className="h-4 w-4 text-heat-500" />
            <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Quick Tools</h2>
          </div>

          <div className="space-y-2">
            <Link
              href="/admin/users"
              className="flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <span className="flex items-center gap-2">
                <Search className="h-4 w-4 text-zinc-400" />
                <span>Search & Audit User</span>
              </span>
              <span className="text-zinc-400">→</span>
            </Link>

            <Link
              href="/admin/roles"
              className="flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <span className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-zinc-400" />
                <span>Manage Roles & Permissions</span>
              </span>
              <span className="text-zinc-400">→</span>
            </Link>

            <Link
              href="/admin/system-health"
              className="flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <span className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-zinc-400" />
                <span>System Health Latency</span>
              </span>
              <span className="text-zinc-400">→</span>
            </Link>

            <Link
              href="/admin/audit-logs"
              className="flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <span className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-zinc-400" />
                <span>Immutable Audit Logs</span>
              </span>
              <span className="text-zinc-400">→</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
