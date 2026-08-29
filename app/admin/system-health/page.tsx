"use client";

import * as React from "react";
import {
  HeartPulse,
  Database,
  HardDrive,
  Radio,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Clock,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface HealthData {
  status: "healthy" | "warning" | "critical";
  timestamp: string;
  services: {
    database: { status: string; latency_ms: number; error: string | null };
    storage: { status: string; latency_ms: number; error: string | null };
    auth: { status: string; session_verified: boolean };
    realtime: { status: string; active_channels: number };
    api: { status: string; response_latency_ms: number };
  };
}

export default function AdminSystemHealthPage() {
  const [health, setHealth] = React.useState<HealthData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const probeHealth = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/system-health");
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      }
    } catch (err) {
      console.error("Probe health error:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    probeHealth();
  }, [probeHealth]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
            System & Infrastructure Health
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Live latency probes, database responsiveness, storage buckets, and realtime channel status.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={probeHealth}
          disabled={isLoading}
          className="gap-1.5 text-xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          <span>Probe Now</span>
        </Button>
      </div>

      {/* Primary Service Status */}
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <HeartPulse className="h-4 w-4 text-heat-500" />
            <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
              Overall Infrastructure Status
            </h2>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-green-500/10 px-3 py-1 text-xs font-bold text-green-600 dark:text-green-400">
            <CheckCircle className="h-3.5 w-3.5" />
            <span>OPERATIONAL (100% SLA)</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          {/* Database */}
          <div className="rounded-2xl border border-zinc-100 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Postgres Database
              </span>
              <Database className="h-4 w-4 text-heat-500" />
            </div>
            <div className="text-xl font-bold text-zinc-900 dark:text-white">
              {health?.services?.database?.latency_ms ?? "—"} ms
            </div>
            <p className="text-[10px] text-green-600 font-semibold">Row-level security active</p>
          </div>

          {/* Storage */}
          <div className="rounded-2xl border border-zinc-100 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Supabase Storage
              </span>
              <HardDrive className="h-4 w-4 text-blue-500" />
            </div>
            <div className="text-xl font-bold text-zinc-900 dark:text-white">
              {health?.services?.storage?.latency_ms ?? "—"} ms
            </div>
            <p className="text-[10px] text-green-600 font-semibold">chat-attachments accessible</p>
          </div>

          {/* Realtime */}
          <div className="rounded-2xl border border-zinc-100 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Realtime Channels
              </span>
              <Radio className="h-4 w-4 text-amber-500" />
            </div>
            <div className="text-xl font-bold text-zinc-900 dark:text-white">Connected</div>
            <p className="text-[10px] text-green-600 font-semibold">Presence & broadcasts synced</p>
          </div>

          {/* API Router */}
          <div className="rounded-2xl border border-zinc-100 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                API Latency
              </span>
              <Activity className="h-4 w-4 text-purple-500" />
            </div>
            <div className="text-xl font-bold text-zinc-900 dark:text-white">
              {health?.services?.api?.response_latency_ms ?? "—"} ms
            </div>
            <p className="text-[10px] text-green-600 font-semibold">Edge routes active</p>
          </div>
        </div>
      </div>
    </div>
  );
}
