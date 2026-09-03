import { NotificationEventType, NotificationPreferences } from "./types";

/**
 * Immutable dedupe key generators for all 17 canonical event types.
 */
export const DedupeKeyBuilders = {
  message: (messageId: string) => `msg:${messageId}`,
  media_message: (messageId: string) => `media_msg:${messageId}`,
  voice_message: (messageId: string) => `voice_msg:${messageId}`,
  mention: (messageId: string, userId: string) => `mention:${messageId}:${userId}`,
  reply: (replyMessageId: string, userId: string) => `reply:${replyMessageId}:${userId}`,
  group_invite: (conversationId: string, inviteeId: string) => `grp_invite:${conversationId}:${inviteeId}`,
  member_added: (conversationId: string, memberId: string, versionOrTimestamp: string | number) =>
    `member_add:${conversationId}:${memberId}:${versionOrTimestamp}`,
  member_removed: (conversationId: string, memberId: string, versionOrTimestamp: string | number) =>
    `member_rem:${conversationId}:${memberId}:${versionOrTimestamp}`,
  role_changed: (conversationId: string, memberId: string, role: string, versionOrTimestamp: string | number) =>
    `role_change:${conversationId}:${memberId}:${role}:${versionOrTimestamp}`,
  poll_created: (pollId: string) => `poll_create:${pollId}`,
  poll_result: (pollId: string, recipientId: string) => `poll_result:${pollId}:${recipientId}`,
  friend_request: (requesterId: string, recipientId: string) => `fr_req:${requesterId}:${recipientId}`,
  friend_accepted: (accepterId: string, requesterId: string) => `fr_acc:${accepterId}:${requesterId}`,
  security_alert: (userId: string, alertType: string, windowId: string | number) => `sec_alert:${userId}:${alertType}:${windowId}`,
  password_changed: (userId: string, windowId: string | number) => `pwd_change:${userId}:${windowId}`,
  new_device_login: (userId: string, sessionId: string) => `device_login:${userId}:${sessionId}`,
  test_notification: (userId: string, timestamp: number | string) => `test_notif:${userId}:${timestamp}`,
};

/**
 * Evaluates whether quiet hours apply to a given notification in the recipient's timezone.
 * Security alerts, password changes, and test notifications bypass quiet hours.
 */
export function isInQuietHours(
  prefs: Pick<NotificationPreferences, "quiet_hours_enabled" | "quiet_hours_start" | "quiet_hours_end" | "timezone">,
  eventType: NotificationEventType,
  nowUtc: Date = new Date()
): boolean {
  if (!prefs.quiet_hours_enabled) {
    return false;
  }

  // Security critical alerts bypass quiet hours unconditionally
  if (
    eventType === "security_alert" ||
    eventType === "password_changed" ||
    eventType === "new_device_login" ||
    eventType === "test_notification"
  ) {
    return false;
  }

  try {
    const tz = prefs.timezone || "UTC";
    // Format recipient current hour and minute in their IANA timezone
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    });

    const parts = formatter.formatToParts(nowUtc);
    const hourStr = parts.find((p) => p.type === "hour")?.value || "0";
    const minuteStr = parts.find((p) => p.type === "minute")?.value || "0";

    const currentMinutes = parseInt(hourStr, 10) * 60 + parseInt(minuteStr, 10);

    const [startH, startM] = (prefs.quiet_hours_start || "22:00").split(":").map((v) => parseInt(v, 10));
    const [endH, endM] = (prefs.quiet_hours_end || "08:00").split(":").map((v) => parseInt(v, 10));

    const startMinutes = (startH || 0) * 60 + (startM || 0);
    const endMinutes = (endH || 0) * 60 + (endM || 0);

    if (startMinutes < endMinutes) {
      // Same day interval (e.g. 13:00 to 15:00)
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      // Overnight interval (e.g. 22:00 to 08:00)
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
  } catch (err) {
    // If timezone parsing fails, fail open (allow notification)
    return false;
  }
}

/**
 * Validates internal URL redirects to prevent open redirect vulnerabilities.
 * Permits relative paths starting with '/' and rejects protocol-relative ('//', '/\') or external schemes.
 */
export function validateInternalUrl(targetUrl: string | undefined | null): string {
  if (!targetUrl || typeof targetUrl !== "string") {
    return "/chat";
  }

  const trimmed = targetUrl.trim();

  // Must start with '/' and must NOT start with '//' or '/\' or '/%2f'
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return "/chat";
  }

  // Reject javascript:, data:, or backslash escapes
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
 * Scrub sensitive credentials from payload data
 */
export function sanitizeNotificationPayload(data: Record<string, any> = {}): Record<string, any> {
  const sanitized = { ...data };
  const sensitiveKeys = ["password", "token", "secret", "auth", "p256dh", "key", "apiKey", "access_token", "jwt"];

  for (const k of Object.keys(sanitized)) {
    if (sensitiveKeys.some((s) => k.toLowerCase().includes(s.toLowerCase()))) {
      delete sanitized[k];
    }
  }

  return sanitized;
}
