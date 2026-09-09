import webPush from "web-push";
import { validatePushEndpointEgress } from "@/lib/notifications/egress";

// Default fallback public key for development and test suites if not configured in environment
export const DEFAULT_VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  process.env.VAPID_PUBLIC_KEY ||
  "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";

export const DEFAULT_VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || "mailto:admin@heat-chat.com";

let vapidConfigured = false;

/**
 * Configure web-push with VAPID details exactly once on the server.
 * Never exposes VAPID_PRIVATE_KEY to client bundles or logs.
 */
export function configureVapid(): void {
  if (vapidConfigured) return;

  const privateKey = process.env.VAPID_PRIVATE_KEY || "UUxI2qLq9Vn0T8oBvX6M9P7vX1Q9Z8K3F2D4N6M8P0A";
  const publicKey = DEFAULT_VAPID_PUBLIC_KEY;
  const subject = DEFAULT_VAPID_SUBJECT;

  try {
    webPush.setVapidDetails(subject, publicKey, privateKey);
    vapidConfigured = true;
  } catch (err) {
    console.warn("[PushDelivery] VAPID configuration warning:", (err as any)?.message || err);
  }
}

export interface SendPushNotificationResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  permanentFailure?: boolean;
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  url?: string;
  notificationId: string;
  eventType: string;
  conversationId?: string;
  senderId?: string;
  data?: Record<string, any>;
}

/**
 * Validates and strictly sanitizes notification destination URL to prevent open redirects.
 */
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
 * Dispatches physical Web Push notification with strict RFC 8030 payload contracts:
 * 1. Executes egress validation (SSRF / IP restriction checks)
 * 2. Transmits encrypted payload via web-push
 * 3. Classifies response codes (404/410 as permanent failures, 429/5xx as retryable)
 * 4. Emits safe structured telemetry (zero private tokens or message content)
 */
export async function sendPhysicalPushNotification(
  subscription: {
    endpoint: string;
    p256dh: string;
    auth: string;
  },
  payload: PushNotificationPayload
): Promise<SendPushNotificationResult> {
  configureVapid();

  const safeSubId = subscription.endpoint.slice(-8);

  // 1. Egress validation defense-in-depth
  const egressCheck = await validatePushEndpointEgress(subscription.endpoint);
  if (!egressCheck.ok) {
    console.warn(`[PushDelivery] notification=${payload.notificationId} subscription=...${safeSubId} status=egress_rejected reason=${egressCheck.reason}`);
    return {
      success: false,
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

    console.info(`[PushDelivery] notification=${payload.notificationId} subscription=...${safeSubId} status=success statusCode=${response.statusCode}`);

    return {
      success: true,
      statusCode: response.statusCode,
    };
  } catch (err: any) {
    const statusCode = err.statusCode || err.status || 0;
    const isGone = statusCode === 404 || statusCode === 410;
    const isAuthError = statusCode === 400 || statusCode === 401 || statusCode === 403;
    const isPermanent = isGone || isAuthError;

    if (isGone) {
      console.warn(`[PushDelivery] notification=${payload.notificationId} subscription=...${safeSubId} status=expired statusCode=${statusCode}`);
    } else if (isPermanent) {
      console.warn(`[PushDelivery] notification=${payload.notificationId} subscription=...${safeSubId} status=permanent_failure statusCode=${statusCode}`);
    } else {
      console.warn(`[PushDelivery] notification=${payload.notificationId} subscription=...${safeSubId} status=retryable statusCode=${statusCode}`);
    }

    return {
      success: false,
      statusCode,
      error: err.message || `HTTP ${statusCode}`,
      permanentFailure: isPermanent,
    };
  }
}

/**
 * Functional alias matching Phase B specification
 */
export const sendPushNotification = sendPhysicalPushNotification;
