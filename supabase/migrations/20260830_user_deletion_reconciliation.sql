-- ==============================================================================
-- HEAT CHAT — USER DELETION RECONCILIATION & STUCK DETECTION
-- ==============================================================================

-- 1. Extend admin_user_deletions table with operational tracking fields
ALTER TABLE IF EXISTS public.admin_user_deletions 
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_admin_user_deletions_stuck 
  ON public.admin_user_deletions(state, updated_at);

-- 2. Configurable Stuck-Deletion Detection RPC
CREATE OR REPLACE FUNCTION public.admin_get_stuck_deletions(
  p_timeout_minutes integer DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  target_user_id uuid,
  target_email text,
  target_username text,
  target_display_name text,
  actor_user_id uuid,
  reason text,
  state text,
  last_error text,
  retry_count integer,
  created_at timestamptz,
  updated_at timestamptz,
  is_stuck boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_is_superadmin boolean;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 
    FROM public.admin_user_roles aur
    JOIN public.admin_roles ar ON aur.role_id = ar.id
    WHERE aur.user_id = v_caller_id
      AND aur.account_state = 'ACTIVE'
      AND (ar.name = 'SuperAdmin' OR aur.is_primary_superadmin = true)
  ) INTO v_is_superadmin;

  IF NOT v_is_superadmin THEN
    RAISE EXCEPTION 'Access denied: Viewing deletion operations requires SuperAdmin role.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT 
    aud.id,
    aud.target_user_id,
    aud.target_email,
    aud.target_username,
    aud.target_display_name,
    aud.actor_user_id,
    aud.reason,
    aud.state,
    aud.last_error,
    aud.retry_count,
    aud.created_at,
    aud.updated_at,
    (
      aud.state = 'FAILED_REQUIRES_RECONCILIATION' OR
      (
        aud.state IN ('DELETION_REQUESTED', 'DELETING_STORAGE', 'DELETING_APPLICATION_DATA', 'DELETING_AUTH')
        AND aud.updated_at < (timezone('utc'::text, now()) - (p_timeout_minutes || ' minutes')::interval)
      )
    ) AS is_stuck
  FROM public.admin_user_deletions aud
  ORDER BY aud.created_at DESC;
END;
$$;

-- 3. Atomic Lock & Start Reconciliation RPC
CREATE OR REPLACE FUNCTION public.admin_start_deletion_reconciliation(
  p_operation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_is_superadmin boolean;
  v_rec record;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 
    FROM public.admin_user_roles aur
    JOIN public.admin_roles ar ON aur.role_id = ar.id
    WHERE aur.user_id = v_caller_id
      AND aur.account_state = 'ACTIVE'
      AND (ar.name = 'SuperAdmin' OR aur.is_primary_superadmin = true)
  ) INTO v_is_superadmin;

  IF NOT v_is_superadmin THEN
    RAISE EXCEPTION 'Access denied: Reconciling deletions requires SuperAdmin role.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_rec
  FROM public.admin_user_deletions
  WHERE id = p_operation_id
  FOR UPDATE;

  IF v_rec.id IS NULL THEN
    RETURN jsonb_build_object('status', 'NOT_FOUND');
  END IF;

  IF v_rec.state = 'COMPLETED' THEN
    RETURN jsonb_build_object(
      'status', 'ALREADY_COMPLETED',
      'deletion_id', v_rec.id,
      'completed_at', v_rec.completed_at
    );
  END IF;

  -- Concurrency check: if another admin actively reconciled within last 30s
  IF v_rec.last_reconciled_at IS NOT NULL 
     AND v_rec.last_reconciled_at > timezone('utc'::text, now()) - interval '30 seconds'
     AND v_rec.reconciled_by IS NOT NULL 
     AND v_rec.reconciled_by != v_caller_id THEN
    RETURN jsonb_build_object(
      'status', 'IN_PROGRESS',
      'deletion_id', v_rec.id,
      'reconciled_by', v_rec.reconciled_by
    );
  END IF;

  -- Acquire reconciliation lock
  UPDATE public.admin_user_deletions
  SET 
    retry_count = retry_count + 1,
    last_reconciled_at = timezone('utc'::text, now()),
    reconciled_by = v_caller_id,
    updated_at = timezone('utc'::text, now())
  WHERE id = p_operation_id;

  RETURN jsonb_build_object(
    'status', 'LOCKED_FOR_RECONCILIATION',
    'deletion_id', v_rec.id,
    'target_user_id', v_rec.target_user_id,
    'target_email', v_rec.target_email,
    'target_username', v_rec.target_username,
    'target_display_name', v_rec.target_display_name,
    'previous_state', v_rec.state,
    'storage_paths', v_rec.storage_paths_to_delete,
    'retry_count', v_rec.retry_count + 1
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_stuck_deletions(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_start_deletion_reconciliation(uuid) TO authenticated;
