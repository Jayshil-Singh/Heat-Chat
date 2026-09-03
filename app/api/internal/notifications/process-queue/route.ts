import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { ClaimedDeliveryItem } from "@/lib/notifications/types";
import { sendPhysicalPushNotification } from "@/lib/notifications/push";
import { validatePushEndpointEgress } from "@/lib/notifications/egress";

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
  const batchSize = Math.min(100, Math.max(1, parseInt(searchParams.get("batch_size") || "25", 10)));
  const leaseSeconds = Math.min(300, Math.max(15, parseInt(searchParams.get("lease_seconds") || "60", 10)));

  // 1. Claim batch of deliveries using FOR UPDATE SKIP LOCKED
  const { data: claimed, error: claimError } = await supabase.rpc("claim_notification_deliveries", {
    p_batch_size: batchSize,
    p_lease_seconds: leaseSeconds,
  });

  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }

  const items = (claimed as ClaimedDeliveryItem[]) || [];
  let deliveredCount = 0;
  let failedCount = 0;

  for (const item of items) {
    // 2. Defense-in-depth egress check on endpoint before dispatch
    const egressCheck = await validatePushEndpointEgress(item.endpoint);
    if (!egressCheck.ok) {
      await supabase.rpc("complete_notification_delivery", {
        p_delivery_id: item.delivery_id,
        p_claim_token: item.claim_token,
        p_success: false,
        p_error: `egress_check_failed: ${egressCheck.reason}`,
        p_permanent_failure: !egressCheck.isTransient,
      });
      failedCount++;
      continue;
    }

    // 3. Dispatch Physical Push Notification
    const result = await sendPhysicalPushNotification(
      {
        endpoint: item.endpoint,
        p256dh: item.p256dh,
        auth: item.auth,
      },
      {
        title: item.title,
        body: item.body,
        notificationId: item.notification_id,
        eventType: item.event_type,
        url: item.data?.url || "/chat",
        data: item.data,
      }
    );

    // 4. Complete delivery in database
    await supabase.rpc("complete_notification_delivery", {
      p_delivery_id: item.delivery_id,
      p_claim_token: item.claim_token,
      p_success: result.success,
      p_error: result.error || null,
      p_permanent_failure: result.permanentFailure || false,
    });

    if (result.success) {
      deliveredCount++;
    } else {
      failedCount++;
    }
  }

  return NextResponse.json({
    claimed: items.length,
    delivered: deliveredCount,
    failed: failedCount,
    timestamp: new Date().toISOString(),
  });
}
