import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/auth";
import { createClient } from "@/lib/supabase/server";
import type { AdminAuditLog } from "@/types/admin";

export async function GET(request: NextRequest) {
  const auth = await requireAdminPermission("audit.view");
  if (auth.errorResponse) return auth.errorResponse;

  const { searchParams } = new URL(request.url);
  const actionFilter = searchParams.get("action") || "all";
  const targetType = searchParams.get("targetType") || "all";
  const search = (searchParams.get("search") || "").trim();
  const format = searchParams.get("format") || "json";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(200, Math.max(10, parseInt(searchParams.get("limit") || "30", 10)));
  const offset = (page - 1) * limit;

  try {
    const supabase = await createClient();

    let query = supabase
      .from("admin_audit_logs")
      .select("*, actor:profiles!admin_audit_logs_actor_user_id_fkey(username)", { count: "exact" });

    if (actionFilter !== "all") {
      query = query.eq("action", actionFilter);
    }

    if (targetType !== "all") {
      query = query.eq("target_type", targetType);
    }

    if (search) {
      query = query.or(`reason.ilike.%${search}%,target_id.ilike.%${search}%`);
    }

    query = query.order("created_at", { ascending: false });

    if (format !== "csv") {
      query = query.range(offset, offset + limit - 1);
    } else {
      query = query.limit(500);
    }

    const { data: logs, count, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const formattedLogs: AdminAuditLog[] = (logs || []).map((l) => {
      const actor = l.actor as unknown as { username: string } | null;
      return {
        id: l.id,
        created_at: l.created_at,
        actor_user_id: l.actor_user_id,
        actor_username: actor?.username || "Admin",
        actor_role: l.actor_role,
        action: l.action,
        target_type: l.target_type,
        target_id: l.target_id,
        reason: l.reason,
        old_value: l.old_value,
        new_value: l.new_value,
        ip_address: l.ip_address,
        user_agent: l.user_agent,
        request_id: l.request_id,
        result: l.result,
        metadata: l.metadata,
      };
    });

    if (format === "csv") {
      const csvHeader = "ID,Timestamp,Actor,Role,Action,TargetType,TargetID,Reason,Result\n";
      const csvRows = formattedLogs
        .map(
          (l) =>
            `"${l.id}","${l.created_at}","${l.actor_username}","${l.actor_role}","${l.action}","${l.target_type}","${l.target_id}","${(l.reason || "").replace(/"/g, '""')}","${l.result}"`
        )
        .join("\n");

      return new NextResponse(csvHeader + csvRows, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="heat-chat-audit-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    return NextResponse.json({
      logs: formattedLogs,
      total: count || formattedLogs.length,
      page,
      limit,
      totalPages: Math.ceil((count || formattedLogs.length) / limit),
    });
  } catch (err) {
    console.error("Audit logs API error:", err);
    return NextResponse.json({ error: "Failed to fetch audit logs" }, { status: 500 });
  }
}
