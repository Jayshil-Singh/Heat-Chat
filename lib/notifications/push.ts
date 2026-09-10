import webPush from "web-push";
import { validatePushEndpointEgress } from "./egress";

// ---------------------------------------------------------------------------
// VAPID Configuration & Utilities
// ---------------------------------------------------------------------------

/** Strip whitespace and surrounding quotes from raw environment strings. */
export function cleanKey(raw?: string | null): string {
  if (!raw) return "";
  let v = raw.trim();
  if (v.length >= 2) {
    if (
      (v[0] === '"' && v[v.length - 1] === '"') ||
      (v[0] === "'" && v[v.length - 1] === "'")
    ) {
      v = v.slice(1, -1).trim();
    }
  }
  return v;
}

// Default fallback keys for development and test suites if not configured in environment
export const DEFAULT_VAPID_PUBLIC_KEY =
  cleanKey(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) ||
  cleanKey(process.env.VAPID_PUBLIC_KEY) ||
  "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";

export const DEFAULT_VAPID_PRIVATE_KEY =
  cleanKey(process.env.VAPID_PRIVATE_KEY) ||
  "UUxI2qLq9Vn0T8oBvX6M9P7vX1Q9Z8K3F2D4N6M8P0A";

export const DEFAULT_VAPID_SUBJECT =
  cleanKey(process.env.VAPID_SUBJECT) || "mailto:admin@heat-chat.com";

let vapidConfigured = false;

/**
 * Returns safe diagnostic metadata about VAPID environment configuration.
 * Only includes booleans and string lengths — NEVER logs or exposes key values.
 */
export function getVapidDiagnostics() {
  const envPub = cleanKey(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY);
  const envPriv = cleanKey(process.env.VAPID_PRIVATE_KEY);
  const envSub = cleanKey(process.env.VAPID_SUBJECT);

  return {
    VAPID_PUBLIC_KEY_set: envPub.length > 0,
    VAPID_PUBLIC_KEY_length: envPub.length,
    VAPID_PRIVATE_KEY_set: envPriv.length > 0,
    VAPID_PRIVATE_KEY_length: envPriv.length,
    VAPID_SUBJECT_set: envSub.length > 0,
    VAPID_SUBJECT_length: envSub.length,
    using_fallback_public: envPub.length === 0,
    using_fallback_private: envPriv.length === 0,
  };
}

export function configureVapid(): void {
  if (vapidConfigured) return;

  const envPub = cleanKey(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY);
  const envPriv = cleanKey(process.env.VAPID_PRIVATE_KEY);
  const envSub = cleanKey(process.env.VAPID_SUBJECT);

  const subject = envSub || DEFAULT_VAPID_SUBJECT;
  const publicKey = envPub || DEFAULT_VAPID_PUBLIC_KEY;
  const privateKey = envPriv || DEFAULT_VAPID_PRIVATE_KEY;

  try {
    webPush.setVapidDetails(subject, publicKey, privateKey);
    vapidConfigured = true;
  } catch (err: any) {
    console.warn("[VAPID Setup Warning] error:", err?.message || err);
  }
}

export interface SendPushNotificationResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  provider?: string;
  errorClass?: string;
  safeDetails?: string;
  permanentFailure?: boolean;
}

export function sanitizePushTargetUrl(rawUrl?: string | null): string {
  if (!rawUrl || typeof rawUrl !== "string") return "/chat";
  const trimmed = rawUrl.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\") || trimmed.includes("\\")) {
    return "/chat";
  }
  if (
    trimmed.toLowerCase().startsWith("/%2f") ||
    trimmed.toLowerCase().includes("javascript:") ||
    trimmed.toLowerCase().includes("data:")
  ) {
    return "/chat";
  }
  return trimmed;
}

/**
 * Classifies push service provider by endpoint hostname without exposing the endpoint.
 */
function classifyPushProvider(endpoint: string): string {
  try {
    const host = new URL(endpoint).hostname.toLowerCase();
    if (host.includes("googleapis.com") || host.includes("fcm")) return "fcm_google";
    if (host.includes("push.apple.com")) return "apple_apns";
    if (host.includes("mozilla")) return "mozilla";
    if (host.includes("notify.windows.com")) return "windows_wns";
    return "webpush_other";
  } catch {
    return "invalid_endpoint";
  }
}

