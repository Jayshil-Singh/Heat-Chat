import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_VAPID_PUBLIC_KEY, DEFAULT_VAPID_SUBJECT } from "@/lib/notifications/push";

function maskPushEndpoint(endpoint: string): string {
  try {
    const u = new URL(endpoint);
    return `${u.protocol}//${u.host}/...${endpoint.slice(-6)}`;
  } catch {
    return `...${endpoint.slice(-8)}`;
  }
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Check user subscriptions in database
  const { data: subscriptions, error: subError } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, device_type, failure_count, revoked_at, last_seen_at, last_success_at, created_at, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // 2. Check user notification preferences
  const { data: preferences } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  // 3. Mask endpoints for privacy (only reveal protocol + domain + last 6 chars)
  const maskedSubscriptions = (subscriptions || []).map((sub) => {
    const maskedEndpoint = maskPushEndpoint(sub.endpoint);

    return {
      id: sub.id,
      endpointMasked: maskedEndpoint,
      deviceType: sub.device_type,
      failureCount: sub.failure_count,
      isRevoked: Boolean(sub.revoked_at),
      revokedAt: sub.revoked_at,
      lastSeenAt: sub.last_seen_at,
      lastSuccessAt: sub.last_success_at,
      createdAt: sub.created_at,
      updatedAt: sub.updated_at,
    };
  });

  const activeCount = maskedSubscriptions.filter((s) => !s.isRevoked).length;
  const revokedCount = maskedSubscriptions.filter((s) => s.isRevoked).length;

  // 4. Check VAPID server configuration without revealing private key
  const hasEnvPublicKey = Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  const hasEnvPrivateKey = Boolean(process.env.VAPID_PRIVATE_KEY);
  const hasEnvSubject = Boolean(process.env.VAPID_SUBJECT);
  const hasValidPublicKey = Boolean(DEFAULT_VAPID_PUBLIC_KEY && DEFAULT_VAPID_PUBLIC_KEY.length >= 65);
  const hasValidPrivateKey = Boolean(process.env.VAPID_PRIVATE_KEY || true); // fallback is active

  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
    },
    vapid: {
      configured: hasValidPublicKey && hasValidPrivateKey,
      subject: process.env.VAPID_SUBJECT || DEFAULT_VAPID_SUBJECT,
      publicKeyConfigured: hasEnvPublicKey || Boolean(DEFAULT_VAPID_PUBLIC_KEY),
      publicKeyPrefix: DEFAULT_VAPID_PUBLIC_KEY ? `${DEFAULT_VAPID_PUBLIC_KEY.slice(0, 10)}...` : null,
      privateKeyConfigured: hasEnvPrivateKey, // boolean only - never expose private key!
      usingFallbackKeys: !hasEnvPublicKey || !hasEnvPrivateKey,
    },
    preferences: preferences
      ? {
          notificationsEnabled: (preferences as any).notifications_enabled,
          pushEnabled: (preferences as any).push_enabled,
          messagePreviewEnabled: (preferences as any).message_preview_enabled,
          messagesNotify: (preferences as any).messages_notify,
          mentionsNotify: (preferences as any).mentions_notify,
          friendActivityNotify: (preferences as any).friend_activity_notify,
          groupActivityNotify: (preferences as any).group_activity_notify,
          reactionsNotify: (preferences as any).reactions_notify,
          securityNotify: (preferences as any).security_notify,
          quietHoursEnabled: Boolean((preferences as any).quiet_hours_enabled),
        }
      : null,
    subscriptions: {
      totalCount: maskedSubscriptions.length,
      activeCount,
      revokedCount,
      hasActiveSubscription: activeCount > 0,
      devices: maskedSubscriptions,
      queryError: subError ? subError.message : null,
    },
  });
}
