"use client";

import * as React from "react";
import Link from "next/link";
import {
  Shield,
  Key,
  Plus,
  CheckCircle,
  AlertCircle,
  Lock,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AdminRole, AdminPermission } from "@/types/admin";

export default function AdminRolesPage() {
  const [roles, setRoles] = React.useState<AdminRole[]>([]);
  const [permissions, setPermissions] = React.useState<AdminPermission[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  // Create Role State
  const [showCreate, setShowCreate] = React.useState(false);
  const [newRoleName, setNewRoleName] = React.useState("");
  const [newRoleDesc, setNewRoleDesc] = React.useState("");
  const [newRoleLevel, setNewRoleLevel] = React.useState(50);
  const [selectedPerms, setSelectedPerms] = React.useState<string[]>([]);
  const [createReason, setCreateReason] = React.useState("");
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const fetchRolesAndPerms = React.useCallback(async () => {
    setIsLoading(true);
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
      console.error("Failed to load roles:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchRolesAndPerms();
  }, [fetchRolesAndPerms]);

  const handleCreateRole = async () => {
    if (!newRoleName.trim() || !newRoleDesc.trim()) {
      setCreateError("Name and description are required.");
      return;
    }

    setIsSubmitting(true);
    setCreateError(null);

    try {
      const res = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newRoleName.trim(),
          description: newRoleDesc.trim(),
          hierarchyLevel: newRoleLevel,
          permissionKeys: selectedPerms,
          reason: createReason.trim() || "Custom administrative role created",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error || "Failed to create role.");
        return;
      }

      setShowCreate(false);
      setNewRoleName("");
      setNewRoleDesc("");
      setSelectedPerms([]);
      fetchRolesAndPerms();
    } catch (err) {
      console.error("Create role error:", err);
      setCreateError("Unexpected error occurred.");
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
            Roles & Permissions Matrix
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Hierarchical role-based access control (RBAC). Highest hierarchy level: SuperAdmin (100).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/admin/permissions">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Key className="h-3.5 w-3.5" />
              <span>View Permission Catalog</span>
            </Button>
          </Link>

          <Button
            variant="heat"
            size="sm"
            onClick={() => setShowCreate(!showCreate)}
            className="gap-1.5 text-xs shadow-sm shadow-heat-500/20"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Create Custom Role</span>
          </Button>
        </div>
      </div>

      {/* Create Role Drawer/Form */}
      {showCreate && (
        <div className="rounded-3xl border border-heat-500/30 bg-heat-500/5 p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-heat-500/20 pb-3">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-heat-500" />
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                New Custom Administrative Role
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            >
              Cancel
            </button>
          </div>

          {createError && (
            <div className="rounded-xl bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{createError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">Role Name</label>
              <input
                type="text"
                placeholder="e.g. ContentReviewer"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
              />
            </div>

            <div>
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">Hierarchy Level (1-99)</label>
              <input
                type="number"
                min={1}
                max={99}
                value={newRoleLevel}
                onChange={(e) => setNewRoleLevel(parseInt(e.target.value, 10))}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
              />
            </div>

            <div>
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">Description</label>
              <input
                type="text"
                placeholder="Operational purpose..."
                value={newRoleDesc}
                onChange={(e) => setNewRoleDesc(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Select Permissions</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              {permissions.map((p) => {
                const checked = selectedPerms.includes(p.key);
                return (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 p-1 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer hover:text-heat-500"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedPerms([...selectedPerms, p.key]);
                        } else {
                          setSelectedPerms(selectedPerms.filter((k) => k !== p.key));
                        }
                      }}
                      className="rounded text-heat-500"
                    />
                    <span className="truncate">{p.key}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="heat"
              size="sm"
              disabled={isSubmitting}
              onClick={handleCreateRole}
            >
              {isSubmitting ? "Creating..." : "Save Role"}
            </Button>
          </div>
        </div>
      )}

      {/* Roles Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {roles.map((role) => (
          <div
            key={role.id}
            className="flex flex-col justify-between rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 space-y-4"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-heat-500/10 text-heat-600 dark:text-heat-400">
                    <Shield className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-zinc-900 dark:text-white">
                      {role.name}
                    </h3>
                    <span className="text-[10px] font-semibold text-zinc-400">
                      Level {role.hierarchy_level} {role.is_system && "• System"}
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                {role.description}
              </p>
            </div>

            <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-zinc-500">Granted Permissions</span>
                <span className="font-bold text-heat-600 dark:text-heat-400">
                  {role.permissions?.length ?? 0}
                </span>
              </div>

              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                {(role.permissions || []).map((perm) => (
                  <span
                    key={perm}
                    className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-mono text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    {perm}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
