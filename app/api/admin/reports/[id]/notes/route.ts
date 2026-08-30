import { createClient } from "@/lib/supabase/server";
import { requireAdminPermission } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
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

    const { data, error } = await supabase
      .from("moderation_notes")
      .select(
        `id, report_id, note, created_at,
        author:profiles!moderation_notes_author_id_fkey(id, username, display_name, avatar_url)`
      )
      .eq("report_id", reportId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[Heat Chat] GET /api/admin/reports/[id]/notes error:", error.message);
      return NextResponse.json({ error: "FETCH_FAILED" }, { status: 500 });
    }

    return NextResponse.json({ notes: data ?? [] });
  } catch (err: any) {
    console.error("[Heat Chat] GET /api/admin/reports/[id]/notes error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminPermission("reports.resolve");
  if (auth.errorResponse || !auth.session) return auth.errorResponse!;

  const { id: reportId } = await context.params;

  try {
    const body = await request.json();
    const { note } = body;

    if (!note || typeof note !== "string" || note.trim().length === 0) {
      return NextResponse.json({ error: "NOTE_REQUIRED" }, { status: 400 });
    }

    const cleanNote = note.trim().slice(0, 2000);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("moderation_notes")
      .insert({
        report_id: reportId,
        author_id: auth.session.userId,
        note: cleanNote,
      })
      .select(
        `id, report_id, note, created_at,
        author:profiles!moderation_notes_author_id_fkey(id, username, display_name, avatar_url)`
      )
      .single();

    if (error) {
      console.error("[Heat Chat] POST /api/admin/reports/[id]/notes error:", error.message);
      return NextResponse.json({ error: "INSERT_FAILED" }, { status: 500 });
    }

    await logAdminAction({
      session: auth.session,
      action: "MODERATION_NOTE_ADDED",
      targetType: "report",
      targetId: reportId,
      reason: `Note added: ${cleanNote.slice(0, 100)}`,
      oldValue: null,
      newValue: { noteId: data.id },
    });

    return NextResponse.json({ note: data });
  } catch (err: any) {
    console.error("[Heat Chat] POST /api/admin/reports/[id]/notes error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
