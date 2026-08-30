import { createClient } from "@/lib/supabase/server";
import { requireAdminPermission } from "@/lib/admin/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminPermission("reports.view");
  if (auth.errorResponse || !auth.session) return auth.errorResponse!;

  const { id: reportId } = await context.params;

  try {
    const supabase = await createClient();

    const { data: report, error } = await supabase
      .from("moderation_reports")
      .select(
        `id, category, target_type, target_id, target_user_id, target_message_id,
        target_attachment_id, target_conversation_id, reason, description,
        status, action_taken, resolution_notes, created_at, updated_at, resolved_at,
        reporter_id, assigned_to,
        reporter:profiles!moderation_reports_reporter_id_fkey(id, username, display_name, avatar_url),
        target_user:profiles!moderation_reports_target_user_id_fkey(id, username, display_name, avatar_url)`
      )
      .eq("id", reportId)
      .single();

    if (error || !report) {
      return NextResponse.json({ error: "REPORT_NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({ report });
  } catch (err: any) {
    console.error("[Heat Chat] GET /api/admin/reports/[id] error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
