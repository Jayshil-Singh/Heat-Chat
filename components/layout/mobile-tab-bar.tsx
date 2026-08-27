"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, Users, Settings, User } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const tabs = [
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

export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t border-zinc-200 bg-white/95 px-2 backdrop-blur-lg dark:border-zinc-800 dark:bg-zinc-950/95 pb-[env(safe-area-inset-bottom)]"
      aria-label="Mobile Navigation"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive =
          pathname === tab.href ||
          (tab.href !== "/" && pathname.startsWith(tab.href));

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center py-1 text-center transition-colors min-h-[44px] touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 rounded-lg",
              isActive
                ? "text-heat-600 dark:text-heat-500 font-semibold"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            )}
            aria-current={isActive ? "page" : undefined}
          >
            <div className="relative">
              <Icon
                className={cn(
                  "h-5 w-5 transition-transform",
                  isActive && "scale-110"
                )}
              />
            </div>
            <span className="text-[11px] mt-1 leading-none">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
