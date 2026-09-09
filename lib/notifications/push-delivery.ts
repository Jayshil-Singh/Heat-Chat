import { createClient } from "@supabase/supabase-js";
import { sendPhysicalPushNotification } from "./push";
import { NotificationPreferences } from "./types";
import { isInQuietHours } from "./events";

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rmvpdcftfdeizitnrvkw.supabase.co";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface PushDeliveryPayload {
  userId: string;
  title: string;
  body: string;
  url?: string;
  eventType: string;
  notificationId?: string;
  conversationId?: string;
  senderId?: string;
  data?: Record<string, any>;
}

export interface PushDeliveryResult {
  success: boolean;
  totalSubscriptions: number;
  sentCount: number;
  failedCount: number;
  revokedCount: number;
  skippedReason?: string;
  error?: string;
}

/**
 * Validates and sanitizes destination URL to prevent open redirect vulnerabilities.
 * Strictly requires internal Heat Chat paths starting with '/'.
 */
export function sanitizePushTargetUrl(url?: string): string {
  if (!url || typeof url !== "string") return "/chat";
  const trimmed = url.trim();

  // Strictly require leading '/' and forbid protocol-relative '//' or backslashes
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return "/chat";
  }

  // Reject javascript:, data:, or encoded slashes
  if (
    trimmed.toLowerCase().startsWith("/%2f") ||
    trimmed.toLowerCase().includes("javascript:") ||
    trimmed.toLowerCase().includes("data:") ||
    trimmed.includes("\\")
  ) {
    return "/chat";
  }

  return trimmed;
}

/**
 * Sends a production-grade Web Push notification to all active devices of a recipient.
 *
 * Invariants:
 * 1. Honors user notification preferences (global enable, category enablement, quiet hours).
 * 2. Honors message preview preference: if disabled, private message text is NEVER placed in the push payload.
 * 3. Never includes secrets, tokens, or private credentials.
 * 4. Automatically revokes 404/410 dead subscriptions to prevent useless retries.
 * 5. Records telemetry in notification_delivery_events without private content.
 */
