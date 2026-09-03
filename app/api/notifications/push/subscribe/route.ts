import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canonicalizePushEndpoint } from "@/lib/notifications/egress";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { endpoint, p256dh, auth, device_type } = body;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json(
      { error: "Missing required fields: endpoint, p256dh, auth" },
      { status: 400 }
    );
  }

  // Canonicalize endpoint according to grammar contract
  let canonicalEndpoint: string;
  try {
    canonicalEndpoint = canonicalizePushEndpoint(endpoint);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  const userAgent = req.headers.get("user-agent") || null;
  const deviceType = ["desktop", "mobile", "tablet", "unknown"].includes(device_type)
    ? device_type
    : "desktop";

  const { data: subscriptionId, error } = await supabase.rpc("register_push_subscription", {
    p_endpoint: canonicalEndpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_agent: userAgent,
    p_device_type: deviceType,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    subscriptionId,
    endpoint: canonicalEndpoint,
  });
}
