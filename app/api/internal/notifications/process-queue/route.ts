import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { ClaimedDeliveryItem } from "@/lib/notifications/types";
import { sendPhysicalPushNotification } from "@/lib/notifications/push";
import { validatePushEndpointEgress } from "@/lib/notifications/egress";

function verifyInternalSecret(req: NextRequest): boolean {
  const secretHeader = req.headers.get("x-internal-secret")?.trim();
  const authHeader = req.headers.get("authorization")?.trim();
  const token = secretHeader || (authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "");

  if (!token) {
    return false;
  }

  const configuredSecrets = [
    process.env.CRON_SECRET?.trim(),
    process.env.INTERNAL_WORKER_SECRET?.trim(),
  ].filter(Boolean) as string[];

  // In production, only allow explicitly configured secrets from environment.
  // In development/testing, allow the local fallback secret if no env secret is configured.
  if (configuredSecrets.length === 0 && process.env.NODE_ENV === "production") {
    console.warn(
      "[Notification Queue Worker] Authentication failed: No CRON_SECRET or INTERNAL_WORKER_SECRET configured in environment variables."
    );
    return false;
  }

  const validSecrets =
    configuredSecrets.length > 0
      ? configuredSecrets
      : ["heat-chat-internal-worker-secret-production-2026"];

  for (const secret of validSecrets) {
    try {
      const a = Buffer.from(token, "utf-8");
      const b = Buffer.from(secret, "utf-8");
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        return true;
      }
    } catch {
      // ignore comparison error
    }
  }

  return false;
}

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rmvpdcftfdeizitnrvkw.supabase.co";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(
      "[Notification Queue Worker] Warning: SUPABASE_SERVICE_ROLE_KEY is not set in environment variables! Using fallback publishable key."
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function handleProcessQueue(req: NextRequest) {
  const source = req.headers.get("x-vercel-cron")
    ? "vercel-cron"
    : req.headers.get("authorization")
    ? "cron"
    : "internal";

  console.log(`[Notification Queue Worker] started=true source=${source}`);

  if (!verifyInternalSecret(req)) {
    console.warn(`[Notification Queue Worker] unauthorized request attempt source=${source}`);
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
    console.error("[Worker Queue Error] Failed to claim notification deliveries:", claimError.message);
    return NextResponse.json({ error: "Failed to claim notification deliveries" }, { status: 500 });
  }

  const items = (claimed as ClaimedDeliveryItem[]) || [];
  console.log(`[Notification Queue Claim] claimed_count=${items.length}`);

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
      console.error(`[Worker Delivery Error] delivery_id=${item.delivery_id} notification_id=${item.notification_id} status=failed reason=egress_check_failed`);
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

    const nowIso = new Date().toISOString();

    if (result.success) {
      deliveredCount++;
      // Structured logging without secrets
      console.log(`[Worker Delivery] delivery_id=${item.delivery_id} notification_id=${item.notification_id} status=delivered`);

      // Telemetry: record successful push delivery (zero notification text)
      try {
        await supabase.from("notification_delivery_events").insert({
          notification_id: item.notification_id,
          recipient_id: item.user_id,
          channel: "push",
          status: "delivered",
          provider_code: null,
          delivered_at: nowIso,
        });

        // Update subscription success tracking
        await supabase
          .from("push_subscriptions")
          .update({
            last_success_at: nowIso,
            updated_at: nowIso,
            failure_count: 0,
          })
          .eq("id", item.subscription_id);
      } catch {
        // Non-blocking telemetry failure
      }
    } else {
      failedCount++;
      // Structured error logging without secrets
      console.error(`[Worker Delivery Error] delivery_id=${item.delivery_id} notification_id=${item.notification_id} status=failed error=${result.error || "delivery_failed"}`);

      const isPermanent =
        Boolean(result.permanentFailure) ||
        result.statusCode === 404 ||
        result.statusCode === 410;
      const errorCode = (result.error || "delivery_failed").slice(0, 120);

      // Telemetry: record failed push delivery (zero notification text)
      try {
        await supabase.from("notification_delivery_events").insert({
          notification_id: item.notification_id,
          recipient_id: item.user_id,
          channel: "push",
          status: "failed",
          provider_code: errorCode,
        });

        const subUpdates: Record<string, any> = {
          last_failure_at: nowIso,
          updated_at: nowIso,
        };

        if (isPermanent) {
          subUpdates.revoked_at = nowIso;
          subUpdates.revoked = true; // revoked: true on permanent subscription failures
        }

        // Bounded retry: permanent subscription errors are never retried
        const retryLimit = isPermanent ? 0 : 3;

        await supabase
          .from("push_subscriptions")
          .update(subUpdates)
          .eq("id", item.subscription_id);
      } catch {
        // Non-blocking telemetry failure
      }
    }
  }

  console.log(`[Notification Queue Complete] delivered_count=${deliveredCount} failed_count=${failedCount}`);

  return NextResponse.json({
    claimed: items.length,
    delivered: deliveredCount,
    failed: failedCount,
    timestamp: new Date().toISOString(),
  });
}

// Export both GET and POST so Vercel Cron (which invokes via GET) works without 405 Method Not Allowed
export async function GET(req: NextRequest) {
  return handleProcessQueue(req);
}

export async function POST(req: NextRequest) {
  return handleProcessQueue(req);
}
