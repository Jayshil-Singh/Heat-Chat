"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  Copy,
  Check,
  Loader2,
  ArrowRight,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AdminMfaSetupPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = React.useState(true);
  const [isVerifying, setIsVerifying] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const [factorId, setFactorId] = React.useState<string | null>(null);
  const [qrCode, setQrCode] = React.useState<string | null>(null);
  const [secret, setSecret] = React.useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = React.useState<string[]>([]);
  const [totpCode, setTotpCode] = React.useState("");
  const [copiedSecret, setCopiedSecret] = React.useState(false);

  React.useEffect(() => {
    async function initEnrollment() {
      try {
        const res = await fetch("/api/admin/mfa/enroll", { method: "POST" });
        const data = await res.json();

        if (!res.ok) {
          setErrorMsg(data.message || "Failed to initialize MFA enrollment.");
          setIsLoading(false);
          return;
        }

        setFactorId(data.factorId);
        setQrCode(data.qrCode);
        setSecret(data.secret);
        setRecoveryCodes(data.recoveryCodes || []);
      } catch (err) {
        console.error("MFA enroll error:", err);
        setErrorMsg("Network error initiating MFA setup.");
      } finally {
        setIsLoading(false);
      }
    }

    initEnrollment();
  }, []);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!totpCode || totpCode.length !== 6) {
      setErrorMsg("Please enter the 6-digit code from your authenticator app.");
      return;
    }

    setIsVerifying(true);
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
        setIsVerifying(false);
        return;
      }

      // Success -> Redirect to Admin Dashboard
      router.replace("/admin/dashboard");
    } catch (err) {
      console.error("MFA verify error:", err);
      setErrorMsg("Failed to verify authenticator code.");
      setIsVerifying(false);
    }
  }

  function handleCopySecret() {
    if (secret) {
      navigator.clipboard.writeText(secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-zinc-950 text-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-heat-500" />
          <p className="text-xs text-zinc-400">Configuring Multi-Factor Authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-zinc-950 px-4 py-12 text-zinc-100">
      <div className="relative w-full max-w-lg space-y-6 rounded-3xl border border-zinc-800/80 bg-zinc-900/90 p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-heat-600 via-heat-500 to-amber-400 text-white shadow-xl shadow-heat-500/25">
            <KeyRound className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Setup Authenticator (MFA)</h1>
          <p className="text-xs text-zinc-400 max-w-sm">
            Scan this QR code with Google Authenticator, Microsoft Authenticator, 1Password, or Authy.
          </p>
        </div>

        {errorMsg && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
            <p>{errorMsg}</p>
          </div>
        )}

        {/* QR Code Container */}
        {qrCode && (
          <div className="flex flex-col items-center justify-center rounded-2xl bg-white p-6 shadow-inner">
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

        {/* Manual Setup Key */}
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
            <p className="text-[11px] text-zinc-500">
              If you lose your authenticator app, these single-use codes are your only backup.
            </p>
            <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px] text-zinc-300">
              {recoveryCodes.map((code, idx) => (
                <div key={idx} className="rounded bg-zinc-900 px-2 py-1 select-all">
                  {code}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 6-Digit TOTP Verification Form */}
        <form onSubmit={handleVerify} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Enter 6-Digit Code to Confirm
            </label>
            <Input
              type="text"
              placeholder="000000"
              maxLength={6}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
              className="text-center font-mono text-xl tracking-widest bg-zinc-950 border-zinc-800 text-white focus-visible:ring-heat-500"
              required
              autoFocus
            />
          </div>

          <Button
            type="submit"
            variant="heat"
            size="lg"
            className="w-full font-medium"
            disabled={isVerifying || totpCode.length !== 6}
          >
            {isVerifying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verifying MFA...
              </>
            ) : (
              <>
                Confirm MFA & Enter Portal
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
