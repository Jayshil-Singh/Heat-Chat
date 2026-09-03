"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck, Lock, Mail, AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";

import { getSafeRedirectUrl } from "@/lib/validation/redirect";

function AdminLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = getSafeRedirectUrl(searchParams.get("redirectTo"), "/admin/dashboard");
  const urlError = searchParams.get("error");

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(
    urlError === "ACCOUNT_INACTIVE" ? "Your administrative account is not active." : null
  );

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg("Please enter both email and password.");
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.message || data.error || "Login failed. Please verify credentials.");
        setIsLoading(false);
        return;
      }

      if (data.nextStep === "VERIFY_EMAIL") {
        router.push("/admin/verify-email");
      } else if (data.nextStep === "MFA_SETUP") {
        router.push("/admin/mfa/setup");
      } else if (data.nextStep === "MFA_VERIFY") {
        router.push(`/admin/mfa/verify?redirectTo=${encodeURIComponent(redirectTo)}`);
      } else {
        router.push(redirectTo);
      }
    } catch (err) {
      console.error("Admin login error:", err);
      setErrorMsg("An unexpected network error occurred.");
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-zinc-950 px-4 py-12 text-zinc-100">
      {/* Background ambient lighting */}
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
        <div className="h-96 w-96 rounded-full bg-heat-500/10 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-md space-y-8 rounded-3xl border border-zinc-800/80 bg-zinc-900/90 p-8 shadow-2xl backdrop-blur-xl">
        {/* Header */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-heat-600 via-heat-500 to-amber-400 text-white shadow-xl shadow-heat-500/25">
            <ShieldCheck className="h-9 w-9" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Heat Chat Administration</h1>
            <p className="text-xs text-zinc-400 mt-1">Privileged Access Control Portal</p>
          </div>
        </div>

        {errorMsg && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
            <p>{errorMsg}</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Admin Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <Input
                type="email"
                placeholder="admin@heatchat.app"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-heat-500"
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Password
              </label>
              <Link
                href="/admin/forgot-password"
                className="text-xs text-heat-400 hover:text-heat-300 transition-colors"
              >
                Forgot Password?
              </Link>
            </div>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <Input
                type="password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-heat-500"
                required
                autoComplete="current-password"
              />
            </div>
          </div>

          <Button
            type="submit"
            variant="heat"
            size="lg"
            className="w-full mt-2 font-medium"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Authenticating...
              </>
            ) : (
              <>
                Authenticate Administrator
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </form>

        <div className="border-t border-zinc-800/80 pt-6 text-center text-xs text-zinc-500 space-y-2">
          <p>Multi-Factor Authentication (MFA) will be challenged upon credential verification.</p>
          <div className="flex items-center justify-center gap-4 pt-1 text-zinc-400">
            <Link href="/login" className="hover:text-zinc-200 transition-colors">
              User Login
            </Link>
            <span>•</span>
            <Link href="/admin/setup" className="hover:text-zinc-200 transition-colors">
              First-Run Setup
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex min-h-screen w-full items-center justify-center bg-zinc-950 text-white">
          <Loader2 className="h-8 w-8 animate-spin text-heat-500" />
        </div>
      }
    >
      <AdminLoginContent />
    </React.Suspense>
  );
}
