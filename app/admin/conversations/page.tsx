"use client";

import * as React from "react";
import Link from "next/link";
import {
  MessageSquare,
  Users,
  Search,
  Filter,
  Trash2,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AdminConversation {
  id: string;
  type: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  member_count: number;
  message_count: number;
}

export default function AdminConversationsPage() {
  const [conversations, setConversations] = React.useState<AdminConversation[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchConversations = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "15",
        type: typeFilter,
      });
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/admin/conversations?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      }
    } catch (err) {
      console.error("Failed to load conversations:", err);
    } finally {
      setIsLoading(false);
    }
  }, [page, search, typeFilter]);

  React.useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const handleDelete = async (convId: string, name: string) => {
    const reason = prompt(`Reason for deleting conversation "${name}":`);
    if (!reason || reason.trim().length < 3) return;

    try {
      const res = await fetch(
        `/api/admin/conversations?id=${convId}&reason=${encodeURIComponent(reason)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        fetchConversations();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete conversation.");
      }
    } catch (err) {
      console.error("Delete conversation error:", err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
            Conversations Governance
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {total} channels & direct message rooms. Inspect metadata, member counts, and activity.
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            placeholder="Search conversation by name..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
          >
            <option value="all">All Types</option>
            <option value="direct">Direct Message (1-on-1)</option>
            <option value="group">Group Channel</option>
          </select>
        </div>
      </div>

      {/* Conversations Table */}
      <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-100 bg-zinc-50/75 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
              <tr>
                <th className="px-5 py-3.5">Name / Channel</th>
                <th className="px-4 py-3.5">Type</th>
                <th className="px-4 py-3.5">Members</th>
                <th className="px-4 py-3.5">Messages</th>
                <th className="px-4 py-3.5">Last Activity</th>
                <th className="px-5 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-zinc-400">
                    Loading conversations...
                  </td>
                </tr>
              ) : conversations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-zinc-400">
                    No conversations found.
                  </td>
                </tr>
              ) : (
                conversations.map((c) => (
                  <tr key={c.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-heat-500/10 text-heat-600 dark:text-heat-400">
                          <MessageSquare className="h-4 w-4" />
                        </div>
                        <div>
                          <span className="font-bold text-zinc-900 dark:text-white">
                            {c.name}
                          </span>
                          <p className="text-[10px] text-zinc-400">ID: {c.id}</p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <span className="capitalize font-semibold text-zinc-700 dark:text-zinc-300">
                        {c.type}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 font-bold text-zinc-900 dark:text-white">
                      {c.member_count}
                    </td>

                    <td className="px-4 py-3.5 font-bold text-heat-600 dark:text-heat-400">
                      {c.message_count}
                    </td>

                    <td className="px-4 py-3.5 text-zinc-400">
                      {new Date(c.updated_at).toLocaleString()}
                    </td>

                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/admin/messages?conversationId=${c.id}`}>
                          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs">
                            Messages
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(c.id, c.name)}
                          className="h-8 px-2 text-xs text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
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
    </div>
  );
}
