"use client";

import * as React from "react";
import Link from "next/link";
import {
  Mail,
  KeyRound,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  Loader2,
  Flame,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validateEmail } from "@/lib/validation/auth";
import { getCallbackUrl } from "@/lib/utils/site-url";

export default function ResetPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSuccess, setIsSuccess] = React.useState(false);

  const supabase = React.useMemo(() => createClient(), []);

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
      const redirectUrl = getCallbackUrl("/auth/callback?next=/update-password");
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

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-zinc-50 dark:bg-zinc-950">
      <div className="w-full max-w-md space-y-6 rounded-3xl border border-zinc-200/80 bg-white/90 p-8 shadow-xl backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="flex flex-col items-center justify-center space-y-2">
          <Link
            href="/"
            className="flex items-center gap-2.5 transition-transform hover:scale-105"
            title="Heat Chat"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-heat-600 via-heat-500 to-amber-400 text-white shadow-lg shadow-heat-500/30">
              <Flame className="h-6 w-6 fill-current" />
            </div>
          </Link>
          <div className="text-center">
            <h1 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white">
              Heat Chat
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Private friends chat
            </p>
          </div>
        </div>

        {isSuccess ? (
          <div className="space-y-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <CheckCircle2 className="h-6 w-6" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
                Check your email
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto leading-relaxed">
                We have sent a secure password reset link to{" "}
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">{email}</span>. Click the link in the email to set a new password.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <Link href="/login">
                <Button variant="heat" className="w-full">
                  Back to Login
                </Button>
              </Link>
              <button
                type="button"
                onClick={() => {
                  setIsSuccess(false);
                  setEmail("");
                }}
                className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
              >
                Didn&apos;t receive it? Try another email
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-1 text-center">
              <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
                Forgot your password?
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Enter your account email and we will send you a link to reset your password.
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

            <form onSubmit={handleRequestReset} className="space-y-4" noValidate>
              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
                >
                  Email Address
                </label>
                <div className="relative">
                  <Input
                    id="email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    className={`pl-10 ${
                      errors.email ? "border-red-500 focus-visible:ring-red-500" : ""
                    }`}
                  />
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
                </div>
                {errors.email && (
                  <p className="mt-1 text-xs text-red-500">{errors.email}</p>
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
                    <span>Sending Reset Link...</span>
                  </>
                ) : (
                  <span>Send Reset Link</span>
                )}
              </Button>
            </form>

            <div className="text-center pt-2">
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back to Login</span>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
