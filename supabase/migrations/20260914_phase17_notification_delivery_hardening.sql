-- ==============================================================================
-- HEAT CHAT — PHASE 17: NOTIFICATION DELIVERY OBSERVABILITY & PUSH RESILIENCE
-- Migration: 20260914_phase17_notification_delivery_hardening.sql
-- ==============================================================================

-- 1. PUSH SUBSCRIPTIONS SCHEMA HARDENING
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS device_id text,
  ADD COLUMN IF NOT EXISTS installation_id text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_failure_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subs_user_endpoint
  ON public.push_subscriptions(user_id, endpoint)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS push_subscriptions_user_device_idx
  ON public.push_subscriptions(user_id, device_id)
  WHERE revoked_at IS NULL AND device_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS push_subscriptions_user_installation_idx
  ON public.push_subscriptions(user_id, installation_id)
  WHERE revoked_at IS NULL AND installation_id IS NOT NULL;

-- 2. NOTIFICATION PREFERENCES GRANULAR CATEGORIES
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS push_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS messages_notify boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS mentions_notify boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS replies_notify boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS group_activity_notify boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS friend_activity_notify boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reactions_notify boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS security_notify boolean NOT NULL DEFAULT true;

-- Deduplication index for notifications table
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_recipient_dedupe
  ON public.notifications(recipient_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- Enforce security_notify is ALWAYS true at the database layer
CREATE OR REPLACE FUNCTION public.enforce_security_notification_preference()
RETURNS trigger AS $$
BEGIN
  NEW.security_notify := true;
  NEW.updated_at := timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_enforce_security_notification_preference ON public.notification_preferences;
CREATE TRIGGER trg_enforce_security_notification_preference
  BEFORE INSERT OR UPDATE ON public.notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_security_notification_preference();

-- Ensure existing rows have security_notify = true
UPDATE public.notification_preferences
SET security_notify = true
WHERE security_notify = false;

-- 3. NOTIFICATION DELIVERY EVENTS (OPERATIONAL TELEMETRY ONLY)
-- Strict invariant: ZERO notification body, message text, or private chat data
CREATE TABLE IF NOT EXISTS public.notification_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid REFERENCES public.notifications(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('realtime', 'push', 'in_app')),
  status text NOT NULL CHECK (status IN ('attempted', 'sent', 'delivered', 'failed', 'expired')),
  provider_code text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  delivered_at timestamptz DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_delivery_events_recipient_created
  ON public.notification_delivery_events(recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_delivery_events_notif_id
  ON public.notification_delivery_events(notification_id);

CREATE INDEX IF NOT EXISTS idx_delivery_events_status
  ON public.notification_delivery_events(status);

CREATE INDEX IF NOT EXISTS notif_delivery_events_created_idx
  ON public.notification_delivery_events(created_at);

-- Row Level Security on notification_delivery_events
ALTER TABLE public.notification_delivery_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.notification_delivery_events FROM anon, public;

DROP POLICY IF EXISTS delivery_events_select_own ON public.notification_delivery_events;
CREATE POLICY delivery_events_select_own
  ON public.notification_delivery_events FOR SELECT
  TO authenticated
  USING (recipient_id = auth.uid());

GRANT ALL ON public.notification_delivery_events TO service_role;
GRANT SELECT ON public.notification_delivery_events TO authenticated;

-- 4. SECURITY DEFINER RPCS

-- A. record_notification_delivery_event
DROP FUNCTION IF EXISTS public.record_notification_delivery_event(uuid, uuid, text, text, text);
CREATE OR REPLACE FUNCTION public.record_notification_delivery_event(
  p_notification_id uuid,
  p_recipient_id uuid,
  p_channel text,
  p_status text,
  p_provider_code text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_caller_id uuid;
  v_event_id uuid;
BEGIN
  v_caller_id := auth.uid();

  -- Channel check
  IF p_channel NOT IN ('realtime', 'push', 'in_app') THEN
    RAISE EXCEPTION 'Invalid delivery channel: %', p_channel;
  END IF;

  -- Status check
  IF p_status NOT IN ('attempted', 'sent', 'delivered', 'failed', 'expired') THEN
    RAISE EXCEPTION 'Invalid delivery status: %', p_status;
  END IF;

  -- Recipient check: If called by an authenticated user, recipient must match caller
  IF v_caller_id IS NOT NULL AND p_recipient_id <> v_caller_id THEN
    RAISE EXCEPTION 'Not authorized to record delivery event for another user';
  END IF;

  INSERT INTO public.notification_delivery_events (
    notification_id,
    recipient_id,
    channel,
    status,
    provider_code,
    created_at,
    delivered_at
  ) VALUES (
    p_notification_id,
    p_recipient_id,
    p_channel,
    p_status,
    substring(COALESCE(p_provider_code, '') FROM 1 FOR 256),
    timezone('utc'::text, now()),
    CASE WHEN p_status IN ('sent', 'delivered') THEN timezone('utc'::text, now()) ELSE NULL END
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- B. verify_push_subscription
-- Checks if an active, non-revoked subscription exists for caller's endpoint
DROP FUNCTION IF EXISTS public.verify_push_subscription(text);
CREATE OR REPLACE FUNCTION public.verify_push_subscription(
  p_endpoint text
) RETURNS boolean AS $$
DECLARE
  v_caller_id uuid;
  v_found boolean := false;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_endpoint IS NULL OR p_endpoint = '' THEN
    RETURN false;
  END IF;

  UPDATE public.push_subscriptions
  SET last_seen_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  WHERE user_id = v_caller_id
    AND endpoint = p_endpoint
    AND revoked_at IS NULL;

  v_found := FOUND;
  RETURN v_found;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- C. cleanup_old_delivery_events
-- Automated telemetry retention management (default 30 days)
DROP FUNCTION IF EXISTS public.cleanup_old_delivery_events(integer);
CREATE OR REPLACE FUNCTION public.cleanup_old_delivery_events(
  p_retention_days integer DEFAULT 30
) RETURNS integer AS $$
DECLARE
  v_deleted integer := 0;
  v_threshold timestamp with time zone;
BEGIN
  v_threshold := timezone('utc'::text, now()) - (GREATEST(7, LEAST(180, COALESCE(p_retention_days, 30))) || ' days')::interval;

  DELETE FROM public.notification_delivery_events
  WHERE created_at < v_threshold;

  GET DIAGNOSTICS v_deleted = row_count;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- D. register_push_subscription (Enhanced with device_id & installation_id support)
DROP FUNCTION IF EXISTS public.register_push_subscription(text, text, text, text, text, text, text);
CREATE OR REPLACE FUNCTION public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text DEFAULT NULL,
  p_device_type text DEFAULT 'desktop',
  p_device_id text DEFAULT NULL,
  p_installation_id text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_raw text;
  v_after_scheme text;
  v_slash_pos integer;
  v_authority text;
  v_path_query text;
  v_colon_pos integer;
  v_host text;
  v_port text;
  v_canonical_endpoint text;
  v_existing_id uuid;
  v_existing_user uuid;
  v_sub_id uuid;
  v_ua text;
BEGIN
  -- Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_endpoint IS NULL THEN
    RAISE EXCEPTION 'Invalid push endpoint: null input';
  END IF;

  -- Reject control characters or non-ASCII
  IF p_endpoint ~ '[\x01-\x1F\x7F]' OR p_endpoint ~ '[^\x00-\x7F]' THEN
    RAISE EXCEPTION 'Invalid push endpoint: control characters or non-ASCII characters are forbidden';
  END IF;

  v_raw := trim(BOTH ' ' FROM p_endpoint);

  IF length(v_raw) < 12 OR length(v_raw) > 2048 OR v_raw ~ '\s' THEN
    RAISE EXCEPTION 'Invalid push endpoint: invalid length or internal whitespace';
  END IF;

  IF position('#' IN v_raw) > 0 THEN
    RAISE EXCEPTION 'Invalid push endpoint: URL fragments are forbidden';
  END IF;

  IF lower(substring(v_raw FROM 1 FOR 8)) <> 'https://' THEN
    RAISE EXCEPTION 'Invalid push endpoint: protocol must be https';
  END IF;

  v_after_scheme := substring(v_raw FROM 9);
  v_slash_pos := position('/' IN v_after_scheme);

  IF v_slash_pos < 2 THEN
    RAISE EXCEPTION 'Invalid push endpoint: path component is required';
  END IF;

  v_authority := substring(v_after_scheme FROM 1 FOR v_slash_pos - 1);
  v_path_query := substring(v_after_scheme FROM v_slash_pos);

  IF position('@' IN v_authority) > 0 THEN
    RAISE EXCEPTION 'Invalid push endpoint: userinfo is forbidden';
  END IF;

  IF position('[' IN v_authority) > 0 OR position(']' IN v_authority) > 0 THEN
    RAISE EXCEPTION 'Invalid push endpoint: raw IP addresses are forbidden';
  END IF;

  v_colon_pos := position(':' IN v_authority);
  IF v_colon_pos > 0 THEN
    v_host := substring(v_authority FROM 1 FOR v_colon_pos - 1);
    v_port := substring(v_authority FROM v_colon_pos + 1);
    IF v_port <> '443' THEN
      RAISE EXCEPTION 'Invalid push endpoint: only HTTPS port 443 is permitted';
    END IF;
  ELSE
    v_host := v_authority;
  END IF;

  v_host := lower(v_host);

  IF v_host ~ '^([0-9]+\.){3}[0-9]+$' THEN
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

  -- Transaction-scoped advisory lock on canonical endpoint identity
  PERFORM pg_advisory_xact_lock(hashtext('push_endpoint:' || v_canonical_endpoint));

  -- Lookup active subscription on canonical endpoint
  SELECT id, user_id INTO v_existing_id, v_existing_user
  FROM public.push_subscriptions
  WHERE endpoint = v_canonical_endpoint
    AND revoked_at IS NULL
  FOR UPDATE;

  IF v_existing_id IS NOT NULL THEN
    IF v_existing_user = auth.uid() THEN
      -- Same user key and metadata refresh
      UPDATE public.push_subscriptions
      SET p256dh = p_p256dh,
          auth = p_auth,
          user_agent = v_ua,
          device_type = COALESCE(p_device_type, 'desktop'),
          device_id = COALESCE(p_device_id, device_id),
          installation_id = COALESCE(p_installation_id, installation_id),
          failure_count = 0,
          updated_at = timezone('utc'::text, now()),
          last_seen_at = timezone('utc'::text, now())
      WHERE id = v_existing_id
      RETURNING id INTO v_sub_id;

      RETURN v_sub_id;
    ELSE
      -- Different user: Atomically revoke old subscription
      UPDATE public.push_subscriptions
      SET revoked_at = timezone('utc'::text, now()),
          updated_at = timezone('utc'::text, now())
      WHERE id = v_existing_id;

      UPDATE public.notification_deliveries
      SET status = 'revoked', last_error = 'endpoint_reassigned_to_different_user'
      WHERE subscription_id = v_existing_id
        AND status IN ('pending', 'processing');
    END IF;
  END IF;

  -- Create or refresh subscription record
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
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
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
      last_seen_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  RETURNING id INTO v_sub_id;

  RETURN v_sub_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- E. get_notification_unread_count (authoritative)
DROP FUNCTION IF EXISTS public.get_notification_unread_count();
CREATE OR REPLACE FUNCTION public.get_notification_unread_count()
RETURNS integer AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 0;
  END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.notifications
  WHERE (recipient_id = auth.uid() OR user_id = auth.uid())
    AND (read_at IS NULL OR is_read = false)
    AND deleted_at IS NULL;

  RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- F. mark_notification_read (authoritative)
DROP FUNCTION IF EXISTS public.mark_notification_read(uuid);
CREATE OR REPLACE FUNCTION public.mark_notification_read(notification_id uuid)
RETURNS boolean AS $$
DECLARE
  v_updated boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.notifications
  SET read_at = now(),
      is_read = true
  WHERE id = notification_id
    AND (recipient_id = auth.uid() OR user_id = auth.uid())
    AND (read_at IS NULL OR is_read = false);

  v_updated := FOUND;
  RETURN v_updated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- G. mark_all_notifications_read (authoritative)
DROP FUNCTION IF EXISTS public.mark_all_notifications_read();
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS integer AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.notifications
  SET read_at = now(),
      is_read = true
  WHERE (recipient_id = auth.uid() OR user_id = auth.uid())
    AND (read_at IS NULL OR is_read = false)
    AND deleted_at IS NULL;

  GET DIAGNOSTICS v_count = row_count;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 5. GRANTS & PERMISSIONS
REVOKE ALL ON FUNCTION public.record_notification_delivery_event(uuid, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_notification_delivery_event(uuid, uuid, text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.verify_push_subscription(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_push_subscription(text) TO authenticated;

REVOKE ALL ON FUNCTION public.cleanup_old_delivery_events(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_old_delivery_events(integer) TO service_role;

REVOKE ALL ON FUNCTION public.register_push_subscription(text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_subscription(text, text, text, text, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_notification_unread_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_notification_unread_count() TO authenticated;

REVOKE ALL ON FUNCTION public.mark_notification_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;
