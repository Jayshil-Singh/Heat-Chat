-- ==============================================================================
-- HEAT CHAT — PHASE 7: NOTIFICATIONS ENGINE & PWA WEB PUSH
-- Migration: 20260909_phase7_notifications_and_push.sql
-- ==============================================================================

-- 1. NOTIFICATIONS TABLE UPGRADES
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'message',
  ADD COLUMN IF NOT EXISTS dedupe_key text,
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS body text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone DEFAULT NULL;

-- Ensure dedupe_key uniqueness per user (allowing multiple nulls if any)
CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_dedupe_key_uidx
  ON public.notifications(user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_user_active_created_idx
  ON public.notifications(user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS notifications_user_unread_active_idx
  ON public.notifications(user_id, read_at)
  WHERE read_at IS NULL AND deleted_at IS NULL;

-- 2. NOTIFICATION PREFERENCES TABLE UPGRADES
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS push_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_notifications boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS messages_notify boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS mentions_notify boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS replies_notify boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS group_activity_notify boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS friend_activity_notify boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS quiet_hours_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quiet_hours_start text NOT NULL DEFAULT '22:00',
  ADD COLUMN IF NOT EXISTS quiet_hours_end text NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC';

-- 3. PUSH SUBSCRIPTIONS TABLE
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  device_type text NOT NULL DEFAULT 'desktop',
  failure_count integer NOT NULL DEFAULT 0,
  last_seen_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  revoked_at timestamp with time zone DEFAULT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_active_uidx
  ON public.push_subscriptions(endpoint)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS push_subscriptions_user_active_idx
  ON public.push_subscriptions(user_id, last_seen_at DESC)
  WHERE revoked_at IS NULL;

-- 4. NOTIFICATION DELIVERIES (DURABLE ASYNC OUTBOX)
CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claim_token uuid DEFAULT NULL,
  lease_until timestamp with time zone DEFAULT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'delivered', 'failed', 'revoked')),
  last_error text DEFAULT NULL,
  next_attempt_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  delivered_at timestamp with time zone DEFAULT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_deliveries_notif_sub_uidx
  ON public.notification_deliveries(notification_id, subscription_id);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_claim
  ON public.notification_deliveries(status, next_attempt_at)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_sub_active
  ON public.notification_deliveries(subscription_id, status)
  WHERE status IN ('pending', 'processing');

-- 5. ROW LEVEL SECURITY
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

-- Block direct PostgREST client mutations on notifications (mutations occur via SECURITY DEFINER RPCs)
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can insert own notifications" ON public.notifications;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid() AND deleted_at IS NULL);

-- Push subscriptions & deliveries are completely isolated from direct PostgREST operations
REVOKE ALL ON public.push_subscriptions FROM anon, authenticated;
REVOKE ALL ON public.notification_deliveries FROM anon, authenticated;

-- Service role retains full administrative access
GRANT ALL ON public.push_subscriptions TO service_role;
GRANT ALL ON public.notification_deliveries TO service_role;
GRANT ALL ON public.notifications TO service_role;
GRANT ALL ON public.notification_preferences TO service_role;
GRANT ALL ON public.conversation_notification_preferences TO service_role;

-- 6. SECURITY DEFINER RPCS

