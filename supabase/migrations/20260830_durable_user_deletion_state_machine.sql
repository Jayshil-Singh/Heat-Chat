-- ==============================================================================
-- HEAT CHAT — DURABLE PERMANENT USER DELETION STATE MACHINE & RECOVERY
-- ==============================================================================

-- 1. Table for tracking durable user deletion lifecycle & reconciliation
CREATE TABLE IF NOT EXISTS public.admin_user_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL UNIQUE,
  target_email text,
  target_username text,
  target_display_name text,
  actor_user_id uuid NOT NULL,
  reason text NOT NULL,
  state text NOT NULL CHECK (state IN (
    'DELETION_REQUESTED',
    'DELETING_STORAGE',
    'DELETING_APPLICATION_DATA',
    'DELETING_AUTH',
    'COMPLETED',
    'FAILED_REQUIRES_RECONCILIATION'
  )),
  last_error text,
  storage_paths_to_delete text[],
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_admin_user_deletions_target ON public.admin_user_deletions(target_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_user_deletions_state ON public.admin_user_deletions(state);

-- Trigger for auto updated_at
DROP TRIGGER IF EXISTS set_admin_user_deletions_updated_at ON public.admin_user_deletions;
CREATE TRIGGER set_admin_user_deletions_updated_at
  BEFORE UPDATE ON public.admin_user_deletions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- RLS on admin_user_deletions
ALTER TABLE public.admin_user_deletions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SuperAdmins can manage deletion records" ON public.admin_user_deletions;
CREATE POLICY "SuperAdmins can manage deletion records"
  ON public.admin_user_deletions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_user_roles aur
      JOIN public.admin_roles ar ON aur.role_id = ar.id
      WHERE aur.user_id = auth.uid()
        AND aur.account_state = 'ACTIVE'
        AND (ar.name = 'SuperAdmin' OR aur.is_primary_superadmin = true)
    )
  );

-- 2. Atomic Function to Initiate or Resume Deletion Request
CREATE OR REPLACE FUNCTION public.admin_initiate_user_deletion(
  p_target_user_id uuid,
  p_reason text,
  p_target_email text DEFAULT NULL,
  p_target_username text DEFAULT NULL,
  p_target_display_name text DEFAULT NULL,
  p_storage_paths text[] DEFAULT ARRAY[]::text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_is_superadmin boolean;
  v_existing record;
  v_new_id uuid;
BEGIN
  -- 1. Authentication check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  -- 2. Authorization check
  SELECT EXISTS (
    SELECT 1 
    FROM public.admin_user_roles aur
    JOIN public.admin_roles ar ON aur.role_id = ar.id
    WHERE aur.user_id = v_caller_id
      AND aur.account_state = 'ACTIVE'
      AND (ar.name = 'SuperAdmin' OR aur.is_primary_superadmin = true)
  ) INTO v_is_superadmin;

  IF NOT v_is_superadmin THEN
    RAISE EXCEPTION 'Access denied: Permanent user deletion requires SuperAdmin role.' USING ERRCODE = '42501';
  END IF;

  -- 3. Check for existing deletion record
  SELECT * INTO v_existing
  FROM public.admin_user_deletions
  WHERE target_user_id = p_target_user_id;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.state = 'COMPLETED' THEN
      RETURN jsonb_build_object(
        'status', 'ALREADY_COMPLETED',
        'deletion_id', v_existing.id,
        'state', v_existing.state,
        'completed_at', v_existing.completed_at
      );
    END IF;

    -- If in progress recently (< 30 seconds), report IN_PROGRESS
    IF v_existing.state IN ('DELETION_REQUESTED', 'DELETING_STORAGE', 'DELETING_APPLICATION_DATA', 'DELETING_AUTH')
       AND v_existing.updated_at > timezone('utc'::text, now()) - interval '30 seconds' THEN
      RETURN jsonb_build_object(
        'status', 'IN_PROGRESS',
        'deletion_id', v_existing.id,
        'state', v_existing.state
      );
    END IF;

    -- Otherwise resume / update for retry
    UPDATE public.admin_user_deletions
    SET 
      state = 'DELETION_REQUESTED',
      last_error = NULL,
      updated_at = timezone('utc'::text, now())
    WHERE id = v_existing.id;

    RETURN jsonb_build_object(
      'status', 'RESUMING',
      'deletion_id', v_existing.id,
      'state', 'DELETION_REQUESTED',
      'storage_paths', v_existing.storage_paths_to_delete
    );
  END IF;

  -- 4. Create new deletion record
  INSERT INTO public.admin_user_deletions (
    target_user_id,
    target_email,
    target_username,
    target_display_name,
    actor_user_id,
    reason,
    state,
    storage_paths_to_delete
  ) VALUES (
    p_target_user_id,
    p_target_email,
    p_target_username,
    p_target_display_name,
    v_caller_id,
    p_reason,
    'DELETION_REQUESTED',
    p_storage_paths
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'status', 'INITIATED',
    'deletion_id', v_new_id,
    'state', 'DELETION_REQUESTED'
  );
END;
$$;

-- 3. Atomic Function to Advance Deletion State Machine
CREATE OR REPLACE FUNCTION public.admin_advance_deletion_state(
  p_deletion_id uuid,
  p_next_state text,
  p_last_error text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.admin_user_deletions
  SET 
    state = p_next_state,
    last_error = p_last_error,
    updated_at = timezone('utc'::text, now()),
    completed_at = CASE WHEN p_next_state = 'COMPLETED' THEN timezone('utc'::text, now()) ELSE completed_at END
  WHERE id = p_deletion_id;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_initiate_user_deletion(uuid, text, text, text, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_advance_deletion_state(uuid, text, text) TO authenticated;
