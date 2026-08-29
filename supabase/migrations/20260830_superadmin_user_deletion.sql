-- ==============================================================================
-- HEAT CHAT — SUPERADMIN-ONLY PERMANENT USER DELETION MIGRATION
-- ==============================================================================

-- 1. SECURITY DEFINER Function for Permanent Application User Deletion
CREATE OR REPLACE FUNCTION public.admin_delete_user(
  p_target_user_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_is_superadmin boolean;
  v_target_is_primary boolean;
  v_target_profile record;
BEGIN
  -- 1. Derive caller strictly from authenticated context
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required for administrative operations.' USING ERRCODE = '42501';
  END IF;

  -- 2. Verify caller is an active SuperAdmin
  SELECT EXISTS (
    SELECT 1 
    FROM public.admin_user_roles aur
    JOIN public.admin_roles ar ON aur.role_id = ar.id
    WHERE aur.user_id = v_caller_id
      AND aur.account_state = 'ACTIVE'
      AND (ar.name = 'SuperAdmin' OR aur.is_primary_superadmin = true)
  ) INTO v_is_superadmin;

  IF NOT v_is_superadmin THEN
    RAISE EXCEPTION 'Access denied: Permanent user deletion is strictly restricted to SuperAdmin.' USING ERRCODE = '42501';
  END IF;

  -- 3. Prevent Self-Deletion
  IF p_target_user_id = v_caller_id THEN
    RAISE EXCEPTION 'Security violation: Administrators cannot delete their own account.' USING ERRCODE = '42501';
  END IF;

  -- 4. Prevent Primary SuperAdmin Deletion
  SELECT EXISTS (
    SELECT 1 
    FROM public.admin_user_roles 
    WHERE user_id = p_target_user_id 
      AND is_primary_superadmin = true
  ) INTO v_target_is_primary;

  IF v_target_is_primary THEN
    RAISE EXCEPTION 'Security violation: Primary SuperAdmin account cannot be deleted.' USING ERRCODE = '42501';
  END IF;

  -- 5. Capture target metadata before deletion
  SELECT * INTO v_target_profile
  FROM public.profiles
  WHERE id = p_target_user_id;

  -- 6. Purge dependent application records in safe dependency order
  DELETE FROM public.admin_mfa_recovery_codes WHERE user_id = p_target_user_id;
  DELETE FROM public.admin_user_roles WHERE user_id = p_target_user_id;
  DELETE FROM public.starred_messages WHERE user_id = p_target_user_id;
  DELETE FROM public.message_reads WHERE user_id = p_target_user_id;
  DELETE FROM public.message_reactions WHERE user_id = p_target_user_id;
  DELETE FROM public.attachments WHERE uploader_id = p_target_user_id;
  DELETE FROM public.messages WHERE sender_id = p_target_user_id;
  DELETE FROM public.conversation_members WHERE user_id = p_target_user_id;
  DELETE FROM public.friendships WHERE user_id = p_target_user_id OR friend_id = p_target_user_id;
  DELETE FROM public.notifications WHERE user_id = p_target_user_id OR actor_id = p_target_user_id;
  DELETE FROM public.notification_preferences WHERE user_id = p_target_user_id;
  DELETE FROM public.conversation_notification_preferences WHERE user_id = p_target_user_id;
  DELETE FROM public.profiles WHERE id = p_target_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_user_id', p_target_user_id,
    'username', v_target_profile.username,
    'display_name', v_target_profile.display_name,
    'reason', p_reason
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid, text) TO authenticated;
