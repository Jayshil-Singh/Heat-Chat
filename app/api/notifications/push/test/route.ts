import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/notifications/rate-limit";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
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

  const { notification, skippedReason } = await dispatchNotification({
    userId: user.id,
    eventType: "test_notification",
    dedupeKey,
    title: "Test Push Notification",
    body: "Web Push is properly configured and functioning on this device!",
    data: { url: "/chat", timestamp: Date.now() },
  });

  return NextResponse.json({
    success: true,
    notificationId: notification?.id || null,
    skippedReason: skippedReason || null,
    remainingTests: rl.remaining,
  });
}
