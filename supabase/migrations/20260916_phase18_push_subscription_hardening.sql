-- ==============================================================================
-- HEAT CHAT — PHASE 18: PUSH NOTIFICATION PRODUCTION REGISTRATION HARDENING
-- Migration: 20260916_phase18_push_subscription_hardening.sql
-- Description:
--   1. Safely deduplicates existing public.push_subscriptions rows on (user_id, endpoint)
--      retaining the highest quality/active subscription.
--   2. Enforces unconditional unique index on (user_id, endpoint).
--   3. Asserts zero duplicate (user_id, endpoint) pairs remain.
--   4. Eliminates PostgREST PGRST203 function overload ambiguity by dropping both
--      legacy 5-parameter and 7-parameter register_push_subscription signatures.
--   5. Recreates single canonical register_push_subscription function using the
--      unconditional unique constraint to fix PostgreSQL 42P10 ON CONFLICT failure.
--   6. Asserts pg_proc contains exactly 1 function definition for register_push_subscription.
--   7. Configures secure search_path, SECURITY DEFINER, and explicit authenticated grants.
-- ==============================================================================

-- 1. SAFELY DEDUPLICATE EXISTING ROWS ON (user_id, endpoint)
-- Reassign any existing notification delivery references to surviving subscription ID
WITH ranked_subs AS (
  SELECT
    id,
    FIRST_VALUE(id) OVER (
      PARTITION BY user_id, endpoint
      ORDER BY
        (revoked_at IS NULL) DESC,
        COALESCE(updated_at, last_seen_at, created_at) DESC,
        created_at DESC,
        id ASC
    ) as keep_id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, endpoint
      ORDER BY
        (revoked_at IS NULL) DESC,
        COALESCE(updated_at, last_seen_at, created_at) DESC,
        created_at DESC,
        id ASC
    ) as rn
  FROM public.push_subscriptions
)
UPDATE public.notification_deliveries nd
SET subscription_id = rs.keep_id
FROM ranked_subs rs
WHERE nd.subscription_id = rs.id AND rs.rn > 1;

-- Delete redundant duplicate subscriptions, retaining only the single best record per (user_id, endpoint)
WITH ranked_subs AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, endpoint
      ORDER BY
        (revoked_at IS NULL) DESC,
        COALESCE(updated_at, last_seen_at, created_at) DESC,
        created_at DESC,
        id ASC
    ) as rn
  FROM public.push_subscriptions
)
DELETE FROM public.push_subscriptions
WHERE id IN (
  SELECT id FROM ranked_subs WHERE rn > 1
);

-- Fail loudly if any duplicate (user_id, endpoint) pairs remain
DO $$
DECLARE
  v_duplicate_count integer;
BEGIN
  SELECT count(*) INTO v_duplicate_count
  FROM (
    SELECT user_id, endpoint
    FROM public.push_subscriptions
    GROUP BY user_id, endpoint
    HAVING count(*) > 1
  ) d;

  IF v_duplicate_count > 0 THEN
    RAISE EXCEPTION 'Assertion failed: % duplicate (user_id, endpoint) pairs remain in push_subscriptions', v_duplicate_count;
  END IF;
END $$;

-- 2. CREATE UNCONDITIONAL UNIQUE INDEX ON (user_id, endpoint)
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_user_endpoint_unconditional_uidx
  ON public.push_subscriptions(user_id, endpoint);

-- Ensure updated_at column exists on push_subscriptions
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now());

-- 3. REMOVE ALL FUNCTION OVERLOADS (ELIMINATES PGRST203)
DROP FUNCTION IF EXISTS public.register_push_subscription(text, text, text, text, text);
DROP FUNCTION IF EXISTS public.register_push_subscription(text, text, text, text, text, text, text);

-- 4. CREATE SINGLE CANONICAL REGISTER FUNCTION (FIXES 42P10)
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
  -- 1. Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 2. Validate endpoint
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

  -- Forward-compatible canonical endpoint (valid HTTPS web push gateway)
  v_canonical_endpoint := 'https://' || v_host || v_path_query;

  -- 3. Validate keys
  IF p_p256dh IS NULL OR length(trim(p_p256dh)) < 16 THEN
    RAISE EXCEPTION 'Invalid p256dh key';
  END IF;

  IF p_auth IS NULL OR length(trim(p_auth)) < 8 THEN
    RAISE EXCEPTION 'Invalid auth key';
  END IF;

  v_ua := substring(trim(COALESCE(p_user_agent, '')) FROM 1 FOR 512);

  -- 4. Transaction-scoped advisory lock on canonical endpoint identity
  PERFORM pg_advisory_xact_lock(hashtext('push_endpoint:' || v_canonical_endpoint));

  -- 5. Revoke endpoint if currently assigned to another user
  SELECT id, user_id INTO v_existing_id, v_existing_user
  FROM public.push_subscriptions
  WHERE endpoint = v_canonical_endpoint
    AND revoked_at IS NULL
  FOR UPDATE;

  IF v_existing_id IS NOT NULL AND v_existing_user <> auth.uid() THEN
    UPDATE public.push_subscriptions
    SET revoked_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    WHERE id = v_existing_id;

    UPDATE public.notification_deliveries
    SET status = 'revoked', last_error = 'endpoint_reassigned_to_different_user'
    WHERE subscription_id = v_existing_id
      AND status IN ('pending', 'processing');
  END IF;

  -- 6. Upsert subscription for current authenticated user
  -- Uses unconditional unique constraint on (user_id, endpoint)
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

-- 5. ASSERT EXACTLY ONE FUNCTION DEFINITION EXISTS IN PG_PROC
DO $$
DECLARE
  v_fn_count integer;
BEGIN
  SELECT count(*) INTO v_fn_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname = 'register_push_subscription';

  IF v_fn_count <> 1 THEN
    RAISE EXCEPTION 'Assertion failed: expected exactly 1 register_push_subscription in public schema, found %', v_fn_count;
  END IF;
END $$;

-- 6. PERMISSIONS & ROLE GRANTS
REVOKE ALL ON FUNCTION public.register_push_subscription(text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_subscription(text, text, text, text, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.verify_push_subscription(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_push_subscription(text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_user_push_subscriptions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_push_subscriptions() TO authenticated;
