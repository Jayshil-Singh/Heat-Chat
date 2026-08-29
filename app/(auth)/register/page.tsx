"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Mail,
  Lock,
  User,
  AtSign,
  Eye,
  EyeOff,
  UserPlus,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  validateEmail,
  validatePassword,
  validatePasswordConfirm,
  validateUsername,
  validateDisplayName,
  sanitizeUsername,
} from "@/lib/validation/auth";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSuccess, setIsSuccess] = React.useState(false);

  const supabase = React.useMemo(() => createClient(), []);

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const clean = sanitizeUsername(raw);
    setUsername(clean);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const emailErr = validateEmail(email);
    const nameErr = validateDisplayName(displayName);
    const userErr = validateUsername(username);
    const passErr = validatePassword(password);
    const confirmErr = validatePasswordConfirm(password, confirmPassword);

    const validationErrors: Record<string, string> = {};
    if (emailErr) validationErrors.email = emailErr;
    if (nameErr) validationErrors.displayName = nameErr;
    if (userErr) validationErrors.username = userErr;
    if (passErr) validationErrors.password = passErr;
    if (confirmErr) validationErrors.confirmPassword = confirmErr;

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsLoading(true);

    try {
      const siteUrl =
        typeof window !== "undefined"
          ? window.location.origin
          : process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            username: username.toLowerCase().trim(),
            display_name: displayName.trim(),
          },
          emailRedirectTo: `${siteUrl}/auth/callback`,
        },
      });

      if (error) {
        if (
          error.message.includes("already registered") ||
          error.message.includes("User already exists")
        ) {
          setErrors({ email: "An account with this email address already exists." });
        } else {
          setErrors({
            general: error.message || "Failed to create account. Please try again.",
          });
        }
        return;
      }

      if (data.user && data.user.email_confirmed_at) {
        router.replace("/chat");
        router.refresh();
        return;
      }

      // Default: User must verify email before entering Heat Chat
      router.replace(`/verify-email?email=${encodeURIComponent(email.trim())}`);
    } catch {
      setErrors({ general: "A network error occurred. Please try again." });
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="space-y-6 text-center py-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Registration Successful!
          </h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-sm mx-auto">
            We sent a verification link to <span className="font-semibold text-zinc-900 dark:text-zinc-200">{email}</span>. Please check your inbox to activate your Heat Chat account.
          </p>
        </div>
        <div className="pt-2">
          <Link href="/login">
            <Button variant="heat" size="lg" className="w-full">
              Proceed to Log In
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
          Create an account
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Join Heat Chat to connect privately with your friends.
        </p>
      </div>

      <div className="rounded-2xl bg-heat-500/10 p-3 text-xs leading-relaxed text-heat-700 dark:text-heat-300 border border-heat-500/20">
        <span className="font-semibold">Email verification required:</span> After
        registering, we&apos;ll send a verification email. You must verify your email
        before entering Heat Chat.
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

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label
            htmlFor="displayName"
            className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
          >
            Display Name
          </label>
          <Input
            id="displayName"
            name="displayName"
            autoComplete="name"
            placeholder="Alex Rivera"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            leftIcon={<User className="h-4 w-4" />}
            error={errors.displayName}
            disabled={isLoading}
            required
          />
        </div>

        <div>
          <label
            htmlFor="username"
            className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
          >
            Unique Username
          </label>
          <Input
            id="username"
            name="username"
            autoComplete="username"
            placeholder="alex_rivera"
            value={username}
            onChange={handleUsernameChange}
            leftIcon={<AtSign className="h-4 w-4" />}
            error={errors.username}
            helperText="3-30 letters, numbers, underscores, or hyphens"
            disabled={isLoading}
            required
          />
        </div>

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

        <div>
          <label
            htmlFor="password"
            className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
          >
            Password
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
            Confirm Password
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
              <UserPlus className="h-4 w-4" />
              <span>Create Account</span>
            </>
          )}
        </Button>
      </form>

      <div className="text-center text-xs text-zinc-500 dark:text-zinc-400">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-semibold text-heat-600 hover:text-heat-500 dark:text-heat-400 hover:underline"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
