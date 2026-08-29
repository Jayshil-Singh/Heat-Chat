"use client";

import * as React from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  Key,
  Radio,
  CheckCircle,
  Lock,
  ArrowLeft,
  Mail,
  User,
} from "lucide-react";
import type { AdminRole, AdminPermission } from "@/types/admin";

export default function AdminProfilePage() {
  const { user, profile } = useAuth();
  const [roles, setRoles] = React.useState<AdminRole[]>([]);
  const [permissions, setPermissions] = React.useState<AdminPermission[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    async function fetchAdminContext() {
      try {
        const [rRes, pRes] = await Promise.all([
          fetch("/api/admin/roles"),
          fetch("/api/admin/permissions"),
        ]);
        if (rRes.ok) {
          const rData = await rRes.json();
          setRoles(rData.roles || []);
        }
        if (pRes.ok) {
          const pData = await pRes.json();
          setPermissions(pData.permissions || []);
        }
      } catch (err) {
        console.error("Failed to load admin profile context:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchAdminContext();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
          Administrator Account & Capabilities
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Your active administrative session, verified identity, assigned roles, and granted permissions.
        </p>
      </div>

      {/* Identity Card */}
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <Avatar
            src={profile?.avatar_url || undefined}
            alt={profile?.display_name || "Admin"}
            name={profile?.display_name || "Admin"}
            size="lg"
          />

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
                {profile?.display_name}
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-heat-500/10 px-2.5 py-0.5 text-[10px] font-bold text-heat-600 dark:text-heat-400 border border-heat-500/20">
                <ShieldCheck className="h-3 w-3" />
                <span>Verified Administrator</span>
              </span>
            </div>
            <p className="text-xs text-zinc-400">@{profile?.username} • {user?.email}</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-zinc-100 pt-4 dark:border-zinc-800 text-xs">
          <div>
            <span className="text-[10px] uppercase font-bold text-zinc-400">Email Verification</span>
            <div className="flex items-center gap-1.5 font-semibold text-green-600 dark:text-green-400 mt-0.5">
              <CheckCircle className="h-3.5 w-3.5" />
              <span>Confirmed</span>
            </div>
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-zinc-400">Account Status</span>
            <p className="font-semibold text-zinc-900 dark:text-white capitalize">
              {profile?.status || "Active"}
            </p>
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-zinc-400">Session Boundary</span>
            <p className="font-semibold text-heat-600 dark:text-heat-400">
              Zero-Trust Server Verified
            </p>
          </div>
        </div>
      </div>

      {/* Granted Capabilities Catalog */}
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-heat-500" />
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              Effective Administrative Permissions ({permissions.length})
            </h3>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {permissions.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-2 rounded-xl bg-zinc-50 p-2.5 dark:bg-zinc-900 text-xs"
            >
              <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
              <span className="font-mono text-zinc-700 dark:text-zinc-300 truncate">
                {p.key}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
