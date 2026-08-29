import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/auth";
import { createClient } from "@/lib/supabase/server";
import type { ModerationReport } from "@/types/admin";

export async function GET(request: NextRequest) {
  const auth = await requireAdminPermission("reports.view");
  if (auth.errorResponse) return auth.errorResponse;

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get("status") || "all";
  const typeFilter = searchParams.get("type") || "all";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(10, parseInt(searchParams.get("limit") || "20", 10)));
  const offset = (page - 1) * limit;

  try {
    const supabase = await createClient();

    let query = supabase
      .from("moderation_reports")
      .select("*, reporter:profiles!moderation_reports_reporter_id_fkey(username)", { count: "exact" });

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    if (typeFilter !== "all") {
      query = query.eq("target_type", typeFilter);
    }

    query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

    const { data: reports, count, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const formattedReports: ModerationReport[] = (reports || []).map((r) => {
      const rep = r.reporter as unknown as { username: string } | null;
      return {
        id: r.id,
        reporter_id: r.reporter_id,
        reporter_username: rep?.username,
        target_type: r.target_type,
        target_id: r.target_id,
        reason: r.reason,
        description: r.description,
        status: r.status,
        assigned_to: r.assigned_to,
        resolution_notes: r.resolution_notes,
        action_taken: r.action_taken,
        resolved_at: r.resolved_at,
        created_at: r.created_at,
        updated_at: r.updated_at,
      };
    });

    return NextResponse.json({
      reports: formattedReports,
      total: count || formattedReports.length,
      page,
      limit,
      totalPages: Math.ceil((count || formattedReports.length) / limit),
    });
  } catch (err) {
    console.error("Reports API error:", err);
    return NextResponse.json({ error: "Failed to fetch reports" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // Allow authenticated users to file a report
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { targetType, targetId, reason, description } = body;

    if (!targetType || !targetId || !reason) {
      return NextResponse.json(
        { error: "targetType, targetId, and reason are required." },
        { status: 400 }
      );
    }

    const { data: report, error } = await supabase
      .from("moderation_reports")
      .insert({
        reporter_id: user.id,
        target_type: targetType,
        target_id: targetId,
        reason: reason.trim(),
        description: description ? description.trim() : null,
        status: "New",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, report }, { status: 201 });
  } catch (err) {
    console.error("File report error:", err);
    return NextResponse.json({ error: "Failed to create report" }, { status: 500 });
  }
}
