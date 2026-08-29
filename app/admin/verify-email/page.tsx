"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Mail, CheckCircle2, AlertCircle, Loader2, ArrowRight, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import Link from "next/link";

export default function AdminVerifyEmailPage() {
  const router = useRouter();
  const { user, isEmailVerified, signOut } = useAuth();
  const [isChecking, setIsChecking] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isEmailVerified) {
      router.replace("/admin/mfa/setup");
    }
  }, [isEmailVerified, router]);

  async function checkStatus() {
    setIsChecking(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/mfa/status");
      if (res.ok) {
        router.replace("/admin/mfa/setup");
      } else {
        setMessage("Email address is not yet confirmed. Please check your inbox and click the verification link.");
      }
    } catch {
      setMessage("Failed to verify status. Please try again.");
    } finally {
      setIsChecking(false);
    }
  }

  async function handleLogout() {
    await signOut();
    router.replace("/admin/login");
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-zinc-950 px-4 py-12 text-zinc-100">
      <div className="relative w-full max-w-md space-y-6 rounded-3xl border border-zinc-800/80 bg-zinc-900/90 p-8 text-center shadow-2xl backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-heat-500/10 text-heat-400 border border-heat-500/20">
          <Mail className="h-8 w-8" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-white">Email Verification Required</h1>
          <p className="text-xs leading-relaxed text-zinc-400">
            A confirmation link was sent to <span className="font-semibold text-zinc-200">{user?.email || "your email address"}</span>.
            Click the link in that email to activate your administrator account.
          </p>
        </div>

        {message && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-300 text-left">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
            <p>{message}</p>
          </div>
        )}

        <div className="space-y-3 pt-2">
          <Button
            onClick={checkStatus}
            variant="heat"
            size="lg"
            className="w-full font-medium"
            disabled={isChecking}
          >
            {isChecking ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Checking Status...
              </>
            ) : (
              <>
                I Have Verified My Email
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>

          <Button
            onClick={handleLogout}
            variant="outline"
            size="lg"
            className="w-full text-zinc-400 border-zinc-800 hover:bg-zinc-800"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>

        <div className="border-t border-zinc-800/80 pt-4 text-xs text-zinc-500">
          <Link href="/admin/login" className="text-heat-400 hover:text-heat-300">
            Return to Admin Login
          </Link>
        </div>
      </div>
    </div>
  );
}
