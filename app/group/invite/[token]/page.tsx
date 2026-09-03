"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { Users, Loader2, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export default function GroupInvitePage() {
  const params = useParams();
  const token = params?.token as string;
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();

  const [isJoining, setIsJoining] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [successConversationId, setSuccessConversationId] = React.useState<string | null>(null);

  const handleJoin = async () => {
    if (!token) return;
    setIsJoining(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/groups/join/${encodeURIComponent(token)}`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErrorMessage(json.error?.message || "Failed to join group");
        setIsJoining(false);
        return;
      }

      const convId = json.data?.conversationId;
      setSuccessConversationId(convId);
      setTimeout(() => {
        router.push(`/chat?id=${convId}`);
      }, 1500);
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred");
      setIsJoining(false);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
        <Loader2 className="h-6 w-6 animate-spin text-heat-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
        <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-xl dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-heat-500/10 text-heat-500">
            <Users className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-bold text-zinc-900 dark:text-white">
            Group Invitation
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
            Please log in or create an account on Heat Chat to accept this group invitation.
          </p>
          <Button
            variant="heat"
            className="w-full text-xs h-9"
            onClick={() => router.push(`/login?redirectTo=${encodeURIComponent(`/group/invite/${token}`)}`)}
          >
            Log in to Join
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-xl dark:border-zinc-800 dark:bg-zinc-900 space-y-4 animate-in fade-in">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-heat-500/10 text-heat-500">
          <Users className="h-7 w-7" />
        </div>

        <div>
          <h1 className="text-lg font-bold text-zinc-900 dark:text-white">
            You&apos;re Invited to Join a Group
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Click below to accept the invitation and join the group conversation.
          </p>
        </div>

        {errorMessage && (
          <div
            className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-left text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successConversationId ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Joined successfully! Redirecting to chat...</span>
          </div>
        ) : (
          <Button
            variant="heat"
            className="w-full text-xs h-10 gap-2 font-bold"
            disabled={isJoining}
            onClick={handleJoin}
          >
            {isJoining ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Joining Group...</span>
              </>
            ) : (
              <>
                <span>Join Group</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs text-zinc-400 hover:text-zinc-600"
          onClick={() => router.push("/chat")}
        >
          Decline & Go to Chats
        </Button>
      </div>
    </div>
  );
}
