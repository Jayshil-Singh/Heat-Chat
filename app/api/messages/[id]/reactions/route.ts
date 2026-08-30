import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: messageId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await request.json();
    const { reaction } = body;

    if (!reaction || typeof reaction !== "string") {
      return NextResponse.json({ error: "REACTION_REQUIRED" }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("toggle_message_reaction", {
      p_message_id: messageId,
      p_reaction: reaction,
    });

    if (error) {
      if (error.message.includes("MESSAGE_ACCESS_DENIED")) {
        return NextResponse.json({ error: "FORBIDDEN", message: "You do not have access to this message." }, { status: 403 });
      }
      console.error("[Heat Chat] toggle_message_reaction RPC error:", error.message);
      return NextResponse.json({ error: "REACTION_FAILED" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      ...((data as Record<string, any>) || {}),
    });
  } catch (err: any) {
    console.error("[Heat Chat] POST /api/messages/[id]/reactions error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
