import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await request.json();
    const { messageId, category, description } = body;

    if (!messageId || typeof messageId !== "string") {
      return NextResponse.json({ error: "MESSAGE_ID_REQUIRED" }, { status: 400 });
    }

    if (!category || typeof category !== "string") {
      return NextResponse.json({ error: "CATEGORY_REQUIRED" }, { status: 400 });
    }

    const cleanCategory = category.trim().toUpperCase();
    const cleanDesc = description && typeof description === "string" ? description.trim().slice(0, 1000) : null;

    // Submit report via RPC (verifies message accessibility)
    const { data, error } = await supabase.rpc("submit_moderation_report", {
      p_target_type: "message",
      p_target_id: messageId,
      p_category: cleanCategory,
      p_description: cleanDesc,
    });

    if (error) {
      if (error.message.includes("REPORT_NOT_ACCESSIBLE")) {
        return NextResponse.json(
          { error: "REPORT_NOT_ACCESSIBLE", message: "You do not have access to this message." },
          { status: 403 }
        );
      }
      console.error("[Heat Chat] submit_moderation_report message error:", error.message);
      return NextResponse.json({ error: "REPORT_SUBMISSION_FAILED" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      ...((data as Record<string, any>) || {}),
    });
  } catch (err: any) {
    console.error("[Heat Chat] POST /api/reports/message error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
