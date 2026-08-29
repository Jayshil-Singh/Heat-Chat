"use client";

import * as React from "react";
import {
  Paperclip,
  Trash2,
  HardDrive,
  FileImage,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface AdminAttachment {
  id: string;
  message_id: string;
  storage_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
  created_at: string;
}

export default function AdminAttachmentsPage() {
  const [attachments, setAttachments] = React.useState<AdminAttachment[]>([]);
  const [total, setTotal] = React.useState(0);
  const [totalBytes, setTotalBytes] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchAttachments = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/attachments?page=${page}&limit=15`);
      if (res.ok) {
        const data = await res.json();
        setAttachments(data.attachments || []);
        setTotal(data.total || 0);
        setTotalBytes(data.total_bytes_page || 0);
        setTotalPages(data.totalPages || 1);
      }
    } catch (err) {
      console.error("Failed to load attachments:", err);
    } finally {
      setIsLoading(false);
    }
  }, [page]);

  React.useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  const handleDelete = async (attId: string, fileName: string) => {
    const reason = prompt(`Reason for deleting attachment "${fileName}":`);
    if (!reason || reason.trim().length < 3) return;

    try {
      const res = await fetch(
        `/api/admin/attachments?id=${attId}&reason=${encodeURIComponent(reason)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        fetchAttachments();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete attachment.");
      }
    } catch (err) {
      console.error("Delete attachment error:", err);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
            Storage & Attachments
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {total} files stored in Supabase Storage. Inspect media usage and manage uploads.
          </p>
        </div>
      </div>

      {/* Storage Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
          <span className="text-xs font-semibold text-zinc-500">Total Uploads</span>
          <div className="mt-2 text-2xl font-black text-zinc-900 dark:text-white">{total}</div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
          <span className="text-xs font-semibold text-zinc-500">Storage Consumption</span>
          <div className="mt-2 text-2xl font-black text-heat-600 dark:text-heat-400">
            {formatBytes(totalBytes)}
          </div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
          <span className="text-xs font-semibold text-zinc-500">Storage Bucket</span>
          <div className="mt-2 text-sm font-bold text-zinc-900 dark:text-white">chat-attachments (RLS)</div>
        </div>
      </div>

      {/* Attachments Table */}
      <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-100 bg-zinc-50/75 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
              <tr>
                <th className="px-5 py-3.5">File Name</th>
                <th className="px-4 py-3.5">MIME Type</th>
                <th className="px-4 py-3.5">File Size</th>
                <th className="px-4 py-3.5">Uploaded</th>
                <th className="px-5 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-zinc-400">
                    Loading attachments catalog...
                  </td>
                </tr>
              ) : attachments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-zinc-400">
                    No attachments uploaded.
                  </td>
                </tr>
              ) : (
                attachments.map((att) => (
                  <tr key={att.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40 transition-colors">
                    <td className="px-5 py-3.5 font-semibold text-zinc-900 dark:text-white">
                      <div className="flex items-center gap-2">
                        <FileImage className="h-4 w-4 text-heat-500" />
                        <span className="truncate max-w-xs">{att.file_name}</span>
                      </div>
                    </td>

                    <td className="px-4 py-3.5 text-zinc-500 font-mono text-[11px]">
                      {att.file_type}
                    </td>

                    <td className="px-4 py-3.5 font-bold text-zinc-900 dark:text-white">
                      {formatBytes(att.file_size)}
                    </td>

                    <td className="px-4 py-3.5 text-zinc-400">
                      {new Date(att.created_at).toLocaleDateString()}
                    </td>

                    <td className="px-5 py-3.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(att.id, att.file_name)}
                        className="h-8 px-2 text-xs text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
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
