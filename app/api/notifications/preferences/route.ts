import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function isValidIanaTimezone(tz: string): boolean {
  if (!tz || typeof tz !== "string") return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const TIME_FORMAT_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const defaultPrefs = {
    user_id: user.id,
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
    quiet_hours_enabled: false,
    quiet_hours_start: "22:00",
    quiet_hours_end: "08:00",
    timezone: "UTC",
  };

  return NextResponse.json(data || defaultPrefs);
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  // Validate timezone if provided
  if (body.timezone !== undefined && !isValidIanaTimezone(body.timezone)) {
    return NextResponse.json({ error: "Invalid IANA timezone" }, { status: 400 });
  }

  // Validate quiet hours times
  if (body.quiet_hours_start !== undefined && !TIME_FORMAT_REGEX.test(body.quiet_hours_start)) {
    return NextResponse.json({ error: "Invalid quiet_hours_start format (HH:MM)" }, { status: 400 });
  }

  if (body.quiet_hours_end !== undefined && !TIME_FORMAT_REGEX.test(body.quiet_hours_end)) {
    return NextResponse.json({ error: "Invalid quiet_hours_end format (HH:MM)" }, { status: 400 });
  }

  const updates = {
    user_id: user.id,
    updated_at: new Date().toISOString(),
    ...(body.notifications_enabled !== undefined && { notifications_enabled: Boolean(body.notifications_enabled) }),
    ...(body.sound_enabled !== undefined && { sound_enabled: Boolean(body.sound_enabled) }),
    ...(body.desktop_notifications_enabled !== undefined && {
      desktop_notifications_enabled: Boolean(body.desktop_notifications_enabled),
    }),
    ...(body.message_preview_enabled !== undefined && {
      message_preview_enabled: Boolean(body.message_preview_enabled),
    }),
    ...(body.push_enabled !== undefined && { push_enabled: Boolean(body.push_enabled) }),
    ...(body.email_notifications !== undefined && { email_notifications: Boolean(body.email_notifications) }),
    ...(body.messages_notify !== undefined && { messages_notify: Boolean(body.messages_notify) }),
    ...(body.mentions_notify !== undefined && { mentions_notify: Boolean(body.mentions_notify) }),
    ...(body.replies_notify !== undefined && { replies_notify: Boolean(body.replies_notify) }),
    ...(body.group_activity_notify !== undefined && {
      group_activity_notify: Boolean(body.group_activity_notify),
    }),
    ...(body.friend_activity_notify !== undefined && {
      friend_activity_notify: Boolean(body.friend_activity_notify),
    }),
    ...(body.quiet_hours_enabled !== undefined && { quiet_hours_enabled: Boolean(body.quiet_hours_enabled) }),
    ...(body.quiet_hours_start && { quiet_hours_start: body.quiet_hours_start }),
    ...(body.quiet_hours_end && { quiet_hours_end: body.quiet_hours_end }),
    ...(body.timezone && { timezone: body.timezone }),
  };

  const { data, error } = await supabase
    .from("notification_preferences")
    .upsert(updates)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
