"use client";

import * as React from "react";
import {
  Settings,
  Save,
  CheckCircle,
  AlertCircle,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SystemSetting } from "@/types/admin";

export default function AdminSettingsPage() {
  const [settings, setSettings] = React.useState<SystemSetting[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [editingKey, setEditingKey] = React.useState<string | null>(null);
  const [editValue, setEditValue] = React.useState<string>("");
  const [editReason, setEditReason] = React.useState<string>("");
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  const fetchSettings = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/settings");
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings || []);
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async (key: string) => {
    if (!editReason.trim() || editReason.trim().length < 3) {
      setSaveError("A justification reason (min 3 chars) is required.");
      return;
    }

    let parsedValue: unknown;
    try {
      parsedValue = JSON.parse(editValue);
    } catch {
      parsedValue = editValue;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: parsedValue, reason: editReason.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error || "Failed to update setting.");
        return;
      }

      setEditingKey(null);
      setEditReason("");
      fetchSettings();
    } catch (err) {
      console.error("Save error:", err);
      setSaveError("Unexpected error occurred.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
          System & Feature Configuration
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Global platform flags, storage quotas, message limits, and authentication policies.
        </p>
      </div>

      {/* Settings Table Card */}
      <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-100 bg-zinc-50/75 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
              <tr>
                <th className="px-5 py-3.5">Setting Key</th>
                <th className="px-4 py-3.5">Category</th>
                <th className="px-4 py-3.5">Value</th>
                <th className="px-4 py-3.5">Description</th>
                <th className="px-5 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-zinc-400">
                    Loading configuration settings...
                  </td>
                </tr>
              ) : (
                settings.map((s) => (
                  <tr key={s.key} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40 transition-colors">
                    <td className="px-5 py-3.5 font-mono font-bold text-heat-600 dark:text-heat-400">
                      {s.key}
                    </td>

                    <td className="px-4 py-3.5 font-semibold text-zinc-700 dark:text-zinc-300">
                      {s.category}
                    </td>

                    <td className="px-4 py-3.5">
                      {editingKey === s.key ? (
                        <div className="space-y-2 max-w-sm">
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full rounded-xl border border-zinc-200 bg-white p-2 text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white font-mono"
                          />
                          <input
                            type="text"
                            placeholder="Reason for change..."
                            value={editReason}
                            onChange={(e) => setEditReason(e.target.value)}
                            className="w-full rounded-xl border border-zinc-200 bg-white p-2 text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
                          />
                          {saveError && <p className="text-[10px] text-red-500">{saveError}</p>}
                        </div>
                      ) : (
                        <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                          {JSON.stringify(s.value)}
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 text-zinc-500 dark:text-zinc-400">
                      {s.description}
                    </td>

                    <td className="px-5 py-3.5 text-right">
                      {editingKey === s.key ? (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingKey(null)}
                            className="h-8 px-2 text-xs"
                          >
                            Cancel
                          </Button>
                          <Button
                            variant="heat"
                            size="sm"
                            disabled={isSaving}
                            onClick={() => handleSave(s.key)}
                            className="h-8 px-2 text-xs"
                          >
                            {isSaving ? "Saving..." : "Save"}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingKey(s.key);
                            setEditValue(typeof s.value === "string" ? s.value : JSON.stringify(s.value));
                            setEditReason("");
                            setSaveError(null);
                          }}
                          className="h-8 px-2 text-xs font-semibold text-heat-600 hover:text-heat-700"
                        >
                          Edit
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
