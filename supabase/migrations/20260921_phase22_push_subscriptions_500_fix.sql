-- Migration: 20260921_phase22_push_subscriptions_500_fix.sql
-- Heat Chat Phase 22: Push Subscriptions 500 Fix, Revocation Hardening & Schema Alignment
--
-- Goals:
-- 1. Ensure public.push_subscriptions table has all required columns (updated_at, device_id, installation_id)
--    so that verify_push_subscription and register_push_subscription do not throw undefined_column errors.
-- 2. Re-create and secure verify_push_subscription(text) with SECURITY DEFINER and search_path = public, pg_temp.
-- 3. Provide revoke_push_subscription_by_endpoint(text) to eliminate 500 errors on DELETE /api/notifications/push/subscriptions.
-- 4. Enable secure RLS update policy for authenticated users to revoke their own subscriptions.
-- 5. Ensure permissions on all push subscription RPCs are granted to authenticated and service_role.

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

-- 3. REVOCATION BY ENDPOINT RPC (Prevents DELETE 500)
CREATE OR REPLACE FUNCTION public.revoke_push_subscription_by_endpoint(
  p_endpoint text
) RETURNS boolean AS $$
DECLARE
  v_caller_id uuid;
  v_sub_id uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_endpoint IS NULL OR p_endpoint = '' THEN
    RETURN false;
  END IF;

  UPDATE public.push_subscriptions
  SET revoked_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  WHERE user_id = v_caller_id
    AND endpoint = p_endpoint
    AND revoked_at IS NULL
  RETURNING id INTO v_sub_id;

  IF v_sub_id IS NOT NULL THEN
    -- Cancel any pending deliveries for this revoked subscription
    UPDATE public.notification_deliveries
    SET status = 'revoked',
        last_error = 'subscription_revoked_by_endpoint',
        updated_at = timezone('utc'::text, now())
    WHERE subscription_id = v_sub_id
      AND status IN ('pending', 'processing');

    RETURN true;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 4. RLS UPDATE POLICY & GRANTS FOR AUTHENTICATED USERS
GRANT SELECT, UPDATE (revoked_at, updated_at) ON public.push_subscriptions TO authenticated;

DROP POLICY IF EXISTS "Users can update own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can update own push subscriptions"
  ON public.push_subscriptions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 5. HARDEN PERMISSIONS (REVOKE PUBLIC/ANON, GRANT AUTHENTICATED)
REVOKE ALL ON FUNCTION public.verify_push_subscription(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_push_subscription(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.revoke_push_subscription_by_endpoint(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_push_subscription_by_endpoint(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.revoke_push_subscription(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_push_subscription(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_user_push_subscriptions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_push_subscriptions() TO authenticated, service_role;
