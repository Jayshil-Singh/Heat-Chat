"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ShieldAlert,
  ShieldCheck,
  KeyRound,
  Mail,
  User,
  Lock,
  QrCode,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Loader2,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";

type SetupStep = "CHECKING" | "LOCKED" | "INITIAL" | "EMAIL_PENDING" | "MFA_SETUP" | "ACTIVE";

export default function AdminSetupPage() {
  const router = useRouter();
  const [step, setStep] = React.useState<SetupStep>("CHECKING");
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Form states
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [userId, setUserId] = React.useState<string | null>(null);

  // MFA states
  const [factorId, setFactorId] = React.useState<string | null>(null);
  const [qrCode, setQrCode] = React.useState<string | null>(null);
  const [secret, setSecret] = React.useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = React.useState<string[]>([]);
  const [totpCode, setTotpCode] = React.useState("");
  const [copiedSecret, setCopiedSecret] = React.useState(false);

  // Check setup availability on mount
  React.useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch("/api/admin/auth/setup/status");
        if (!res.ok) {
          setStep("LOCKED");
          return;
        }
        const data = await res.json();
        if (data.bootstrapAvailable) {
          setStep("INITIAL");
        } else {
          setStep("LOCKED");
        }
      } catch (err) {
        console.error("Status check error:", err);
        setStep("LOCKED");
      }
    }

    checkStatus();
  }, []);

  // Step 1: Submit Initial Registration
  async function handleInitialSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !email || !password || !confirmPassword) {
      setErrorMsg("All fields are required.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setErrorMsg("Password must be at least 8 characters in length.");
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/admin/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.message || data.error || "Failed to initialize setup.");
        setIsLoading(false);
        return;
      }

      setUserId(data.userId);

      if (data.isEmailVerified) {
        // Email auto-confirmed (dev env) -> proceed directly to MFA enrollment
        await startMfaEnrollment();
      } else {
        setStep("EMAIL_PENDING");
      }
      setIsLoading(false);
    } catch (err) {
      console.error("Setup error:", err);
      setErrorMsg("Network error during setup.");
      setIsLoading(false);
    }
  }

  // Step 2: Check Email Confirmation Status
  async function checkEmailVerification() {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/mfa/status");
      if (res.ok) {
        // Email is confirmed -> proceed to MFA
        await startMfaEnrollment();
      } else {
        setErrorMsg("Email address is not verified yet. Please check your inbox and click the verification link.");
      }
    } catch (err) {
      console.error("Verification check error:", err);
      setErrorMsg("Failed to verify status.");
    } finally {
      setIsLoading(false);
    }
  }

  // Step 3: Initiate MFA Enrollment
  async function startMfaEnrollment() {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/mfa/enroll", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.message || "Failed to generate MFA setup factor.");
        return;
      }

      setFactorId(data.factorId);
      setQrCode(data.qrCode);
      setSecret(data.secret);
      setRecoveryCodes(data.recoveryCodes || []);
      setStep("MFA_SETUP");
    } catch (err) {
      console.error("MFA enrollment error:", err);
      setErrorMsg("Failed to generate MFA enrollment QR code.");
    } finally {
      setIsLoading(false);
    }
  }

  // Step 4: Verify TOTP Code and Activate SuperAdmin
  async function handleMfaVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!totpCode || totpCode.length !== 6) {
      setErrorMsg("Please enter the 6-digit authenticator code.");
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/admin/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factorId, code: totpCode }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.message || "Invalid 6-digit authenticator code.");
        setIsLoading(false);
        return;
      }

      // Complete atomic Primary SuperAdmin activation
      if (userId) {
        await fetch("/api/admin/auth/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, name }),
        });
      }

      setStep("ACTIVE");
    } catch (err) {
      console.error("MFA activation error:", err);
      setErrorMsg("Failed to complete SuperAdmin activation.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleCopySecret() {
    if (secret) {
      navigator.clipboard.writeText(secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  }

  // Step: CHECKING
  if (step === "CHECKING") {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-zinc-950 text-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-heat-500" />
          <p className="text-xs text-zinc-400">Verifying First-Run Setup Status...</p>
        </div>
      </div>
    );
  }

  // Step: LOCKED (409 Conflict)
  if (step === "LOCKED") {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-zinc-950 p-4 text-zinc-100">
        <div className="w-full max-w-md space-y-6 rounded-3xl border border-zinc-800 bg-zinc-900/90 p-8 text-center shadow-2xl backdrop-blur-xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <ShieldAlert className="h-9 w-9" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-white">409 — Setup Closed</h1>
            <p className="text-xs leading-relaxed text-zinc-400">
              Initial administrator setup has already been completed for this platform. The first-run bootstrap process is permanently locked.
            </p>
          </div>
          <div className="pt-2">
            <Link href="/admin/login">
              <Button variant="heat" size="lg" className="w-full">
                Go to Administrator Login
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Step: EMAIL_PENDING
  if (step === "EMAIL_PENDING") {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-zinc-950 p-4 text-zinc-100">
        <div className="w-full max-w-md space-y-6 rounded-3xl border border-zinc-800 bg-zinc-900/90 p-8 text-center shadow-2xl backdrop-blur-xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-heat-500/10 text-heat-400 border border-heat-500/20">
            <Mail className="h-9 w-9" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-white">Verify Admin Email</h1>
            <p className="text-xs leading-relaxed text-zinc-400">
              We sent a verification link to <span className="font-semibold text-zinc-200">{email}</span>. Please click the link to confirm your email before proceeding to MFA enrollment.
            </p>
          </div>

          {errorMsg && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              {errorMsg}
            </div>
          )}

          <Button
            onClick={checkEmailVerification}
            variant="heat"
            size="lg"
            className="w-full"
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            I Have Verified My Email
          </Button>
        </div>
      </div>
    );
  }

  // Step: MFA_SETUP
  if (step === "MFA_SETUP") {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-zinc-950 p-4 py-12 text-zinc-100">
        <div className="w-full max-w-lg space-y-6 rounded-3xl border border-zinc-800 bg-zinc-900/90 p-8 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-heat-600 via-heat-500 to-amber-400 text-white shadow-xl shadow-heat-500/25">
              <KeyRound className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-bold text-white">Secure SuperAdmin Account</h1>
            <p className="text-xs text-zinc-400">Scan the QR code with your Authenticator App (Google Authenticator, Microsoft Authenticator, 1Password, Authy).</p>
          </div>

          {/* QR Code Container */}
          {qrCode && (
            <div className="flex flex-col items-center justify-center rounded-2xl bg-white p-6 shadow-inner">
              {/* If SVG data URI or raw SVG */}
              {qrCode.startsWith("data:image/svg") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrCode} alt="TOTP QR Code" className="h-48 w-48" />
              ) : (
                <div
                  className="h-48 w-48 flex items-center justify-center"
                  dangerouslySetInnerHTML={{ __html: qrCode }}
                />
              )}
            </div>
          )}

          {/* Manual Secret Key */}
          {secret && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Manual Setup Key
              </label>
              <div className="flex items-center gap-2 rounded-xl bg-zinc-950 border border-zinc-800 p-2.5">
                <code className="flex-1 font-mono text-xs text-amber-400 tracking-widest break-all select-all">
                  {secret}
                </code>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleCopySecret}
                  className="h-8 w-8 p-0 text-zinc-400 hover:text-white"
                >
                  {copiedSecret ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}

          {/* Recovery Codes */}
          {recoveryCodes.length > 0 && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                <ShieldAlert className="h-4 w-4" />
                <span>Backup Recovery Codes (Save These)</span>
              </div>
              <p className="text-[11px] text-zinc-500">Store these single-use codes safely. They will not be shown again.</p>
              <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px] text-zinc-300">
                {recoveryCodes.map((code, idx) => (
                  <div key={idx} className="rounded bg-zinc-900 px-2 py-1 select-all">
                    {code}
                  </div>
                ))}
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="flex items-start gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
              <p>{errorMsg}</p>
            </div>
          )}

          {/* 6-Digit Code Verification */}
          <form onSubmit={handleMfaVerify} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Enter 6-Digit Authenticator Code
              </label>
              <Input
                type="text"
                placeholder="000000"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                className="text-center font-mono text-xl tracking-widest bg-zinc-950 border-zinc-800 text-white focus-visible:ring-heat-500"
                required
              />
            </div>

            <Button
              type="submit"
              variant="heat"
              size="lg"
              className="w-full font-medium"
              disabled={isLoading || totpCode.length !== 6}
            >
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Verify MFA & Activate SuperAdmin
            </Button>
          </form>
        </div>
      </div>
    );
  }

  // Step: ACTIVE
  if (step === "ACTIVE") {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-zinc-950 p-4 text-zinc-100">
        <div className="w-full max-w-md space-y-6 rounded-3xl border border-emerald-500/30 bg-zinc-900/90 p-8 text-center shadow-2xl backdrop-blur-xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="h-9 w-9" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-white">Primary SuperAdmin Active</h1>
            <p className="text-xs leading-relaxed text-zinc-400">
              The platform bootstrap has finished. Your account has been provisioned as <span className="font-semibold text-amber-400">Primary SuperAdmin (Level 100)</span> with mandatory MFA enabled.
            </p>
          </div>
          <div className="pt-2">
            <Button
              onClick={() => router.push("/admin/dashboard")}
              variant="heat"
              size="lg"
              className="w-full"
            >
              Enter Admin Portal
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Step: INITIAL Form
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-zinc-950 px-4 py-12 text-zinc-100">
      <div className="relative w-full max-w-lg space-y-8 rounded-3xl border border-zinc-800/80 bg-zinc-900/90 p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-heat-600 via-heat-500 to-amber-400 text-white shadow-xl shadow-heat-500/25">
            <ShieldCheck className="h-9 w-9" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">First-Run Admin Setup</h1>
            <p className="text-xs text-zinc-400 mt-1">
              Initialize the Primary SuperAdmin account for Heat Chat.
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
            <p>{errorMsg}</p>
          </div>
        )}

        <form onSubmit={handleInitialSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Administrator Name
            </label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <Input
                type="text"
                placeholder="Chief Administrator"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="pl-10 bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-heat-500"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Admin Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <Input
                type="email"
                placeholder="superadmin@heatchat.app"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-heat-500"
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Password
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
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Initializing...
              </>
            ) : (
              <>
                Continue to Email & MFA Verification
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </form>

        <div className="border-t border-zinc-800/80 pt-6 text-center text-xs text-zinc-500 space-y-1">
          <p>This wizard will permanently close after the first Primary SuperAdmin is provisioned.</p>
        </div>
      </div>
    </div>
  );
}
