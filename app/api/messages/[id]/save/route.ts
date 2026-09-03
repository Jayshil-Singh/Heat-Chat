import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { isValidUuid } from "@/lib/validation/uuid";

/**
 * POST /api/messages/[id]/save
 *
 * Save a message for the authenticated user.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 }
    );
  }

  const { id: messageId } = await params;
  if (!isValidUuid(messageId)) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "INVALID_MESSAGE_ID", message: "Invalid message ID format" } },
      { status: 400 }
    );
  }

  try {
    const { data, error } = (await (supabase.rpc as any)("save_message", {
      p_message_id: messageId,
    })) as { data: boolean | null; error: { message?: string } | null };

    if (error) {
      const msg = error.message || "";
      if (msg.includes("MESSAGE_ACCESS_DENIED")) {
        return NextResponse.json(
          { ok: false, data: null, error: { code: "MESSAGE_ACCESS_DENIED", message: "Cannot save inaccessible message" } },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { ok: false, data: null, error: { code: "SAVE_FAILED", message: msg || "Failed to save message" } },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: { saved: true, messageId },
      error: null,
    });
  } catch (err: any) {
    console.error("[api/messages/[id]/save POST] Unexpected error:", err);
    return NextResponse.json(
      { ok: false, data: null, error: { code: "SAVE_FAILED", message: err.message || "Failed to save message" } },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/messages/[id]/save
 *
 * Remove a message from the authenticated user's saved messages.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 }
    );
  }

  const { id: messageId } = await params;
  if (!isValidUuid(messageId)) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "INVALID_MESSAGE_ID", message: "Invalid message ID format" } },
      { status: 400 }
    );
  }

  try {
    const { error } = (await (supabase.rpc as any)("unsave_message", {
      p_message_id: messageId,
    })) as { error: { message?: string } | null };

    if (error) {
      return NextResponse.json(
        { ok: false, data: null, error: { code: "SAVE_FAILED", message: error.message || "Failed to unsave message" } },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: { saved: false, messageId },
      error: null,
    });
  } catch (err: any) {
    console.error("[api/messages/[id]/save DELETE] Unexpected error:", err);
    return NextResponse.json(
      { ok: false, data: null, error: { code: "SAVE_FAILED", message: err.message || "Failed to unsave message" } },
      { status: 500 }
    );
  }
}
