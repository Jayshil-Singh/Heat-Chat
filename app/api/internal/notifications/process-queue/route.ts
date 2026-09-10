import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { ClaimedDeliveryItem } from "@/lib/notifications/types";
import { sendPhysicalPushNotification, getVapidDiagnostics } from "@/lib/notifications/push";
import { validatePushEndpointEgress } from "@/lib/notifications/egress";

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

/** Strip whitespace and surrounding quotes from a raw header/env value. */
function clean(raw: string | null | undefined): string {
  if (!raw) return "";
  let v = raw.trim();
  if (v.length >= 2) {
    if ((v[0] === '"' && v[v.length - 1] === '"') ||
        (v[0] === "'" && v[v.length - 1] === "'")) {
      v = v.slice(1, -1).trim();
    }
  }
  return v;
}

/** Constant-time string comparison. Returns false if either string is empty. */
function timingSafeCompare(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a, "utf-8");
  const bb = Buffer.from(b, "utf-8");
  if (ba.length !== bb.length) return false;
  try {
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/**
 * Extract the bearer token from an Authorization header.
 * Accepts any case of "Bearer" followed by one or more spaces.
 */
function extractBearerToken(authHeader: string): string {
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  return m ? clean(m[1]) : "";
}

/**
 * Verify the incoming request carries a valid internal secret.
 *
 * Priority:
 *   1. x-internal-secret header (recommended for cron-job.org)
 *   2. Authorization: Bearer <token>
 *
 * Accepted secrets (OR logic):
 *   - CRON_SECRET env var
 *   - INTERNAL_WORKER_SECRET env var
 *
 * Emits safe diagnostic logs (metadata only — no secret values).
 */
function verifyInternalSecret(req: NextRequest): boolean {
  // --- Extract token ---
  const xSecret = clean(req.headers.get("x-internal-secret"));
  const authRaw = req.headers.get("authorization") ?? "";
  const bearerToken = extractBearerToken(authRaw);
  const token = xSecret || bearerToken;

  // --- Read configured secrets ---
  const cronSecret = clean(process.env.CRON_SECRET);
  const workerSecret = clean(process.env.INTERNAL_WORKER_SECRET);
  const secrets = [cronSecret, workerSecret].filter(Boolean);

  // --- SAFE DIAGNOSTIC LOGS (metadata only, no values) ---
  console.log(
    `[Auth Diag] ` +
    `has_x_internal_secret=${xSecret.length > 0} ` +
    `has_authorization=${authRaw.length > 0} ` +
    `starts_with_bearer=${/^Bearer\s+/i.test(authRaw)} ` +
    `token_length=${token.length} ` +
    `auth_source=${xSecret ? "x-internal-secret" : bearerToken ? "bearer" : "none"}`
  );
  console.log(
    `[Auth Diag] ` +
    `CRON_SECRET_set=${cronSecret.length > 0} ` +
    `CRON_SECRET_length=${cronSecret.length} ` +
    `INTERNAL_WORKER_SECRET_set=${workerSecret.length > 0} ` +
    `INTERNAL_WORKER_SECRET_length=${workerSecret.length} ` +
    `configured_count=${secrets.length} ` +
    `node_env=${process.env.NODE_ENV}`
  );
  // --- END SAFE DIAGNOSTIC LOGS ---

  if (!token) {
    console.warn("[Auth Diag] auth_result=rejected reason=no_token");
    return false;
  }

  // Production guard: must have at least one configured secret
  if (secrets.length === 0 && process.env.NODE_ENV === "production") {
    console.warn("[Auth Diag] auth_result=rejected reason=no_secrets_configured");
    return false;
  }

  // Fall through to dev fallback if no secrets configured
  const validSecrets = secrets.length > 0
    ? secrets
    : ["heat-chat-internal-worker-secret-production-2026"];

  for (let i = 0; i < validSecrets.length; i++) {
    const matched = timingSafeCompare(token, validSecrets[i]);
    console.log(
      `[Auth Diag] ` +
      `comparing index=${i} ` +
      `token_length=${token.length} ` +
      `secret_length=${validSecrets[i].length} ` +
      `lengths_match=${token.length === validSecrets[i].length} ` +
      `matched=${matched}`
    );
    if (matched) {
      console.log(`[Auth Diag] auth_result=success index=${i}`);
      return true;
    }
  }

  console.warn("[Auth Diag] auth_result=rejected reason=no_match");
  return false;
}

// ---------------------------------------------------------------------------
// Supabase admin client
// ---------------------------------------------------------------------------

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rmvpdcftfdeizitnrvkw.supabase.co";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("[Queue Worker] SUPABASE_SERVICE_ROLE_KEY not set — using fallback publishable key.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

async function handleProcessQueue(req: NextRequest) {
  // --- ABSOLUTE FIRST LOG LINE — confirms Lambda code is executing ---
  const reqId = req.headers.get("x-vercel-id") || req.headers.get("x-request-id") || "unknown";
  const method = req.method;
  const source = req.headers.get("x-vercel-cron")
    ? "vercel-cron"
    : req.headers.get("x-internal-secret")
    ? "x-internal-secret"
    : req.headers.get("authorization")
    ? "authorization"
    : "none";
  console.log(`[Queue Worker] INVOKED method=${method} source=${source} req_id=${reqId}`);

  // --- Authentication ---
  const authed = verifyInternalSecret(req);
  if (!authed) {
    console.warn(`[Queue Worker] UNAUTHORIZED method=${method} source=${source} req_id=${reqId}`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log(`[Queue Worker] AUTHORIZED method=${method} source=${source} req_id=${reqId}`);

  // --- Safe VAPID diagnostics (lengths & booleans only — no secrets) ---
  const vapidDiag = getVapidDiagnostics();
  console.log(
    `[VAPID Diag] ` +
    `VAPID_PUBLIC_KEY_set=${vapidDiag.VAPID_PUBLIC_KEY_set} ` +
    `VAPID_PUBLIC_KEY_length=${vapidDiag.VAPID_PUBLIC_KEY_length} ` +
    `VAPID_PRIVATE_KEY_set=${vapidDiag.VAPID_PRIVATE_KEY_set} ` +
    `VAPID_PRIVATE_KEY_length=${vapidDiag.VAPID_PRIVATE_KEY_length} ` +
    `VAPID_SUBJECT_set=${vapidDiag.VAPID_SUBJECT_set} ` +
    `VAPID_SUBJECT_length=${vapidDiag.VAPID_SUBJECT_length} ` +
    `using_fallback_private=${vapidDiag.using_fallback_private}`
  );

  // --- Queue processing ---
  const supabase = getAdminSupabase();
  const batchSize = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get("batch_size") || "25", 10)));
  const leaseSeconds = Math.min(300, Math.max(15, parseInt(req.nextUrl.searchParams.get("lease_seconds") || "60", 10)));

  const { data: claimed, error: claimError } = await supabase.rpc("claim_notification_deliveries", {
    p_batch_size: batchSize,
    p_lease_seconds: leaseSeconds,
  });

  if (claimError) {
    console.error("[Queue Worker] claim_error:", claimError.message);
    return NextResponse.json({ error: "Failed to claim notification deliveries" }, { status: 500 });
  }

  const items = (claimed as ClaimedDeliveryItem[]) || [];
  console.log(`[Notification Queue Claim] claimed_count=${items.length}`);

  let deliveredCount = 0;
  let failedCount = 0;
  const sampleErrors: Array<{
    delivery_id: string;
    notification_id: string;
    provider: string;
    provider_status: number;
    error_class: string;
    error: string;
    details?: string;
  }> = [];

  for (const item of items) {
    // Egress check
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
      console.error(`[Worker Delivery Error] delivery_id=${item.delivery_id} notification_id=${item.notification_id} provider_status=0 error_class=egress_check_failed error=egress_check_failed`);
      continue;
    }

    // Send push
    const result = await sendPhysicalPushNotification(
      { endpoint: item.endpoint, p256dh: item.p256dh, auth: item.auth },
      {
        title: item.title,
        body: item.body,
        notificationId: item.notification_id,
        eventType: item.event_type,
        url: item.data?.url || "/chat",
        data: item.data,
      }
    );

    // Mark delivery complete
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
      console.log(`[Worker Delivery] delivery_id=${item.delivery_id} notification_id=${item.notification_id} provider=${result.provider || "unknown"} status=delivered`);
      try {
        await supabase.from("notification_delivery_events").insert({
          notification_id: item.notification_id,
          recipient_id: item.user_id,
          channel: "push",
          status: "delivered",
          provider_code: null,
          delivered_at: nowIso,
        });
        await supabase
          .from("push_subscriptions")
          .update({ last_success_at: nowIso, updated_at: nowIso, failure_count: 0 })
          .eq("id", item.subscription_id);
      } catch {
        // Non-blocking telemetry
      }
    } else {
      failedCount++;
      console.error(
        `[Worker Delivery Error] ` +
        `delivery_id=${item.delivery_id} ` +
        `notification_id=${item.notification_id} ` +
        `provider=${result.provider || "unknown"} ` +
        `provider_status=${result.statusCode ?? 0} ` +
        `error_class=${result.errorClass || "unknown"} ` +
        `error=${result.error || "delivery_failed"}` +
        (result.safeDetails ? ` details="${result.safeDetails}"` : "")
      );

      if (sampleErrors.length < 5) {
        sampleErrors.push({
          delivery_id: item.delivery_id,
          notification_id: item.notification_id,
          provider: result.provider || "unknown",
          provider_status: result.statusCode ?? 0,
          error_class: result.errorClass || "unknown",
          error: result.error || "delivery_failed",
          details: result.safeDetails,
        });
      }

      const isPermanent =
        Boolean(result.permanentFailure) ||
        result.statusCode === 404 ||
        result.statusCode === 410;

      try {
        await supabase.from("notification_delivery_events").insert({
          notification_id: item.notification_id,
          recipient_id: item.user_id,
          channel: "push",
          status: "failed",
          provider_code: `HTTP_${result.statusCode || 0}_${result.errorClass || "unknown"}`.slice(0, 120),
        });

        const subUpdates: Record<string, unknown> = { last_failure_at: nowIso, updated_at: nowIso };
        if (isPermanent) {
          subUpdates.revoked_at = nowIso;
          subUpdates.revoked = true;
        }
        await supabase.from("push_subscriptions").update(subUpdates).eq("id", item.subscription_id);
      } catch {
        // Non-blocking telemetry
      }
    }
  }

  console.log(`[Notification Queue Complete] delivered_count=${deliveredCount} failed_count=${failedCount}`);

  return NextResponse.json({
    claimed: items.length,
    delivered: deliveredCount,
    failed: failedCount,
    vapid: {
      publicKeySet: vapidDiag.VAPID_PUBLIC_KEY_set,
      publicKeyLength: vapidDiag.VAPID_PUBLIC_KEY_length,
      privateKeySet: vapidDiag.VAPID_PRIVATE_KEY_set,
      privateKeyLength: vapidDiag.VAPID_PRIVATE_KEY_length,
      subjectSet: vapidDiag.VAPID_SUBJECT_set,
      subjectLength: vapidDiag.VAPID_SUBJECT_length,
      usingFallbackPrivate: vapidDiag.using_fallback_private,
    },
    sampleErrors: sampleErrors.length > 0 ? sampleErrors : undefined,
    timestamp: new Date().toISOString(),
  });
}

// Export both GET and POST.
// GET is used by Vercel Cron (x-vercel-cron header).
// POST is used by external cron providers (cron-job.org).
export async function GET(req: NextRequest) {
  return handleProcessQueue(req);
}

export async function POST(req: NextRequest) {
  return handleProcessQueue(req);
}
