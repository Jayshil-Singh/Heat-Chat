-- ==============================================================================
-- HEAT CHAT — SAFE APPLICATION DATABASE RESET SCRIPT
-- File: supabase/reset_database.sql
-- ==============================================================================
-- WARNING: This script drops ONLY application-level tables, functions, triggers,
-- and policies in the 'public' schema, and resets the 'chat-attachments' bucket.
--
-- IT DOES NOT:
-- - Drop the 'auth' schema or destroy Supabase platform services.
-- - Destroy Supabase internal extensions or roles.
-- ==============================================================================

BEGIN;

-- 1. DROP TRIGGERS ON AUTH & PUBLIC
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS trg_prevent_audit_log_modification ON public.admin_audit_logs;
DROP TRIGGER IF EXISTS on_message_created_notification ON public.messages;
DROP TRIGGER IF EXISTS validate_reply_conversation ON public.messages;
DROP TRIGGER IF EXISTS on_message_inserted_update_conversation ON public.messages;
DROP TRIGGER IF EXISTS set_friendships_updated_at ON public.friendships;
DROP TRIGGER IF EXISTS set_messages_updated_at ON public.messages;
DROP TRIGGER IF EXISTS set_conversations_updated_at ON public.conversations;
DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;

-- 2. DROP STORAGE POLICIES
DROP POLICY IF EXISTS "Conversation members can read chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Conversation members can upload chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authorized users can delete chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;

-- 3. DROP APPLICATION TABLES IN REVERSE DEPENDENCY ORDER
DROP TABLE IF EXISTS public.admin_mfa_recovery_codes CASCADE;
DROP TABLE IF EXISTS public.admin_invitations CASCADE;
DROP TABLE IF EXISTS public.system_settings CASCADE;
DROP TABLE IF EXISTS public.moderation_reports CASCADE;
DROP TABLE IF EXISTS public.admin_security_events CASCADE;
DROP TABLE IF EXISTS public.admin_audit_logs CASCADE;
DROP TABLE IF EXISTS public.admin_user_roles CASCADE;
DROP TABLE IF EXISTS public.admin_role_permissions CASCADE;
DROP TABLE IF EXISTS public.admin_permissions CASCADE;
DROP TABLE IF EXISTS public.admin_roles CASCADE;

DROP TABLE IF EXISTS public.starred_messages CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.conversation_notification_preferences CASCADE;
DROP TABLE IF EXISTS public.notification_preferences CASCADE;
DROP TABLE IF EXISTS public.friendships CASCADE;
DROP TABLE IF EXISTS public.attachments CASCADE;
DROP TABLE IF EXISTS public.message_reads CASCADE;
DROP TABLE IF EXISTS public.message_reactions CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.conversation_members CASCADE;
DROP TABLE IF EXISTS public.conversations CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- 4. DROP APPLICATION FUNCTIONS & RPCS
DROP FUNCTION IF EXISTS public.admin_update_mfa_status(uuid, boolean, boolean);
DROP FUNCTION IF EXISTS public.admin_accept_invitation(uuid, text);
DROP FUNCTION IF EXISTS public.admin_validate_invitation(text);
DROP FUNCTION IF EXISTS public.admin_create_invitation(text, uuid, text, integer);
DROP FUNCTION IF EXISTS public.admin_bootstrap_primary_superadmin(uuid, text);
DROP FUNCTION IF EXISTS public.admin_is_bootstrap_available();
DROP FUNCTION IF EXISTS public.admin_break_glass_message_content(uuid, text);
DROP FUNCTION IF EXISTS public.admin_suspend_user(uuid, text, integer);
DROP FUNCTION IF EXISTS public.admin_assign_role(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.admin_log_audit(text, text, text, text, jsonb, text);
DROP FUNCTION IF EXISTS public.get_caller_admin_roles();
DROP FUNCTION IF EXISTS public.get_caller_admin_permissions();
DROP FUNCTION IF EXISTS public.has_admin_permission(text);
DROP FUNCTION IF EXISTS public.is_any_admin(uuid);
DROP FUNCTION IF EXISTS public.prevent_audit_log_modification();
DROP FUNCTION IF EXISTS public.get_message_context_by_id(uuid, integer);
DROP FUNCTION IF EXISTS public.toggle_starred_message(uuid);
DROP FUNCTION IF EXISTS public.search_global_messages(text, integer, integer);
DROP FUNCTION IF EXISTS public.search_conversation_messages(uuid, text, integer, integer);
DROP FUNCTION IF EXISTS public.toggle_conversation_mute(uuid, boolean, text, timestamptz);
DROP FUNCTION IF EXISTS public.mark_all_notifications_as_read();
DROP FUNCTION IF EXISTS public.mark_notification_as_read(uuid);
DROP FUNCTION IF EXISTS public.handle_new_message_notification();
DROP FUNCTION IF EXISTS public.safe_cast_uuid(text);
DROP FUNCTION IF EXISTS public.leave_group(uuid);
DROP FUNCTION IF EXISTS public.update_group_details(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.update_group_member_role(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.remove_group_member(uuid, uuid);
DROP FUNCTION IF EXISTS public.add_group_members(uuid, uuid[]);
DROP FUNCTION IF EXISTS public.create_group_conversation(text, uuid[], text, text);
DROP FUNCTION IF EXISTS public.get_conversation_role(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_conversation_owner(uuid, uuid);
DROP FUNCTION IF EXISTS public.validate_reply_same_conversation();
DROP FUNCTION IF EXISTS public.handle_new_message_conversation_updated_at();
DROP FUNCTION IF EXISTS public.get_or_create_direct_conversation(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_conversation_admin(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_conversation_member(uuid, uuid);
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.handle_updated_at();

-- 5. RESET STORAGE OBJECTS IN CHAT-ATTACHMENTS BUCKET
DELETE FROM storage.objects WHERE bucket_id = 'chat-attachments';

COMMIT;
