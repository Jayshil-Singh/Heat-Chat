-- ==============================================================================
-- HEAT CHAT — CANONICAL APPLICATION DATA WIPE SCRIPT
-- ==============================================================================
-- Objective: Remove all user and application data while preserving complete schema,
-- RLS policies, RPC functions, triggers, indexes, reference roles & permissions.
-- ==============================================================================

BEGIN;

-- 1. Disable audit log modification trigger during data wipe maintenance
ALTER TABLE IF EXISTS public.admin_audit_logs DISABLE TRIGGER trg_prevent_audit_log_modification;

-- 2. Delete application data in strict reverse foreign-key dependency order
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

-- 3. Clear application objects from chat-attachments bucket while preserving bucket
DELETE FROM storage.objects WHERE bucket_id = 'chat-attachments';

-- 4. Re-enable audit log immutability trigger
ALTER TABLE IF EXISTS public.admin_audit_logs ENABLE TRIGGER trg_prevent_audit_log_modification;

-- 5. Ensure Reference Roles exist (6 system roles)
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

-- 6. Ensure Reference Permissions exist (32 system permissions)
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

-- 7. Ensure Default System Settings exist
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
