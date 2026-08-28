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
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ThemeToggle } from "./theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { useNotificationContext } from "@/components/notifications/notification-provider";

function SidebarNotificationCenter() {
  const {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
  } = useNotificationContext();

  return (
    <NotificationCenter
      notifications={notifications}
      unreadCount={unreadCount}
      isLoading={isLoading}
      onMarkAsRead={markAsRead}
      onMarkAllAsRead={markAllAsRead}
    />
  );
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
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

interface SidebarNavProps {
  onOpenCommandPalette?: () => void;
}

export function SidebarNav({ onOpenCommandPalette }: SidebarNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, signOut, isLoading } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  return (
    <aside className="hidden md:flex h-full md:w-20 md:p-3 lg:w-64 lg:p-4 flex-col justify-between border-r border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-950/70 backdrop-blur-xl shrink-0 transition-all duration-200">
      {/* Brand Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between md:justify-center lg:justify-between px-1">
          <Link
            href="/"
            className="flex items-center gap-3 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 rounded-xl"
            title="Heat Chat"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-heat-600 via-heat-500 to-amber-400 text-white shadow-md shadow-heat-500/25">
              <Flame className="h-5 w-5 fill-current" />
            </div>
            <div className="hidden lg:block">
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

          {user && (
            <div className="hidden lg:block">
              <SidebarNotificationCenter />
            </div>
          )}
        </div>

        {/* Quick Search Button */}
        {user && onOpenCommandPalette && (
          <button
            onClick={onOpenCommandPalette}
            className="flex w-full items-center justify-center lg:justify-between gap-2 rounded-xl border border-zinc-200/80 bg-white/80 p-2.5 lg:px-3 lg:py-2 text-xs text-zinc-500 transition-all hover:border-zinc-300 hover:bg-white hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
            aria-label="Quick search (Cmd+K / Ctrl+K)"
            title="Search messages (Cmd+K / Ctrl+K)"
          >
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-zinc-400" />
              <span className="hidden lg:inline">Search messages...</span>
            </div>
            <span className="hidden lg:inline rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
              ⌘K
            </span>
          </button>
        )}

        {/* Navigation Items */}
        <nav className="space-y-1 pt-1" aria-label="Main Navigation">
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
                  "flex items-center justify-center lg:justify-start gap-3 rounded-xl p-2.5 lg:px-3 lg:py-2.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500",
                  isActive
                    ? "bg-heat-500 text-white shadow-sm shadow-heat-500/20 dark:bg-heat-500"
                    : "text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                )}
                aria-current={isActive ? "page" : undefined}
                title={item.label}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    isActive ? "text-white" : "text-zinc-400 dark:text-zinc-500"
                  )}
                />
                <span className="hidden lg:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer Area */}
      <div className="space-y-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-center lg:justify-between px-1">
          <span className="hidden lg:inline text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Appearance
          </span>
          <ThemeToggle />
        </div>

        {/* User profile / Auth status */}
        {!isLoading && user ? (
          <div className="flex items-center justify-center lg:justify-between gap-2 rounded-xl p-2 bg-white/70 dark:bg-zinc-900/70 border border-zinc-200/80 dark:border-zinc-800 shadow-sm">
            <Link
              href="/profile"
              className="flex items-center gap-2.5 min-w-0 flex-1 hover:opacity-80 transition-opacity justify-center lg:justify-start"
              title={profile?.display_name || user.email || "Profile"}
            >
              <Avatar
                src={profile?.avatar_url}
                name={profile?.display_name || user.email || "User"}
                size="default"
                status={profile?.status || "online"}
              />
              <div className="hidden lg:block min-w-0 flex-1">
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
              className="hidden lg:block rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-red-500 dark:hover:bg-zinc-800 dark:hover:text-red-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500"
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
              title="Log In / Register"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Log In / Register</span>
            </Link>
            <div className="hidden lg:flex items-center justify-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
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
