"use client";

import * as React from "react";
import { AdminHeader } from "./admin-header";
import { AdminNav } from "./admin-nav";
import { Flame } from "lucide-react";
import Link from "next/link";

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full bg-zinc-50 text-zinc-900 selection:bg-heat-500 selection:text-white dark:bg-zinc-950 dark:text-zinc-50">
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden md:flex h-screen w-64 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 sticky top-0 shrink-0">
        {/* Brand Header */}
        <div className="flex h-16 items-center gap-3 px-6 border-b border-zinc-200 dark:border-zinc-800">
          <Link href="/admin/dashboard" className="flex items-center gap-2.5 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-heat-600 via-heat-500 to-amber-400 text-white shadow-md shadow-heat-500/25 transition-transform group-hover:scale-105">
              <Flame className="h-5 w-5 fill-current" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-sm tracking-tight text-zinc-900 dark:text-white">
                Heat Chat
              </span>
              <span className="text-[10px] font-semibold text-heat-600 dark:text-heat-400">
                Administration
              </span>
            </div>
          </Link>
        </div>

        {/* Scrollable Navigation Tree */}
        <div className="flex-1 overflow-y-auto px-3">
          <AdminNav />
        </div>
      </aside>

      {/* Main Administrative Content Area */}
      <div className="flex flex-1 flex-col min-w-0">
        <AdminHeader />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {children}
        </main>
      </div>
    </div>
  );
}
