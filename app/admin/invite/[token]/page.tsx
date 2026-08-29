"use client";

import * as React from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ShieldCheck,
  Lock,
  User,
  Mail,
  AlertCircle,
  ArrowRight,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";

export default function AdminInviteAcceptPage() {
  const router = useRouter();
  const params = useParams();
  const token = params?.token as string;

  const [isLoadingToken, setIsLoadingToken] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [tokenError, setTokenError] = React.useState<string | null>(null);

  const [invitedEmail, setInvitedEmail] = React.useState("");
  const [roleName, setRoleName] = React.useState("");
  const [invitedBy, setInvitedBy] = React.useState("");

  const [displayName, setDisplayName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function validateToken() {
      if (!token) {
        setTokenError("Missing invitation token.");
        setIsLoadingToken(false);
        return;
      }

      try {
        const res = await fetch(`/api/admin/auth/invite/${token}`);
        const data = await res.json();

        if (!res.ok || !data.valid) {
          setTokenError(data.error || "This invitation link is invalid, expired, or has already been used.");
        } else {
          setInvitedEmail(data.email || "");
          setRoleName(data.roleName || "Administrator");
          setInvitedBy(data.invitedBy || "System");
          setDisplayName(data.email?.split("@")[0] || "");
        }
      } catch (err) {
        console.error("Token validation error:", err);
        setTokenError("Failed to validate invitation token.");
      } finally {
        setIsLoadingToken(false);
      }
    }

    validateToken();
  }, [token]);

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();
    if (!password || !confirmPassword) {
      setErrorMsg("Password is required.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setErrorMsg("Password must be at least 8 characters long.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/admin/auth/invite/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.message || data.error || "Failed to complete account activation.");
        setIsSubmitting(false);
        return;
      }

      if (data.isEmailVerified) {
        // Proceed to MFA setup
        router.replace("/admin/mfa/setup");
      } else {
        router.replace("/admin/verify-email");
      }
    } catch (err) {
      console.error("Invite acceptance error:", err);
      setErrorMsg("Network error during invitation acceptance.");
      setIsSubmitting(false);
    }
  }

  if (isLoadingToken) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-zinc-950 text-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-heat-500" />
          <p className="text-xs text-zinc-400">Validating Administrator Invitation...</p>
        </div>
      </div>
    );
  }

  if (tokenError) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-zinc-950 p-4 text-zinc-100">
        <div className="w-full max-w-md space-y-6 rounded-3xl border border-zinc-800 bg-zinc-900/90 p-8 text-center shadow-2xl backdrop-blur-xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 text-red-400 border border-red-500/20">
            <AlertCircle className="h-9 w-9" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-white">Invitation Invalid</h1>
            <p className="text-xs leading-relaxed text-zinc-400">{tokenError}</p>
          </div>
          <div className="pt-2">
            <Link href="/admin/login">
              <Button variant="heat" size="lg" className="w-full">
                Go to Admin Login
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-zinc-950 px-4 py-12 text-zinc-100">
      <div className="relative w-full max-w-lg space-y-8 rounded-3xl border border-zinc-800/80 bg-zinc-900/90 p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-heat-600 via-heat-500 to-amber-400 text-white shadow-xl shadow-heat-500/25">
            <ShieldCheck className="h-9 w-9" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Administrator Invitation</h1>
            <p className="text-xs text-zinc-400 mt-1">
              You have been invited by <span className="text-zinc-200 font-semibold">{invitedBy}</span> as an{" "}
              <span className="text-amber-400 font-semibold">{roleName}</span>.
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
            <p>{errorMsg}</p>
          </div>
        )}

        <form onSubmit={handleAccept} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Assigned Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
              <Input
                type="email"
                value={invitedEmail}
                disabled
                className="pl-10 bg-zinc-950/60 border-zinc-800/60 text-zinc-400 cursor-not-allowed"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Display Name
            </label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <Input
                type="text"
                placeholder="Your Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="pl-10 bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-heat-500"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Set Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <Input
                  type="password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-heat-500"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <Input
                  type="password"
                  placeholder="••••••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10 bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-heat-500"
                  required
                />
              </div>
            </div>
          </div>

          <Button
            type="submit"
            variant="heat"
            size="lg"
            className="w-full mt-2 font-medium"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Activating Account...
              </>
            ) : (
              <>
                Accept Invitation & Setup MFA
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </form>

        <div className="border-t border-zinc-800/80 pt-6 text-center text-xs text-zinc-500">
          <p>MFA enrollment is mandatory for all Heat Chat administrators.</p>
        </div>
      </div>
    </div>
  );
}
