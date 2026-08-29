"use client";

import * as React from "react";
import Link from "next/link";
import {
  Users,
  Search,
  Filter,
  Plus,
  Shield,
  MoreHorizontal,
  Lock,
  UserX,
  UserCheck,
  Radio,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Trash2,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { DeleteUserDialog } from "@/components/admin/delete-user-dialog";
import type { AdminUserSummary } from "@/types/admin";

export default function AdminUsersPage() {
  const [users, setUsers] = React.useState<AdminUserSummary[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = React.useState(false);
  const [deleteTargetUser, setDeleteTargetUser] = React.useState<AdminUserSummary | null>(null);

  // Modals state
  const [actionUser, setActionUser] = React.useState<AdminUserSummary | null>(null);
  const [actionType, setActionType] = React.useState<"suspend" | "restore" | "revoke" | null>(null);
  const [actionReason, setActionReason] = React.useState("");
  const [durationHours, setDurationHours] = React.useState(24);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const fetchUsers = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "15",
        status: statusFilter,
      });
      if (search.trim()) params.set("search", search.trim());

      const [res, meRes] = await Promise.all([
        fetch(`/api/admin/users?${params.toString()}`),
        fetch("/api/admin/auth/me"),
      ]);

      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      }
      if (meRes.ok) {
        const meData = await meRes.json();
        setIsSuperAdmin(Boolean(meData.user?.isSuperAdmin));
      }
    } catch (err) {
      console.error("Failed to load users:", err);
    } finally {
      setIsLoading(false);
    }
  }, [page, search, statusFilter]);

  React.useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleAction = async () => {
    if (!actionUser || !actionType) return;
    if (!actionReason.trim() || actionReason.trim().length < 3) {
      setActionError("A reason (minimum 3 characters) is required.");
      return;
    }

    setIsSubmitting(true);
    setActionError(null);

    try {
      let endpoint = "";
      let body: Record<string, unknown> = { reason: actionReason.trim() };

      if (actionType === "suspend") {
        endpoint = `/api/admin/users/${actionUser.id}/suspend`;
        body.durationHours = durationHours;
      } else if (actionType === "restore") {
        endpoint = `/api/admin/users/${actionUser.id}/restore`;
      } else if (actionType === "revoke") {
        endpoint = `/api/admin/users/${actionUser.id}/revoke-sessions`;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || "Action failed.");
        return;
      }

      setActionType(null);
      setActionUser(null);
      setActionReason("");
      fetchUsers();
    } catch (err) {
      console.error("Action error:", err);
      setActionError("Unexpected network error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
            User Management
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {total} registered platform users. Inspect accounts, audit sessions, and manage status.
          </p>
        </div>

        {isSuperAdmin && (
          <Link href="/admin/users/deletions">
            <Button variant="outline" size="sm" className="gap-2 text-xs font-semibold">
              <ShieldAlert className="h-3.5 w-3.5 text-red-500" />
              Deletion Operations
            </Button>
          </Link>
        )}
      </div>

      {/* Filters & Search Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            placeholder="Search by username or display name..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-100 bg-zinc-50/75 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
              <tr>
                <th className="px-5 py-3.5">User</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Roles</th>
                <th className="px-4 py-3.5">Joined</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-zinc-400">
                    Loading users directory...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-zinc-400">
                    No users matching criteria.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40 transition-colors">
                    <td className="px-5 py-3.5">
                      <Link href={`/admin/users/${u.id}`} className="flex items-center gap-3 group">
                        <Avatar
                          src={u.avatar_url || undefined}
                          alt={u.display_name}
                          name={u.display_name}
                          size="sm"
                        />
                        <div>
                          <span className="font-bold text-zinc-900 group-hover:text-heat-500 dark:text-white">
                            {u.display_name}
                          </span>
                          <p className="text-[11px] text-zinc-400">@{u.username}</p>
                        </div>
                      </Link>
                    </td>

                    <td className="px-4 py-3.5">
                      {u.is_disabled ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-[10px] font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                          Disabled
                        </span>
                      ) : u.is_suspended ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400">
                          Suspended
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2.5 py-0.5 text-[10px] font-bold text-green-600 dark:text-green-400">
                          Active
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3.5">
                      {u.roles.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {u.roles.map((r) => (
                            <span
                              key={r}
                              className="rounded-full bg-heat-500/10 px-2 py-0.5 text-[10px] font-bold text-heat-700 dark:text-heat-300 border border-heat-500/20"
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-zinc-400">Standard User</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 text-zinc-400">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>

                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/admin/users/${u.id}`}>
                          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs">
                            View
                          </Button>
                        </Link>

                        {u.is_suspended ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setActionUser(u);
                              setActionType("restore");
                              setActionReason("");
                              setActionError(null);
                            }}
                            className="h-8 px-2 text-xs text-green-600 hover:text-green-700"
                          >
                            Restore
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setActionUser(u);
                              setActionType("suspend");
                              setActionReason("");
                              setActionError(null);
                            }}
                            className="h-8 px-2 text-xs text-red-600 hover:text-red-700"
                          >
                            Suspend
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setActionUser(u);
                            setActionType("revoke");
                            setActionReason("");
                            setActionError(null);
                          }}
                          className="h-8 px-2 text-xs text-amber-600 hover:text-amber-700"
                          title="Force Logout / Revoke Sessions"
                        >
                          <Radio className="h-3.5 w-3.5" />
                        </Button>

                        {isSuperAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDeleteTargetUser(u);
                            }}
                            className="h-8 px-2 text-xs text-red-600 hover:text-red-700"
                            title="Permanently Delete User"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
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

      {/* Action Dialog Modal */}
      {actionType && actionUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                  actionType === "suspend"
                    ? "bg-red-500/10 text-red-600"
                    : actionType === "restore"
                    ? "bg-green-500/10 text-green-600"
                    : "bg-amber-500/10 text-amber-600"
                }`}
              >
                {actionType === "suspend" ? (
                  <UserX className="h-5 w-5" />
                ) : actionType === "restore" ? (
                  <UserCheck className="h-5 w-5" />
                ) : (
                  <Radio className="h-5 w-5" />
                )}
              </div>
              <div>
                <h3 className="font-bold text-sm text-zinc-900 dark:text-white capitalize">
                  {actionType} @{actionUser.username}
                </h3>
                <p className="text-[11px] text-zinc-400">All actions are recorded in immutable audit logs.</p>
              </div>
            </div>

            {actionError && (
              <div className="rounded-xl bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            {actionType === "suspend" && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                  Suspension Duration (Hours)
                </label>
                <select
                  value={durationHours}
                  onChange={(e) => setDurationHours(parseInt(e.target.value, 10))}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                >
                  <option value={24}>24 Hours (1 Day)</option>
                  <option value={72}>72 Hours (3 Days)</option>
                  <option value={168}>168 Hours (7 Days)</option>
                  <option value={720}>720 Hours (30 Days)</option>
                  <option value={0}>Indefinite / Permanent</option>
                </select>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                Reason & Justification (Mandatory)
              </label>
              <textarea
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder="Provide detailed justification for this administrative action..."
                className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
                rows={3}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setActionType(null);
                  setActionUser(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant={actionType === "suspend" ? "destructive" : "heat"}
                size="sm"
                disabled={isSubmitting}
                onClick={handleAction}
              >
                {isSubmitting ? "Processing..." : `Confirm ${actionType}`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* SuperAdmin Permanent User Deletion Dialog */}
      {deleteTargetUser && (
        <DeleteUserDialog
          user={deleteTargetUser}
          isOpen={Boolean(deleteTargetUser)}
          onClose={() => setDeleteTargetUser(null)}
          onSuccess={() => {
            setDeleteTargetUser(null);
            fetchUsers();
          }}
        />
      )}
    </div>
  );
}
