import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function PATCH(
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
    const { content } = body;

    const { data, error } = await supabase.rpc("edit_message", {
      p_message_id: messageId,
      p_content: content,
    });

    if (error) {
      if (error.message.includes("MESSAGE_NOT_FOUND")) {
        return NextResponse.json({ error: "MESSAGE_NOT_FOUND" }, { status: 404 });
      }
      if (error.message.includes("MESSAGE_EDIT_FORBIDDEN")) {
        return NextResponse.json({ error: "FORBIDDEN", message: "You can only edit your own messages." }, { status: 403 });
      }
      if (error.message.includes("MESSAGE_ALREADY_DELETED")) {
        return NextResponse.json({ error: "MESSAGE_ALREADY_DELETED", message: "Cannot edit a deleted message." }, { status: 409 });
      }
      if (error.message.includes("MESSAGE_TOO_LONG")) {
        return NextResponse.json({ error: "MESSAGE_TOO_LONG", message: "Message exceeds 4000 characters." }, { status: 400 });
      }
      console.error("[Heat Chat] edit_message RPC error:", error.message);
      return NextResponse.json({ error: "FAILED_TO_EDIT_MESSAGE" }, { status: 500 });
    }

    // Reconcile mentions if any
    try {
      const mentionsRegex = /(?:^|[\s.,!?;:()[\]{}'"])@([a-zA-Z0-9_]{3,30})(?=$|[\s.,!?;:()[\]{}'"])/g;
      const usernames: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = mentionsRegex.exec(content || "")) !== null) {
        if (m[1]) usernames.push(m[1].toLowerCase());
      }
      // eslint-disable-next-line
      await (supabase.rpc as any)("reconcile_message_mentions", {
        p_message_id: messageId,
        p_new_usernames: Array.from(new Set(usernames)),
      });
    } catch (mentionErr) {
      console.warn("[Heat Chat] Failed to reconcile mentions on edit:", mentionErr);
    }

    return NextResponse.json({
      success: true,
      ...((data as Record<string, any>) || {}),
    });
  } catch (err: any) {
    console.error("[Heat Chat] PATCH /api/messages/[id] error:", err);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
