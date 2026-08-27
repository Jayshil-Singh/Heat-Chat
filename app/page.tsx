"use client";

import * as React from "react";
import Link from "next/link";
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
  LogIn,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/hooks/use-auth";

export default function HomePage() {
  const { user, profile } = useAuth();
  const [testInput, setTestInput] = React.useState("");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:py-12 space-y-12">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-zinc-50 to-white p-8 md:p-12 text-center border border-zinc-200/80 shadow-sm dark:from-zinc-900/60 dark:to-zinc-950 dark:border-zinc-800">
        <div className="inline-flex items-center gap-2 rounded-full bg-heat-500/10 px-3.5 py-1 text-xs font-semibold text-heat-600 dark:text-heat-400 border border-heat-500/20 mb-6">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Phase 2 — Supabase Auth & Database Security</span>
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
          {user ? (
            <Link href="/chat">
              <Button variant="heat" size="lg" className="gap-2">
                <span>Enter Chat</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          ) : (
            <>
              <Link href="/login">
                <Button variant="heat" size="lg" className="gap-2">
                  <LogIn className="h-4 w-4" />
                  <span>Log In</span>
                </Button>
              </Link>
              <Link href="/register">
                <Button variant="outline" size="lg" className="gap-2">
                  <UserPlus className="h-4 w-4" />
                  <span>Create Account</span>
                </Button>
              </Link>
            </>
          )}
        </div>
      </section>

      {/* Feature Pillar Cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-heat-600 dark:bg-heat-950/60 dark:text-heat-400 mb-4">
            <Lock className="h-5 w-5" />
          </div>
          <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
            Row Level Security (RLS)
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            Database-enforced security policies on profiles, conversations,
            messages, and storage attachments prevent unauthorized cross-user
            access.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 mb-4">
            <Zap className="h-5 w-5" />
          </div>
          <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
            Supabase Auth & SSR
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            Secure HTTP-only cookie session handling with automated Next.js
            middleware token refreshing and route protection.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 sm:col-span-2 lg:col-span-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 mb-4">
            <Smartphone className="h-5 w-5" />
          </div>
          <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
            PWA & Mobile Ready
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
            Accessible primitives built with TypeScript, Tailwind CSS, and Next.js 15.
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
              Form Input & Validation
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
              <Avatar
                name={profile?.display_name || "Alice Rivera"}
                status="online"
                size="lg"
              />
              <Avatar name="Bob Miller" status="away" size="default" />
              <Avatar name="Charlie Kim" status="busy" size="default" />
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

      {/* Empty State / Status Card */}
      <section className="rounded-3xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/20">
        <EmptyState
          icon={<Users className="h-7 w-7 text-heat-500" />}
          title="Supabase Auth & Database Schema Ready"
          description="Authentication pages (/login, /register, /reset-password), session middleware, database schema with Row Level Security, and storage policies have been implemented."
          action={
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span>Phase 2 Verification Ready</span>
            </div>
          }
        />
      </section>
    </div>
  );
}
