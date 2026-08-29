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
  ShieldCheck,
  KeyRound,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, refreshUser, resendVerificationEmail, signOut } = useAuth();
  const supabase = React.useMemo(() => createClient(), []);

  const urlEmail = searchParams.get("email") || "";
  const urlError = searchParams.get("error") || "";

  const displayEmail = user?.email || urlEmail || "";

  const [otp, setOtp] = React.useState<string[]>(["", "", "", "", "", ""]);
  const inputRefs = React.useRef<(HTMLInputElement | null)[]>([]);

  const [isVerifying, setIsVerifying] = React.useState(false);
  const [isResending, setIsResending] = React.useState(false);
  const [resendStatus, setResendStatus] = React.useState<{
    success?: boolean;
    message?: string;
  } | null>(null);
  const [cooldown, setCooldown] = React.useState(0);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(
    urlError ? decodeURIComponent(urlError) : null
  );

  // Auto-focus first input on mount
  React.useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Resend cooldown timer
  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleOtpChange = (index: number, value: string) => {
    // Only accept numeric characters
    const cleanVal = value.replace(/\D/g, "");
    if (!cleanVal && value !== "") return;

    setErrorMessage(null);
    const newOtp = [...otp];

    if (cleanVal.length > 1) {
      // User typed or autofilled multiple digits
      const digits = cleanVal.slice(0, 6).split("");
      for (let i = 0; i < 6; i++) {
        newOtp[i] = digits[i] || "";
      }
      setOtp(newOtp);
      const nextIdx = Math.min(digits.length, 5);
      inputRefs.current[nextIdx]?.focus();
      return;
    }

    newOtp[index] = cleanVal;
    setOtp(newOtp);

    // Auto-advance to next input
    if (cleanVal && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (!otp[index] && index > 0) {
        // Empty box backspace: move to previous and clear it
        const newOtp = [...otp];
        newOtp[index - 1] = "";
        setOtp(newOtp);
        inputRefs.current[index - 1]?.focus();
      } else {
        const newOtp = [...otp];
        newOtp[index] = "";
        setOtp(newOtp);
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!pastedData) return;

    setErrorMessage(null);
    const digits = pastedData.slice(0, 6).split("");
    const newOtp = ["", "", "", "", "", ""];
    for (let i = 0; i < digits.length; i++) {
      newOtp[i] = digits[i];
    }
    setOtp(newOtp);

    const focusIdx = Math.min(digits.length, 5);
    inputRefs.current[focusIdx]?.focus();
  };

  const fullCode = otp.join("");
  const isComplete = fullCode.length === 6;

  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isComplete || isVerifying) return;

    if (!displayEmail) {
      setErrorMessage("No email address provided. Please return to the login screen.");
      return;
    }

    setIsVerifying(true);
    setErrorMessage(null);
    setResendStatus(null);

    try {
      // 1. Verify 6-digit OTP code with Supabase Auth using type: "email"
      let verifyRes = await supabase.auth.verifyOtp({
        email: displayEmail.trim(),
        token: fullCode,
        type: "email",
      });

      if (verifyRes.error) {
        // Fallback check with type: "signup"
        const signupRes = await supabase.auth.verifyOtp({
          email: displayEmail.trim(),
          token: fullCode,
          type: "signup",
        });
        if (!signupRes.error) {
          verifyRes = signupRes;
        }
      }

      if (verifyRes.error) {
        const msg = verifyRes.error.message.toLowerCase();
        if (msg.includes("expired") || msg.includes("invalid")) {
          setErrorMessage("That code is invalid or has expired. Please request a new code.");
        } else if (msg.includes("rate limit") || msg.includes("too many")) {
          setErrorMessage("Too many attempts. Please wait and try again.");
        } else {
          setErrorMessage("That code is invalid or has expired. Please request a new code.");
        }
        setIsVerifying(false);
        return;
      }

      // 2. CRITICAL: Clear temporary session to require explicit credential sign-in
      await supabase.auth.signOut();

      // 3. Redirect to /login?verified=true (DO NOT auto-enter /chat)
      router.replace("/login?verified=true");
    } catch (err) {
      console.error("OTP verification error:", err);
      setErrorMessage("A network error occurred during verification. Please try again.");
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || isResending) return;
    if (!displayEmail) {
      setErrorMessage("No email address provided to resend code.");
      return;
    }

    setIsResending(true);
    setResendStatus(null);
    setErrorMessage(null);

    try {
      const res = await resendVerificationEmail(displayEmail);

      if (res.success) {
        setResendStatus({
          success: true,
          message: "A new 6-digit code has been sent to your email.",
        });
        setCooldown(60);
        // Clear previous input
        setOtp(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
      } else {
        setResendStatus({
          success: false,
          message: res.error || "Failed to resend code. Please try again.",
        });
      }
    } catch {
      setResendStatus({
        success: false,
        message: "Failed to resend code. Please try again.",
      });
    } finally {
      setIsResending(false);
    }
  };

  const handleSignOutAndChange = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <div className="space-y-6">
      {/* Icon & Title */}
      <div className="space-y-2 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-heat-500/10 text-heat-600 dark:bg-heat-950/60 dark:text-heat-400 border border-heat-500/20 shadow-sm">
          <KeyRound className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Verify your email
        </h2>
        <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-sm mx-auto">
          Enter the 6-digit code we sent to:
          <br />
          <span className="font-semibold text-zinc-900 dark:text-zinc-200 break-all">
            {displayEmail || "your email"}
          </span>
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

      {/* Success / Resend Alert */}
      {resendStatus?.success && (
        <div
          className="flex items-start gap-2.5 rounded-xl bg-emerald-50 p-3 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50"
          role="status"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
          <span>{resendStatus.message}</span>
        </div>
      )}

      {/* 6-Digit OTP Form */}
      <form onSubmit={handleVerifyOtp} className="space-y-6">
        <div className="flex items-center justify-center gap-2 sm:gap-3">
          {otp.map((digit, idx) => (
            <input
              key={idx}
              ref={(el) => {
                inputRefs.current[idx] = el;
              }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete={idx === 0 ? "one-time-code" : "off"}
              maxLength={1}
              value={digit}
              onChange={(e) => handleOtpChange(idx, e.target.value)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              onPaste={handlePaste}
              aria-label={`Digit ${idx + 1} of verification code`}
              className={`h-12 w-10 sm:h-14 sm:w-12 rounded-xl text-center font-mono text-xl font-bold text-zinc-900 dark:text-white transition-all outline-none border ${
                digit
                  ? "border-heat-500 bg-heat-500/5 ring-2 ring-heat-500/20"
                  : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80 focus:border-heat-500 focus:ring-2 focus:ring-heat-500/20"
              }`}
            />
          ))}
        </div>

        {/* Primary Action Button */}
        <div className="space-y-3">
          <Button
            type="submit"
            variant="heat"
            size="lg"
            className="w-full gap-2 font-semibold shadow-md shadow-heat-500/20"
            disabled={!isComplete || isVerifying}
          >
            {isVerifying ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <>
                <span>Verify Email</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>

          {/* Resend Button */}
          <Button
            type="button"
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
                  {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend Code"}
                </span>
              </>
            )}
          </Button>
        </div>
      </form>

      {/* Secondary Options */}
      <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-col items-center gap-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
        <button
          type="button"
          onClick={handleSignOutAndChange}
          className="flex items-center gap-1.5 font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Use a different email / account</span>
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
