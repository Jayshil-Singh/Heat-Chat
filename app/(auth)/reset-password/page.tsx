"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  KeyRound,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  validateEmail,
  validatePassword,
  validatePasswordConfirm,
} from "@/lib/validation/auth";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [isUpdateMode, setIsUpdateMode] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSuccess, setIsSuccess] = React.useState(false);

  const supabase = React.useMemo(() => createClient(), []);

  // Check if the user is in a recovery session (opened via reset email link)
  React.useEffect(() => {
    supabase.auth.onAuthStateChange(async (event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsUpdateMode(true);
      }
    });

    // Also check hash parameters if arriving directly from email
    if (typeof window !== "undefined" && window.location.hash.includes("type=recovery")) {
      setIsUpdateMode(true);
    }
  }, [supabase]);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const emailErr = validateEmail(email);
    if (emailErr) {
      setErrors({ email: emailErr });
      return;
    }

    setIsLoading(true);

    try {
      const redirectUrl = `${window.location.origin}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: redirectUrl,
      });

      if (error) {
        setErrors({ general: error.message || "Failed to send reset link." });
        return;
      }

      setIsSuccess(true);
    } catch {
      setErrors({ general: "A network error occurred. Please try again." });
    } finally {
      setIsLoading(false);
    }
  };

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
        return;
      }

      setIsSuccess(true);
      setTimeout(() => {
        router.push("/chat");
      }, 2500);
    } catch {
      setErrors({ general: "A network error occurred. Please try again." });
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess && !isUpdateMode) {
    return (
      <div className="space-y-6 text-center py-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Reset Link Sent!
          </h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-sm mx-auto">
            If an account exists for <span className="font-semibold text-zinc-900 dark:text-zinc-200">{email}</span>, you will receive password reset instructions shortly.
          </p>
        </div>
        <div className="pt-2">
          <Link href="/login">
            <Button variant="secondary" size="lg" className="w-full gap-2">
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Login</span>
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (isSuccess && isUpdateMode) {
    return (
      <div className="space-y-6 text-center py-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Password Updated!
          </h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Your password has been successfully updated. Redirecting to your chats...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
          {isUpdateMode ? "Set New Password" : "Reset your password"}
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {isUpdateMode
            ? "Enter your new password below."
            : "Enter your registered email and we will send a password reset link."}
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

      {isUpdateMode ? (
        <form onSubmit={handleUpdatePassword} className="space-y-4" noValidate>
          <div>
            <label
              htmlFor="password"
              className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
            >
              New Password
            </label>
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              name="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              leftIcon={<Lock className="h-4 w-4" />}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="focus-visible:outline-none hover:text-zinc-600 dark:hover:text-zinc-200"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              }
              error={errors.password}
              helperText="Minimum 8 characters with letters and numbers"
              disabled={isLoading}
              required
            />
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
            >
              Confirm New Password
            </label>
            <Input
              id="confirmPassword"
              type={showPassword ? "text" : "password"}
              name="confirmPassword"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              leftIcon={<Lock className="h-4 w-4" />}
              error={errors.confirmPassword}
              disabled={isLoading}
              required
            />
          </div>

          <Button
            type="submit"
            variant="heat"
            size="lg"
            className="w-full gap-2 mt-2"
            disabled={isLoading}
          >
            {isLoading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <>
                <KeyRound className="h-4 w-4" />
                <span>Save New Password</span>
              </>
            )}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleRequestReset} className="space-y-4" noValidate>
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
            >
              Email Address
            </label>
            <Input
              id="email"
              type="email"
              name="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              leftIcon={<Mail className="h-4 w-4" />}
              error={errors.email}
              disabled={isLoading}
              required
            />
          </div>

          <Button
            type="submit"
            variant="heat"
            size="lg"
            className="w-full gap-2 mt-2"
            disabled={isLoading}
          >
            {isLoading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <>
                <KeyRound className="h-4 w-4" />
                <span>Send Reset Link</span>
              </>
            )}
          </Button>
        </form>
      )}

      <div className="text-center text-xs text-zinc-500 dark:text-zinc-400">
        Remember your password?{" "}
        <Link
          href="/login"
          className="font-semibold text-heat-600 hover:text-heat-500 dark:text-heat-400 hover:underline"
        >
          Back to login
        </Link>
      </div>
    </div>
  );
}
