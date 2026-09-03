import webPush from "web-push";
import { validatePushEndpointEgress } from "./egress";

// Default fallback keys for development and test suites if not configured in environment
export const DEFAULT_VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
export const DEFAULT_VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY ||
  "UUxI2qLq9Vn0T8oBvX6M9P7vX1Q9Z8K3F2D4N6M8P0A";
export const DEFAULT_VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || "mailto:admin@heat-chat.com";

let vapidConfigured = false;

export function configureVapid(): void {
  if (vapidConfigured) return;

  try {
    webPush.setVapidDetails(
      DEFAULT_VAPID_SUBJECT,
      DEFAULT_VAPID_PUBLIC_KEY,
      DEFAULT_VAPID_PRIVATE_KEY
    );
    vapidConfigured = true;
  } catch (err) {
    console.warn("VAPID setup warning:", err);
  }
}

export interface SendPushNotificationResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  permanentFailure?: boolean;
}

/**
 * Dispatches physical Web Push notification:
 * 1. Executes egress validation (canonicalization fail-closed check + DNS public-IP check)
 * 2. Transmits encrypted payload via web-push
 * 3. Classifies response codes (404/410/unregistered as permanent failures, 429/5xx as retryable)
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
    data?: Record<string, any>;
  }
): Promise<SendPushNotificationResult> {
  configureVapid();

  // 1. Egress validation defense-in-depth
  const egressCheck = await validatePushEndpointEgress(subscription.endpoint);
  if (!egressCheck.ok) {
    return {
      success: false,
      error: `egress_validation_failed: ${egressCheck.reason}`,
      permanentFailure: !egressCheck.isTransient,
    };
  }

  // 2. Prepare payload string (Max 4KB payload limit for Web Push)
  const pushPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: {
      url: payload.url || "/chat",
      notificationId: payload.notificationId,
      eventType: payload.eventType,
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
    };
  } catch (err: any) {
    const statusCode = err.statusCode || err.status || 0;
    const isGone = statusCode === 404 || statusCode === 410;
    const isAuthError = statusCode === 400 || statusCode === 401 || statusCode === 403;

    return {
      success: false,
      statusCode,
      error: err.message || `HTTP ${statusCode}`,
      permanentFailure: isGone || isAuthError,
    };
  }
}
