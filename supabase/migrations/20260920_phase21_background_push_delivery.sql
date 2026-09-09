-- Migration: 20260920_phase21_background_push_delivery.sql
-- Heat Chat Phase 21: True Background Web Push Delivery When App Is Closed
--
-- Goals:
-- 1. Ensure notification_deliveries schema and indexes are completely hardened.
-- 2. Update claim_notification_deliveries to claim pending and retryable failed jobs
--    and manage lease_until, lease_expires_at, and updated_at atomically.
-- 3. Update complete_notification_delivery to maintain updated_at and clear lease fields.
-- 4. Update register_push_subscription to automatically ensure notification_preferences.push_enabled = true.
-- 5. Update handle_notification_delivery_enqueue to guarantee delivery enqueueing for all active subscriptions.

-- 1. ENSURE COLUMNS AND CONSTRAINTS EXIST
ALTER TABLE public.notification_deliveries
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT timezone('utc'::text, now());

-- Ensure indices for high-performance claim queries
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_claim_v2
  ON public.notification_deliveries(status, next_attempt_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_user
  ON public.notification_deliveries(user_id, status);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_lease
  ON public.notification_deliveries(status, lease_expires_at)
  WHERE status = 'processing';

CREATE UNIQUE INDEX IF NOT EXISTS notification_deliveries_notif_sub_uidx
  ON public.notification_deliveries(notification_id, subscription_id);

-- RLS
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notification deliveries" ON public.notification_deliveries;
CREATE POLICY "Users can view own notification deliveries"
  ON public.notification_deliveries FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON public.notification_deliveries FROM anon, authenticated;
GRANT SELECT ON public.notification_deliveries TO authenticated;
GRANT ALL ON public.notification_deliveries TO service_role;

-- 2. HARDENED claim_notification_deliveries FUNCTION
CREATE OR REPLACE FUNCTION public.claim_notification_deliveries(
  p_batch_size integer DEFAULT 25,
  p_lease_seconds integer DEFAULT 60
) RETURNS TABLE (
  delivery_id uuid,
  claim_token uuid,
  notification_id uuid,
  subscription_id uuid,
  user_id uuid,
  endpoint text,
  p256dh text,
  auth text,
  title text,
  body text,
  data jsonb,
  event_type text
) AS $$
DECLARE
  v_batch integer;
  v_lease integer;
  r RECORD;
  v_item_token uuid;
  v_now timestamptz;
BEGIN
  v_batch := COALESCE(p_batch_size, 25);
  IF v_batch < 1 OR v_batch > 100 THEN
    RAISE EXCEPTION 'Batch size must be between 1 and 100';
  END IF;

  v_lease := COALESCE(p_lease_seconds, 60);
  IF v_lease < 15 OR v_lease > 300 THEN
    RAISE EXCEPTION 'Lease duration must be between 15 and 300 seconds';
  END IF;

  v_now := timezone('utc'::text, now());

  -- Claim candidate selection: FOR UPDATE OF d SKIP LOCKED
  -- Evaluates pending items, retryable failed items (attempts < 5), and expired processing leases
  FOR r IN
    SELECT d.id AS cand_id, d.notification_id AS cand_nid, d.subscription_id AS cand_sid,
           d.user_id AS cand_uid, s.endpoint AS cand_endpoint, s.p256dh AS cand_p256dh,
           s.auth AS cand_auth, n.title AS cand_title, n.body AS cand_body,
           n.data AS cand_data, n.event_type AS cand_type
    FROM public.notification_deliveries d
    JOIN public.push_subscriptions s ON d.subscription_id = s.id
    JOIN public.notifications n ON d.notification_id = n.id
    WHERE s.revoked_at IS NULL
      AND s.user_id = d.user_id
      AND (n.deleted_at IS NULL OR n.event_type IN ('security_alert', 'password_changed', 'new_device_login'))
      AND (n.expires_at IS NULL OR n.expires_at > v_now)
      AND (
        (d.status = 'pending' AND d.next_attempt_at <= v_now)
        OR
        (d.status = 'failed' AND d.attempt_count < 5 AND d.next_attempt_at <= v_now)
        OR
        (d.status = 'processing' AND COALESCE(d.lease_expires_at, d.lease_until) < v_now)
      )
    ORDER BY d.next_attempt_at ASC
    LIMIT v_batch
    FOR UPDATE OF d SKIP LOCKED
  LOOP
    v_item_token := gen_random_uuid();

    UPDATE public.notification_deliveries
    SET status = 'processing',
        claim_token = v_item_token,
        lease_until = v_now + (v_lease || ' seconds')::interval,
        lease_expires_at = v_now + (v_lease || ' seconds')::interval,
        updated_at = v_now,
        attempt_count = attempt_count + 1
    WHERE id = r.cand_id;

    delivery_id := r.cand_id;
    claim_token := v_item_token;
    notification_id := r.cand_nid;
    subscription_id := r.cand_sid;
    user_id := r.cand_uid;
    endpoint := r.cand_endpoint;
    p256dh := r.cand_p256dh;
    auth := r.cand_auth;
    title := r.cand_title;
    body := r.cand_body;
    data := r.cand_data;
    event_type := r.cand_type;
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.claim_notification_deliveries(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_deliveries(integer, integer) TO service_role;

-- 3. HARDENED complete_notification_delivery FUNCTION
CREATE OR REPLACE FUNCTION public.complete_notification_delivery(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_success boolean,
  p_error text DEFAULT NULL,
  p_permanent_failure boolean DEFAULT false,
  p_retry_delay_seconds integer DEFAULT 30
) RETURNS boolean AS $$
DECLARE
  v_sub_id uuid;
  v_attempts integer;
  v_next_delay integer;
  v_now timestamptz;
BEGIN
  IF p_delivery_id IS NULL OR p_claim_token IS NULL THEN
    RETURN false;
  END IF;

  v_now := timezone('utc'::text, now());

  -- Validate lease and claim token ownership
  SELECT subscription_id, attempt_count INTO v_sub_id, v_attempts
  FROM public.notification_deliveries
  WHERE id = p_delivery_id
    AND claim_token = p_claim_token
    AND status = 'processing'
    AND COALESCE(lease_expires_at, lease_until) >= v_now
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF p_success THEN
    UPDATE public.notification_deliveries
    SET status = 'delivered',
        delivered_at = v_now,
        claim_token = NULL,
        lease_until = NULL,
        lease_expires_at = NULL,
        updated_at = v_now,
        last_error = NULL
    WHERE id = p_delivery_id;

    UPDATE public.push_subscriptions
    SET failure_count = 0,
        last_seen_at = v_now,
        updated_at = v_now
    WHERE id = v_sub_id;

    RETURN true;
  ELSE
    IF p_permanent_failure OR v_attempts >= 5 THEN
      UPDATE public.notification_deliveries
      SET status = 'failed',
          claim_token = NULL,
          lease_until = NULL,
          lease_expires_at = NULL,
          updated_at = v_now,
          last_error = substring(COALESCE(p_error, 'terminal_failure') FROM 1 FOR 512)
      WHERE id = p_delivery_id;

      IF p_permanent_failure AND (p_error LIKE '%410%' OR p_error LIKE '%404%' OR p_error LIKE '%unregistered%' OR p_error LIKE '%expired%') THEN
        UPDATE public.push_subscriptions
        SET revoked_at = v_now,
            updated_at = v_now
        WHERE id = v_sub_id;
      ELSE
        UPDATE public.push_subscriptions
        SET failure_count = failure_count + 1,
            updated_at = v_now
        WHERE id = v_sub_id;
      END IF;
    ELSE
      v_next_delay := GREATEST(10, LEAST(3600, COALESCE(p_retry_delay_seconds, 30) * (2 ^ (v_attempts - 1))));
      UPDATE public.notification_deliveries
      SET status = 'pending',
          claim_token = NULL,
          lease_until = NULL,
          lease_expires_at = NULL,
          next_attempt_at = v_now + (v_next_delay || ' seconds')::interval,
          updated_at = v_now,
          last_error = substring(COALESCE(p_error, 'delivery_failed') FROM 1 FOR 512)
      WHERE id = p_delivery_id;
    END IF;

    RETURN true;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.complete_notification_delivery(uuid, uuid, boolean, text, boolean, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_notification_delivery(uuid, uuid, boolean, text, boolean, integer) TO service_role;

-- 4. HARDENED register_push_subscription FUNCTION
CREATE OR REPLACE FUNCTION public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text DEFAULT NULL,
  p_device_type text DEFAULT 'desktop',
  p_device_id text DEFAULT NULL,
  p_installation_id text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_sub_id uuid;
  v_host text;
  v_path_query text;
  v_canonical_endpoint text;
  v_ua text;
  v_existing_id uuid;
  v_existing_user uuid;
  v_now timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_now := timezone('utc'::text, now());

  -- Grammar-level parsing of endpoint
  IF p_endpoint IS NULL OR length(trim(p_endpoint)) < 12 THEN
    RAISE EXCEPTION 'Invalid push endpoint: format must be https://host/path';
  END IF;

  IF NOT (p_endpoint ~* '^https://([a-zA-Z0-9.-]+)(:[0-9]+)?(/.*)?$') THEN
    RAISE EXCEPTION 'Invalid push endpoint: strictly requires HTTPS scheme and valid authority';
  END IF;

  v_host := lower(substring(p_endpoint from '^https://([^/:]+)'));
  v_path_query := substring(p_endpoint from '^https://[^/:]+(.*)$');

  IF v_path_query IS NULL OR length(v_path_query) = 0 THEN
    v_path_query := '/';
  END IF;

  -- Block raw IPs or loopback
  IF v_host IN ('localhost', '127.0.0.1', '::1') OR v_host ~ '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' THEN
    RAISE EXCEPTION 'Invalid push endpoint: raw IP addresses are forbidden';
  END IF;

  v_canonical_endpoint := 'https://' || v_host || v_path_query;

  IF p_p256dh IS NULL OR length(trim(p_p256dh)) < 16 THEN
    RAISE EXCEPTION 'Invalid p256dh key';
  END IF;

  IF p_auth IS NULL OR length(trim(p_auth)) < 8 THEN
    RAISE EXCEPTION 'Invalid auth key';
  END IF;

  v_ua := substring(trim(COALESCE(p_user_agent, '')) FROM 1 FOR 512);

  PERFORM pg_advisory_xact_lock(hashtext('push_endpoint:' || v_canonical_endpoint));

  -- Revoke endpoint if assigned to another user
  SELECT id, user_id INTO v_existing_id, v_existing_user
  FROM public.push_subscriptions
  WHERE endpoint = v_canonical_endpoint
    AND revoked_at IS NULL
  FOR UPDATE;

  IF v_existing_id IS NOT NULL AND v_existing_user <> auth.uid() THEN
    UPDATE public.push_subscriptions
    SET revoked_at = v_now,
        updated_at = v_now
    WHERE id = v_existing_id;

    UPDATE public.notification_deliveries
    SET status = 'revoked', last_error = 'endpoint_reassigned_to_different_user', updated_at = v_now
    WHERE subscription_id = v_existing_id
      AND status IN ('pending', 'processing');
  END IF;

  -- Upsert subscription
  INSERT INTO public.push_subscriptions (
    user_id,
    endpoint,
    p256dh,
    auth,
    user_agent,
    device_type,
    device_id,
    installation_id,
    failure_count,
    revoked_at,
    last_seen_at,
    updated_at
  ) VALUES (
    auth.uid(),
    v_canonical_endpoint,
    p_p256dh,
    p_auth,
    v_ua,
    COALESCE(p_device_type, 'desktop'),
    p_device_id,
    p_installation_id,
    0,
    NULL,
    v_now,
    v_now
  )
  ON CONFLICT (user_id, endpoint) DO UPDATE
  SET p256dh = EXCLUDED.p256dh,
      auth = EXCLUDED.auth,
      user_agent = EXCLUDED.user_agent,
      device_type = EXCLUDED.device_type,
      device_id = COALESCE(EXCLUDED.device_id, public.push_subscriptions.device_id),
      installation_id = COALESCE(EXCLUDED.installation_id, public.push_subscriptions.installation_id),
      revoked_at = NULL,
      failure_count = 0,
      last_seen_at = v_now,
      updated_at = v_now
  RETURNING id INTO v_sub_id;

  -- Automatically ensure notification_preferences.push_enabled = true for caller
  INSERT INTO public.notification_preferences (user_id, push_enabled, updated_at)
  VALUES (auth.uid(), true, v_now)
  ON CONFLICT (user_id) DO UPDATE
  SET push_enabled = true,
      updated_at = v_now;

  RETURN v_sub_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.register_push_subscription(text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_subscription(text, text, text, text, text, text, text) TO authenticated;

-- 5. HARDENED handle_notification_delivery_enqueue TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION public.handle_notification_delivery_enqueue()
RETURNS trigger AS $$
DECLARE
  v_recipient uuid;
  v_event_type text;
  v_is_security boolean;
  v_now timestamptz;
BEGIN
  v_recipient := COALESCE(NEW.recipient_id, NEW.user_id);
  IF v_recipient IS NULL THEN
    RETURN NEW;
  END IF;

  v_now := timezone('utc'::text, now());
  v_event_type := COALESCE(NEW.event_type, NEW.type, 'message');
  v_is_security := v_event_type IN ('security', 'security_alert', 'password_changed', 'new_device_login');

  -- Enqueue for all active (non-revoked) subscriptions belonging to the recipient
  INSERT INTO public.notification_deliveries (
    notification_id,
    subscription_id,
    user_id,
    status,
    attempt_count,
    next_attempt_at,
    created_at,
    updated_at
  )
  SELECT
    NEW.id,
    ps.id,
    v_recipient,
    'pending',
    0,
    v_now,
    v_now,
    v_now
  FROM public.push_subscriptions ps
  LEFT JOIN public.notification_preferences np ON np.user_id = v_recipient
  WHERE ps.user_id = v_recipient
    AND ps.revoked_at IS NULL
    AND (
      v_is_security
      OR (
        COALESCE(np.notifications_enabled, true) = true
        AND (np.push_enabled IS NULL OR np.push_enabled = true)
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
