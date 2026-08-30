import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("moderation_reports")
      .select("id, category, target_type, created_at, status")
      .eq("reporter_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("[Heat Chat] GET /api/reports/history error:", error.message);
      return NextResponse.json({ error: "FETCH_FAILED" }, { status: 500 });
    }

    return NextResponse.json({ reports: data ?? [] });
  } catch (err: any) {
    console.error("[Heat Chat] GET /api/reports/history error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
