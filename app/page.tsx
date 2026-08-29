"use client";

import * as React from "react";
import Link from "next/link";
import {
  Flame,
  ShieldCheck,
  Zap,
  Users,
  ArrowRight,
  LogIn,
  UserPlus,
  CheckCircle2,
  MessageSquare,
  Lock,
  Sparkles,
  HeartHandshake,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useAuth } from "@/hooks/use-auth";

export default function HomePage() {
  const { user, profile, isLoading } = useAuth();

  return (
    <div className="min-h-screen bg-white text-zinc-900 selection:bg-heat-500 selection:text-white dark:bg-zinc-950 dark:text-zinc-50 flex flex-col justify-between">
      {/* Background Ambient Glows */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[600px] rounded-full bg-gradient-to-tr from-heat-500/15 via-amber-500/10 to-transparent blur-3xl dark:from-heat-600/10 dark:via-amber-600/5" />
        <div className="absolute top-1/2 right-0 -translate-y-1/2 h-[400px] w-[400px] rounded-full bg-gradient-to-bl from-heat-400/10 to-transparent blur-3xl dark:from-heat-500/5" />
      </div>

      {/* Top Navigation Bar */}
      <header className="relative z-10 w-full border-b border-zinc-200/80 bg-white/80 backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-950/80 sticky top-0">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Brand */}
          <Link
            href="/"
            className="flex items-center gap-2.5 transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 rounded-xl"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-heat-600 via-heat-500 to-amber-400 text-white shadow-md shadow-heat-500/25">
              <Flame className="h-5 w-5 fill-current" />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold tracking-tight text-zinc-900 dark:text-white leading-tight">
                Heat Chat
              </span>
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">
                Private Friends
              </span>
            </div>
          </Link>

          {/* Nav Right CTAs */}
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {!isLoading && (
              <>
                {user ? (
                  <Link href="/chat">
                    <Button variant="heat" size="sm" className="gap-2 shadow-sm shadow-heat-500/20">
                      <MessageSquare className="h-4 w-4" />
                      <span>Enter Chat</span>
                    </Button>
                  </Link>
                ) : (
                  <div className="flex items-center gap-2">
                    <Link href="/login">
                      <Button variant="ghost" size="sm">
                        Sign In
                      </Button>
                    </Link>
                    <Link href="/register">
                      <Button variant="heat" size="sm" className="gap-1.5 shadow-sm shadow-heat-500/20">
                        <UserPlus className="h-3.5 w-3.5" />
                        <span>Get Started</span>
                      </Button>
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 space-y-16 md:space-y-24 py-12 md:py-20 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto w-full">
        {/* Hero Section */}
        <section className="text-center space-y-6 max-w-3xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full bg-heat-500/10 px-4 py-1.5 text-xs font-semibold text-heat-600 dark:text-heat-400 border border-heat-500/20 shadow-sm backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5 text-heat-500" />
            <span>Private Messaging for Your Trusted Circle</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-zinc-900 dark:text-white leading-[1.1]">
            Private conversations.{" "}
            <span className="bg-gradient-to-r from-heat-600 via-heat-500 to-amber-400 bg-clip-text text-transparent">
              Close connections.
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-base sm:text-lg md:text-xl text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto leading-relaxed">
            A fast, distraction-free messaging space designed exclusively for close friends and trusted groups.
            Zero algorithms, zero tracking, instant realtime sync.
          </p>

          {/* Hero CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-3.5 pt-2">
            {!isLoading && user ? (
              <Link href="/chat">
                <Button variant="heat" size="lg" className="gap-2 px-8 shadow-lg shadow-heat-500/30 text-base font-semibold">
                  <MessageSquare className="h-5 w-5" />
                  <span>Open Heat Chat</span>
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/register">
                  <Button variant="heat" size="lg" className="gap-2 px-7 shadow-lg shadow-heat-500/30 text-base font-semibold">
                    <UserPlus className="h-4 w-4" />
                    <span>Create Free Account</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/login">
                  <Button variant="outline" size="lg" className="gap-2 px-6 text-base font-semibold">
                    <LogIn className="h-4 w-4" />
                    <span>Sign In</span>
                  </Button>
                </Link>
              </>
            )}
          </div>

          {/* Trust Highlights */}
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 pt-4 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Private by Design
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Instant Realtime Delivery
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Zero Ads or Data Tracking
            </span>
          </div>
        </section>

        {/* Product Interface Preview Mockup */}
        <section className="relative mx-auto max-w-4xl">
          <div className="relative rounded-3xl border border-zinc-200/80 bg-white/70 p-3 sm:p-5 shadow-2xl shadow-heat-500/10 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-900/60 dark:shadow-black/60">
            {/* Header Bar */}
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/80 pb-3 px-3">
              <div className="flex items-center gap-3">
                <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-heat-500 to-amber-400 text-white font-bold text-sm shadow-sm">
                  🔥
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      The Inner Circle
                    </h2>
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      4 online
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">
                    Maya, Alex, Jordan, You
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-zinc-400">
                <div className="flex -space-x-2 overflow-hidden">
                  <Avatar name="Maya Lin" size="sm" status="online" />
                  <Avatar name="Alex Chen" size="sm" status="online" />
                  <Avatar name="Jordan Rivera" size="sm" status="online" />
                </div>
              </div>
            </div>

            {/* Conversation Stream Preview */}
            <div className="space-y-4 py-6 px-3 sm:px-6">
              {/* Message 1 */}
              <div className="flex items-start gap-3">
                <Avatar name="Maya Lin" size="default" status="online" />
                <div className="space-y-1 max-w-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-200">
                      Maya Lin
                    </span>
                    <span className="text-[10px] text-zinc-400">8:14 PM</span>
                  </div>
                  <div className="rounded-2xl rounded-tl-sm bg-zinc-100 p-3 text-xs sm:text-sm text-zinc-800 dark:bg-zinc-800/80 dark:text-zinc-200 shadow-sm">
                    Hey everyone! Are we all still meeting up tonight? 🍕
                    <div className="mt-1 flex items-center gap-1">
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-white dark:bg-zinc-900 px-1.5 py-0.5 text-[11px] border border-zinc-200 dark:border-zinc-700 shadow-2xs">
                        🔥 3
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Message 2 */}
              <div className="flex items-start gap-3">
                <Avatar name="Alex Chen" size="default" status="online" />
                <div className="space-y-1 max-w-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-200">
                      Alex Chen
                    </span>
                    <span className="text-[10px] text-zinc-400">8:15 PM</span>
                  </div>
                  <div className="rounded-2xl rounded-tl-sm bg-zinc-100 p-3 text-xs sm:text-sm text-zinc-800 dark:bg-zinc-800/80 dark:text-zinc-200 shadow-sm space-y-2">
                    <p>Yes! Just checked in at the rooftop spot.</p>
                    <div className="flex items-center gap-2 rounded-xl bg-white/80 p-2 text-xs dark:bg-zinc-900/80 border border-zinc-200/60 dark:border-zinc-700/60 text-zinc-600 dark:text-zinc-300">
                      <ImageIcon className="h-4 w-4 text-heat-500 shrink-0" />
                      <span className="truncate">rooftop_sunset_view.jpg</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Message 3 (Current user outgoing) */}
              <div className="flex items-start justify-end gap-3">
                <div className="space-y-1 max-w-sm text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-[10px] text-zinc-400">8:16 PM</span>
                    <span className="text-xs font-semibold text-heat-600 dark:text-heat-400">
                      You
                    </span>
                  </div>
                  <div className="rounded-2xl rounded-tr-sm bg-gradient-to-tr from-heat-600 to-amber-500 p-3 text-xs sm:text-sm text-white shadow-md shadow-heat-500/20 text-left">
                    Looks incredible! On my way now, see you in 10! 🚀
                  </div>
                </div>
              </div>

              {/* Live typing indicator */}
              <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500 italic pt-1 pl-1">
                <div className="flex gap-1 items-center">
                  <span className="h-1.5 w-1.5 rounded-full bg-heat-500 animate-bounce [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-heat-500 animate-bounce [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-heat-500 animate-bounce" />
                </div>
                <span>Jordan is typing...</span>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Pillars */}
        <section className="space-y-8">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
              Built for how you actually chat
            </h2>
            <p className="text-sm sm:text-base text-zinc-500 dark:text-zinc-400">
              Everything you need for genuine conversations with your closest people.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {/* Pillar 1 */}
            <div className="rounded-3xl border border-zinc-200/80 bg-white p-7 shadow-sm transition-all hover:shadow-md hover:border-heat-500/30 dark:border-zinc-800 dark:bg-zinc-900/50 space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-heat-500/10 to-amber-500/10 text-heat-600 dark:text-heat-400 border border-heat-500/20">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                Private by Design
              </h3>
              <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Your direct messages, group chats, and photos are strictly isolated to active members.
                No third-party trackers, no advertising algorithms.
              </p>
            </div>

            {/* Pillar 2 */}
            <div className="rounded-3xl border border-zinc-200/80 bg-white p-7 shadow-sm transition-all hover:shadow-md hover:border-amber-500/30 dark:border-zinc-800 dark:bg-zinc-900/50 space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500/10 to-orange-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <Zap className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                Instant Realtime Sync
              </h3>
              <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Experience instant message delivery, live presence indicators, typing cues,
                and read receipts across desktop and mobile.
              </p>
            </div>

            {/* Pillar 3 */}
            <div className="rounded-3xl border border-zinc-200/80 bg-white p-7 shadow-sm transition-all hover:shadow-md hover:border-heat-500/30 dark:border-zinc-800 dark:bg-zinc-900/50 space-y-4 sm:col-span-2 lg:col-span-1">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-orange-500/10 to-red-500/10 text-heat-600 dark:text-heat-400 border border-heat-500/20">
                <HeartHandshake className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                Your Trusted Circle
              </h3>
              <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Form intimate direct chats and close-knit group rooms. Share memories,
                photos, reactions, and pinned bookmarks effortlessly.
              </p>
            </div>
          </div>
        </section>

        {/* Bottom CTA Banner */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-tr from-zinc-900 via-zinc-900 to-zinc-950 p-8 sm:p-12 text-center text-white border border-zinc-800 shadow-xl dark:border-zinc-800/80">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -right-10 -bottom-10 h-60 w-60 rounded-full bg-heat-500/20 blur-3xl" />
            <div className="absolute -left-10 -top-10 h-60 w-60 rounded-full bg-amber-500/15 blur-3xl" />
          </div>

          <div className="relative z-10 space-y-4 max-w-xl mx-auto">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-heat-500 to-amber-400 text-white shadow-lg shadow-heat-500/30">
              <Flame className="h-7 w-7 fill-current" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Ready to connect with your inner circle?
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
              Create an account in seconds and experience fast, private messaging with the people who matter most.
            </p>
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              {!isLoading && user ? (
                <Link href="/chat">
                  <Button variant="heat" size="lg" className="gap-2 px-8 shadow-lg shadow-heat-500/30 font-semibold">
                    <span>Enter Heat Chat</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              ) : (
                <>
                  <Link href="/register">
                    <Button variant="heat" size="lg" className="gap-2 px-8 shadow-lg shadow-heat-500/30 font-semibold">
                      <UserPlus className="h-4 w-4" />
                      <span>Get Started Free</span>
                    </Button>
                  </Link>
                  <Link href="/login">
                    <Button variant="outline" size="lg" className="gap-2 px-6 border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 text-white font-semibold">
                      <span>Sign In</span>
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Production Footer */}
      <footer className="relative z-10 w-full border-t border-zinc-200/80 bg-white/80 dark:border-zinc-800/80 dark:bg-zinc-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-col sm:flex-row items-center justify-between gap-4 px-4 py-8 sm:px-6 lg:px-8 text-xs text-zinc-500 dark:text-zinc-400">
          <div className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-tr from-heat-600 to-amber-400 text-white">
              <Flame className="h-3.5 w-3.5 fill-current" />
            </div>
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">
              Heat Chat
            </span>
            <span className="text-zinc-400 dark:text-zinc-600">·</span>
            <span>Private conversations. Close connections.</span>
          </div>

          <div className="flex items-center gap-5 text-zinc-500 dark:text-zinc-400">
            <Link href="/login" className="hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors">
              Sign In
            </Link>
            <Link href="/register" className="hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors">
              Register
            </Link>
            <span>·</span>
            <span>&copy; {new Date().getFullYear()} Heat Chat. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