/**
 * Dispatches physical Web Push notification:
 * 1. Executes egress validation (canonicalization fail-closed check + DNS public-IP check)
 * 2. Transmits encrypted payload via web-push
 * 3. Captures the exact HTTP status code from push service without masking behind generic messages
 * 4. Categorizes error classes safely (vapid_auth, subscription_expired, etc.)
 */
export async function sendPhysicalPushNotification(
  subscription: {
    endpoint: string;
    p256dh: string;
    auth: string;
  },
  payload: {
    title: string;
    body: string;
    url?: string;
    notificationId: string;
    eventType: string;
    conversationId?: string;
    senderId?: string;
    data?: Record<string, any>;
  }
): Promise<SendPushNotificationResult> {
  configureVapid();

  const provider = classifyPushProvider(subscription.endpoint);

  // 1. Egress validation defense-in-depth
  const egressCheck = await validatePushEndpointEgress(subscription.endpoint);
  if (!egressCheck.ok) {
    return {
      success: false,
      statusCode: 0,
      provider,
      errorClass: "egress_blocked",
      error: `egress_validation_failed: ${egressCheck.reason}`,
      permanentFailure: !egressCheck.isTransient,
    };
  }

  // 2. Prepare payload string matching Phase 19 strict contract (Max 4KB payload limit for Web Push)
  const targetUrl = sanitizePushTargetUrl(payload.url);
  let safeBody = payload.body || "New notification";
  if (Buffer.byteLength(safeBody, "utf-8") > 4000) {
    safeBody = safeBody.slice(0, 3900) + "...";
  }

  const pushPayload = JSON.stringify({
    version: 1,
    type: payload.eventType,
    title: payload.title,
    body: safeBody,
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-72.png",
    url: targetUrl,
    notificationId: payload.notificationId,
    conversationId: payload.conversationId,
    senderId: payload.senderId,
    data: {
      url: targetUrl,
      notificationId: payload.notificationId,
      eventType: payload.eventType,
      conversationId: payload.conversationId,
      senderId: payload.senderId,
      ...(payload.data || {}),
    },
  });

  const pushSubscription: webPush.PushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
  };

  // 3. Send Notification over redirect-disabled transport
  try {
    const response = await webPush.sendNotification(pushSubscription, pushPayload, {
      TTL: 86400, // 24 hours
      urgency: payload.eventType === "security_alert" ? "high" : "normal",
    });

    return {
      success: true,
      statusCode: response.statusCode,
      provider,
    };
  } catch (err: any) {
    const statusCode =
      typeof err.statusCode === "number"
        ? err.statusCode
        : typeof err.status === "number"
        ? err.status
        : 0;

    const isGone = statusCode === 404 || statusCode === 410;
    const isAuthError = statusCode === 400 || statusCode === 401 || statusCode === 403;

    // Classify error type safely
    let errorClass = "unknown_error";
    if (statusCode === 404 || statusCode === 410) errorClass = "subscription_expired";
    else if (statusCode === 401) errorClass = "vapid_auth";
    else if (statusCode === 403) errorClass = "forbidden";
    else if (statusCode === 400) errorClass = "bad_request";
    else if (statusCode === 413) errorClass = "payload_too_large";
    else if (statusCode === 429) errorClass = "rate_limited";
    else if (statusCode >= 500) errorClass = "push_service_error";
    else if (statusCode === 0) errorClass = err.code || "network_or_tls_error";

    // Unmistakable error string that includes actual HTTP statusCode instead of masking behind generic message
    const safeError =
      statusCode > 0
        ? `push_service_${statusCode}_${errorClass}`
        : err.code || "network_or_tls_error";

    // Safe sanitized response body preview (strictly strip URLs, tokens, and endpoints, max 80 chars)
    let safeDetails: string | undefined;
    if (typeof err.body === "string" && err.body.length > 0) {
      safeDetails = err.body
        .replace(/https?:\/\/[^\s]+/g, "[url]")
        .replace(/[A-Za-z0-9_-]{24,}/g, "[token]")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
    }

    return {
      success: false,
      statusCode,
      provider,
      errorClass,
      safeDetails,
      error: safeError,
      permanentFailure: isGone || isAuthError,
    };
  }
}
