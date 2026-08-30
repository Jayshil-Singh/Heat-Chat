"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Flame,
  Menu,
  X,
  ShieldCheck,
  ArrowLeft,
} from "lucide-react";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import { AdminNav } from "./admin-nav";

export function AdminHeader() {
  const pathname = usePathname();
  const { user, profile } = useAuth();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  // Generate breadcrumb from pathname
  const segments = pathname.split("/").filter(Boolean);
  const breadcrumb = segments.map((seg, idx) => {
    const href = "/" + segments.slice(0, idx + 1).join("/");
    const label = seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, " ");
    return { href, label };
  });

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-zinc-200 bg-white/80 px-4 sm:px-6 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 text-zinc-600 md:hidden dark:border-zinc-800 dark:text-zinc-400"
            aria-label="Toggle Navigation"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          {/* Breadcrumb Trail */}
          <nav className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            <Link
              href="/admin/dashboard"
              className="flex items-center gap-1.5 font-bold text-zinc-900 hover:text-heat-500 dark:text-white"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-tr from-heat-600 via-heat-500 to-amber-400 text-white shadow-sm">
                <Flame className="h-3.5 w-3.5 fill-current" />
              </div>
              <span className="hidden sm:inline">Heat Admin</span>
            </Link>

            {breadcrumb.map((b, idx) => {
              if (b.href === "/admin") return null;
              return (
                <React.Fragment key={b.href}>
                  <span className="text-zinc-300 dark:text-zinc-700">/</span>
                  <Link
                    href={b.href}
                    className={
                      idx === breadcrumb.length - 1
                        ? "font-bold text-heat-600 dark:text-heat-400"
                        : "hover:text-zinc-900 dark:hover:text-zinc-200"
                    }
                  >
                    {b.label}
                  </Link>
                </React.Fragment>
              );
            })}
          </nav>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <Link href="/chat">
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Back to Chat</span>
            </Button>
          </Link>

          <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-heat-500/10 px-2.5 py-1 text-[11px] font-bold text-heat-700 dark:text-heat-300 border border-heat-500/20">
            <ShieldCheck className="h-3.5 w-3.5 text-heat-500" />
            <span>Admin Portal</span>
          </div>

          <div className="hidden sm:block">
            <ThemeToggle />
          </div>
          <div className="sm:hidden">
            <ThemeToggle compact />
          </div>

          <Link href="/admin/profile" className="flex items-center gap-2 pl-1">
            <Avatar
              src={profile?.avatar_url || undefined}
              alt={profile?.display_name || user?.email || "Admin"}
              name={profile?.display_name || user?.email || "Admin"}
              size="sm"
            />
          </Link>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-zinc-950/60 backdrop-blur-sm md:hidden">
          <div className="fixed inset-y-0 left-0 w-72 bg-white p-4 shadow-2xl dark:bg-zinc-950 overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-heat-600 via-heat-500 to-amber-400 text-white shadow-md">
                  <Flame className="h-5 w-5 fill-current" />
                </div>
                <span className="font-bold text-sm text-zinc-900 dark:text-white">Heat Admin</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <AdminNav onLinkClick={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
