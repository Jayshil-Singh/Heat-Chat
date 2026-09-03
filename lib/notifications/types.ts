export type NotificationEventType =
  | "message"
  | "media_message"
  | "voice_message"
  | "mention"
  | "reply"
  | "group_invite"
  | "member_added"
  | "member_removed"
  | "role_changed"
  | "poll_created"
  | "poll_result"
  | "friend_request"
  | "friend_accepted"
  | "security_alert"
  | "password_changed"
  | "new_device_login"
  | "test_notification";

export type NotificationCategory = "all" | "messages" | "mentions" | "groups" | "friends";

export type DeviceType = "desktop" | "mobile" | "tablet" | "unknown";

export type DeliveryStatus = "pending" | "processing" | "delivered" | "failed" | "revoked";

export interface NotificationRecord {
  id: string;
  user_id: string;
  actor_id: string | null;
  conversation_id: string | null;
  event_type: NotificationEventType;
  dedupe_key: string | null;
  title: string;
  body: string;
  data: Record<string, any>;
  read_at: string | null;
  deleted_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface NotificationPreferences {
  user_id: string;
  notifications_enabled: boolean;
  sound_enabled: boolean;
  desktop_notifications_enabled: boolean;
  message_preview_enabled: boolean;
  push_enabled: boolean;
  email_notifications: boolean;
  messages_notify: boolean;
  mentions_notify: boolean;
  replies_notify: boolean;
  group_activity_notify: boolean;
  friend_activity_notify: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string; // HH:MM (e.g. "22:00")
  quiet_hours_end: string;   // HH:MM (e.g. "08:00")
  timezone: string;          // IANA timezone, e.g. "UTC", "America/New_York"
  updated_at: string;
}

export interface PushSubscriptionRecord {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  device_type: DeviceType;
  failure_count: number;
  last_seen_at: string;
  revoked_at: string | null;
  created_at: string;
}

export interface NotificationDeliveryRecord {
  id: string;
  notification_id: string;
  subscription_id: string;
  user_id: string;
  claim_token: string | null;
  lease_until: string | null;
  attempt_count: number;
  status: DeliveryStatus;
  last_error: string | null;
  next_attempt_at: string;
  created_at: string;
  delivered_at: string | null;
}

export interface DispatchNotificationParams {
  userId: string;
  actorId?: string | null;
  conversationId?: string | null;
  eventType: NotificationEventType;
  dedupeKey: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  expiresAt?: string | null;
}

export interface ClaimedDeliveryItem {
  delivery_id: string;
  claim_token: string;
  notification_id: string;
  subscription_id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  title: string;
  body: string;
  data: Record<string, any>;
  event_type: NotificationEventType;
}
