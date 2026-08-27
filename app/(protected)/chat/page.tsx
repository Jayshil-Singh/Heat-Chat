"use client";

import * as React from "react";
import { MessageSquare, ShieldCheck, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { EmptyState } from "@/components/ui/empty-state";
import { Avatar } from "@/components/ui/avatar";

export default function ChatPage() {
  const { user, profile } = useAuth();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-8">
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Chats
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Phase 2: Authentication & RLS Protected Space
          </p>
        </div>

        {user && (
          <div className="flex items-center gap-3">
            <Avatar
              src={profile?.avatar_url}
              name={profile?.display_name || user.email || "User"}
              size="default"
              status={profile?.status || "online"}
            />
            <div className="hidden sm:block text-right">
              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                {profile?.display_name || user.email}
              </p>
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1 justify-end">
                <ShieldCheck className="h-3 w-3" />
                Authenticated Session
              </p>
            </div>
          </div>
        )}
      </div>

      <EmptyState
        icon={<MessageSquare className="h-7 w-7 text-heat-500" />}
        title="Protected Chat Area"
        description="Your Supabase session is verified and Row Level Security is active. Real conversations, member lists, and realtime messaging will be unlocked in upcoming phases."
        action={
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3.5 py-1.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900">
            <CheckCircle2 className="h-4 w-4" />
            <span>RLS Active: Users can only access conversations they belong to</span>
          </div>
        }
      />
    </div>
  );
}
