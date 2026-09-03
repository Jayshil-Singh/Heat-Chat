import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function verifyInternalSecret(req: NextRequest): boolean {
  const secretHeader = req.headers.get("x-internal-secret");
  const authHeader = req.headers.get("authorization");
  const configuredSecret = process.env.INTERNAL_WORKER_SECRET || "heat-chat-internal-worker-secret-production-2026";

  const candidate = secretHeader || (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "");

  if (!candidate || !configuredSecret) {
    return false;
  }

  try {
    const a = Buffer.from(candidate, "utf-8");
    const b = Buffer.from(configuredSecret, "utf-8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rmvpdcftfdeizitnrvkw.supabase.co";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(req: NextRequest) {
  if (!verifyInternalSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getAdminSupabase();
  const searchParams = req.nextUrl.searchParams;
  const notifDays = parseInt(searchParams.get("notif_retention_days") || "30", 10);
  const deliveryDays = parseInt(searchParams.get("delivery_retention_days") || "7", 10);

  const { data, error } = await supabase.rpc("cleanup_stale_notifications", {
    p_retention_days: notifDays,
    p_deliveries_retention_days: deliveryDays,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
