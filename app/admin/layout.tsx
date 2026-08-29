"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { AdminShell } from "@/components/admin/admin-shell";
import { Flame, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isLoading, isAuthenticated, isEmailVerified } = useAuth();
  const [isAdmin, setIsAdmin] = React.useState<boolean | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated || !user) {
      router.replace("/login?redirectTo=/admin/dashboard");
      return;
    }

    if (!isEmailVerified) {
      router.replace("/verify-email");
      return;
    }

    // Verify admin privileges server-side
    async function verifyAdmin() {
      try {
        const res = await fetch("/api/admin/metrics");
        if (res.status === 401) {
          router.replace("/login?redirectTo=/admin/dashboard");
          return;
        }
        if (res.status === 403) {
          const data = await res.json().catch(() => ({}));
          setIsAdmin(false);
          setErrorMsg(data.message || "Access denied: Administrative privileges required.");
          return;
        }
        if (res.ok) {
          setIsAdmin(true);
        } else {
          // Check permissions directly
          const permRes = await fetch("/api/admin/permissions");
          if (permRes.ok) {
            setIsAdmin(true);
          } else {
            setIsAdmin(false);
            setErrorMsg("Access denied: You do not have permissions to access the Admin Panel.");
          }
        }
      } catch (err) {
        console.error("Admin verification check failed:", err);
        setIsAdmin(false);
        setErrorMsg("Failed to verify administrative authorization.");
      }
    }

    verifyAdmin();
  }, [isLoading, isAuthenticated, isEmailVerified, user, router]);

  if (isLoading || isAdmin === null) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-zinc-950 text-white">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-14 w-14 animate-pulse items-center justify-center rounded-2xl bg-gradient-to-tr from-heat-600 via-heat-500 to-amber-400 text-white shadow-xl shadow-heat-500/30">
            <Flame className="h-8 w-8 fill-current" />
          </div>
          <p className="text-xs font-semibold tracking-wider uppercase text-zinc-400 animate-pulse">
            Verifying Admin Authorization...
          </p>
        </div>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-950">
        <div className="w-full max-w-md space-y-4 rounded-3xl border border-red-200 bg-white p-6 sm:p-8 text-center shadow-2xl dark:border-red-900/40 dark:bg-zinc-900">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400">
            <AlertCircle className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white">403 — Unauthorized Access</h2>
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            {errorMsg || "You do not possess the required administrative roles or permissions to access this platform."}
          </p>
          <div className="pt-2">
            <Link href="/chat">
              <Button variant="heat" size="lg" className="w-full">
                Return to Heat Chat
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <AdminShell>{children}</AdminShell>;
}
