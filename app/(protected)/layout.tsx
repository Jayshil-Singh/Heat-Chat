"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/layout/app-shell";
import { FriendsProvider } from "@/hooks/use-friends-context";
import { ConversationsProvider } from "@/hooks/use-conversations";
import { Flame } from "lucide-react";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, isLoading, status, isEmailVerified } = useAuth();

  React.useEffect(() => {
    if (!isLoading) {
      if (status === "unauthenticated" || !user) {
        router.replace("/login");
      } else if (status === "authenticated-unverified" || !isEmailVerified || !user.email_confirmed_at) {
        router.replace("/verify-email");
      }
    }
  }, [isLoading, status, user, isEmailVerified, router]);

  // While resolving authentication session, show a neutral loading state (NO sidebar flash)
  if (isLoading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-white dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-14 w-14 animate-pulse items-center justify-center rounded-2xl bg-gradient-to-tr from-heat-600 via-heat-500 to-amber-400 text-white shadow-xl shadow-heat-500/30">
            <Flame className="h-8 w-8 fill-current" />
          </div>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 animate-pulse">
            Connecting to Heat Chat...
          </p>
        </div>
      </div>
    );
  }

  // If unauthenticated or unverified, do NOT render AppShell or sidebar into the DOM
  if (status !== "authenticated-verified" || !user || !user.email_confirmed_at) {
    return null;
  }

  // User is confirmed authenticated AND email verified: render full AppShell
  // FriendsProvider and ConversationsProvider are the single owners of their realtime channels.
  return (
    <FriendsProvider>
      <ConversationsProvider>
        <AppShell>{children}</AppShell>
      </ConversationsProvider>
    </FriendsProvider>
  );
}

