import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/notifications/rate-limit";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { sendWebPushToUser } from "@/lib/notifications/push-delivery";
import { DedupeKeyBuilders } from "@/lib/notifications/events";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: max 3 test notifications per hour per user
  const rl = checkRateLimit(`push_test:${user.id}`, 3, 3600);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: `Rate limit exceeded. Please wait ${rl.resetInSeconds} seconds before requesting another test notification.`,
      },
      { status: 429 }
    );
  }

  const dedupeKey = DedupeKeyBuilders.test_notification(user.id, Date.now());

  // 1. Dispatch persistent notification row
  const { notification, skippedReason } = await dispatchNotification({
    userId: user.id,
    eventType: "test_notification",
    dedupeKey,
    title: "Test Push Notification",
    body: "Web Push is properly configured and functioning on this device!",
    data: { url: "/chat", timestamp: Date.now() },
  });

  // 2. Direct physical Web Push dispatch to verify end-to-end delivery
  const pushResult = await sendWebPushToUser({
    userId: user.id,
    title: "Test Push Notification",
    body: "Web Push is properly configured and functioning on this device!",
    url: "/chat",
    eventType: "test_notification",
    notificationId: notification?.id || undefined,
    data: { timestamp: Date.now() },
  });

  if (pushResult.totalSubscriptions === 0) {
    return NextResponse.json({
      success: false,
      message: "No active push subscription found on server. Please click 'Subscribe This Device' first.",
      notificationId: notification?.id || null,
      remainingTests: rl.remaining,
      totalSubscriptions: 0,
      sentCount: 0,
    });
  }

  return NextResponse.json({
    success: pushResult.sentCount > 0,
    notificationId: notification?.id || null,
    skippedReason: skippedReason || pushResult.skippedReason || null,
    remainingTests: rl.remaining,
    totalSubscriptions: pushResult.totalSubscriptions,
    sentCount: pushResult.sentCount,
    failedCount: pushResult.failedCount,
    revokedCount: pushResult.revokedCount,
    message:
      pushResult.sentCount > 0
        ? "Test push notification sent successfully!"
        : "Push delivery failed. Please check your browser notification permissions or re-subscribe.",
  });
}
