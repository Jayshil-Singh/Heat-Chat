"use client";

import * as React from "react";
import {
  Flame,
  Shield,
  Zap,
  Smartphone,
  Users,
  Lock,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";

export default function HomePage() {
  const [demoDialogOpen, setDemoDialogOpen] = React.useState(false);
  const [testInput, setTestInput] = React.useState("");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:py-12 space-y-12">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-zinc-50 to-white p-8 md:p-12 text-center border border-zinc-200/80 shadow-sm dark:from-zinc-900/60 dark:to-zinc-950 dark:border-zinc-800">
        <div className="inline-flex items-center gap-2 rounded-full bg-heat-500/10 px-3.5 py-1 text-xs font-semibold text-heat-600 dark:text-heat-400 border border-heat-500/20 mb-6">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Phase 1 — Foundation Initialized</span>
        </div>

        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-heat-600 via-heat-500 to-amber-400 text-white shadow-xl shadow-heat-500/30 mb-6">
          <Flame className="h-9 w-9 fill-current" />
        </div>

        <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 sm:text-4xl md:text-5xl dark:text-white">
          Heat Chat
        </h1>
        <p className="mt-3 text-lg font-medium text-heat-600 dark:text-heat-400">
          Private conversations. Close connections.
        </p>
        <p className="mx-auto mt-4 max-w-2xl text-sm text-zinc-600 sm:text-base dark:text-zinc-400 leading-relaxed">
          A modern, high-performance, and secure private chat application built
          for your trusted circle. Zero bloat, instant realtime delivery, and
          complete privacy.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button
            variant="heat"
            size="lg"
            className="gap-2"
            onClick={() => setDemoDialogOpen(true)}
          >
            <span>Foundation Preview</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => {
              window.scrollTo({
                top: document.body.scrollHeight,
                behavior: "smooth",
              });
            }}
          >
            Explore System Architecture
          </Button>
        </div>
      </section>

      {/* Feature Pillar Cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-heat-600 dark:bg-heat-950/60 dark:text-heat-400 mb-4">
            <Lock className="h-5 w-5" />
          </div>
          <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
            Private by Design
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            Row Level Security enforced strictly at the database layer. Only
            authorized conversation members can read or transmit messages.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 mb-4">
            <Zap className="h-5 w-5" />
          </div>
          <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
            Realtime Speed
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            PostgreSQL Realtime change feeds, broadcast channels for typing
            indicators, and ephemeral presence without database bloat.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 sm:col-span-2 lg:col-span-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 mb-4">
            <Smartphone className="h-5 w-5" />
          </div>
          <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
            PWA & Mobile First
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            Optimized for iPhone, Android, tablets, and desktop browsers with
            safe-area support and standalone installability.
          </p>
        </div>
      </section>

      {/* Component Foundation Playground */}
      <section className="rounded-3xl border border-zinc-200 bg-white p-6 md:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/30 space-y-6">
        <div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <Shield className="h-5 w-5 text-heat-500" />
            Foundation Component Gallery
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Standard accessible primitives built with TypeScript and Tailwind CSS.
          </p>
        </div>

        {/* Buttons and Inputs */}
        <div className="grid gap-6 md:grid-cols-2 pt-2">
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Interactive Buttons
            </h4>
            <div className="flex flex-wrap gap-2">
              <Button variant="heat">Heat</Button>
              <Button variant="default">Default</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Form Input & Status
            </h4>
            <Input
              placeholder="Type something here..."
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              helperText="Built-in accessible ARIA helper and error descriptions"
            />
          </div>
        </div>

        {/* Avatars and Skeletons */}
        <div className="grid gap-6 md:grid-cols-2 pt-4 border-t border-zinc-100 dark:border-zinc-800">
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Dynamic Avatars & Status Badges
            </h4>
            <div className="flex items-center gap-4">
              <Avatar name="Alex Rivera" status="online" size="lg" />
              <Avatar name="Jordan Lee" status="away" size="default" />
              <Avatar name="Sam Chen" status="busy" size="default" />
              <Avatar name="Taylor Swift" status="offline" size="sm" />
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Skeleton Loaders
            </h4>
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-3.5 w-3/4 rounded" />
                <Skeleton className="h-3 w-1/2 rounded" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Empty State Demo Card */}
      <section className="rounded-3xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/20">
        <EmptyState
          icon={<Users className="h-7 w-7 text-heat-500" />}
          title="Ready for Phase 2 (Supabase & Auth)"
          description="The frontend architecture and design system are initialized. Supabase configuration, migrations, and authentication will be integrated in Phase 2."
          action={
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span>Phase 1 Foundation Verification In Progress</span>
            </div>
          }
        />
      </section>

      {/* Demo Modal Dialog */}
      <Dialog
        isOpen={demoDialogOpen}
        onClose={() => setDemoDialogOpen(false)}
        title="Heat Chat Foundation"
        description="Phase 1 architecture is in place."
      >
        <div className="space-y-4">
          <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 text-xs space-y-2">
            <div className="flex items-center gap-2 font-medium text-zinc-900 dark:text-zinc-100">
              <Info className="h-4 w-4 text-heat-500" />
              Architecture Highlights
            </div>
            <ul className="list-disc list-inside space-y-1 text-zinc-600 dark:text-zinc-400">
              <li>Next.js App Router with TypeScript</li>
              <li>Tailwind CSS theme tokens & dark/light mode</li>
              <li>Zero fake mock messaging simulation</li>
              <li>Strict clean codebase ready for Supabase backend</li>
            </ul>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDemoDialogOpen(false)}
            >
              Close
            </Button>
            <Button
              variant="heat"
              size="sm"
              onClick={() => setDemoDialogOpen(false)}
            >
              Done
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
