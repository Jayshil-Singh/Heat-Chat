import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const verifyEndpoint = searchParams.get("verify_endpoint");

  if (verifyEndpoint) {
    console.log("[Push Subscriptions] Verifying push endpoint", {
      userId: user.id,
    });

    const { data: isValid, error: verifyError } = await (supabase.rpc as any)("verify_push_subscription", {
      p_endpoint: verifyEndpoint,
    });

    if (verifyError) {
      console.warn("[Push Subscriptions] Verification RPC error:", {
        code: verifyError.code,
        message: verifyError.message,
        hint: verifyError.hint,
        durationMs: Date.now() - t0,
      });

      // Non-blocking fallback: Return HTTP 200 with verified: false so client can self-heal rather than fail page load
      return NextResponse.json({
        verified: false,
        error: "Subscription verification failed",
        code: verifyError.code,
        message: verifyError.message,
      });
    }

    return NextResponse.json({
      verified: Boolean(isValid),
    });
  }

  console.log("[Push Subscriptions] Listing subscriptions", {
    userId: user.id,
  });

  const { data, error } = await supabase.rpc("get_user_push_subscriptions");

  if (error) {
    console.error("[Push Subscriptions] List RPC error:", {
      code: error.code,
      message: error.message,
      hint: error.hint,
      durationMs: Date.now() - t0,
    });

    return NextResponse.json(
      {
        error: "Unable to fetch push subscriptions",
        code: error.code,
        message: error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ subscriptions: data || [] });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { endpoint, subscriptionId } = body;

    if (!endpoint && !subscriptionId) {
      return NextResponse.json({ error: "Endpoint or subscription ID required" }, { status: 400 });
    }

    let query = supabase
      .from("push_subscriptions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", user.id);

    if (endpoint) {
      query = query.eq("endpoint", endpoint);
    } else {
      query = query.eq("id", subscriptionId);
    }

    const { error } = await query;
    if (error) {
      console.error("[Push Subscriptions] Revocation error:", {
        code: error.code,
        message: error.message,
      });
      return NextResponse.json(
        { error: "Unable to revoke push subscription", code: error.code, message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[Push Subscriptions] Revocation unhandled error:", {
      message: err?.message,
    });
    return NextResponse.json({ error: "Unable to revoke push subscription" }, { status: 500 });
  }
}
