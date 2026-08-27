"use client";

import * as React from "react";
import { Settings, Moon, Sun, Monitor, Shield, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/components/layout/theme-provider";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  const { user, profile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-8">
      <div className="border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Settings
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Manage your account preferences and application appearance
        </p>
      </div>

      <div className="grid gap-6">
        {/* Account Section */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 space-y-4">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
            <Shield className="h-4 w-4 text-heat-500" />
            Account Overview
          </h2>
          <div className="space-y-2 text-xs text-zinc-600 dark:text-zinc-400">
            <p>
              <span className="font-semibold text-zinc-900 dark:text-zinc-200">
                Email:
              </span>{" "}
              {user?.email || "Not signed in"}
            </p>
            <p>
              <span className="font-semibold text-zinc-900 dark:text-zinc-200">
                Username:
              </span>{" "}
              @{profile?.username || "pending"}
            </p>
            <p>
              <span className="font-semibold text-zinc-900 dark:text-zinc-200">
                User ID:
              </span>{" "}
              <code className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">
                {user?.id || "none"}
              </code>
            </p>
          </div>
          {user && (
            <div className="pt-2">
              <Button
                variant="destructive"
                size="sm"
                className="gap-2"
                onClick={() => signOut()}
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Log Out</span>
              </Button>
            </div>
          )}
        </div>

        {/* Appearance Section */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 space-y-4">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
            <Settings className="h-4 w-4 text-heat-500" />
            Theme & Appearance
          </h2>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setTheme("light")}
              className={`flex items-center gap-2 rounded-xl border p-3 text-xs font-medium transition-all ${
                theme === "light"
                  ? "border-heat-500 bg-heat-50 text-heat-700 dark:bg-heat-950/40 dark:text-heat-400"
                  : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
              }`}
            >
              <Sun className="h-4 w-4" />
              <span>Light Mode</span>
            </button>

            <button
              onClick={() => setTheme("dark")}
              className={`flex items-center gap-2 rounded-xl border p-3 text-xs font-medium transition-all ${
                theme === "dark"
                  ? "border-heat-500 bg-heat-50 text-heat-700 dark:bg-heat-950/40 dark:text-heat-400"
                  : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
              }`}
            >
              <Moon className="h-4 w-4" />
              <span>Dark Mode</span>
            </button>

            <button
              onClick={() => setTheme("system")}
              className={`flex items-center gap-2 rounded-xl border p-3 text-xs font-medium transition-all ${
                theme === "system"
                  ? "border-heat-500 bg-heat-50 text-heat-700 dark:bg-heat-950/40 dark:text-heat-400"
                  : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
              }`}
            >
              <Monitor className="h-4 w-4" />
              <span>System Default</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
