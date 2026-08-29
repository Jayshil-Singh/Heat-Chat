-- ==============================================================================
-- HEAT CHAT — COMPLETE APPLICATION & AUTH USER PURGE SCRIPT
-- ==============================================================================
-- Target Project: rmvpdcftfdeizitnrvkw (https://rmvpdcftfdeizitnrvkw.supabase.co)
-- Objective: Completely purge all application and test auth.users records while
-- preserving 100% of schema definitions, RLS policies, RPCs, triggers, indexes,
-- and reference configuration (admin_roles, admin_permissions, system_settings).
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. DISABLE AUDIT IMMUTABILITY TRIGGER TEMPORARILY FOR DATA WIPE MAINTENANCE
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.admin_audit_logs 
  DISABLE TRIGGER trg_prevent_audit_log_modification;

-- ------------------------------------------------------------------------------
-- 2. PURGE DEPENDENT APPLICATION DATA IN REVERSE FOREIGN-KEY DEPENDENCY ORDER
-- ------------------------------------------------------------------------------
DELETE FROM public.starred_messages;
DELETE FROM public.message_reads;
DELETE FROM public.message_reactions;
DELETE FROM public.attachments;
DELETE FROM public.messages;
DELETE FROM public.conversation_members;
DELETE FROM public.conversations;

DELETE FROM public.conversation_notification_preferences;
DELETE FROM public.notification_preferences;
DELETE FROM public.notifications;

DELETE FROM public.friendships;
DELETE FROM public.moderation_reports;
DELETE FROM public.admin_security_events;

DELETE FROM public.admin_mfa_recovery_codes;
DELETE FROM public.admin_invitations;
DELETE FROM public.admin_user_roles;
DELETE FROM public.admin_audit_logs;

DELETE FROM public.profiles;

-- ------------------------------------------------------------------------------
-- 3. PURGE STORAGE ATTACHMENT OBJECTS (PRESERVE BUCKET AND RLS)
-- ------------------------------------------------------------------------------
DELETE FROM storage.objects 
WHERE bucket_id = 'chat-attachments';

-- ------------------------------------------------------------------------------
-- 4. PURGE APPLICATION & TEST AUTH USERS (CASCADES IDENTITIES & SESSIONS)
-- ------------------------------------------------------------------------------
DELETE FROM auth.users;

-- ------------------------------------------------------------------------------
-- 5. RE-ENABLE AUDIT IMMUTABILITY TRIGGER
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.admin_audit_logs 
  ENABLE TRIGGER trg_prevent_audit_log_modification;

-- ------------------------------------------------------------------------------
-- 6. PRESERVE & VERIFY REFERENCE CONFIGURATION DATA
-- ------------------------------------------------------------------------------

-- Seed 6 System Roles
INSERT INTO public.admin_roles (name, description, hierarchy_level, is_system) VALUES
  ('SuperAdmin', 'Unrestricted administrative access with break-glass authorization', 100, true),
  ('SystemAdmin', 'Technical systems administration, configuration, and security operations', 80, true),
  ('Admin', 'General user management, conversation governance, and operational moderation', 60, true),
  ('Moderator', 'Content moderation, user reports resolution, and message safety', 40, true),
  ('Support', 'User troubleshooting, session recovery, and account status management', 30, true),
  ('Analyst', 'Read-only business analytics, metrics, and operational health monitoring', 20, true)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  hierarchy_level = EXCLUDED.hierarchy_level,
  is_system = EXCLUDED.is_system;

-- Seed 32 System Permissions
INSERT INTO public.admin_permissions (key, category, description) VALUES
  ('users.view', 'Users', 'View user profiles, statuses, and registration details'),
  ('users.create', 'Users', 'Create new user accounts administratively'),
  ('users.edit', 'Users', 'Edit user profile information'),
  ('users.delete', 'Users', 'Soft delete or hard delete user accounts'),
  ('users.suspend', 'Users', 'Temporarily or permanently suspend user accounts'),
  ('users.restore', 'Users', 'Restore suspended or disabled user accounts'),
  ('users.revoke_sessions', 'Users', 'Force logout and invalidate active sessions for users'),
  ('roles.view', 'Roles', 'View administrative roles and assigned permissions'),
  ('roles.manage', 'Roles', 'Create, edit, assign, and revoke administrative roles'),
  ('permissions.view', 'Roles', 'View permission catalogs'),
  ('permissions.manage', 'Roles', 'Configure permissions assigned to roles'),
  ('conversations.metadata.view', 'Conversations', 'Inspect conversation metadata, members, and activity'),
  ('conversations.moderate', 'Conversations', 'Archive, disable, or transfer conversation ownership'),
  ('conversations.delete', 'Conversations', 'Delete conversations administratively'),
  ('messages.metadata.view', 'Messages', 'Search message metadata, timestamps, and message types'),
  ('messages.content.view', 'Messages', 'Break-glass access to view private message bodies with justification'),
  ('messages.delete', 'Messages', 'Administratively delete abusive messages'),
  ('messages.restore', 'Messages', 'Restore previously deleted messages'),
  ('attachments.view', 'Storage', 'View attachment metadata, usage, and catalog'),
  ('attachments.delete', 'Storage', 'Delete malicious or orphaned attachments from storage'),
  ('reports.view', 'Moderation', 'View the moderation queue and user reports'),
  ('reports.assign', 'Moderation', 'Assign moderation reports to specific moderators'),
  ('reports.resolve', 'Moderation', 'Resolve or dismiss moderation reports with action taken'),
  ('security.view', 'Security', 'View security dashboard and security event audit logs'),
  ('security.manage', 'Security', 'Execute security interventions, force lockouts, and revoke credentials'),
  ('analytics.view', 'Analytics', 'Access platform analytics, growth rates, and retention stats'),
  ('settings.view', 'Settings', 'View global application and system configuration'),
  ('settings.manage', 'Settings', 'Update global system settings and security policies'),
  ('notifications.view', 'Notifications', 'View system email and notification templates'),
  ('notifications.manage', 'Notifications', 'Edit and test notification templates'),
  ('audit.view', 'Audit', 'Inspect immutable administrative audit logs'),
  ('system.health.view', 'System', 'Monitor live service latency, error rates, and infrastructure health')
ON CONFLICT (key) DO NOTHING;

-- Seed Default System Settings
INSERT INTO public.system_settings (key, value, category, description, is_secret) VALUES
  ('app.name', '"Heat Chat"'::jsonb, 'General', 'Display name of the application', false),
  ('app.registration_enabled', 'true'::jsonb, 'Auth', 'Whether new user registrations are permitted', false),
  ('app.email_verification_mandatory', 'true'::jsonb, 'Auth', 'Whether email verification is strictly required', false),
  ('app.max_message_length', '5000'::jsonb, 'Messaging', 'Maximum character count for messages', false),
  ('app.max_attachment_size_mb', '25'::jsonb, 'Storage', 'Maximum allowed attachment size in megabytes', false),
  ('app.allowed_attachment_types', '["image/jpeg", "image/png", "image/webp", "image/gif"]'::jsonb, 'Storage', 'Permitted MIME types for chat uploads', false),
  ('app.maintenance_mode', 'false'::jsonb, 'System', 'Whether the application is undergoing maintenance', false)
ON CONFLICT (key) DO NOTHING;

COMMIT;

-- ------------------------------------------------------------------------------
-- 7. POST-PURGE VERIFICATION ASSERTIONS (RUN IMMEDIATELY AFTER COMMIT)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_users_count integer;
  v_profiles_count integer;
  v_messages_count integer;
  v_conversations_count integer;
  v_attachments_count integer;
  v_admin_users_count integer;
  v_primary_superadmin_count integer;
  v_invitations_count integer;
  v_mfa_codes_count integer;
  v_audit_logs_count integer;
  v_security_events_count integer;
  v_storage_objects_count integer;
  v_bootstrap_avail boolean;
  v_roles_count integer;
  v_perms_count integer;
BEGIN
  SELECT count(*) INTO v_users_count FROM auth.users;
  SELECT count(*) INTO v_profiles_count FROM public.profiles;
  SELECT count(*) INTO v_messages_count FROM public.messages;
  SELECT count(*) INTO v_conversations_count FROM public.conversations;
  SELECT count(*) INTO v_attachments_count FROM public.attachments;
  SELECT count(*) INTO v_admin_users_count FROM public.admin_user_roles;
  SELECT count(*) INTO v_primary_superadmin_count FROM public.admin_user_roles WHERE is_primary_superadmin = true;
  SELECT count(*) INTO v_invitations_count FROM public.admin_invitations;
  SELECT count(*) INTO v_mfa_codes_count FROM public.admin_mfa_recovery_codes;
  SELECT count(*) INTO v_audit_logs_count FROM public.admin_audit_logs;
  SELECT count(*) INTO v_security_events_count FROM public.admin_security_events;
  SELECT count(*) INTO v_storage_objects_count FROM storage.objects WHERE bucket_id = 'chat-attachments';
  SELECT count(*) INTO v_roles_count FROM public.admin_roles;
  SELECT count(*) INTO v_perms_count FROM public.admin_permissions;
  
  v_bootstrap_avail := public.admin_is_bootstrap_available();

  RAISE NOTICE '==================================================================';
  RAISE NOTICE ' HEAT CHAT — POST-PURGE VERIFICATION ASSERTIONS';
  RAISE NOTICE '==================================================================';
  RAISE NOTICE 'auth.users count:                 %', v_users_count;
  RAISE NOTICE 'public.profiles count:            %', v_profiles_count;
  RAISE NOTICE 'public.messages count:            %', v_messages_count;
  RAISE NOTICE 'public.conversations count:       %', v_conversations_count;
  RAISE NOTICE 'public.attachments count:         %', v_attachments_count;
  RAISE NOTICE 'public.admin_user_roles count:    %', v_admin_users_count;
  RAISE NOTICE 'PrimarySuperAdmin count:          %', v_primary_superadmin_count;
  RAISE NOTICE 'admin_invitations count:          %', v_invitations_count;
  RAISE NOTICE 'admin_mfa_recovery_codes count:   %', v_mfa_codes_count;
  RAISE NOTICE 'admin_audit_logs count:           %', v_audit_logs_count;
  RAISE NOTICE 'admin_security_events count:      %', v_security_events_count;
  RAISE NOTICE 'chat-attachments storage objects: %', v_storage_objects_count;
  RAISE NOTICE 'admin_roles (retained):           %', v_roles_count;
  RAISE NOTICE 'admin_permissions (retained):     %', v_perms_count;
  RAISE NOTICE 'bootstrapAvailable:               %', v_bootstrap_avail;
  RAISE NOTICE '==================================================================';

  IF v_users_count != 0 THEN
    RAISE EXCEPTION 'Assertion Failed: auth.users is not empty (% rows remaining)', v_users_count;
  END IF;

  IF v_profiles_count != 0 THEN
    RAISE EXCEPTION 'Assertion Failed: public.profiles is not empty (% rows remaining)', v_profiles_count;
  END IF;

  IF v_admin_users_count != 0 OR v_primary_superadmin_count != 0 THEN
    RAISE EXCEPTION 'Assertion Failed: admin users remain in admin_user_roles';
  END IF;

  IF v_bootstrap_avail IS NOT TRUE THEN
    RAISE EXCEPTION 'Assertion Failed: bootstrapAvailable is not true';
  END IF;

  RAISE NOTICE 'ALL FIRST-RUN DATABASE PURGE ASSERTIONS PASSED SUCCESSFULLY.';
END $$;
