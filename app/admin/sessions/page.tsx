"use client";

import * as React from "react";
import Link from "next/link";
import { Radio, Users, Search, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminUserSummary } from "@/types/admin";

export default function AdminSessionsPage() {
  const [users, setUsers] = React.useState<AdminUserSummary[]>([]);
  const [search, setSearch] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchUsers = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: "1", limit: "25" });
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/admin/users?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (err) {
      console.error("Failed to load sessions:", err);
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  React.useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleRevokeAll = async (userId: string, username: string) => {
    const reason = prompt(`Reason for invalidating all active sessions for @${username}:`);
    if (!reason || reason.trim().length < 3) return;

    try {
      const res = await fetch(`/api/admin/users/${userId}/revoke-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        alert(`Sessions revoked for @${username}.`);
        fetchUsers();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to revoke sessions.");
      }
    } catch (err) {
      console.error("Revoke error:", err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
          Active Sessions & Invalidation
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Force logout users and terminate JWT/session tokens across all devices immediately.
        </p>
      </div>

      {/* Search Input */}
      <div className="max-w-md">
        <Input
          placeholder="Search user to terminate sessions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-xs"
        />
      </div>

      {/* Sessions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {users.map((u) => (
          <div
            key={u.id}
            className="flex flex-col justify-between rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 space-y-4"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-zinc-900 dark:text-white">
                  {u.display_name}
                </span>
                <span className="text-xs text-zinc-400">@{u.username}</span>
              </div>
              <p className="mt-1 text-[11px] text-zinc-400">
                Last force-logout:{" "}
                {u.force_logout_at ? new Date(u.force_logout_at).toLocaleString() : "Never"}
              </p>
            </div>

            <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800 flex items-center justify-between">
              <span className="text-xs capitalize text-zinc-500">Status: {u.status}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRevokeAll(u.id, u.username)}
                className="gap-1.5 text-xs text-amber-600 hover:text-amber-700"
              >
                <Radio className="h-3.5 w-3.5" />
                <span>Force Logout</span>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
