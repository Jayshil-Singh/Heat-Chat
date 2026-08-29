-- ==============================================================================
-- HEAT CHAT — PRODUCTION ADMIN PLATFORM PHASE 2: SEPARATE AUTH, BOOTSTRAP & MFA
-- Migration: 20260830_admin_auth_mfa.sql
-- ==============================================================================

-- 1. Extend admin_user_roles with lifecycle and MFA fields
ALTER TABLE public.admin_user_roles 
  ADD COLUMN IF NOT EXISTS is_primary_superadmin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mfa_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS mfa_enrolled_at timestamptz,
  ADD COLUMN IF NOT EXISTS mfa_last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS account_state text NOT NULL DEFAULT 'ACTIVE' 
    CHECK (account_state IN ('INVITED', 'EMAIL_PENDING', 'EMAIL_VERIFIED', 'MFA_PENDING', 'MFA_VERIFIED', 'ACTIVE', 'SUSPENDED', 'DISABLED', 'REVOKED')),
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_admin_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS mfa_reset_at timestamptz;

-- 2. Partial unique index to enforce exactly ONE Primary SuperAdmin
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_primary_superadmin 
  ON public.admin_user_roles(is_primary_superadmin) 
  WHERE is_primary_superadmin = true;

-- 3. Admin Invitations Table
CREATE TABLE IF NOT EXISTS public.admin_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role_id uuid NOT NULL REFERENCES public.admin_roles(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  invited_by uuid NOT NULL REFERENCES public.profiles(id),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_admin_invitations_token_hash ON public.admin_invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_invitations_email ON public.admin_invitations(email);

ALTER TABLE public.admin_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin invitations viewable only by authorized admins"
  ON public.admin_invitations FOR SELECT
  TO authenticated
  USING (public.is_any_admin(auth.uid()));

-- 4. Admin MFA Recovery Codes Table (Hashed at rest)
CREATE TABLE IF NOT EXISTS public.admin_mfa_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_admin_recovery_codes_user ON public.admin_mfa_recovery_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_recovery_codes_hash ON public.admin_mfa_recovery_codes(code_hash);

ALTER TABLE public.admin_mfa_recovery_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recovery codes viewable only by account owner"
  ON public.admin_mfa_recovery_codes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ==============================================================================
-- HARDENED RPC FUNCTIONS (SECURITY DEFINER SET search_path = public)
-- ==============================================================================

-- Check if initial Primary SuperAdmin bootstrap is open
CREATE OR REPLACE FUNCTION public.admin_is_bootstrap_available()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.admin_user_roles
  WHERE is_primary_superadmin = true;

  RETURN v_count = 0;
END;
$$;

-- Atomic one-time bootstrap for Primary SuperAdmin
CREATE OR REPLACE FUNCTION public.admin_bootstrap_primary_superadmin(
  p_user_id uuid,
  p_display_name text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
  v_role_id uuid;
  v_user_email text;
  v_email_confirmed timestamptz;
BEGIN
  -- Lock admin_user_roles to prevent concurrent bootstrap race conditions
  LOCK TABLE public.admin_user_roles IN EXCLUSIVE MODE;

  -- 1. Check if any Primary SuperAdmin already exists
  SELECT EXISTS (
    SELECT 1 FROM public.admin_user_roles WHERE is_primary_superadmin = true
  ) INTO v_exists;

  IF v_exists THEN
    RAISE EXCEPTION 'Initial administrator setup has already been completed.';
  END IF;

  -- 2. Verify target user exists in auth.users and has verified email
  SELECT email, email_confirmed_at INTO v_user_email, v_email_confirmed
  FROM auth.users
  WHERE id = p_user_id;

  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'Target user not found.';
  END IF;

  IF v_email_confirmed IS NULL THEN
    RAISE EXCEPTION 'Email must be verified before SuperAdmin activation.';
  END IF;

  -- 3. Ensure profile exists and is updated
  INSERT INTO public.profiles (id, username, display_name, status)
  VALUES (
    p_user_id,
    COALESCE((SELECT username FROM public.profiles WHERE id = p_user_id), split_part(v_user_email, '@', 1)),
    COALESCE(p_display_name, (SELECT display_name FROM public.profiles WHERE id = p_user_id), split_part(v_user_email, '@', 1)),
    'online'
  )
  ON CONFLICT (id) DO UPDATE SET
    display_name = COALESCE(EXCLUDED.display_name, public.profiles.display_name),
    updated_at = timezone('utc'::text, now());

  -- 4. Lookup SuperAdmin role
  SELECT id INTO v_role_id FROM public.admin_roles WHERE name = 'SuperAdmin';
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'SuperAdmin system role is not defined.';
  END IF;

  -- 5. Insert Primary SuperAdmin role
  INSERT INTO public.admin_user_roles (
    user_id,
    role_id,
    assigned_by,
    is_primary_superadmin,
    mfa_required,
    mfa_enrolled_at,
    mfa_last_verified_at,
    account_state,
    activated_at,
    last_admin_login_at
  ) VALUES (
    p_user_id,
    v_role_id,
    p_user_id,
    true,
    true,
    timezone('utc'::text, now()),
    timezone('utc'::text, now()),
    'ACTIVE',
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
  )
  ON CONFLICT (user_id, role_id) DO UPDATE SET
    is_primary_superadmin = true,
    account_state = 'ACTIVE',
    mfa_required = true,
    mfa_last_verified_at = timezone('utc'::text, now()),
    activated_at = timezone('utc'::text, now());

  -- 6. Log immutable audit event
  INSERT INTO public.admin_audit_logs (
    actor_user_id,
    actor_role,
    action,
    target_type,
    target_id,
    reason,
    result
  ) VALUES (
    p_user_id,
    'SuperAdmin',
    'PRIMARY_SUPERADMIN_CREATED',
    'user',
    p_user_id::text,
    'Initial platform bootstrap completed successfully.',
    'SUCCESS'
  );

  RETURN true;
END;
$$;

-- Create an admin invitation
CREATE OR REPLACE FUNCTION public.admin_create_invitation(
  p_email text,
  p_role_id uuid,
  p_token_hash text,
  p_expires_hours integer DEFAULT 48
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_level integer;
  v_target_level integer;
  v_invitation_id uuid;
  v_role_name text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF NOT public.has_admin_permission('roles.manage') THEN
    RAISE EXCEPTION 'Access denied: missing roles.manage permission.';
  END IF;

  SELECT COALESCE(max(r.hierarchy_level), 0) INTO v_caller_level
  FROM public.admin_user_roles ur
  JOIN public.admin_roles r ON ur.role_id = r.id
  WHERE ur.user_id = v_caller AND ur.account_state = 'ACTIVE';

  SELECT hierarchy_level, name INTO v_target_level, v_role_name
  FROM public.admin_roles
  WHERE id = p_role_id;

  IF v_target_level IS NULL THEN
    RAISE EXCEPTION 'Target role does not exist.';
  END IF;

  -- Enforce hierarchy: caller must be strictly higher than invited role
  IF v_target_level >= v_caller_level THEN
    RAISE EXCEPTION 'Hierarchy violation: cannot invite an administrator with equal or higher role level.';
  END IF;

  -- Invalidate any pending invitation for this email
  UPDATE public.admin_invitations
  SET revoked_at = timezone('utc'::text, now())
  WHERE email = lower(trim(p_email)) AND accepted_at IS NULL AND revoked_at IS NULL;

  INSERT INTO public.admin_invitations (
    email,
    role_id,
    token_hash,
    invited_by,
    expires_at
  ) VALUES (
    lower(trim(p_email)),
    p_role_id,
    p_token_hash,
    v_caller,
    timezone('utc'::text, now()) + (p_expires_hours || ' hours')::interval
  ) RETURNING id INTO v_invitation_id;

  -- Audit log
  INSERT INTO public.admin_audit_logs (
    actor_user_id,
    actor_role,
    action,
    target_type,
    target_id,
    reason,
    metadata,
    result
  ) VALUES (
    v_caller,
    'Admin',
    'ADMIN_INVITED',
    'user',
    p_email,
    'Administrator invitation generated.',
    jsonb_build_object('role_name', v_role_name, 'role_id', p_role_id, 'expires_hours', p_expires_hours),
    'SUCCESS'
  );

  RETURN v_invitation_id;
END;
$$;

-- Validate an invitation token
CREATE OR REPLACE FUNCTION public.admin_validate_invitation(p_token_hash text)
RETURNS TABLE (
  invitation_id uuid,
  email text,
  role_id uuid,
  role_name text,
  hierarchy_level integer,
  invited_by_username text,
  is_valid boolean,
  invalid_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv record;
BEGIN
  SELECT 
    i.id,
    i.email,
    i.role_id,
    r.name as role_name,
    r.hierarchy_level,
    p.username as invited_by_username,
    i.expires_at,
    i.accepted_at,
    i.revoked_at
  INTO v_inv
  FROM public.admin_invitations i
  JOIN public.admin_roles r ON i.role_id = r.id
  JOIN public.profiles p ON i.invited_by = p.id
  WHERE i.token_hash = p_token_hash;

  IF v_inv.id IS NULL THEN
    RETURN QUERY SELECT 
      NULL::uuid, NULL::text, NULL::uuid, NULL::text, NULL::integer, NULL::text,
      false, 'Invitation token not found or invalid.';
    RETURN;
  END IF;

  IF v_inv.accepted_at IS NOT NULL THEN
    RETURN QUERY SELECT 
      v_inv.id, v_inv.email, v_inv.role_id, v_inv.role_name, v_inv.hierarchy_level, v_inv.invited_by_username,
      false, 'Invitation has already been used.';
    RETURN;
  END IF;

  IF v_inv.revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT 
      v_inv.id, v_inv.email, v_inv.role_id, v_inv.role_name, v_inv.hierarchy_level, v_inv.invited_by_username,
      false, 'Invitation has been revoked.';
    RETURN;
  END IF;

  IF v_inv.expires_at < timezone('utc'::text, now()) THEN
    RETURN QUERY SELECT 
      v_inv.id, v_inv.email, v_inv.role_id, v_inv.role_name, v_inv.hierarchy_level, v_inv.invited_by_username,
      false, 'Invitation token has expired.';
    RETURN;
  END IF;

  RETURN QUERY SELECT 
    v_inv.id, v_inv.email, v_inv.role_id, v_inv.role_name, v_inv.hierarchy_level, v_inv.invited_by_username,
    true, NULL::text;
END;
$$;

-- Accept an invitation and activate administrator role
CREATE OR REPLACE FUNCTION public.admin_accept_invitation(
  p_user_id uuid,
  p_token_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv record;
  v_user_email text;
  v_email_confirmed timestamptz;
BEGIN
  -- 1. Validate invitation token
  SELECT i.*, r.name as role_name
  INTO v_inv
  FROM public.admin_invitations i
  JOIN public.admin_roles r ON i.role_id = r.id
  WHERE i.token_hash = p_token_hash
    AND i.accepted_at IS NULL
    AND i.revoked_at IS NULL
    AND i.expires_at > timezone('utc'::text, now());

  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'Invalid, expired, or previously used invitation token.';
  END IF;

  -- 2. Verify target user in auth.users matches invitation email
  SELECT email, email_confirmed_at INTO v_user_email, v_email_confirmed
  FROM auth.users
  WHERE id = p_user_id;

  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'Target user not found.';
  END IF;

  IF lower(trim(v_user_email)) != lower(trim(v_inv.email)) THEN
    RAISE EXCEPTION 'User email does not match invited email address.';
  END IF;

  IF v_email_confirmed IS NULL THEN
    RAISE EXCEPTION 'Email must be verified before administrator role activation.';
  END IF;

  -- 3. Mark invitation as accepted
  UPDATE public.admin_invitations
  SET accepted_at = timezone('utc'::text, now())
  WHERE id = v_inv.id;

  -- 4. Assign role
  INSERT INTO public.admin_user_roles (
    user_id,
    role_id,
    assigned_by,
    is_primary_superadmin,
    mfa_required,
    mfa_enrolled_at,
    mfa_last_verified_at,
    account_state,
    activated_at,
    last_admin_login_at
  ) VALUES (
    p_user_id,
    v_inv.role_id,
    v_inv.invited_by,
    false,
    true,
    timezone('utc'::text, now()),
    timezone('utc'::text, now()),
    'ACTIVE',
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
  )
  ON CONFLICT (user_id, role_id) DO UPDATE SET
    account_state = 'ACTIVE',
    mfa_required = true,
    mfa_last_verified_at = timezone('utc'::text, now()),
    activated_at = timezone('utc'::text, now());

  -- 5. Audit log
  INSERT INTO public.admin_audit_logs (
    actor_user_id,
    actor_role,
    action,
    target_type,
    target_id,
    reason,
    metadata,
    result
  ) VALUES (
    p_user_id,
    v_inv.role_name,
    'ADMIN_ACTIVATED',
    'user',
    p_user_id::text,
    'Administrator accepted invitation and activated account.',
    jsonb_build_object('invitation_id', v_inv.id, 'role_name', v_inv.role_name),
    'SUCCESS'
  );

  RETURN true;
END;
$$;

-- Update MFA verification timestamp on successful TOTP verification
CREATE OR REPLACE FUNCTION public.admin_update_mfa_status(
  p_user_id uuid,
  p_enrolled boolean DEFAULT true,
  p_verified boolean DEFAULT true
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() != p_user_id AND NOT public.has_admin_permission('security.manage') THEN
    RAISE EXCEPTION 'Access denied: cannot update MFA status for another user without security.manage.';
  END IF;

  UPDATE public.admin_user_roles
  SET 
    mfa_enrolled_at = CASE WHEN p_enrolled THEN COALESCE(mfa_enrolled_at, timezone('utc'::text, now())) ELSE NULL END,
    mfa_last_verified_at = CASE WHEN p_verified THEN timezone('utc'::text, now()) ELSE mfa_last_verified_at END,
    last_admin_login_at = timezone('utc'::text, now())
  WHERE user_id = p_user_id;

  RETURN true;
END;
$$;

-- Update admin_assign_role to protect Primary SuperAdmin & enforce hierarchy
CREATE OR REPLACE FUNCTION public.admin_assign_role(
  p_target_user_id uuid,
  p_role_id uuid,
  p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_level integer;
  v_target_level integer;
  v_role_name text;
  v_target_is_primary boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF v_caller = p_target_user_id THEN
    RAISE EXCEPTION 'Anti-self-escalation violation: administrators cannot modify their own roles.';
  END IF;

  IF NOT public.has_admin_permission('roles.manage') THEN
    RAISE EXCEPTION 'Access denied: missing roles.manage permission.';
  END IF;

  SELECT COALESCE(max(r.hierarchy_level), 0) INTO v_caller_level
  FROM public.admin_user_roles ur
  JOIN public.admin_roles r ON ur.role_id = r.id
  WHERE ur.user_id = v_caller AND ur.account_state = 'ACTIVE';

  SELECT hierarchy_level, name INTO v_target_level, v_role_name
  FROM public.admin_roles
  WHERE id = p_role_id;

  IF v_target_level IS NULL THEN
    RAISE EXCEPTION 'Target role does not exist.';
  END IF;

  IF v_target_level >= v_caller_level THEN
    RAISE EXCEPTION 'Hierarchy violation: cannot grant a role with equal or higher hierarchy level.';
  END IF;

  -- Check if target is Primary SuperAdmin
  SELECT COALESCE(bool_or(is_primary_superadmin), false) INTO v_target_is_primary
  FROM public.admin_user_roles
  WHERE user_id = p_target_user_id;

  IF v_target_is_primary THEN
    RAISE EXCEPTION 'Primary SuperAdmin role configuration cannot be modified via normal role assignment.';
  END IF;

  INSERT INTO public.admin_user_roles (
    user_id,
    role_id,
    assigned_by,
    account_state,
    mfa_required
  ) VALUES (
    p_target_user_id,
    p_role_id,
    v_caller,
    'ACTIVE',
    true
  )
  ON CONFLICT (user_id, role_id) DO UPDATE SET
    assigned_by = v_caller,
    account_state = 'ACTIVE',
    assigned_at = timezone('utc'::text, now());

  INSERT INTO public.admin_audit_logs (
    actor_user_id,
    actor_role,
    action,
    target_type,
    target_id,
    reason,
    new_value,
    result
  ) VALUES (
    v_caller,
    'Admin',
    'ADMIN_ROLE_ASSIGNED',
    'user',
    p_target_user_id::text,
    p_reason,
    jsonb_build_object('role_id', p_role_id, 'role_name', v_role_name),
    'SUCCESS'
  );

  RETURN true;
END;
$$;

-- Update admin_suspend_user to prevent suspending Primary SuperAdmin
CREATE OR REPLACE FUNCTION public.admin_suspend_user(
  p_target_user_id uuid,
  p_reason text,
  p_duration_hours integer DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_until timestamptz;
  v_target_is_primary boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF v_caller = p_target_user_id THEN
    RAISE EXCEPTION 'Anti-self-escalation violation: cannot suspend your own account.';
  END IF;

  IF NOT public.has_admin_permission('users.suspend') THEN
    RAISE EXCEPTION 'Access denied: missing users.suspend permission.';
  END IF;

  -- Protect Primary SuperAdmin
  SELECT COALESCE(bool_or(is_primary_superadmin), false) INTO v_target_is_primary
  FROM public.admin_user_roles
  WHERE user_id = p_target_user_id;

  IF v_target_is_primary THEN
    RAISE EXCEPTION 'Primary SuperAdmin account cannot be suspended.';
  END IF;

  IF p_duration_hours IS NOT NULL AND p_duration_hours > 0 THEN
    v_until := timezone('utc'::text, now()) + (p_duration_hours || ' hours')::interval;
  ELSE
    v_until := NULL;
  END IF;

  UPDATE public.profiles
  SET 
    is_suspended = true,
    suspended_until = v_until,
    suspension_reason = p_reason,
    updated_at = timezone('utc'::text, now())
  WHERE id = p_target_user_id;

  UPDATE public.admin_user_roles
  SET account_state = 'SUSPENDED'
  WHERE user_id = p_target_user_id;

  INSERT INTO public.admin_audit_logs (
    actor_user_id,
    actor_role,
    action,
    target_type,
    target_id,
    reason,
    metadata,
    result
  ) VALUES (
    v_caller,
    'Admin',
    'USER_SUSPENDED',
    'user',
    p_target_user_id::text,
    p_reason,
    jsonb_build_object('duration_hours', p_duration_hours, 'suspended_until', v_until),
    'SUCCESS'
  );

  RETURN true;
END;
$$;
