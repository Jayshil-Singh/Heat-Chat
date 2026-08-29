"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Shield,
  Key,
  Radio,
  AlertTriangle,
  Flame,
  MessageSquare,
  FileText,
  Paperclip,
  Lock,
  Activity,
  BarChart3,
  HeartPulse,
  Bell,
  Settings,
  ScrollText,
  UserCheck,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: "OVERVIEW",
    items: [
      { name: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    title: "USERS",
    items: [
      { name: "Users", href: "/admin/users", icon: Users },
      { name: "Roles & Permissions", href: "/admin/roles", icon: Shield },
      { name: "Sessions", href: "/admin/sessions", icon: Radio },
    ],
  },
  {
    title: "MODERATION",
    items: [
      { name: "Reports", href: "/admin/reports", icon: AlertTriangle },
      { name: "Moderation Queue", href: "/admin/moderation", icon: Shield },
    ],
  },
  {
    title: "CONTENT",
    items: [
      { name: "Conversations", href: "/admin/conversations", icon: MessageSquare },
      { name: "Messages", href: "/admin/messages", icon: FileText },
      { name: "Attachments", href: "/admin/attachments", icon: Paperclip },
    ],
  },
  {
    title: "SECURITY",
    items: [
      { name: "Security Center", href: "/admin/security", icon: Lock },
    ],
  },
  {
    title: "SYSTEM",
    items: [
      { name: "Analytics", href: "/admin/analytics", icon: BarChart3 },
      { name: "System Health", href: "/admin/system-health", icon: HeartPulse },
      { name: "Notifications", href: "/admin/notifications", icon: Bell },
      { name: "Settings", href: "/admin/settings", icon: Settings },
    ],
  },
  {
    title: "AUDIT",
    items: [
      { name: "Audit Logs", href: "/admin/audit-logs", icon: ScrollText },
      { name: "Access Reviews", href: "/admin/access-reviews", icon: UserCheck },
    ],
  },
  {
    title: "ACCOUNT",
    items: [
      { name: "Admin Profile", href: "/admin/profile", icon: UserCheck },
    ],
  },
];

export function AdminNav({ onLinkClick }: { onLinkClick?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-6 py-4">
      {NAV_SECTIONS.map((section) => (
        <div key={section.title} className="space-y-1">
          <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            {section.title}
          </div>
          <div className="space-y-0.5">
            {section.items.map((item) => {
              const isActive = pathname === item.href || (item.href !== "/admin" && item.href !== "/admin/dashboard" && pathname.startsWith(item.href));
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onLinkClick}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-150",
                    isActive
                      ? "bg-gradient-to-r from-heat-500/15 to-amber-500/10 text-heat-600 dark:text-heat-400 border border-heat-500/20 shadow-sm"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 transition-colors",
                      isActive
                        ? "text-heat-600 dark:text-heat-400"
                        : "text-zinc-400 group-hover:text-zinc-600 dark:text-zinc-500 dark:group-hover:text-zinc-300"
                    )}
                  />
                  <span className="flex-1 truncate">{item.name}</span>
                  {item.badge && (
                    <span className="rounded-full bg-heat-500/20 px-1.5 py-0.5 text-[10px] font-bold text-heat-600 dark:text-heat-400">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