-- A. register_push_subscription
CREATE OR REPLACE FUNCTION public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text DEFAULT NULL,
  p_device_type text DEFAULT 'desktop'
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

  -- Reject control characters (0x01-0x1F, 0x7F) or non-ASCII (>= 0x80) anywhere in raw input
  IF p_endpoint ~ '[\x01-\x1F\x7F]' OR p_endpoint ~ '[^\x00-\x7F]' THEN
    RAISE EXCEPTION 'Invalid push endpoint: control characters or non-ASCII characters are forbidden';
  END IF;

  -- Trim leading and trailing ASCII space (0x20) ONLY
  v_raw := trim(BOTH ' ' FROM p_endpoint);

  -- Bounds and internal space check
  IF length(v_raw) < 12 OR length(v_raw) > 2048 OR position(' ' in v_raw) > 0 THEN
    RAISE EXCEPTION 'Invalid push endpoint: invalid length or internal spaces';
  END IF;

  -- Reject URL fragments (#) anywhere
  IF position('#' in v_raw) > 0 THEN
    RAISE EXCEPTION 'Invalid push endpoint: URL fragments are forbidden';
  END IF;

  -- Protocol check
  IF v_raw !~* '^https://' THEN
    RAISE EXCEPTION 'Invalid push endpoint: protocol must be https';
  END IF;

  -- Separate Authority and Path/Query
  v_after_scheme := substring(v_raw FROM 9);
  v_slash_pos := position('/' in v_after_scheme);

  IF v_slash_pos < 1 THEN
    RAISE EXCEPTION 'Invalid push endpoint: path component is required';
  END IF;

  v_authority := substring(v_after_scheme FROM 1 FOR v_slash_pos - 1);
  v_path_query := substring(v_after_scheme FROM v_slash_pos);

  -- Token-level path/query check: % is permitted ONLY when followed by two hex digits
  IF v_path_query !~ '^/([A-Za-z0-9._~:/?@!$&''()*+,;=-]|%[0-9A-Fa-f]{2})*$' THEN
    RAISE EXCEPTION 'Invalid push endpoint: path/query contains prohibited characters or malformed percent-encoding';
  END IF;

  -- Authority checks
  IF position('@' in v_authority) > 0 THEN
    RAISE EXCEPTION 'Invalid push endpoint: userinfo is forbidden';
  END IF;

  IF position('[' in v_authority) > 0 OR position(']' in v_authority) > 0 THEN
    RAISE EXCEPTION 'Invalid push endpoint: raw IP addresses are forbidden';
  END IF;

  -- Port normalization
  v_colon_pos := position(':' in v_authority);
  IF v_colon_pos > 0 THEN
    IF position(':' in substring(v_authority FROM v_colon_pos + 1)) > 0 THEN
      RAISE EXCEPTION 'Invalid push endpoint: malformed authority';
    END IF;

    v_host := substring(v_authority FROM 1 FOR v_colon_pos - 1);
    v_port := substring(v_authority FROM v_colon_pos + 1);

    IF v_port != '443' THEN
      RAISE EXCEPTION 'Invalid push endpoint: only HTTPS port 443 is permitted';
    END IF;
  ELSE
    v_host := v_authority;
  END IF;

  v_host := lower(v_host);

  IF v_host ~ '^([0-9]+(\.[0-9]+){3})$' THEN
    RAISE EXCEPTION 'Invalid push endpoint: raw IP addresses are forbidden';
  END IF;

  -- Exact hosts vs. single-level wildcard subdomains (PostgreSQL POSIX ERE)
  IF NOT (
    v_host IN (
      'android.googleapis.com',
      'fcm.googleapis.com',
      'web.push.apple.com',
      'updates.push.services.mozilla.com',
      'notify.windows.com'
    )
    OR
    v_host ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.(fcm\.googleapis\.com|push\.apple\.com|push\.services\.mozilla\.com|notify\.windows\.com)$'
  ) THEN
    RAISE EXCEPTION 'Invalid push endpoint: destination must be an authorized browser push gateway';
  END IF;

  v_canonical_endpoint := 'https://' || v_host || v_path_query;

  -- Key validations
  IF p_p256dh IS NULL OR length(p_p256dh) < 16 OR length(p_p256dh) > 256 OR p_p256dh !~ '^[A-Za-z0-9\-_]+$' THEN
    RAISE EXCEPTION 'Invalid p256dh key: must be valid base64url (16..256 chars)';
  END IF;

  IF p_auth IS NULL OR length(p_auth) < 16 OR length(p_auth) > 64 OR p_auth !~ '^[A-Za-z0-9\-_]+$' THEN
    RAISE EXCEPTION 'Invalid auth secret: must be valid base64url (16..64 chars)';
  END IF;

  IF p_device_type IS NULL OR p_device_type NOT IN ('desktop', 'mobile', 'tablet', 'unknown') THEN
    RAISE EXCEPTION 'Invalid device_type: must be desktop, mobile, tablet, or unknown';
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
      -- Same user key refresh
      UPDATE public.push_subscriptions
      SET p256dh = p_p256dh,
          auth = p_auth,
          user_agent = v_ua,
          device_type = p_device_type,
          failure_count = 0,
          last_seen_at = timezone('utc'::text, now())
      WHERE id = v_existing_id
      RETURNING id INTO v_sub_id;

      RETURN v_sub_id;
    ELSE
      -- Different user: Atomically revoke old subscription and its undelivered messages
      UPDATE public.push_subscriptions
      SET revoked_at = timezone('utc'::text, now())
      WHERE id = v_existing_id;

      UPDATE public.notification_deliveries
      SET status = 'revoked', last_error = 'endpoint_reassigned_to_different_user'
      WHERE subscription_id = v_existing_id
        AND status IN ('pending', 'processing');
    END IF;
  END IF;

  -- Create clean subscription record
  INSERT INTO public.push_subscriptions (
    user_id, endpoint, p256dh, auth, user_agent, device_type, failure_count, revoked_at, last_seen_at
  ) VALUES (
    auth.uid(), v_canonical_endpoint, p_p256dh, p_auth, v_ua, p_device_type, 0, NULL, timezone('utc'::text, now())
  )
  RETURNING id INTO v_sub_id;

  RETURN v_sub_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- B. revoke_push_subscription
CREATE OR REPLACE FUNCTION public.revoke_push_subscription(
  p_subscription_id uuid
) RETURNS boolean AS $$
DECLARE
  v_rows integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.push_subscriptions
  SET revoked_at = timezone('utc'::text, now())
  WHERE id = p_subscription_id
    AND user_id = auth.uid()
    AND revoked_at IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows > 0 THEN
    UPDATE public.notification_deliveries
    SET status = 'revoked', last_error = 'subscription_revoked_by_user'
    WHERE subscription_id = p_subscription_id
      AND status IN ('pending', 'processing');
    RETURN true;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- C. get_user_push_subscriptions (Sanitized device metadata, zero endpoints/keys exposed)
CREATE OR REPLACE FUNCTION public.get_user_push_subscriptions()
RETURNS TABLE (
  id uuid,
  device_type text,
  user_agent text,
  created_at timestamp with time zone,
  last_seen_at timestamp with time zone,
  failure_count integer
) AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
  SELECT s.id, s.device_type, s.user_agent, s.created_at, s.last_seen_at, s.failure_count
  FROM public.push_subscriptions s
  WHERE s.user_id = auth.uid()
    AND s.revoked_at IS NULL
  ORDER BY s.last_seen_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- D. claim_notification_deliveries (Queue worker with lease management and dead-work exclusion)
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
BEGIN
  -- Strict validation of batch and lease bounds
  v_batch := COALESCE(p_batch_size, 25);
  IF v_batch < 1 OR v_batch > 100 THEN
    RAISE EXCEPTION 'Batch size must be between 1 and 100';
  END IF;

  v_lease := COALESCE(p_lease_seconds, 60);
  IF v_lease < 15 OR v_lease > 300 THEN
    RAISE EXCEPTION 'Lease duration must be between 15 and 300 seconds';
  END IF;

  -- Claim candidate selection: FOR UPDATE OF d SKIP LOCKED with active checks
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
      AND (n.expires_at IS NULL OR n.expires_at > timezone('utc'::text, now()))
      AND (
        (d.status = 'pending' AND d.next_attempt_at <= timezone('utc'::text, now()))
        OR
        (d.status = 'processing' AND d.lease_until < timezone('utc'::text, now()))
      )
    ORDER BY d.next_attempt_at ASC
    LIMIT v_batch
    FOR UPDATE OF d SKIP LOCKED
  LOOP
    -- Unique claim token per delivery row
    v_item_token := gen_random_uuid();

    UPDATE public.notification_deliveries
    SET status = 'processing',
        claim_token = v_item_token,
        lease_until = timezone('utc'::text, now()) + (v_lease || ' seconds')::interval,
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

-- E. complete_notification_delivery
CREATE OR REPLACE FUNCTION public.complete_notification_delivery(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_success boolean,
  p_error text DEFAULT NULL,
  p_permanent_failure boolean DEFAULT false,
  p_retry_delay_seconds integer DEFAULT 30
) RETURNS boolean AS $$
DECLARE
  v_rows integer;
  v_sub_id uuid;
  v_attempts integer;
  v_next_delay integer;
BEGIN
  IF p_delivery_id IS NULL OR p_claim_token IS NULL THEN
    RETURN false;
  END IF;

  -- Validate lease and claim token ownership
  SELECT subscription_id, attempt_count INTO v_sub_id, v_attempts
  FROM public.notification_deliveries
  WHERE id = p_delivery_id
    AND claim_token = p_claim_token
    AND status = 'processing'
    AND lease_until >= timezone('utc'::text, now())
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF p_success THEN
    UPDATE public.notification_deliveries
    SET status = 'delivered',
        delivered_at = timezone('utc'::text, now()),
        claim_token = NULL,
        lease_until = NULL,
        last_error = NULL
    WHERE id = p_delivery_id;

    -- Reset failure count on successful dispatch
    UPDATE public.push_subscriptions
    SET failure_count = 0,
        last_seen_at = timezone('utc'::text, now())
    WHERE id = v_sub_id;

    RETURN true;
  ELSE
    IF p_permanent_failure OR v_attempts >= 5 THEN
      -- Terminal failure or max attempts exhausted
      UPDATE public.notification_deliveries
      SET status = 'failed',
          claim_token = NULL,
          lease_until = NULL,
          last_error = substring(COALESCE(p_error, 'terminal_failure') FROM 1 FOR 512)
      WHERE id = p_delivery_id;

      -- If endpoint reported 404/410 Gone, revoke the subscription
      IF p_permanent_failure AND (p_error LIKE '%410%' OR p_error LIKE '%404%' OR p_error LIKE '%unregistered%') THEN
        UPDATE public.push_subscriptions
        SET revoked_at = timezone('utc'::text, now())
        WHERE id = v_sub_id;
      ELSE
        UPDATE public.push_subscriptions
        SET failure_count = failure_count + 1
        WHERE id = v_sub_id;
      END IF;
    ELSE
      -- Exponential backoff retry
      v_next_delay := GREATEST(10, LEAST(3600, COALESCE(p_retry_delay_seconds, 30) * (2 ^ (v_attempts - 1))));
      UPDATE public.notification_deliveries
      SET status = 'pending',
          claim_token = NULL,
          lease_until = NULL,
          next_attempt_at = timezone('utc'::text, now()) + (v_next_delay || ' seconds')::interval,
          last_error = substring(COALESCE(p_error, 'delivery_failed') FROM 1 FOR 512)
      WHERE id = p_delivery_id;

      UPDATE public.push_subscriptions
      SET failure_count = failure_count + 1
      WHERE id = v_sub_id;
    END IF;

    RETURN true;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- F. mark_notification_as_read
CREATE OR REPLACE FUNCTION public.mark_notification_as_read(notif_id uuid)
RETURNS boolean AS $$
DECLARE
  v_rows integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.notifications
  SET read_at = timezone('utc'::text, now())
  WHERE id = notif_id
    AND user_id = auth.uid()
    AND read_at IS NULL
    AND deleted_at IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN (v_rows > 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- G. mark_all_notifications_as_read
CREATE OR REPLACE FUNCTION public.mark_all_notifications_as_read()
RETURNS integer AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.notifications
  SET read_at = timezone('utc'::text, now())
  WHERE user_id = auth.uid()
    AND read_at IS NULL
    AND deleted_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- H. soft_delete_notification
CREATE OR REPLACE FUNCTION public.soft_delete_notification(p_notification_id uuid)
RETURNS boolean AS $$
DECLARE
  v_rows integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.notifications
  SET deleted_at = timezone('utc'::text, now())
  WHERE id = p_notification_id
    AND user_id = auth.uid()
    AND deleted_at IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN (v_rows > 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- I. soft_delete_all_notifications
CREATE OR REPLACE FUNCTION public.soft_delete_all_notifications()
RETURNS integer AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.notifications
  SET deleted_at = timezone('utc'::text, now())
  WHERE user_id = auth.uid()
    AND deleted_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- J. get_notification_unread_count
CREATE OR REPLACE FUNCTION public.get_notification_unread_count()
RETURNS integer AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 0;
  END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.notifications
  WHERE user_id = auth.uid()
    AND read_at IS NULL
    AND deleted_at IS NULL;

  RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- K. get_user_notifications
CREATE OR REPLACE FUNCTION public.get_user_notifications(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_category text DEFAULT 'all'
) RETURNS TABLE (
  id uuid,
  actor_id uuid,
  conversation_id uuid,
  event_type text,
  title text,
  body text,
  data jsonb,
  read_at timestamp with time zone,
  created_at timestamp with time zone
) AS $$
DECLARE
  v_lim integer;
  v_off integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_lim := GREATEST(1, LEAST(100, COALESCE(p_limit, 50)));
  v_off := GREATEST(0, COALESCE(p_offset, 0));

  RETURN QUERY
  SELECT n.id, n.actor_id, n.conversation_id, n.event_type, n.title, n.body, n.data, n.read_at, n.created_at
  FROM public.notifications n
  WHERE n.user_id = auth.uid()
    AND n.deleted_at IS NULL
    AND (
      p_category = 'all' OR
      (p_category = 'messages' AND n.event_type IN ('message', 'media_message', 'voice_message')) OR
      (p_category = 'mentions' AND n.event_type IN ('mention', 'reply')) OR
      (p_category = 'groups' AND n.event_type IN ('group_invite', 'member_added', 'member_removed', 'role_changed', 'poll_created', 'poll_result')) OR
      (p_category = 'friends' AND n.event_type IN ('friend_request', 'friend_accepted'))
    )
  ORDER BY n.created_at DESC
  LIMIT v_lim OFFSET v_off;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- L. cleanup_stale_notifications (Maintenance function: service_role or superadmin only)
CREATE OR REPLACE FUNCTION public.cleanup_stale_notifications(
  p_retention_days integer DEFAULT 30,
  p_deliveries_retention_days integer DEFAULT 7
) RETURNS jsonb AS $$
DECLARE
  v_notifs_purged integer;
  v_deliveries_purged integer;
  v_is_superadmin boolean;
BEGIN
  -- Authorize: service_role (auth.uid() is null) or app superadmin
  IF auth.uid() IS NOT NULL THEN
    SELECT (role = 'superadmin') INTO v_is_superadmin
    FROM public.profiles
    WHERE id = auth.uid();

    IF NOT COALESCE(v_is_superadmin, false) THEN
      RAISE EXCEPTION 'Insufficient permissions: superadmin required' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Delete soft-deleted notifications older than retention days
  DELETE FROM public.notifications
  WHERE deleted_at IS NOT NULL
    AND deleted_at < timezone('utc'::text, now()) - (COALESCE(p_retention_days, 30) || ' days')::interval;
  GET DIAGNOSTICS v_notifs_purged = ROW_COUNT;

  -- Delete completed/failed outbox deliveries older than delivery retention days
  DELETE FROM public.notification_deliveries
  WHERE status IN ('delivered', 'failed', 'revoked')
    AND (
      (delivered_at IS NOT NULL AND delivered_at < timezone('utc'::text, now()) - (COALESCE(p_deliveries_retention_days, 7) || ' days')::interval)
      OR
      (created_at < timezone('utc'::text, now()) - (COALESCE(p_deliveries_retention_days, 7) || ' days')::interval)
    );
  GET DIAGNOSTICS v_deliveries_purged = ROW_COUNT;

  RETURN jsonb_build_object(
    'notifications_purged', v_notifs_purged,
    'deliveries_purged', v_deliveries_purged,
    'cleaned_at', timezone('utc'::text, now())
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Permissions for authenticated users on RPCs
GRANT EXECUTE ON FUNCTION public.register_push_subscription(text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_push_subscription(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_push_subscriptions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notification_as_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_as_read() TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_notification(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_all_notifications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_notification_unread_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_notifications(integer, integer, text) TO authenticated;

-- Delivery worker and cleanup functions: service_role only
REVOKE EXECUTE ON FUNCTION public.claim_notification_deliveries(integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_deliveries(integer, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.complete_notification_delivery(uuid, uuid, boolean, text, boolean, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_notification_delivery(uuid, uuid, boolean, text, boolean, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.cleanup_stale_notifications(integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_notifications(integer, integer) TO service_role, authenticated;
