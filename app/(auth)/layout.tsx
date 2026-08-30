import * as React from "react";
import Link from "next/link";
import { Flame } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center bg-zinc-50 px-4 py-8 dark:bg-zinc-950 sm:px-6 lg:px-8">
      {/* Background ambient glow */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
        <div className="h-96 w-96 rounded-full bg-gradient-to-tr from-heat-500/10 to-amber-500/10 blur-3xl dark:from-heat-500/5 dark:to-amber-500/5" />
      </div>

      <div className="relative w-full max-w-md space-y-6">
        {/* Header Branding */}
        <div className="flex flex-col items-center text-center">
          <Link
            href="/"
            className="flex items-center gap-3 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-500 rounded-2xl p-1"
            title="Heat Chat"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-heat-600 via-heat-500 to-amber-400 text-white shadow-lg shadow-heat-500/30">
              <Flame className="h-7 w-7 fill-current" />
            </div>
          </Link>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Heat Chat
          </h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Private conversations. Close connections.
          </p>
        </div>

        {/* Card Container */}
        <div className="rounded-3xl border border-zinc-200/80 bg-white p-6 sm:p-8 shadow-xl shadow-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-900/80 dark:shadow-black/40 backdrop-blur-xl">
          {children}
        </div>
      </div>
    </div>
  );
}
