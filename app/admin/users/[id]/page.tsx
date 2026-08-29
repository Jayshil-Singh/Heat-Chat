"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Shield,
  ShieldCheck,
  Radio,
  UserX,
  UserCheck,
  AlertTriangle,
  ScrollText,
  Clock,
  CheckCircle,
  AlertCircle,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import type { AdminRole, AdminUserSummary, ModerationReport, AdminAuditLog } from "@/types/admin";

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const userId = params.id;

  const [user, setUser] = React.useState<AdminUserSummary | null>(null);
  const [reports, setReports] = React.useState<ModerationReport[]>([]);
  const [auditHistory, setAuditHistory] = React.useState<AdminAuditLog[]>([]);
  const [allRoles, setAllRoles] = React.useState<AdminRole[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  // Role Assignment State
  const [selectedRole, setSelectedRole] = React.useState("");
  const [roleReason, setRoleReason] = React.useState("");
  const [roleError, setRoleError] = React.useState<string | null>(null);
  const [isAssigning, setIsAssigning] = React.useState(false);

  const fetchUserDetail = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [uRes, rRes] = await Promise.all([
        fetch(`/api/admin/users/${userId}`),
        fetch("/api/admin/roles"),
      ]);

      if (uRes.ok) {
        const uData = await uRes.json();
        setUser(uData.user);
        setReports(uData.reports || []);
        setAuditHistory(uData.auditHistory || []);
      }
      if (rRes.ok) {
        const rData = await rRes.json();
        setAllRoles(rData.roles || []);
      }
    } catch (err) {
      console.error("Failed to load user details:", err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  React.useEffect(() => {
    fetchUserDetail();
  }, [fetchUserDetail]);

  const handleAssignRole = async () => {
    if (!selectedRole || !roleReason.trim()) {
      setRoleError("Select a role and enter a justification reason.");
      return;
    }

    setIsAssigning(true);
    setRoleError(null);

    try {
      const res = await fetch(`/api/admin/users/${userId}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId: selectedRole, reason: roleReason.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setRoleError(data.error || "Failed to assign role.");
        return;
      }

      setSelectedRole("");
      setRoleReason("");
      fetchUserDetail();
    } catch (err) {
      console.error("Role assign error:", err);
      setRoleError("Unexpected network error occurred.");
    } finally {
      setIsAssigning(false);
    }
  };

  const handleRemoveRole = async (roleName: string) => {
    const targetRole = allRoles.find((r) => r.name === roleName);
    if (!targetRole) return;

    const reason = prompt(`Enter reason for revoking role ${roleName}:`);
    if (!reason || reason.trim().length < 3) return;

    try {
      const res = await fetch(
        `/api/admin/users/${userId}/roles?roleId=${targetRole.id}&reason=${encodeURIComponent(reason)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        fetchUserDetail();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to remove role.");
      }
    } catch (err) {
      console.error("Failed to remove role:", err);
    }
  };

  if (isLoading) {
    return (
      <div className="py-20 text-center text-xs text-zinc-400">
        Loading user account details...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="py-20 text-center space-y-4">
        <p className="text-sm font-bold text-zinc-900 dark:text-white">User not found.</p>
        <Link href="/admin/users">
          <Button variant="outline" size="sm">Back to Users</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Navigation & Actions */}
      <div className="flex items-center justify-between">
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Directory</span>
        </Link>
      </div>

      {/* User Header Profile Card */}
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar
              src={user.avatar_url || undefined}
              alt={user.display_name}
              name={user.display_name}
              size="lg"
            />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-zinc-900 dark:text-white">
                  {user.display_name}
                </h1>
                {user.is_suspended && (
                  <span className="rounded-full bg-red-500/10 px-2.5 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400">
                    Suspended
                  </span>
                )}
                {user.is_disabled && (
                  <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[10px] font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    Disabled
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400">@{user.username} • ID: {user.id}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {user.roles.map((r) => (
              <span
                key={r}
                className="inline-flex items-center gap-1 rounded-full bg-heat-500/10 px-3 py-1 text-xs font-bold text-heat-700 dark:text-heat-300 border border-heat-500/20"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>{r}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveRole(r)}
                  className="ml-1 text-zinc-400 hover:text-red-500"
                  title={`Revoke role ${r}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Bio & Details Grid */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-zinc-100 pt-4 dark:border-zinc-800 text-xs">
          <div>
            <span className="text-[10px] uppercase font-bold text-zinc-400">Account Created</span>
            <p className="font-semibold text-zinc-900 dark:text-white">
              {new Date(user.created_at).toLocaleString()}
            </p>
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-zinc-400">Status</span>
            <p className="font-semibold text-zinc-900 dark:text-white capitalize">{user.status}</p>
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-zinc-400">Bio</span>
            <p className="text-zinc-600 dark:text-zinc-300 italic">{user.bio || "No bio set."}</p>
          </div>
        </div>
      </div>

      {/* Role Assignment Card */}
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 space-y-4">
        <div className="flex items-center gap-2 border-b border-zinc-100 pb-3 dark:border-zinc-800">
          <Shield className="h-4 w-4 text-heat-500" />
          <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
            Assign Administrative Role
          </h2>
        </div>

        {roleError && (
          <div className="rounded-xl bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{roleError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">Select Role</label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
            >
              <option value="">-- Choose Role --</option>
              {allRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} (Level {r.hierarchy_level})
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">Justification Reason</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="text"
                value={roleReason}
                onChange={(e) => setRoleReason(e.target.value)}
                placeholder="Operational reason for granting privilege..."
                className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
              />
              <Button
                variant="heat"
                size="sm"
                disabled={isAssigning || !selectedRole}
                onClick={handleAssignRole}
              >
                {isAssigning ? "Assigning..." : "Assign Role"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Moderation Reports Filed against this user */}
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 space-y-4">
        <div className="flex items-center gap-2 border-b border-zinc-100 pb-3 dark:border-zinc-800">
          <AlertTriangle className="h-4 w-4 text-heat-500" />
          <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
            Moderation Reports ({reports.length})
          </h2>
        </div>

        {reports.length === 0 ? (
          <p className="text-xs text-zinc-400 italic">No moderation reports on record for this user.</p>
        ) : (
          <div className="space-y-2">
            {reports.map((rep) => (
              <div
                key={rep.id}
                className="flex items-center justify-between rounded-2xl border border-zinc-100 bg-zinc-50/50 p-3.5 text-xs dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-zinc-900 dark:text-white">{rep.reason}</span>
                    <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {rep.status}
                    </span>
                  </div>
                  <p className="text-zinc-500 dark:text-zinc-400">{rep.description || "No description."}</p>
                </div>
                <span className="text-[11px] text-zinc-400">
                  {new Date(rep.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Audit History Trail on this User */}
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 space-y-4">
        <div className="flex items-center gap-2 border-b border-zinc-100 pb-3 dark:border-zinc-800">
          <ScrollText className="h-4 w-4 text-heat-500" />
          <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
            Audit Trail ({auditHistory.length})
          </h2>
        </div>

        {auditHistory.length === 0 ? (
          <p className="text-xs text-zinc-400 italic">No administrative actions logged on this user yet.</p>
        ) : (
          <div className="space-y-2">
            {auditHistory.map((log) => (
              <div
                key={log.id}
                className="rounded-2xl border border-zinc-100 bg-zinc-50/50 p-3.5 text-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-heat-600 dark:text-heat-400">{log.action}</span>
                  <span className="text-[11px] text-zinc-400">
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-zinc-600 dark:text-zinc-300">
                  By <span className="font-semibold">{log.actor_role}</span>: {log.reason}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
