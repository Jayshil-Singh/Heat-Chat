"use client";

import * as React from "react";
import { Users, CheckCircle2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export default function FriendsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-8">
      <div className="border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Friends
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Phase 2: Protected Friends Route
        </p>
      </div>

      <EmptyState
        icon={<Users className="h-7 w-7 text-heat-500" />}
        title="Friends Management System"
        description="Friend requests, acceptance, and friend discovery schema and RLS policies are deployed in PostgreSQL. Phase 4 will connect the interactive UI."
        action={
          <div className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3.5 py-1.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span>Friendships Table & RLS Verified</span>
          </div>
        }
      />
    </div>
  );
}
