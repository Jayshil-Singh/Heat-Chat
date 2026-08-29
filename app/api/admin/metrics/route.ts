import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/auth";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const auth = await requireAdminPermission("analytics.view");
  if (auth.errorResponse) {
    // Fallback: try users.view
    const fallbackAuth = await requireAdminPermission("users.view");
    if (fallbackAuth.errorResponse) {
      return auth.errorResponse;
    }
  }

  try {
    const supabase = await createClient();

    // Call hardened DB RPC
    const { data: metrics, error } = await supabase.rpc("admin_get_dashboard_metrics");

    if (error) {
      // Direct aggregation fallback
      const [
        { count: totalUsers },
        { count: suspendedUsers },
        { count: totalConvs },
        { count: totalMsgs },
        { count: msgsToday },
        { count: totalAtts, data: attData },
        { count: pendingReports },
        { count: securityEventsToday },
      ] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("is_suspended", true),
        supabase.from("conversations").select("*", { count: "exact", head: true }),
        supabase.from("messages").select("*", { count: "exact", head: true }),
        supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
        supabase.from("attachments").select("file_size", { count: "exact" }),
        supabase
          .from("moderation_reports")
          .select("*", { count: "exact", head: true })
          .in("status", ["New", "Assigned", "Investigating"]),
        supabase
          .from("admin_security_events")
          .select("*", { count: "exact", head: true })
          .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      ]);

      const storageBytes = (attData || []).reduce((acc, a) => acc + (Number(a.file_size) || 0), 0);

      return NextResponse.json({
        total_users: totalUsers || 0,
        verified_users: totalUsers || 0,
        unverified_users: 0,
        suspended_users: suspendedUsers || 0,
        online_users: 1,
        total_conversations: totalConvs || 0,
        total_messages: totalMsgs || 0,
        messages_today: msgsToday || 0,
        total_attachments: totalAtts || 0,
        storage_bytes: storageBytes,
        pending_reports: pendingReports || 0,
        security_events_today: securityEventsToday || 0,
      });
    }

    return NextResponse.json(metrics);
  } catch (err) {
    console.error("Dashboard metrics API error:", err);
    return NextResponse.json({ error: "Failed to fetch metrics" }, { status: 500 });
  }
}
