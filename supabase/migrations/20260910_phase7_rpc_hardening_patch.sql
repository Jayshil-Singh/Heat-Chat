-- ==============================================================================
-- HEAT CHAT — Phase 7 Narrowly Scoped RPC Hardening Patch
-- File: 20260910_phase7_rpc_hardening_patch.sql
-- Purpose:
-- 1. Expose public.validate_push_endpoint(text) as a standalone RPC.
-- 2. Tighten cleanup_stale_notifications permissions to service_role only.
-- 3. Ensure claim_notification_deliveries & complete_notification_delivery
--    are revoked from PUBLIC, anon, and authenticated.
-- ==============================================================================

-- 1. Standalone validate_push_endpoint RPC
CREATE OR REPLACE FUNCTION public.validate_push_endpoint(
  p_endpoint text
) RETURNS boolean AS $$
DECLARE
  v_raw text;
  v_host text;
  v_after_scheme text;
  v_slash_pos integer;
  v_authority text;
  v_path_query text;
BEGIN
  IF p_endpoint IS NULL THEN
    RETURN false;
  END IF;

  -- Reject control characters (0x01-0x1F, 0x7F) or non-ASCII (>= 0x80)
  IF p_endpoint ~ '[\x01-\x1F\x7F]' OR p_endpoint ~ '[^\x00-\x7F]' THEN
    RETURN false;
  END IF;

  -- Trim leading and trailing ASCII space (0x20) ONLY
  v_raw := trim(BOTH ' ' FROM p_endpoint);

  -- Bounds and internal space check
  IF length(v_raw) < 12 OR length(v_raw) > 2048 OR position(' ' in v_raw) > 0 THEN
    RETURN false;
  END IF;

  -- Reject URL fragments (#) anywhere
  IF position('#' in v_raw) > 0 THEN
    RETURN false;
  END IF;

  -- Protocol check
  IF v_raw !~* '^https://' THEN
    RETURN false;
  END IF;

  -- Separate Authority and Path/Query
  v_after_scheme := substring(v_raw FROM 9);
  v_slash_pos := position('/' in v_after_scheme);
  IF v_slash_pos < 1 THEN
    RETURN false;
  END IF;

  v_authority := substring(v_after_scheme FROM 1 FOR v_slash_pos - 1);
  v_path_query := substring(v_after_scheme FROM v_slash_pos);

  -- Reject userinfo (username/password)
  IF position('@' in v_authority) > 0 THEN
    RETURN false;
  END IF;

  -- Extract Host and validate explicit Port
  IF position(':' in v_authority) > 0 THEN
    IF v_authority ~ ':[0-9]+$' THEN
      IF NOT v_authority ~ ':443$' THEN
        RETURN false;
      END IF;
      v_host := substring(v_authority FROM 1 FOR position(':' in v_authority) - 1);
    ELSE
      RETURN false;
    END IF;
  ELSE
    v_host := v_authority;
  END IF;

  v_host := lower(v_host);

  -- Reject raw IP addresses
  IF v_host ~ '^([0-9]+(\.[0-9]+){3})$' THEN
    RETURN false;
  END IF;

  -- Authorized browser push gateways (Exact vs. Wildcard with verified unescaped label group)
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
    RETURN false;
  END IF;

  -- Validate safe path and query characters + valid %HH encoding
  IF v_path_query !~ '^/([A-Za-z0-9\-._~:/?#\[\]@!$&''()*+,;=]|%[0-9A-Fa-f]{2})*$' THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.validate_push_endpoint(text) TO anon, authenticated, service_role;

-- 2. Lock down cleanup_stale_notifications: service_role only
REVOKE ALL ON FUNCTION public.cleanup_stale_notifications(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_notifications(integer, integer) TO service_role;

-- 3. Lock down delivery worker RPCs: service_role only
REVOKE ALL ON FUNCTION public.claim_notification_deliveries(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_deliveries(integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.complete_notification_delivery(uuid, uuid, boolean, text, boolean, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_notification_delivery(uuid, uuid, boolean, text, boolean, integer) TO service_role;
