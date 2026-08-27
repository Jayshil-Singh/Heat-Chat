"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  MessageSquare,
  Users,
  Settings,
  Flame,
  User,
  ShieldCheck,
  LogOut,
  LogIn,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ThemeToggle } from "./theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";

const navItems = [
  {
    label: "Chats",
    href: "/chat",
    icon: MessageSquare,
  },
  {
    label: "Friends",
    href: "/friends",
    icon: Users,
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
  },
  {
    label: "Profile",
    href: "/profile",
    icon: User,
  },
];

export function SidebarNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, signOut, isLoading } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  return (
    <aside className="hidden md:flex h-full w-64 flex-col justify-between border-r border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/70 backdrop-blur-xl shrink-0">
      {/* Brand Header */}
      <div className="space-y-6">
        <Link
          href="/"
          className="flex items-center gap-3 px-2 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 rounded-xl"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-heat-600 via-heat-500 to-amber-400 text-white shadow-md shadow-heat-500/25">
            <Flame className="h-5 w-5 fill-current" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-1.5">
              Heat Chat
              <span className="inline-flex items-center rounded-full bg-heat-100 px-1.5 py-0.5 text-[10px] font-semibold text-heat-700 dark:bg-heat-950 dark:text-heat-400 border border-heat-200 dark:border-heat-900">
                v1
              </span>
            </h1>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-none mt-0.5">
              Private friends chat
            </p>
          </div>
        </Link>

        {/* Navigation Items */}
        <nav className="space-y-1" aria-label="Main Navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500",
                  isActive
                    ? "bg-heat-500 text-white shadow-sm shadow-heat-500/20 dark:bg-heat-500"
                    : "text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon
                  className={cn(
                    "h-4 w-4",
                    isActive ? "text-white" : "text-zinc-400 dark:text-zinc-500"
                  )}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer Area */}
      <div className="space-y-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Appearance
          </span>
          <ThemeToggle />
        </div>

        {/* User profile / Auth status */}
        {!isLoading && user ? (
          <div className="flex items-center justify-between gap-2 rounded-xl p-2 bg-white/70 dark:bg-zinc-900/70 border border-zinc-200/80 dark:border-zinc-800 shadow-sm">
            <Link
              href="/profile"
              className="flex items-center gap-2.5 min-w-0 flex-1 hover:opacity-80 transition-opacity"
            >
              <Avatar
                src={profile?.avatar_url}
                name={profile?.display_name || user.email || "User"}
                size="default"
                status={profile?.status || "online"}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  {profile?.display_name || user.email?.split("@")[0]}
                </p>
                <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                  @{profile?.username || "user"}
                </p>
              </div>
            </Link>
            <button
              onClick={handleSignOut}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-red-500 dark:hover:bg-zinc-800 dark:hover:text-red-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500"
              title="Log out"
              aria-label="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : !isLoading ? (
          <div className="space-y-2">
            <Link
              href="/login"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-heat-500 px-3 py-2 text-xs font-semibold text-white shadow-sm shadow-heat-500/20 hover:bg-heat-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>Log In / Register</span>
            </Link>
            <div className="flex items-center justify-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              <ShieldCheck className="h-3 w-3 text-emerald-500" />
              <span>Private & Encrypted</span>
            </div>
          </div>
        ) : (
          <div className="h-12 w-full animate-pulse rounded-xl bg-zinc-200/60 dark:bg-zinc-800/60" />
        )}
      </div>
    </aside>
  );
}
