import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(
  _request: NextRequest,
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

    const { data, error } = await supabase.rpc("pin_message", {
      p_message_id: messageId,
    });

    if (error) {
      if (error.message.includes("MESSAGE_ACCESS_DENIED")) {
        return NextResponse.json({ error: "FORBIDDEN", message: "You do not have access to this message." }, { status: 403 });
      }
      console.error("[Heat Chat] pin_message RPC error:", error.message);
      return NextResponse.json({ error: "PIN_FAILED" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      ...((data as Record<string, any>) || {}),
    });
  } catch (err: any) {
    console.error("[Heat Chat] POST /api/messages/[id]/pin error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
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

    const { data, error } = await supabase.rpc("unpin_message", {
      p_message_id: messageId,
    });

    if (error) {
      if (error.message.includes("MESSAGE_ACCESS_DENIED")) {
        return NextResponse.json({ error: "FORBIDDEN", message: "You do not have access to this message." }, { status: 403 });
      }
      console.error("[Heat Chat] unpin_message RPC error:", error.message);
      return NextResponse.json({ error: "UNPIN_FAILED" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      ...((data as Record<string, any>) || {}),
    });
  } catch (err: any) {
    console.error("[Heat Chat] DELETE /api/messages/[id]/pin error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
