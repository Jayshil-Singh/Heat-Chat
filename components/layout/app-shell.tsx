"use client";

import * as React from "react";
import Link from "next/link";
import { Flame } from "lucide-react";
import { SidebarNav } from "./sidebar-nav";
import { MobileTabBar } from "./mobile-tab-bar";
import { ThemeToggle } from "./theme-toggle";
import { NotificationProvider, useNotificationContext } from "@/components/notifications/notification-provider";
import { NotificationCenter } from "@/components/notifications/notification-center";

function MobileNotificationCenter() {
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

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <NotificationProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-50">
        {/* Desktop Sidebar */}
        <SidebarNav />

        {/* Main Area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Mobile Header */}
          <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white/95 px-4 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 md:hidden shrink-0 pt-[env(safe-area-inset-top)]">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-heat-600 to-amber-400 text-white shadow-sm shadow-heat-500/30">
                <Flame className="h-4 w-4 fill-current" />
              </div>
              <span className="text-sm font-bold tracking-tight text-zinc-900 dark:text-white">
                Heat Chat
              </span>
            </Link>
            <div className="flex items-center gap-2">
              <MobileNotificationCenter />
              <ThemeToggle />
            </div>
          </header>

          {/* Dynamic Content Container */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden pb-16 md:pb-0">
            {children}
          </main>

          {/* Mobile Bottom Tab Bar */}
          <MobileTabBar />
        </div>
      </div>
    </NotificationProvider>
  );
}

