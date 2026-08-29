"use client";

import * as React from "react";
import {
  Bell,
  Mail,
  Send,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Template {
  id: string;
  name: string;
  subject: string;
  type: string;
  description: string;
  variables: string[];
  status: string;
}

export default function AdminNotificationsPage() {
  const [templates, setTemplates] = React.useState<Template[]>([]);
  const [testEmail, setTestEmail] = React.useState("");
  const [selectedTpl, setSelectedTpl] = React.useState("tpl_verify_email");
  const [isSending, setIsSending] = React.useState(false);
  const [statusMsg, setStatusMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function fetchTemplates() {
      try {
        const res = await fetch("/api/admin/notifications");
        if (res.ok) {
          const data = await res.json();
          setTemplates(data.templates || []);
        }
      } catch (err) {
        console.error("Failed to load templates:", err);
      }
    }
    fetchTemplates();
  }, []);

  const handleSendTest = async () => {
    if (!testEmail.trim() || !selectedTpl) {
      setStatusMsg("Enter a test email address.");
      return;
    }

    setIsSending(true);
    setStatusMsg(null);

    try {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: selectedTpl, testEmail: testEmail.trim() }),
      });

      const data = await res.json();
      if (res.ok) {
        setStatusMsg(`Test dispatched successfully to ${testEmail}.`);
      } else {
        setStatusMsg(data.error || "Failed to dispatch test notification.");
      }
    } catch (err) {
      console.error("Send test error:", err);
      setStatusMsg("Unexpected error occurred.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
          Email & Notification Templates
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Transactional email templates, password resets, verification links, and alerts.
        </p>
      </div>

      {/* Test Dispatch Tool */}
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 space-y-4">
        <div className="flex items-center gap-2 border-b border-zinc-100 pb-3 dark:border-zinc-800">
          <Mail className="h-4 w-4 text-heat-500" />
          <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
            Dispatch Test Notification
          </h2>
        </div>

        {statusMsg && (
          <div className="rounded-xl bg-heat-500/10 p-3 text-xs text-heat-700 dark:text-heat-300 font-semibold">
            {statusMsg}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">Select Template</label>
            <select
              value={selectedTpl}
              onChange={(e) => setSelectedTpl(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">Recipient Email</label>
            <div className="mt-1 flex items-center gap-2">
              <Input
                type="email"
                placeholder="test.admin@example.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="text-xs"
              />
              <Button
                variant="heat"
                size="sm"
                disabled={isSending}
                onClick={handleSendTest}
                className="gap-1.5 shrink-0"
              >
                <Send className="h-3.5 w-3.5" />
                <span>{isSending ? "Sending..." : "Send Test"}</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Templates Catalog Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {templates.map((tpl) => (
          <div
            key={tpl.id}
            className="flex flex-col justify-between rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 space-y-4"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-zinc-900 dark:text-white">{tpl.name}</h3>
                <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-bold text-green-600 dark:text-green-400">
                  {tpl.status}
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{tpl.description}</p>
              <div className="rounded-xl bg-zinc-50 p-2.5 dark:bg-zinc-900 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Subject: {tpl.subject}
              </div>
            </div>

            <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800 space-y-1">
              <span className="text-[10px] uppercase font-bold text-zinc-400">Template Tags</span>
              <div className="flex flex-wrap gap-1">
                {tpl.variables.map((v) => (
                  <span
                    key={v}
                    className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-mono text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
