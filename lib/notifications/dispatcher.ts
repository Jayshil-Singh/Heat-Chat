import { createClient } from "@supabase/supabase-js";
import { DispatchNotificationParams, NotificationRecord, NotificationPreferences } from "./types";
import { isInQuietHours, sanitizeNotificationPayload } from "./events";
import { sendWebPushToUser } from "./push-delivery";

// Service role client for notification persistence and delivery queueing
function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rmvpdcftfdeizitnrvkw.supabase.co";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Deterministically generates an idempotency deduplication key.
 */
export function generateDedupeKey(params: {
  eventType: string;
  userId: string;
  conversationId?: string | null;
  actorId?: string | null;
  sourceId?: string | null;
}): string {
  const parts = [params.eventType, params.userId, params.conversationId || "", params.actorId || "", params.sourceId || ""];
  return parts.filter(Boolean).join(":");
}

/**
 * Records operational delivery telemetry without any sensitive message content.
 */
export async function recordNotificationDeliveryEvent(
  supabase: any,
  params: {
    notificationId?: string;
    recipientId: string;
    channel: "realtime" | "push" | "in_app";
    status: "attempted" | "sent" | "delivered" | "failed" | "expired";
    providerCode?: string | null;
  }
): Promise<void> {
  try {
    await supabase.from("notification_delivery_events").insert({
      notification_id: params.notificationId || null,
      recipient_id: params.recipientId,
      channel: params.channel,
      status: params.status,
      provider_code: params.providerCode || null,
    });
  } catch {
    // Non-blocking telemetry
  }
}

/**
 * Dispatches a notification to persistent storage and enqueues outbox deliveries if push is enabled.
 * Persistence and push delivery remain separate.
 */
export async function dispatchNotification(
  params: DispatchNotificationParams
): Promise<{ notification: NotificationRecord | null; skippedReason?: string }> {
  const supabase = getAdminSupabase();

  // 1. Check conversation mute if conversationId is provided
  if (params.conversationId) {
    const { data: mutePref } = await supabase
      .from("conversation_notification_preferences")
      .select("muted")
      .eq("conversation_id", params.conversationId)
      .eq("user_id", params.userId)
      .maybeSingle();

    if (mutePref?.muted) {
      return { notification: null, skippedReason: "conversation_muted" };
    }
  }

  // 2. Fetch recipient notification preferences
  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("user_id", params.userId)
    .maybeSingle();

  const userPrefs: NotificationPreferences = prefs || {
    user_id: params.userId,
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

  const notificationType = params.eventType;
  const isSecurityNotification =
    ["security", "security_alert"].includes(notificationType) ||
    notificationType === "password_changed" ||
    notificationType === "new_device_login";
  // Security notifications bypass social notification preferences

  if (!isSecurityNotification) {
    if (!userPrefs.notifications_enabled) {
      return { notification: null, skippedReason: "notifications_disabled_globally" };
    }

    // Check event type category enablement
    if (params.eventType === "message" || params.eventType === "media_message" || params.eventType === "voice_message") {
      if (!userPrefs.messages_notify) return { notification: null, skippedReason: "messages_disabled" };
    } else if (params.eventType === "mention" && !userPrefs.mentions_notify) {
      return { notification: null, skippedReason: "mentions_disabled" };
    } else if (params.eventType === "reply" && !userPrefs.replies_notify) {
      return { notification: null, skippedReason: "replies_disabled" };
    } else if (
      (params.eventType === "group_invite" || params.eventType === "group_activity" || params.eventType === "member_added" || params.eventType === "member_removed" || params.eventType === "role_changed" || params.eventType === "poll_created" || params.eventType === "poll_result") &&
      !userPrefs.group_activity_notify
    ) {
      return { notification: null, skippedReason: "group_activity_disabled" };
    } else if (
      (params.eventType === "friend_request" || params.eventType === "friend_accepted" || params.eventType === "friend_request_accepted" || params.eventType === "friend_request_declined") &&
      !userPrefs.friend_activity_notify
    ) {
      return { notification: null, skippedReason: "friend_activity_disabled" };
    } else if (params.eventType === "reaction" && userPrefs.reactions_notify === false) {
      return { notification: null, skippedReason: "reactions_disabled" };
    }
  }

  // 3. Persist notification row with ON CONFLICT (user_id, dedupe_key) DO NOTHING
  const dedupeKey =
    params.dedupeKey ||
    generateDedupeKey({
      eventType: params.eventType,
      userId: params.userId,
      conversationId: params.conversationId,
      actorId: params.actorId,
    });
  const sanitizedData = sanitizeNotificationPayload(params.data || {});

  const { data: inserted, error: insertError } = await supabase
    .from("notifications")
    .upsert(
      {
        user_id: params.userId,
        recipient_id: params.userId,
        actor_id: params.actorId || null,
        sender_id: params.actorId || null,
        conversation_id: params.conversationId || null,
        event_type: params.eventType,
        type: params.eventType,
        dedupe_key: dedupeKey,
        title: params.title,
        body: params.body,
        data: sanitizedData,
        metadata: sanitizedData,
        is_read: false,
        expires_at: params.expiresAt || null,
      },
      {
        onConflict: "user_id,dedupe_key",
        ignoreDuplicates: true,
      }
    )
    .select()
    .maybeSingle();

  if (insertError) {
    console.error("Error persisting notification:", insertError);
    return { notification: null, skippedReason: `db_error: ${insertError.message}` };
  }

  const notification = (inserted as NotificationRecord) || null;
  if (!notification) {
    // Deduplication occurred: item was already inserted
    return { notification: null, skippedReason: "deduplicated" };
  }

  // Record operational delivery telemetry for in_app (zero notification text)
  await recordNotificationDeliveryEvent(supabase, {
    notificationId: notification.id,
    recipientId: params.userId,
    channel: "in_app",
    status: "delivered",
  });

  // 4. Enqueue push deliveries if recipient has push enabled and not in quiet hours
  const quietHoursActive = isInQuietHours(userPrefs, params.eventType);

  if ((userPrefs.push_enabled || isSecurityNotification) && !quietHoursActive) {
    // Fetch active push subscriptions for the recipient
    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("id")
      .eq("user_id", params.userId)
      .is("revoked_at", null);

    if (subscriptions && subscriptions.length > 0) {
      const deliveryRows = subscriptions.map((sub) => ({
        notification_id: notification.id,
        subscription_id: sub.id,
        user_id: params.userId,
        status: "pending",
        attempt_count: 0,
        next_attempt_at: new Date().toISOString(),
      }));

      await supabase
        .from("notification_deliveries")
        .upsert(deliveryRows, { onConflict: "notification_id,subscription_id", ignoreDuplicates: true });

      // Record operational delivery telemetry for push outbox (zero notification text)
      await recordNotificationDeliveryEvent(supabase, {
        notificationId: notification.id,
        recipientId: params.userId,
        channel: "push",
        status: "attempted",
        providerCode: "queued_for_delivery",
      });

      // Execute immediate background delivery so notifications arrive even if the app/tab is closed
      sendWebPushToUser({
        userId: params.userId,
        title: params.title,
        body: params.body,
        url: (params.data as any)?.url || "/chat",
        eventType: params.eventType,
        notificationId: notification.id,
        conversationId: params.conversationId || undefined,
        senderId: params.actorId || undefined,
        data: params.data,
      }).catch((err) => {
        console.error("[Dispatcher] Immediate push delivery error:", err);
      });
    }
  }

  return { notification };
}
