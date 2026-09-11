-- Migration: 20260922_phase23_sender_name_web_push_notifications.sql
-- Heat Chat Phase 23: Sender-Name Web Push Notifications, Safe Previews, and Recipient Privacy
--
-- Goals:
-- 1. Update public.handle_new_message_notification() trigger to:
--    a. Server-side resolve sender display name (profiles.display_name, fallback profiles.username)
--    b. Server-side resolve conversation type ('direct' vs 'group') and conversation name (conversations.name)
--    c. Compute notification title:
--       - Direct message: "<sender display name>"
--       - Group message: "<sender display name> in <conversation name>"
--       - Fallback (missing sender name): "New message"
--       - INVARIANT: Never use recipient's name as title
--    d. Compute message preview:
--       - Trim whitespace, max 120 chars with "..." if truncated
--       - Image messages -> "Sent an image"
--       - File messages -> "Sent a file"
--       - Voice messages -> "Voice message"
--       - Video messages -> "Sent a video"
--       - Fallback -> "New message"
--    e. Respect recipient privacy:
--       - Check notification_preferences.message_preview_enabled for each recipient
--       - If false -> body is strictly "New message"
--    f. Store structured payload in notifications.data and notifications.metadata:
--       { type: 'new_message', title, body, senderName, senderAvatar, sender_id, conversationId, messageId, url }
--       Strictly without private fields, credentials, or tokens.
--    g. Maintain idempotency with ON CONFLICT (recipient_id, dedupe_key) DO NOTHING
--    h. Maintain conversation muting check (cnp.muted = false) and sender exclusion (cm.user_id <> NEW.sender_id)

CREATE OR REPLACE FUNCTION public.handle_new_message_notification()
RETURNS trigger AS $$
DECLARE
  v_sender_display_name text;
  v_sender_username text;
  v_sender_avatar text;
  v_sender_name text;
  v_conv_type text;
  v_conv_name text;
  v_title text;
  v_raw_preview text;
BEGIN
  -- 1. Resolve sender profile display info
  SELECT display_name, username, avatar_url
  INTO v_sender_display_name, v_sender_username, v_sender_avatar
  FROM public.profiles
  WHERE id = NEW.sender_id;

  v_sender_name := COALESCE(NULLIF(trim(v_sender_display_name), ''), NULLIF(trim(v_sender_username), ''));

  -- 2. Resolve conversation info
  SELECT type, name
  INTO v_conv_type, v_conv_name
  FROM public.conversations
  WHERE id = NEW.conversation_id;

  -- 3. Determine notification title
  -- For direct message: "<sender display name>"
  -- For group conversation: "<sender display name> in <conversation name>"
  -- If sender name unavailable: "New message"
  -- (Never uses recipient's name)
  IF v_sender_name IS NOT NULL AND v_sender_name <> '' THEN
    IF v_conv_type = 'group' THEN
      IF v_conv_name IS NOT NULL AND trim(v_conv_name) <> '' THEN
        v_title := v_sender_name || ' in ' || trim(v_conv_name);
      ELSE
        v_title := v_sender_name || ' in Group';
      END IF;
    ELSE
      v_title := v_sender_name;
    END IF;
  ELSE
    v_title := 'New message';
  END IF;

  -- 4. Compute safe preview based on message type
  IF NEW.message_type = 'image' THEN
    v_raw_preview := 'Sent an image';
  ELSIF NEW.message_type = 'file' THEN
    v_raw_preview := 'Sent a file';
  ELSIF NEW.message_type = 'voice' THEN
    v_raw_preview := 'Voice message';
  ELSIF NEW.message_type = 'video' THEN
    v_raw_preview := 'Sent a video';
  ELSE
    IF NEW.content IS NOT NULL AND trim(NEW.content) <> '' THEN
      v_raw_preview := trim(NEW.content);
      IF length(v_raw_preview) > 120 THEN
        v_raw_preview := substring(v_raw_preview FROM 1 FOR 117) || '...';
      END IF;
    ELSE
      v_raw_preview := 'New message';
    END IF;
  END IF;

  -- 5. For every conversation member (except sender), insert idempotent notification record
  INSERT INTO public.notifications (
    recipient_id,
    user_id,
    conversation_id,
    message_id,
    sender_id,
    actor_id,
    type,
    event_type,
    title,
    body,
    metadata,
    data,
    dedupe_key
  )
  SELECT
    cm.user_id,
    cm.user_id,
    NEW.conversation_id,
    NEW.id,
    NEW.sender_id,
    NEW.sender_id,
    'message',
    'message',
    v_title,
    CASE
      WHEN COALESCE(np.message_preview_enabled, true) = false THEN 'New message'
      ELSE v_raw_preview
    END,
    jsonb_build_object(
      'type', 'new_message',
      'title', v_title,
      'body', CASE WHEN COALESCE(np.message_preview_enabled, true) = false THEN 'New message' ELSE v_raw_preview END,
      'senderName', v_sender_name,
      'senderAvatar', v_sender_avatar,
      'sender_id', NEW.sender_id,
      'conversationId', NEW.conversation_id,
      'conversation_id', NEW.conversation_id,
      'messageId', NEW.id,
      'message_id', NEW.id,
      'url', '/chat/' || NEW.conversation_id::text
    ),
    jsonb_build_object(
      'type', 'new_message',
      'title', v_title,
      'body', CASE WHEN COALESCE(np.message_preview_enabled, true) = false THEN 'New message' ELSE v_raw_preview END,
      'senderName', v_sender_name,
      'senderAvatar', v_sender_avatar,
      'sender_id', NEW.sender_id,
      'conversationId', NEW.conversation_id,
      'conversation_id', NEW.conversation_id,
      'messageId', NEW.id,
      'message_id', NEW.id,
      'url', '/chat/' || NEW.conversation_id::text
    ),
    'message:' || NEW.id::text || ':' || cm.user_id::text
  FROM public.conversation_members cm
  LEFT JOIN public.conversation_notification_preferences cnp
    ON cnp.conversation_id = NEW.conversation_id AND cnp.user_id = cm.user_id
  LEFT JOIN public.notification_preferences np
    ON np.user_id = cm.user_id
  WHERE cm.conversation_id = NEW.conversation_id
    AND cm.user_id <> NEW.sender_id
    AND COALESCE(cnp.muted, false) = false
  ON CONFLICT (recipient_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Ensure trigger exists on public.messages
DROP TRIGGER IF EXISTS on_message_created_notification ON public.messages;
CREATE TRIGGER on_message_created_notification
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_message_notification();
