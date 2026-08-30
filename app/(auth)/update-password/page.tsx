"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  validatePassword,
  validatePasswordConfirm,
} from "@/lib/validation/auth";

function UpdatePasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = React.useState(false);
  const [isCheckingSession, setIsCheckingSession] = React.useState(true);
  const [hasValidSession, setHasValidSession] = React.useState(false);

  const supabase = React.useMemo(() => createClient(), []);

  // Verify recovery session existence
  React.useEffect(() => {
    let isSubscribed = true;

    async function checkRecoverySession() {
      // If callback redirected with an error query param
      const urlError = searchParams.get("error");
      if (urlError) {
        if (isSubscribed) {
          setHasValidSession(false);
          setIsCheckingSession(false);
        }
        return;
      }

      // Check if hash has error
      if (typeof window !== "undefined" && window.location.hash.includes("error=")) {
        if (isSubscribed) {
          setHasValidSession(false);
          setIsCheckingSession(false);
        }
        return;
      }

      // Check for active session / recovery state
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && isSubscribed) {
          setHasValidSession(true);
          setIsCheckingSession(false);
          return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (user && isSubscribed) {
          setHasValidSession(true);
          setIsCheckingSession(false);
          return;
        }

        // Check hash parameters for direct recovery landing
        if (
          typeof window !== "undefined" &&
          (window.location.hash.includes("type=recovery") ||
            window.location.hash.includes("access_token"))
        ) {
          if (isSubscribed) {
            setHasValidSession(true);
            setIsCheckingSession(false);
            return;
          }
        }
      } catch (err) {
        console.error("Session check error:", err);
      }

      if (isSubscribed) {
        setHasValidSession(false);
        setIsCheckingSession(false);
      }
    }

    checkRecoverySession();

    // Listen for auth state change
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isSubscribed) return;
        if (event === "PASSWORD_RECOVERY" || (session && session.user)) {
          setHasValidSession(true);
          setIsCheckingSession(false);
        }
      }
    );

    return () => {
      isSubscribed = false;
      subscription.unsubscribe();
    };
  }, [supabase, searchParams]);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const passErr = validatePassword(password);
    const confirmErr = validatePasswordConfirm(password, confirmPassword);

    const validationErrors: Record<string, string> = {};
    if (passErr) validationErrors.password = passErr;
    if (confirmErr) validationErrors.confirmPassword = confirmErr;

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        setErrors({ general: error.message || "Failed to update password." });
        setIsLoading(false);
        return;
      }

      // Clear recovery session so user explicitly logs in with new credentials
      await supabase.auth.signOut();
      router.replace("/login?reset=success");
    } catch {
      setErrors({ general: "A network error occurred. Please try again." });
      setIsLoading(false);
    }
  };

  if (isCheckingSession) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-3">
        <Loader2 className="h-6 w-6 animate-spin text-heat-500" />
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Verifying password recovery session...
        </p>
      </div>
    );
  }

  // If session is missing or expired
  if (!hasValidSession) {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
          <AlertCircle className="h-6 w-6" />
        </div>

        <div className="space-y-1.5">
          <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Link Invalid or Expired
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto leading-relaxed">
            Your password reset link is invalid or has expired. For your security, password reset links can only be used once and expire shortly after being sent.
          </p>
        </div>

        <div className="space-y-2 pt-2">
          <Link href="/reset-password">
            <Button variant="heat" className="w-full">
              Request New Reset Link
            </Button>
          </Link>
          <Link href="/login">
            <Button variant="outline" className="w-full">
              Back to Login
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Reset your password
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Enter your new password below to secure your Heat Chat account.
        </p>
      </div>

      {errors.general && (
        <div
          className="flex items-center gap-2.5 rounded-xl bg-red-50 p-3 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-900/50"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
          <span>{errors.general}</span>
        </div>
      )}

      <form onSubmit={handleUpdatePassword} className="space-y-4" noValidate>
        <div>
          <label
            htmlFor="password"
            className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
          >
            New Password
          </label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              name="password"
              autoComplete="new-password"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              className={`pl-10 pr-10 ${
                errors.password ? "border-red-500 focus-visible:ring-red-500" : ""
              }`}
            />
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors p-1"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          {errors.password && (
            <p className="mt-1 text-xs text-red-500">{errors.password}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="confirmPassword"
            className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
          >
            Confirm New Password
          </label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              name="confirmPassword"
              autoComplete="new-password"
              placeholder="••••••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isLoading}
              className={`pl-10 pr-10 ${
                errors.confirmPassword ? "border-red-500 focus-visible:ring-red-500" : ""
              }`}
            />
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors p-1"
              aria-label={
                showConfirmPassword ? "Hide confirm password" : "Show confirm password"
              }
            >
              {showConfirmPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          {errors.confirmPassword && (
            <p className="mt-1 text-xs text-red-500">{errors.confirmPassword}</p>
          )}
        </div>

        <Button
          type="submit"
          variant="heat"
          className="w-full mt-2"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              <span>Updating Password...</span>
            </>
          ) : (
            <span>Update Password</span>
          )}
        </Button>
      </form>
    </div>
  );
}

export default function UpdatePasswordPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-heat-500" />
        </div>
      }
    >
      <UpdatePasswordForm />
    </React.Suspense>
  );
}
