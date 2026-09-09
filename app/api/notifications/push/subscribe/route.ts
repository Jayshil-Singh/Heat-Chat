import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canonicalizePushEndpoint } from "@/lib/notifications/egress";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        code: "PUSH_AUTH_REQUIRED",
        message: "You must be signed in to enable push notifications.",
      },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const endpoint = body.endpoint;
  const p256dh = body.p256dh || body.keys?.p256dh;
  const auth = body.auth || body.keys?.auth;
  const { device_type, device_id, installation_id } = body;

  if (!endpoint || typeof endpoint !== "string" || !p256dh || typeof p256dh !== "string" || !auth || typeof auth !== "string") {
    return NextResponse.json(
      {
        error: "Missing required fields: endpoint, p256dh, auth",
        code: "PUSH_INVALID_PAYLOAD",
        message: "Invalid push subscription payload received.",
      },
      { status: 400 }
    );
  }

  if (p256dh.trim().length < 16) {
    return NextResponse.json(
      {
        error: "Invalid p256dh key: minimum 16 characters required",
        code: "PUSH_INVALID_P256DH",
        message: "Invalid push subscription key.",
      },
      { status: 400 }
    );
  }

  if (auth.trim().length < 8) {
    return NextResponse.json(
      {
        error: "Invalid auth key: minimum 8 characters required",
        code: "PUSH_INVALID_AUTH",
        message: "Invalid push subscription secret.",
      },
      { status: 400 }
    );
  }

  // Canonicalize endpoint according to grammar contract
  let canonicalEndpoint: string;
  try {
    canonicalEndpoint = canonicalizePushEndpoint(endpoint);
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err.message || "Invalid push endpoint",
        code: "PUSH_INVALID_ENDPOINT",
        message: "Push endpoint format is invalid.",
      },
      { status: 400 }
    );
  }

  const userAgent = req.headers.get("user-agent") || null;
  const deviceType = ["desktop", "mobile", "tablet", "unknown"].includes(device_type)
    ? device_type
    : "desktop";

  // Explicitly pass all 7 RPC parameters to avoid ambiguous overload resolution
  const { data: subscriptionId, error } = await supabase.rpc("register_push_subscription", {
    p_endpoint: canonicalEndpoint,
    p_p256dh: p256dh.trim(),
    p_auth: auth.trim(),
    p_user_agent: userAgent,
    p_device_type: deviceType,
    p_device_id: typeof device_id === "string" ? device_id : null,
    p_installation_id: typeof installation_id === "string" ? installation_id : null,
  });

  if (error) {
    console.error("[Push Subscribe RPC Error]", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });

    return NextResponse.json(
      {
        error: "Failed to register push subscription",
        code: error.code || "PUSH_REGISTRATION_FAILED",
        message: "We were unable to save your push subscription. Please try again.",
      },
      { status: 500 }
    );
  }

  // Defense-in-depth: ensure notification preferences have push enabled
  try {
    await supabase
      .from("notification_preferences")
      .upsert(
        {
          user_id: user.id,
          push_enabled: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
  } catch {
    // Non-blocking fallback
  }

  return NextResponse.json({
    success: true,
    subscriptionId,
    endpoint: canonicalEndpoint,
  });
}
