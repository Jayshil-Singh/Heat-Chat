-- Migration: 20260921_phase22_push_subscriptions_500_fix.sql
-- Heat Chat Phase 22: Push Subscriptions 500 Fix & Schema Alignment
--
-- Goals:
-- 1. Ensure public.push_subscriptions table has all required columns (updated_at, device_id, installation_id)
--    so that verify_push_subscription and register_push_subscription do not throw undefined_column errors.
-- 2. Re-create and secure verify_push_subscription(text) with SECURITY DEFINER and search_path = public, pg_temp.
-- 3. Ensure permissions on verify_push_subscription and get_user_push_subscriptions are granted to authenticated.

-- 1. ENSURE REQUIRED COLUMNS EXIST ON push_subscriptions
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  ADD COLUMN IF NOT EXISTS device_id text,
  ADD COLUMN IF NOT EXISTS installation_id text;

-- Backfill updated_at from last_seen_at or created_at if null
UPDATE public.push_subscriptions
SET updated_at = COALESCE(last_seen_at, created_at, timezone('utc'::text, now()))
WHERE updated_at IS NULL;

-- 2. VERIFY / HARDEN verify_push_subscription FUNCTION
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

-- 3. HARDEN PERMISSIONS (REVOKE PUBLIC/ANON, GRANT AUTHENTICATED)
REVOKE ALL ON FUNCTION public.verify_push_subscription(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_push_subscription(text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_user_push_subscriptions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_push_subscriptions() TO authenticated;
