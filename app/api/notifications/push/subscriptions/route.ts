import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
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
    const { data: isValid, error: verifyError } = await (supabase.rpc as any)("verify_push_subscription", {
      p_endpoint: verifyEndpoint,
    });

    if (verifyError) {
      return NextResponse.json({ error: "Failed to verify push subscription" }, { status: 500 });
    }

    return NextResponse.json({
      verified: Boolean(isValid),
      endpoint: verifyEndpoint,
    });
  }

  const { data, error } = await supabase.rpc("get_user_push_subscriptions");

  if (error) {
    return NextResponse.json({ error: "Unable to fetch push subscriptions" }, { status: 500 });
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
      return NextResponse.json({ error: "Unable to revoke push subscription" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unable to revoke push subscription" }, { status: 500 });
  }
}
