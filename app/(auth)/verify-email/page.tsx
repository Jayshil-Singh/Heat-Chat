"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Mail,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  LogOut,
  Send,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isEmailVerified, refreshUser, resendVerificationEmail, signOut } =
    useAuth();

  const urlEmail = searchParams.get("email") || "";
  const urlError = searchParams.get("error") || "";

  const displayEmail = user?.email || urlEmail || "your email address";

  const [isResending, setIsResending] = React.useState(false);
  const [isChecking, setIsChecking] = React.useState(false);
  const [resendStatus, setResendStatus] = React.useState<{
    success?: boolean;
    message?: string;
  } | null>(null);
  const [cooldown, setCooldown] = React.useState(0);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(
    urlError ? decodeURIComponent(urlError) : null
  );

  // If already verified, route to /chat immediately
  React.useEffect(() => {
    if (isEmailVerified || user?.email_confirmed_at) {
      router.replace("/chat");
    }
  }, [isEmailVerified, user?.email_confirmed_at, router]);

  // Resend cooldown timer
  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Multi-tab check on window focus / visibility change
  React.useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible") {
        const fresh = await refreshUser();
        if (fresh?.email_confirmed_at) {
          router.replace("/chat");
        }
      }
    };

    window.addEventListener("focus", handleVisibilityChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", handleVisibilityChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshUser, router]);

  const handleResend = async () => {
    if (cooldown > 0 || isResending) return;
    setIsResending(true);
    setResendStatus(null);
    setErrorMessage(null);

    const target = user?.email || urlEmail;
    const res = await resendVerificationEmail(target);

    if (res.success) {
      setResendStatus({
        success: true,
        message: "Verification email sent! Please check your inbox and spam folder.",
      });
      setCooldown(60);
    } else {
      setResendStatus({
        success: false,
        message: res.error || "Failed to resend verification email. Please try again.",
      });
    }
    setIsResending(false);
  };

  const handleCheckStatus = async () => {
    setIsChecking(true);
    setErrorMessage(null);

    const freshUser = await refreshUser();
    if (freshUser?.email_confirmed_at) {
      setResendStatus({
        success: true,
        message: "Email verified! Redirecting to Heat Chat...",
      });
      setTimeout(() => {
        router.replace("/chat");
      }, 500);
    } else {
      setErrorMessage("Your email has not been verified yet.");
    }
    setIsChecking(false);
  };

  const handleSignOutAndChange = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <div className="space-y-6">
      {/* Icon & Title */}
      <div className="space-y-3 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-heat-500/10 text-heat-600 dark:bg-heat-950/60 dark:text-heat-400 border border-heat-500/20 shadow-sm">
          <Mail className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Check your email
        </h2>
        <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-sm mx-auto">
          We&apos;ve sent a verification link to:
          <br />
          <span className="font-semibold text-zinc-900 dark:text-zinc-200 break-all">
            {displayEmail}
          </span>
        </p>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          Click the link in the email to activate your Heat Chat account.
        </p>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div
          className="flex items-start gap-2.5 rounded-xl bg-red-50 p-3 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-900/50"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Success Alert */}
      {resendStatus?.success && (
        <div
          className="flex items-start gap-2.5 rounded-xl bg-emerald-50 p-3 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50"
          role="status"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
          <span>{resendStatus.message}</span>
        </div>
      )}

      {/* Primary Action Buttons */}
      <div className="space-y-3 pt-2">
        <Button
          onClick={handleCheckStatus}
          variant="heat"
          size="lg"
          className="w-full gap-2 font-semibold shadow-md shadow-heat-500/20"
          disabled={isChecking}
        >
          {isChecking ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <>
              <span>I&apos;ve verified my email</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>

        <Button
          onClick={handleResend}
          variant="outline"
          size="default"
          className="w-full gap-2 text-xs"
          disabled={cooldown > 0 || isResending}
        >
          {isResending ? (
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-500 border-t-transparent" />
          ) : (
            <>
              <Send className="h-3.5 w-3.5" />
              <span>
                {cooldown > 0
                  ? `Resend available in ${cooldown}s`
                  : "Resend verification email"}
              </span>
            </>
          )}
        </Button>
      </div>

      {/* Secondary Options */}
      <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-col items-center gap-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
        <button
          type="button"
          onClick={handleSignOutAndChange}
          className="flex items-center gap-1.5 font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Sign in with a different account</span>
        </button>
        <Link
          href="/login"
          className="font-medium text-heat-600 hover:text-heat-500 dark:text-heat-400 hover:underline"
        >
          Back to Log In
        </Link>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <React.Suspense
      fallback={
        <div className="h-64 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-heat-500 border-t-transparent" />
        </div>
      }
    >
      <VerifyEmailContent />
    </React.Suspense>
  );
}
