-- ==============================================================================
-- HEAT CHAT — CLEAN DATABASE VERIFICATION SCRIPT
-- File: supabase/verify_clean_database.sql
-- ==============================================================================
-- Run this in Supabase Dashboard -> SQL Editor after applying full_schema.sql.
-- All assertions should return SUCCESS.
-- ==============================================================================

DO $$
DECLARE
  v_missing_tables text[];
  v_missing_roles text[];
  v_role_count integer;
  v_perm_count integer;
  v_admin_user_count integer;
  v_bootstrap_avail boolean;
  v_bucket_exists boolean;
  v_bucket_is_private boolean;
BEGIN
  RAISE NOTICE '==================================================';
  RAISE NOTICE 'HEAT CHAT — CLEAN DATABASE REBUILD VERIFICATION';
  RAISE NOTICE '==================================================';

  -- 1. Verify 22 Public Tables Exist
  SELECT array_agg(t) INTO v_missing_tables
  FROM unnest(ARRAY[
    'profiles', 'conversations', 'conversation_members', 'messages',
    'message_reactions', 'message_reads', 'attachments', 'friendships',
    'notification_preferences', 'conversation_notification_preferences',
    'notifications', 'starred_messages', 'admin_roles', 'admin_permissions',
    'admin_role_permissions', 'admin_user_roles', 'admin_audit_logs',
    'admin_security_events', 'moderation_reports', 'system_settings',
    'admin_invitations', 'admin_mfa_recovery_codes'
  ]) AS t
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = t
  );

  IF v_missing_tables IS NOT NULL AND array_length(v_missing_tables, 1) > 0 THEN
    RAISE EXCEPTION 'FAILED: Missing public tables: %', v_missing_tables;
  ELSE
    RAISE NOTICE '[PASS] All 22 application tables exist in public schema.';
  END IF;

  -- 2. Verify 6 System Admin Roles
  SELECT count(*) INTO v_role_count FROM public.admin_roles;
  IF v_role_count != 6 THEN
    RAISE EXCEPTION 'FAILED: Expected 6 admin roles, found %', v_role_count;
  ELSE
    RAISE NOTICE '[PASS] Exactly 6 hierarchical admin roles seeded.';
  END IF;

  -- 3. Verify 32 System Admin Permissions
  SELECT count(*) INTO v_perm_count FROM public.admin_permissions;
  IF v_perm_count != 32 THEN
    RAISE EXCEPTION 'FAILED: Expected 32 admin permissions, found %', v_perm_count;
  ELSE
    RAISE NOTICE '[PASS] Exactly 32 granular admin permissions seeded.';
  END IF;

  -- 4. Verify ZERO Seeded Admin Users
  SELECT count(*) INTO v_admin_user_count FROM public.admin_user_roles;
  IF v_admin_user_count != 0 THEN
    RAISE EXCEPTION 'FAILED: Found % seeded admin user records. Clean database must have 0.', v_admin_user_count;
  ELSE
    RAISE NOTICE '[PASS] Exactly 0 admin users exist (Zero-Trust Bootstrap ready).';
  END IF;

  -- 5. Verify Bootstrap Availability RPC
  SELECT public.admin_is_bootstrap_available() INTO v_bootstrap_avail;
  IF v_bootstrap_avail IS NOT TRUE THEN
    RAISE EXCEPTION 'FAILED: admin_is_bootstrap_available() returned false.';
  ELSE
    RAISE NOTICE '[PASS] First-run Primary SuperAdmin bootstrap is OPEN (bootstrapAvailable = true).';
  END IF;

  -- 6. Verify Storage Bucket 'chat-attachments'
  SELECT EXISTS(SELECT 1 FROM storage.buckets WHERE id = 'chat-attachments') INTO v_bucket_exists;
  SELECT COALESCE(bool_and(NOT public), false) INTO v_bucket_is_private 
  FROM storage.buckets WHERE id = 'chat-attachments';

  IF NOT v_bucket_exists THEN
    RAISE EXCEPTION 'FAILED: Storage bucket chat-attachments does not exist.';
  ELSIF NOT v_bucket_is_private THEN
    RAISE EXCEPTION 'FAILED: Storage bucket chat-attachments is public! Must be private.';
  ELSE
    RAISE NOTICE '[PASS] Storage bucket chat-attachments is created and verified PRIVATE.';
  END IF;

  -- 7. Verify Unique Primary SuperAdmin Constraint
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'admin_user_roles' AND indexname = 'idx_unique_primary_superadmin'
  ) THEN
    RAISE EXCEPTION 'FAILED: Partial unique index idx_unique_primary_superadmin is missing.';
  ELSE
    RAISE NOTICE '[PASS] Primary SuperAdmin partial unique index is ACTIVE.';
  END IF;

  -- 8. Verify Audit Log Modification Protection Trigger
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers 
    WHERE event_object_table = 'admin_audit_logs' 
      AND trigger_name = 'trg_prevent_audit_log_modification'
  ) THEN
    RAISE EXCEPTION 'FAILED: Audit log immutability trigger trg_prevent_audit_log_modification is missing.';
  ELSE
    RAISE NOTICE '[PASS] Audit log append-only immutability trigger is ACTIVE.';
  END IF;

  RAISE NOTICE '==================================================';
  RAISE NOTICE 'SUMMARY: ALL CLEAN DATABASE VERIFICATIONS PASSED (100%)';
  RAISE NOTICE '==================================================';
END;
$$;
