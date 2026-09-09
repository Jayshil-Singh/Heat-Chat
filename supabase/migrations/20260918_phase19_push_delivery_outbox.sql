-- ==============================================================================
-- HEAT CHAT — PHASE 19: TRUE BACKGROUND WEB PUSH DELIVERY OUTBOX
-- Ensures all notification events generate outbox delivery records for active
-- subscriptions, hardens push_subscriptions columns, and ensures zero delivery loss.
-- ==============================================================================

-- 1. HARDEN PUSH_SUBSCRIPTIONS TABLE COLUMNS
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  ADD COLUMN IF NOT EXISTS last_success_at timestamp with time zone DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_failure_at timestamp with time zone DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_error text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS device_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS installation_id text DEFAULT NULL;

-- Ensure index on active subscriptions for fast delivery lookup
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active_delivery
  ON public.push_subscriptions(user_id)
  WHERE revoked_at IS NULL;

-- 2. ENSURE NOTIFICATION_DELIVERIES TABLE AND INDICES EXIST
CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'delivered', 'failed', 'revoked')),
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  lease_expires_at timestamp with time zone DEFAULT NULL,
  claim_token text DEFAULT NULL,
  last_error text DEFAULT NULL,
  delivered_at timestamp with time zone DEFAULT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Idempotency constraint: exactly one delivery attempt record per (notification_id, subscription_id)
CREATE UNIQUE INDEX IF NOT EXISTS notification_deliveries_notif_sub_uidx
  ON public.notification_deliveries(notification_id, subscription_id);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_claim_v2
  ON public.notification_deliveries(status, next_attempt_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_user
  ON public.notification_deliveries(user_id, status);

-- Enable RLS on notification_deliveries
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notification deliveries" ON public.notification_deliveries;
CREATE POLICY "Users can view own notification deliveries"
  ON public.notification_deliveries FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON public.notification_deliveries FROM anon, authenticated;
GRANT SELECT ON public.notification_deliveries TO authenticated;
GRANT ALL ON public.notification_deliveries TO service_role;

-- 3. AUTOMATIC OUTBOX ENQUEUE TRIGGER
-- When ANY notification is inserted into public.notifications, automatically
-- create delivery rows for all active push subscriptions of the recipient.
CREATE OR REPLACE FUNCTION public.handle_notification_delivery_enqueue()
RETURNS trigger AS $$
DECLARE
  v_recipient uuid;
  v_event_type text;
  v_is_security boolean;
BEGIN
  v_recipient := COALESCE(NEW.recipient_id, NEW.user_id);
  IF v_recipient IS NULL THEN
    RETURN NEW;
  END IF;

  v_event_type := COALESCE(NEW.event_type, NEW.type, 'message');
  v_is_security := v_event_type IN ('security', 'security_alert', 'password_changed', 'new_device_login');

  -- Enqueue for all active (non-revoked) subscriptions belonging to the recipient
  INSERT INTO public.notification_deliveries (
    notification_id,
    subscription_id,
    user_id,
    status,
    attempt_count,
    next_attempt_at
  )
  SELECT
    NEW.id,
    ps.id,
    v_recipient,
    'pending',
    0,
    timezone('utc'::text, now())
  FROM public.push_subscriptions ps
  LEFT JOIN public.notification_preferences np ON np.user_id = v_recipient
  WHERE ps.user_id = v_recipient
    AND ps.revoked_at IS NULL
    AND (
      v_is_security
      OR (
        COALESCE(np.notifications_enabled, true) = true
        AND COALESCE(np.push_enabled, true) = true
        AND (
          (v_event_type IN ('message', 'media_message', 'voice_message') AND COALESCE(np.messages_notify, true) = true)
          OR (v_event_type = 'mention' AND COALESCE(np.mentions_notify, true) = true)
          OR (v_event_type = 'reply' AND COALESCE(np.replies_notify, true) = true)
          OR (v_event_type IN ('friend_request', 'friend_accepted', 'friend_request_accepted') AND COALESCE(np.friend_activity_notify, true) = true)
          OR (v_event_type IN ('group_invite', 'group_activity', 'member_added', 'member_removed') AND COALESCE(np.group_activity_notify, true) = true)
          OR (v_event_type = 'reaction' AND COALESCE(np.reactions_notify, true) = true)
          OR (v_event_type = 'test_notification')
        )
      )
    )
  ON CONFLICT (notification_id, subscription_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_enqueue_notification_delivery ON public.notifications;
CREATE TRIGGER trg_enqueue_notification_delivery
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_notification_delivery_enqueue();
