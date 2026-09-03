"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  FileText,
  Lock,
  Eye,
  Trash2,
  AlertTriangle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AdminMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_username: string;
  sender_display_name: string;
  content_preview: string;
  message_type: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export default function AdminMessagesPage() {
  const searchParams = useSearchParams();
  const initialConvId = searchParams.get("conversationId") || "";

  const [messages, setMessages] = React.useState<AdminMessage[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [convId, setConvId] = React.useState(initialConvId);
  const [isLoading, setIsLoading] = React.useState(true);

  // Break-glass modal state
  const [activeMsg, setActiveMsg] = React.useState<AdminMessage | null>(null);
  const [breakGlassReason, setBreakGlassReason] = React.useState("");
  const [revealedContent, setRevealedContent] = React.useState<string | null>(null);
  const [breakGlassError, setBreakGlassError] = React.useState<string | null>(null);
  const [isRevealing, setIsRevealing] = React.useState(false);

  const fetchMessages = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "15",
      });
      if (convId.trim()) params.set("conversationId", convId.trim());

      const res = await fetch(`/api/admin/messages?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      }
    } catch (err) {
      console.error("Failed to load messages:", err);
    } finally {
      setIsLoading(false);
    }
  }, [page, convId]);

  React.useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const handleBreakGlass = async () => {
    if (!activeMsg) return;
    if (!breakGlassReason.trim() || breakGlassReason.trim().length < 5) {
      setBreakGlassError("A justification reason of at least 5 characters is required.");
      return;
    }

    setIsRevealing(true);
    setBreakGlassError(null);

    try {
      const res = await fetch(`/api/admin/messages/${activeMsg.id}/break-glass`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: breakGlassReason.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setBreakGlassError(data.error || "Break-glass authorization denied.");
        return;
      }

      setRevealedContent(data.message.content || "[Empty message body]");
    } catch (err) {
      console.error("Break-glass error:", err);
      setBreakGlassError("Unexpected network error.");
    } finally {
      setIsRevealing(false);
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    const reason = prompt("Reason for deleting message:");
    if (!reason || reason.trim().length < 3) return;

    try {
      const res = await fetch(`/api/admin/messages?id=${msgId}&reason=${encodeURIComponent(reason)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchMessages();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete message.");
      }
    } catch (err) {
      console.error("Delete message error:", err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
            Messages Moderation & Metadata
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {total} messages cataloged. By default, message content is protected and private.
          </p>
        </div>
      </div>

      {/* Privacy Notice Banner */}
      <div className="rounded-3xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-3">
        <Lock className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-bold">Zero-Trust Message Privacy Active</span>
          <p className="leading-relaxed text-[11px] text-amber-700 dark:text-amber-400">
            Message contents are masked. Revealing message content requires explicit break-glass permission and triggers an immutable security audit event.
          </p>
        </div>
      </div>

      {/* Filter by Conversation */}
      <div className="flex items-center gap-2 max-w-md">
        <Input
          placeholder="Filter by Conversation ID (UUID)..."
          value={convId}
          onChange={(e) => {
            setConvId(e.target.value);
            setPage(1);
          }}
          className="text-xs"
        />
        {convId && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConvId("")}
            className="text-xs"
          >
            Clear
          </Button>
        )}
      </div>

      {/* Messages Table */}
      <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-100 bg-zinc-50/75 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
              <tr>
                <th className="px-5 py-3.5">Message ID / Sender</th>
                <th className="px-4 py-3.5">Type</th>
                <th className="px-4 py-3.5">Content Preview</th>
                <th className="px-4 py-3.5">Timestamp</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-zinc-400">
                    Loading messages...
                  </td>
                </tr>
              ) : messages.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-zinc-400">
                    No messages found.
                  </td>
                </tr>
              ) : (
                messages.map((m) => (
                  <tr key={m.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="space-y-0.5">
                        <span className="font-bold text-zinc-900 dark:text-white">
                          @{m.sender_username}
                        </span>
                        <p className="text-[10px] text-zinc-400 font-mono">
                          ID: {m.id.slice(0, 12)}...
                        </p>
                      </div>
                    </td>

                    <td className="px-4 py-3.5 capitalize font-semibold text-zinc-700 dark:text-zinc-300">
                      {m.message_type}
                    </td>

                    <td className="px-4 py-3.5">
                      {m.deleted_at ? (
                        <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400">
                          [Deleted by admin]
                        </span>
                      ) : (
                        <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-mono text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                          {m.content_preview}
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 text-zinc-400">
                      {new Date(m.created_at).toLocaleString()}
                    </td>

                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setActiveMsg(m);
                            setBreakGlassReason("");
                            setRevealedContent(null);
                            setBreakGlassError(null);
                          }}
                          className="h-8 px-2 text-xs text-heat-600 hover:text-heat-700"
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          <span>Break-Glass</span>
                        </Button>

                        {!m.deleted_at && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteMessage(m.id)}
                            className="h-8 px-2 text-xs text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex items-center justify-between border-t border-zinc-100 px-5 py-3 dark:border-zinc-800 text-xs text-zinc-500">
          <span>
            Page {page} of {totalPages} ({total} total)
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="h-8 px-2"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="h-8 px-2"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Break-Glass Inspection Modal */}
      {activeMsg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 backdrop-blur-sm p-4 cursor-pointer"
          onClick={() => {
            if (!isRevealing) setActiveMsg(null);
          }}
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 space-y-4 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-zinc-900 dark:text-white">
                  Break-Glass Message Inspection
                </h3>
                <p className="text-[11px] text-zinc-400">
                  Message #{activeMsg.id.slice(0, 8)} by @{activeMsg.sender_username}
                </p>
              </div>
            </div>

            {breakGlassError && (
              <div className="rounded-xl bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{breakGlassError}</span>
              </div>
            )}

            {revealedContent ? (
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                  Decrypted Message Body (Audited)
                </label>
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950 text-xs font-mono text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap">
                  {revealedContent}
                </div>
                <div className="flex justify-end pt-2">
                  <Button variant="outline" size="sm" onClick={() => setActiveMsg(null)}>
                    Close Inspector
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                  <span className="font-bold">Security Notice:</span> Submitting this request will immediately record your administrator identity and reason into the immutable audit logs.
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                    Justification Reason (Mandatory, min 5 chars)
                  </label>
                  <textarea
                    value={breakGlassReason}
                    onChange={(e) => setBreakGlassReason(e.target.value)}
                    placeholder="Enter formal compliance or investigation justification..."
                    className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
                    rows={3}
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button variant="ghost" size="sm" onClick={() => setActiveMsg(null)}>
                    Cancel
                  </Button>
                  <Button
                    variant="heat"
                    size="sm"
                    disabled={isRevealing}
                    onClick={handleBreakGlass}
                  >
                    {isRevealing ? "Authorizing..." : "Authorize & Decrypt"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
