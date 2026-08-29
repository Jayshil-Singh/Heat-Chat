import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminPermission("reports.resolve");
  if (auth.errorResponse || !auth.session) return auth.errorResponse!;

  const { id: reportId } = await context.params;

  try {
    const body = await request.json();
    const { status, actionTaken, resolutionNotes } = body;

    if (!status) {
      return NextResponse.json({ error: "status is required." }, { status: 400 });
    }

    const supabase = await createClient();

    // Call hardened DB RPC
    const { error: rpcErr } = await supabase.rpc("admin_resolve_report", {
      p_report_id: reportId,
      p_new_status: status,
      p_action_taken: actionTaken || null,
      p_resolution_notes: resolutionNotes || null,
    });

    if (rpcErr) {
      // Fallback direct update
      const resolvedAt = ["Resolved", "Closed"].includes(status) ? new Date().toISOString() : null;

      const { data: oldRep } = await supabase
        .from("moderation_reports")
        .select("*")
        .eq("id", reportId)
        .single();

      const { error: updErr } = await supabase
        .from("moderation_reports")
        .update({
          status,
          action_taken: actionTaken || null,
          resolution_notes: resolutionNotes || null,
          assigned_to: auth.session.userId,
          resolved_at: resolvedAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", reportId);

      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 400 });
      }

      await logAdminAction({
        session: auth.session,
        action: "REPORT_RESOLVED",
        targetType: "report",
        targetId: reportId,
        reason: resolutionNotes || `Report status updated to ${status}`,
        oldValue: oldRep ? { status: oldRep.status, action_taken: oldRep.action_taken } : null,
        newValue: { status, action_taken: actionTaken },
      });
    }

    return NextResponse.json({ success: true, message: `Report ${status} successfully.` });
  } catch (err) {
    console.error("Resolve report API error:", err);
    return NextResponse.json({ error: "Failed to resolve report" }, { status: 500 });
  }
}