export async function sendWebPushToUser(
  payload: PushDeliveryPayload
): Promise<PushDeliveryResult> {
  const supabase = getAdminSupabase();
  const notificationId = payload.notificationId || `push_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const targetUrl = sanitizePushTargetUrl(payload.url);

  // 1. Fetch recipient notification preferences
  const { data: rawPrefs } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("user_id", payload.userId)
    .maybeSingle();

  const userPrefs: NotificationPreferences = rawPrefs || {
    user_id: payload.userId,
    notifications_enabled: true,
    sound_enabled: true,
    desktop_notifications_enabled: false,
    message_preview_enabled: true,
    push_enabled: false,
    email_notifications: false,
    messages_notify: true,
    mentions_notify: true,
    replies_notify: true,
    group_activity_notify: true,
    friend_activity_notify: true,
    reactions_notify: true,
    security_notify: true,
    quiet_hours_enabled: false,
    quiet_hours_start: "22:00",
    quiet_hours_end: "08:00",
    timezone: "UTC",
    updated_at: new Date().toISOString(),
  };

  const isSecurity =
    ["security", "security_alert", "password_changed", "new_device_login"].includes(payload.eventType);

  // 2. Evaluate preference gates
  if (!isSecurity) {
    if (!userPrefs.notifications_enabled) {
      return { success: true, totalSubscriptions: 0, sentCount: 0, failedCount: 0, revokedCount: 0, skippedReason: "notifications_disabled_globally" };
    }

    if (!userPrefs.push_enabled && payload.eventType !== "test_notification") {
      return { success: true, totalSubscriptions: 0, sentCount: 0, failedCount: 0, revokedCount: 0, skippedReason: "push_disabled" };
    }

    // Category gates
    if (payload.eventType === "message" || payload.eventType === "media_message" || payload.eventType === "voice_message") {
      if (!userPrefs.messages_notify) return { success: true, totalSubscriptions: 0, sentCount: 0, failedCount: 0, revokedCount: 0, skippedReason: "messages_disabled" };
    } else if (payload.eventType === "mention" && !userPrefs.mentions_notify) {
      return { success: true, totalSubscriptions: 0, sentCount: 0, failedCount: 0, revokedCount: 0, skippedReason: "mentions_disabled" };
    } else if (payload.eventType === "reply" && !userPrefs.replies_notify) {
      return { success: true, totalSubscriptions: 0, sentCount: 0, failedCount: 0, revokedCount: 0, skippedReason: "replies_disabled" };
    } else if (
      (payload.eventType === "group_invite" || payload.eventType === "group_activity" || payload.eventType === "member_added" || payload.eventType === "member_removed" || payload.eventType === "role_changed" || payload.eventType === "poll_created" || payload.eventType === "poll_result") &&
      !userPrefs.group_activity_notify
    ) {
      return { success: true, totalSubscriptions: 0, sentCount: 0, failedCount: 0, revokedCount: 0, skippedReason: "group_activity_disabled" };
    } else if (
      (payload.eventType === "friend_request" || payload.eventType === "friend_accepted" || payload.eventType === "friend_request_accepted" || payload.eventType === "friend_request_declined") &&
      !userPrefs.friend_activity_notify
    ) {
      return { success: true, totalSubscriptions: 0, sentCount: 0, failedCount: 0, revokedCount: 0, skippedReason: "friend_activity_disabled" };
    } else if (payload.eventType === "reaction" && userPrefs.reactions_notify === false) {
      return { success: true, totalSubscriptions: 0, sentCount: 0, failedCount: 0, revokedCount: 0, skippedReason: "reactions_disabled" };
    }

    // Quiet hours
    if (isInQuietHours(userPrefs, payload.eventType as any)) {
      return { success: true, totalSubscriptions: 0, sentCount: 0, failedCount: 0, revokedCount: 0, skippedReason: "quiet_hours_active" };
    }
  }

  // 3. Privacy requirement: enforce message_preview_enabled
  let sanitizedBody = payload.body;
  if (!userPrefs.message_preview_enabled && (payload.eventType === "message" || payload.eventType === "media_message" || payload.eventType === "voice_message")) {
    sanitizedBody = "New message";
  }

  // 4. Query active subscriptions
  const { data: subscriptions, error: subError } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, device_type")
    .eq("user_id", payload.userId)
    .is("revoked_at", null);

  if (subError) {
    console.error("[Push Delivery] Error querying push_subscriptions:", subError.message);
    return { success: false, totalSubscriptions: 0, sentCount: 0, failedCount: 0, revokedCount: 0, error: subError.message };
  }

  if (!subscriptions || subscriptions.length === 0) {
    return { success: true, totalSubscriptions: 0, sentCount: 0, failedCount: 0, revokedCount: 0, skippedReason: "no_active_subscriptions" };
  }

  let sentCount = 0;
  let failedCount = 0;
  let revokedCount = 0;
  const nowIso = new Date().toISOString();

  // 5. Send push to each active device
  for (const sub of subscriptions) {
    const res = await sendPhysicalPushNotification(
      {
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
      {
        title: payload.title,
        body: sanitizedBody,
        url: targetUrl,
        notificationId,
        eventType: payload.eventType,
        conversationId: payload.conversationId,
        senderId: payload.senderId,
        data: payload.data,
      }
    );

    if (res.success) {
      sentCount++;
      // Update subscription tracking
      try {
        await supabase
          .from("push_subscriptions")
          .update({
            last_success_at: nowIso,
            last_seen_at: nowIso,
            failure_count: 0,
            updated_at: nowIso,
          })
          .eq("id", sub.id);

        await supabase.from("notification_delivery_events").insert({
          notification_id: payload.notificationId || null,
          recipient_id: payload.userId,
          channel: "push",
          status: "delivered",
          provider_code: res.statusCode ? String(res.statusCode) : null,
          delivered_at: nowIso,
        });
      } catch {}
    } else {
      failedCount++;
      const isPermanent =
        res.permanentFailure || (res.statusCode === 404 || res.statusCode === 410);

      try {
        if (isPermanent) {
          revokedCount++;
          // Automatically revoke dead / expired subscriptions
          await supabase
            .from("push_subscriptions")
            .update({
              revoked_at: nowIso,
              last_error: `permanent_failure_status_${res.statusCode || "unknown"}`,
              updated_at: nowIso,
            })
            .eq("id", sub.id);
        } else {
          // Bounded retry tracking
          const { error: rpcErr } = await supabase.rpc("increment_push_failure_count", {
            p_subscription_id: sub.id,
            p_error_message: (res.error || "delivery_error").slice(0, 200),
          });

          if (rpcErr) {
            // Fallback direct update if RPC is missing
            await supabase
              .from("push_subscriptions")
              .update({
                failure_count: (sub as any).failure_count ? (sub as any).failure_count + 1 : 1,
                last_error: (res.error || "delivery_error").slice(0, 200),
                updated_at: nowIso,
              })
              .eq("id", sub.id);
          }
        }

        await supabase.from("notification_delivery_events").insert({
          notification_id: payload.notificationId || null,
          recipient_id: payload.userId,
          channel: "push",
          status: "failed",
          provider_code: res.statusCode ? String(res.statusCode) : "network_error",
        });
      } catch {}
    }
  }

  return {
    success: sentCount > 0 || failedCount === 0,
    totalSubscriptions: subscriptions.length,
    sentCount,
    failedCount,
    revokedCount,
  };
}

/**
 * Dispatches a push notification to all conversation members except the sender.
 */
export async function sendWebPushToConversationMembers(params: {
  conversationId: string;
  senderId: string;
  senderName: string;
  content: string;
  messageType?: string;
  messageId?: string;
}): Promise<void> {
  const supabase = getAdminSupabase();

  try {
    // 1. Fetch conversation members except the sender
    const { data: members, error } = await supabase
      .from("conversation_members")
      .select("user_id")
      .eq("conversation_id", params.conversationId)
      .neq("user_id", params.senderId);

    if (error || !members || members.length === 0) {
      return;
    }

    // 2. Fetch conversation title/type for groups
    const { data: conv } = await supabase
      .from("conversations")
      .select("type, title")
      .eq("id", params.conversationId)
      .maybeSingle();

    const isGroup = conv?.type === "group";
    const title = isGroup && conv?.title ? `${conv.title} (${params.senderName})` : params.senderName;
    const eventType =
      params.messageType === "voice"
        ? "voice_message"
        : params.messageType === "image"
        ? "media_message"
        : "message";

    let bodyText = params.content || "New message";
    if (params.messageType === "voice") {
      bodyText = "Voice message";
    } else if (params.messageType === "image") {
      bodyText = "Photo";
    }

    // 3. Dispatch to all recipient members
    for (const member of members) {
      sendWebPushToUser({
        userId: member.user_id,
        title,
        body: bodyText,
        url: `/chat/${params.conversationId}`,
        eventType,
        conversationId: params.conversationId,
        senderId: params.senderId,
        notificationId: params.messageId ? `msg_${params.messageId}_${member.user_id}` : undefined,
        data: {
          conversationId: params.conversationId,
          messageId: params.messageId,
          senderId: params.senderId,
        },
      }).catch((err) => {
        console.error("[Push Delivery] Member dispatch error:", err);
      });
    }
  } catch (err) {
    console.error("[Push Delivery] Failed to dispatch conversation push:", err);
  }
}
