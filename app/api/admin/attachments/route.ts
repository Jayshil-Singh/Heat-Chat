import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const auth = await requireAdminPermission("attachments.view");
  if (auth.errorResponse) return auth.errorResponse;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(10, parseInt(searchParams.get("limit") || "20", 10)));
  const offset = (page - 1) * limit;

  try {
    const supabase = await createClient();

    const { data: attachments, count, error } = await supabase
      .from("attachments")
      .select("id, message_id, storage_path, file_name, file_type, file_size, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const totalBytes = (attachments || []).reduce((acc, a) => acc + (Number(a.file_size) || 0), 0);

    return NextResponse.json({
      attachments: attachments || [],
      total: count || (attachments || []).length,
      total_bytes_page: totalBytes,
      page,
      limit,
      totalPages: Math.ceil((count || (attachments || []).length) / limit),
    });
  } catch (err) {
    console.error("Attachments API error:", err);
    return NextResponse.json({ error: "Failed to fetch attachments" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdminPermission("attachments.delete");
  if (auth.errorResponse || !auth.session) return auth.errorResponse!;

  try {
    const { searchParams } = new URL(request.url);
    const attachmentId = searchParams.get("id");
    const reason = searchParams.get("reason") || "Attachment removed by administrator";

    if (!attachmentId) {
      return NextResponse.json({ error: "id parameter is required." }, { status: 400 });
    }

    const supabase = await createClient();

    const { data: attachment } = await supabase
      .from("attachments")
      .select("*")
      .eq("id", attachmentId)
      .single();

    if (!attachment) {
      return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
    }

    // Delete record from database
    const { error: delErr } = await supabase
      .from("attachments")
      .delete()
      .eq("id", attachmentId);

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 400 });
    }

    // Try deleting physical file from storage bucket if possible
    await supabase.storage.from("chat-attachments").remove([attachment.storage_path]);

    await logAdminAction({
      session: auth.session,
      action: "ATTACHMENT_DELETED",
      targetType: "attachment",
      targetId: attachmentId,
      reason,
      oldValue: attachment,
    });

    return NextResponse.json({ success: true, message: "Attachment deleted successfully." });
  } catch (err) {
    console.error("Delete attachment API error:", err);
    return NextResponse.json({ error: "Failed to delete attachment" }, { status: 500 });
  }
}
