"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Key, ShieldCheck } from "lucide-react";
import type { AdminPermission } from "@/types/admin";

export default function AdminPermissionsPage() {
  const [permissions, setPermissions] = React.useState<AdminPermission[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    async function fetchPermissions() {
      try {
        const res = await fetch("/api/admin/permissions");
        if (res.ok) {
          const data = await res.json();
          setPermissions(data.permissions || []);
        }
      } catch (err) {
        console.error("Failed to load permissions:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchPermissions();
  }, []);

  // Group by category
  const categories = React.useMemo(() => {
    const map: Record<string, AdminPermission[]> = {};
    permissions.forEach((p) => {
      if (!map[p.category]) map[p.category] = [];
      map[p.category].push(p);
    });
    return map;
  }, [permissions]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link
          href="/admin/roles"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Roles</span>
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
          Permission Catalog
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {permissions.length} granular capabilities enforced server-side.
        </p>
      </div>

      {/* Permission Categories Grid */}
      <div className="space-y-6">
        {Object.entries(categories).map(([cat, perms]) => (
          <div
            key={cat}
            className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 space-y-4"
          >
            <div className="flex items-center gap-2 border-b border-zinc-100 pb-3 dark:border-zinc-800">
              <Key className="h-4 w-4 text-heat-500" />
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                {cat} ({perms.length})
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {perms.map((p) => (
                <div
                  key={p.id}
                  className="rounded-2xl border border-zinc-100 bg-zinc-50/50 p-3.5 dark:border-zinc-800 dark:bg-zinc-900 space-y-1"
                >
                  <span className="font-mono text-xs font-bold text-heat-600 dark:text-heat-400">
                    {p.key}
                  </span>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {p.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
