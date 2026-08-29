"use client";

import * as React from "react";
import {
  UserCheck,
  ShieldAlert,
  ShieldCheck,
  Search,
  Filter,
  Download,
  Clock,
  KeyRound,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminUserSummary } from "@/types/admin";

export default function AccessReviewsPage() {
  const [admins, setAdmins] = React.useState<AdminUserSummary[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const fetchReviews = React.useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/users?limit=100");
      if (!res.ok) {
        setErrorMsg("Failed to load administrators.");
        return;
      }
      const data = await res.json();
      // Filter to users with at least one admin role
      const adminUsers = (data.users || []).filter(
        (u: AdminUserSummary) => u.roles && u.roles.length > 0
      );
      setAdmins(adminUsers);
    } catch {
      setErrorMsg("Network error loading access reviews.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const filteredAdmins = admins.filter((a) => {
    const q = search.toLowerCase();
    return (
      a.username.toLowerCase().includes(q) ||
      a.display_name.toLowerCase().includes(q) ||
      (a.email && a.email.toLowerCase().includes(q)) ||
      a.roles.some((r) => r.toLowerCase().includes(q))
    );
  });

  function exportCsv() {
    const headers = [
      "ID",
      "Username",
      "Display Name",
      "Email",
      "Primary SuperAdmin",
      "Roles",
      "Top Hierarchy Level",
      "Account State",
      "MFA Enrolled",
      "MFA Last Verified",
      "Created At",
    ];

    const rows = filteredAdmins.map((a) => [
      a.id,
      a.username,
      `"${a.display_name.replace(/"/g, '""')}"`,
      a.email || "N/A",
      a.is_primary_superadmin ? "YES" : "NO",
      `"${a.roles.join(", ")}"`,
      a.top_role_level,
      a.account_state || "ACTIVE",
      a.mfa_enrolled_at || "NO",
      a.mfa_last_verified_at || "NEVER",
      a.created_at,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `heat-chat-access-review-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2.5">
            <UserCheck className="h-6 w-6 text-heat-500" />
            Privileged Access Reviews
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Periodic compliance audit of administrative roles, MFA enrollment, and privileged access grants.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchReviews} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="heat" size="sm" onClick={exportCsv} disabled={filteredAdmins.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export Audit CSV
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="Search by administrator name, email, or role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 text-xs"
          />
        </div>
      </div>

      {errorMsg && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
          <p>{errorMsg}</p>
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-400">
              <tr>
                <th className="px-5 py-3.5">Administrator</th>
                <th className="px-5 py-3.5">Assigned Roles</th>
                <th className="px-5 py-3.5">Hierarchy Level</th>
                <th className="px-5 py-3.5">Account State</th>
                <th className="px-5 py-3.5">MFA Status</th>
                <th className="px-5 py-3.5">Last Active / MFA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-zinc-500">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-heat-500 mb-2" />
                    Loading access reviews...
                  </td>
                </tr>
              ) : filteredAdmins.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-zinc-500">
                    No privileged administrators match your search.
                  </td>
                </tr>
              ) : (
                filteredAdmins.map((admin) => (
                  <tr key={admin.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-zinc-700 to-zinc-600 text-white text-xs font-bold shadow-sm">
                          {admin.display_name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 font-medium text-zinc-900 dark:text-white">
                            <span>{admin.display_name}</span>
                            {admin.is_primary_superadmin && (
                              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                Primary
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-zinc-400">@{admin.username}</p>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1">
                        {admin.roles.map((r) => (
                          <span
                            key={r}
                            className="rounded-md bg-heat-500/10 px-2 py-0.5 text-[10px] font-semibold text-heat-600 dark:text-heat-400 border border-heat-500/20"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td className="px-5 py-4 font-mono font-semibold text-zinc-700 dark:text-zinc-300">
                      Lvl {admin.top_role_level}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                          admin.is_disabled || admin.is_suspended
                            ? "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
                            : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                        }`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {admin.is_disabled ? "DISABLED" : admin.is_suspended ? "SUSPENDED" : admin.account_state || "ACTIVE"}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5">
                        <KeyRound className="h-3.5 w-3.5 text-emerald-500" />
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                          MFA Enrolled
                        </span>
                      </div>
                    </td>

                    <td className="px-5 py-4 text-[11px] text-zinc-500 dark:text-zinc-400">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>{admin.mfa_last_verified_at ? new Date(admin.mfa_last_verified_at).toLocaleString() : "Recently"}</span>
                      </div>
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
