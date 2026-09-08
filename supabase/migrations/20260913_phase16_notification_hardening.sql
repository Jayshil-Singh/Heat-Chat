-- ==============================================================================
-- HEAT CHAT — PHASE 16: NOTIFICATION RELIABILITY, IDEMPOTENCY & CENTER HARDENING
-- Migration: 20260913_phase16_notification_hardening.sql
-- ==============================================================================

-- 1. NOTIFICATIONS TABLE SCHEMA HARDENING
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS recipient_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS friend_request_id uuid REFERENCES public.friend_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false;

-- Backfill missing columns from existing data
UPDATE public.notifications
SET recipient_id = user_id
WHERE recipient_id IS NULL AND user_id IS NOT NULL;

UPDATE public.notifications
SET is_read = (read_at IS NOT NULL)
WHERE is_read = false AND read_at IS NOT NULL;

UPDATE public.notifications
SET metadata = data
WHERE (metadata IS NULL OR metadata = '{}'::jsonb) AND data IS NOT NULL AND data <> '{}'::jsonb;

-- 2. BIDIRECTIONAL COLUMN SYNCHRONIZATION TRIGGER
CREATE OR REPLACE FUNCTION public.sync_notifications_columns()
RETURNS trigger AS $$
BEGIN
  -- Synchronize user_id <-> recipient_id
  IF NEW.recipient_id IS NOT NULL AND NEW.user_id IS NULL THEN
    NEW.user_id := NEW.recipient_id;
  ELSIF NEW.user_id IS NOT NULL AND NEW.recipient_id IS NULL THEN
    NEW.recipient_id := NEW.user_id;
  ELSIF NEW.recipient_id IS NOT NULL AND NEW.user_id IS NOT NULL AND NEW.recipient_id <> NEW.user_id THEN
    NEW.user_id := NEW.recipient_id;
  END IF;

  -- Synchronize metadata <-> data
  IF NEW.metadata IS NOT NULL AND (NEW.data IS NULL OR NEW.data = '{}'::jsonb) AND NEW.metadata <> '{}'::jsonb THEN
    NEW.data := NEW.metadata;
  ELSIF NEW.data IS NOT NULL AND (NEW.metadata IS NULL OR NEW.metadata = '{}'::jsonb) AND NEW.data <> '{}'::jsonb THEN
    NEW.metadata := NEW.data;
  END IF;

  -- Synchronize read_at <-> is_read
  IF NEW.read_at IS NOT NULL THEN
    NEW.is_read := true;
  ELSIF NEW.is_read = true AND NEW.read_at IS NULL THEN
    NEW.read_at := timezone('utc'::text, now());
  ELSIF NEW.is_read = false AND NEW.read_at IS NOT NULL THEN
    NEW.read_at := NULL;
  END IF;

  -- Synchronize type <-> event_type
  IF NEW.type IS NOT NULL AND NEW.event_type IS NULL THEN
    NEW.event_type := NEW.type;
  ELSIF NEW.event_type IS NOT NULL AND NEW.type IS NULL THEN
    NEW.type := NEW.event_type;
  END IF;

  -- Synchronize sender_id <-> actor_id
  IF NEW.sender_id IS NOT NULL AND NEW.actor_id IS NULL THEN
    NEW.actor_id := NEW.sender_id;
  ELSIF NEW.actor_id IS NOT NULL AND NEW.sender_id IS NULL THEN
    NEW.sender_id := NEW.actor_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_sync_notifications_columns ON public.notifications;
CREATE TRIGGER trg_sync_notifications_columns
  BEFORE INSERT OR UPDATE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_notifications_columns();

-- 3. INDEXES FOR PERFORMANCE & IDEMPOTENCY
CREATE UNIQUE INDEX IF NOT EXISTS notifications_recipient_dedupe_unique
  ON public.notifications(recipient_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_dedupe_key_uidx
  ON public.notifications(user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_recipient_unread_created_idx
  ON public.notifications(recipient_id, created_at DESC)
  WHERE is_read = false AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx
  ON public.notifications(recipient_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS notifications_recipient_read_idx
  ON public.notifications(recipient_id, read_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS notifications_friend_request_idx
  ON public.notifications(friend_request_id);

CREATE INDEX IF NOT EXISTS notifications_message_idx
  ON public.notifications(message_id);

CREATE INDEX IF NOT EXISTS notifications_sender_idx
  ON public.notifications(sender_id);

CREATE INDEX IF NOT EXISTS notifications_conv_id_idx
  ON public.notifications(conversation_id);

-- 4. ROW LEVEL SECURITY
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can insert own notifications" ON public.notifications;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING ((user_id = auth.uid() OR recipient_id = auth.uid()) AND deleted_at IS NULL);

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR recipient_id = auth.uid())
  WITH CHECK (user_id = auth.uid() OR recipient_id = auth.uid());

CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() OR recipient_id = auth.uid());

-- 5. SECURE NOTIFICATION RPCs

-- A. create_notification (idempotent, validated, anti-spoofing)
DROP FUNCTION IF EXISTS public.create_notification(uuid, text, text, text, uuid, uuid, uuid, jsonb, text);
CREATE OR REPLACE FUNCTION public.create_notification(
  p_recipient_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_conversation_id uuid DEFAULT NULL,
  p_message_id uuid DEFAULT NULL,
  p_friend_request_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_dedupe_key text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_caller_id uuid;
  v_notif_id uuid;
  v_dedupe_key text;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_recipient_id IS NULL THEN
    RAISE EXCEPTION 'Recipient is required';
  END IF;

  -- Suppress self-notifications unless explicitly allowed system/test type
  IF v_caller_id = p_recipient_id AND p_type NOT IN ('system', 'security', 'test_notification') THEN
    RETURN NULL;
  END IF;

  -- Validate conversation membership if conversation_id provided
  IF p_conversation_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.conversation_members
      WHERE conversation_id = p_conversation_id AND user_id = v_caller_id
    ) THEN
      RAISE EXCEPTION 'Not authorized to send notification for this conversation';
    END IF;
  END IF;

  -- Generate deterministic dedupe_key if not provided
  IF p_dedupe_key IS NOT NULL AND p_dedupe_key <> '' THEN
    v_dedupe_key := p_dedupe_key;
  ELSIF p_friend_request_id IS NOT NULL THEN
    v_dedupe_key := p_type || ':' || p_friend_request_id::text;
  ELSIF p_message_id IS NOT NULL THEN
    v_dedupe_key := p_type || ':' || p_message_id::text || ':' || p_recipient_id::text;
  ELSIF p_conversation_id IS NOT NULL THEN
    v_dedupe_key := p_type || ':' || p_conversation_id::text || ':' || v_caller_id::text;
  ELSE
    v_dedupe_key := NULL;
  END IF;

  INSERT INTO public.notifications (
    recipient_id,
    user_id,
    sender_id,
    actor_id,
    type,
    event_type,
    title,
    body,
    conversation_id,
    message_id,
    friend_request_id,
    metadata,
    data,
    dedupe_key,
    is_read,
    read_at,
    created_at
  ) VALUES (
    p_recipient_id,
    p_recipient_id,
    v_caller_id,
    v_caller_id,
    p_type,
    p_type,
    COALESCE(p_title, ''),
    COALESCE(p_body, ''),
    p_conversation_id,
    p_message_id,
    p_friend_request_id,
    COALESCE(p_metadata, '{}'::jsonb),
    COALESCE(p_metadata, '{}'::jsonb),
    v_dedupe_key,
    false,
    NULL,
    timezone('utc'::text, now())
  )
  ON CONFLICT (recipient_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_notif_id;

  RETURN v_notif_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- B. mark_notification_read & mark_notification_as_read
DROP FUNCTION IF EXISTS public.mark_notification_read(uuid);
CREATE OR REPLACE FUNCTION public.mark_notification_read(notification_id uuid)
RETURNS boolean AS $$
DECLARE
  v_updated boolean := false;
BEGIN
  UPDATE public.notifications
  SET read_at = timezone('utc'::text, now()),
      is_read = true
  WHERE id = notification_id
    AND (user_id = auth.uid() OR recipient_id = auth.uid())
    AND (read_at IS NULL OR is_read = false);

  v_updated := FOUND;
  RETURN v_updated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP FUNCTION IF EXISTS public.mark_notification_as_read(uuid);
CREATE OR REPLACE FUNCTION public.mark_notification_as_read(notif_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN public.mark_notification_read(notif_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- C. mark_all_notifications_read & mark_all_notifications_as_read
DROP FUNCTION IF EXISTS public.mark_all_notifications_read();
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS integer AS $$
DECLARE
  v_count integer := 0;
BEGIN
  UPDATE public.notifications
  SET read_at = timezone('utc'::text, now()),
      is_read = true
  WHERE (user_id = auth.uid() OR recipient_id = auth.uid())
    AND (read_at IS NULL OR is_read = false)
    AND deleted_at IS NULL;

  GET DIAGNOSTICS v_count = row_count;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP FUNCTION IF EXISTS public.mark_all_notifications_as_read();
CREATE OR REPLACE FUNCTION public.mark_all_notifications_as_read()
RETURNS integer AS $$
BEGIN
  RETURN public.mark_all_notifications_read();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- D. get_notification_unread_count (authoritative)
DROP FUNCTION IF EXISTS public.get_notification_unread_count();
CREATE OR REPLACE FUNCTION public.get_notification_unread_count()
RETURNS integer AS $$
DECLARE
  v_count integer := 0;
BEGIN
  SELECT count(*)::integer INTO v_count
  FROM public.notifications
  WHERE (user_id = auth.uid() OR recipient_id = auth.uid())
    AND (read_at IS NULL OR is_read = false)
    AND deleted_at IS NULL;

  RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- E. get_user_notifications_cursor (cursor pagination)
DROP FUNCTION IF EXISTS public.get_user_notifications_cursor(integer, timestamp with time zone, uuid, text);
CREATE OR REPLACE FUNCTION public.get_user_notifications_cursor(
  p_limit integer DEFAULT 25,
  p_cursor_created_at timestamp with time zone DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_category text DEFAULT 'all'
)
RETURNS jsonb AS $$
DECLARE
  v_limit integer;
  v_caller_id uuid;
  v_result jsonb;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 25), 50));

  WITH raw_page AS (
    SELECT
      n.id,
      COALESCE(n.recipient_id, n.user_id) AS recipient_id,
      COALESCE(n.recipient_id, n.user_id) AS user_id,
      COALESCE(n.sender_id, n.actor_id) AS sender_id,
      COALESCE(n.actor_id, n.sender_id) AS actor_id,
      n.conversation_id,
      n.message_id,
      n.friend_request_id,
      COALESCE(n.type, n.event_type) AS type,
      COALESCE(n.event_type, n.type) AS event_type,
      n.dedupe_key,
      n.title,
      n.body,
      COALESCE(n.metadata, n.data, '{}'::jsonb) AS metadata,
      COALESCE(n.data, n.metadata, '{}'::jsonb) AS data,
      COALESCE(n.is_read, n.read_at IS NOT NULL) AS is_read,
      n.read_at,
      n.created_at,
      jsonb_build_object(
        'id', p.id,
        'display_name', p.display_name,
        'avatar_url', p.avatar_url,
        'status', p.status
      ) AS sender_profile,
      c.name AS conversation_name,
      c.type AS conversation_type,
      m.content AS message_preview,
      (m.deleted_at IS NOT NULL) AS message_deleted
    FROM public.notifications n
    LEFT JOIN public.profiles p ON p.id = COALESCE(n.sender_id, n.actor_id)
    LEFT JOIN public.conversations c ON c.id = n.conversation_id
    LEFT JOIN public.messages m ON m.id = n.message_id
    WHERE (n.recipient_id = v_caller_id OR n.user_id = v_caller_id)
      AND n.deleted_at IS NULL
      AND (
        p_cursor_created_at IS NULL
        OR (n.created_at, n.id) < (p_cursor_created_at, p_cursor_id)
      )
      AND (
        p_category IS NULL OR p_category = 'all'
        OR (p_category = 'messages' AND (c.type = 'direct' OR c.type IS NULL) AND n.type = 'message')
        OR (p_category = 'mentions' AND (n.type = 'mention' OR n.event_type = 'mention'))
        OR (p_category = 'groups' AND c.type = 'group')
        OR (p_category = 'friends' AND (n.type LIKE 'friend%' OR n.event_type LIKE 'friend%'))
        OR (p_category = 'reactions' AND (n.type = 'reaction' OR n.event_type = 'reaction'))
        OR (p_category = 'system' AND (n.type IN ('system', 'security', 'security_alert') OR n.event_type IN ('system', 'security', 'security_alert')))
      )
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT v_limit + 1
  ),
  counted_page AS (
    SELECT *, row_number() OVER () AS rn
    FROM raw_page
  )
  SELECT
    jsonb_build_object(
      'items', COALESCE(
        jsonb_agg(
          to_jsonb(cp) - 'sender_profile' - 'conversation_name' - 'conversation_type' - 'message_preview' - 'message_deleted' - 'rn' ||
          jsonb_build_object(
            'sender', cp.sender_profile,
            'conversation_name', cp.conversation_name,
            'conversation_type', cp.conversation_type,
            'preview', CASE
              WHEN cp.type LIKE 'friend%accepted' THEN COALESCE(NULLIF(cp.body, ''), 'accepted your friend request')
              WHEN cp.type LIKE 'friend%' THEN COALESCE(NULLIF(cp.body, ''), 'sent you a friend request')
              WHEN cp.message_deleted THEN 'This message was deleted'
              WHEN cp.message_preview IS NOT NULL AND cp.message_preview <> '' THEN cp.message_preview
              WHEN cp.body IS NOT NULL AND cp.body <> '' THEN cp.body
              ELSE 'New notification'
            END,
            'is_deleted', cp.message_deleted
          )
        ) FILTER (WHERE rn <= v_limit),
        '[]'::jsonb
      ),
      'has_more', count(*) > v_limit,
      'next_cursor', CASE
        WHEN count(*) > v_limit THEN
          (
            SELECT jsonb_build_object(
              'created_at', sub.created_at,
              'id', sub.id
            )
            FROM counted_page sub
            WHERE sub.rn = v_limit
          )
        ELSE NULL
      END
    ) INTO v_result
  FROM counted_page cp;

  RETURN COALESCE(v_result, jsonb_build_object('items', '[]'::jsonb, 'has_more', false, 'next_cursor', null));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 6. PERMISSIONS
REVOKE ALL ON FUNCTION public.create_notification(uuid, text, text, text, uuid, uuid, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, uuid, uuid, uuid, jsonb, text) TO authenticated;

REVOKE ALL ON FUNCTION public.mark_notification_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.mark_notification_as_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_notification_as_read(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;

REVOKE ALL ON FUNCTION public.mark_all_notifications_as_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_as_read() TO authenticated;

REVOKE ALL ON FUNCTION public.get_notification_unread_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_notification_unread_count() TO authenticated;

REVOKE ALL ON FUNCTION public.get_user_notifications_cursor(integer, timestamp with time zone, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_notifications_cursor(integer, timestamp with time zone, uuid, text) TO authenticated;

-- 7. ATOMIC NOTIFICATION INTEGRITY IN STATE TRANSITIONS

-- A. Update send_friend_request to include deterministic dedupe_key
DROP FUNCTION IF EXISTS public.send_friend_request(uuid);
CREATE OR REPLACE FUNCTION public.send_friend_request(target_user_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_caller_id uuid;
  v_existing_reverse record;
  v_existing_outgoing record;
  v_new_req_id uuid;
  v_daily_count integer;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF v_caller_id = target_user_id THEN
    RAISE EXCEPTION 'Cannot send friend request to yourself';
  END IF;

  -- Block verification
  IF EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = v_caller_id AND blocked_id = target_user_id)
       OR (blocker_id = target_user_id AND blocked_id = v_caller_id)
  ) THEN
    RAISE EXCEPTION 'Action not permitted';
  END IF;

  -- Rate limit check (max 30 pending/sent per 24 hours)
  SELECT count(*) INTO v_daily_count
  FROM public.friend_requests
  WHERE sender_id = v_caller_id
    AND created_at > (timezone('utc'::text, now()) - interval '24 hours');

  IF v_daily_count >= 30 THEN
    RAISE EXCEPTION 'Rate limit exceeded: maximum 30 friend requests per 24 hours';
  END IF;

  -- 1. Check if reverse pending request already exists (auto-accept)
  SELECT id, status INTO v_existing_reverse
  FROM public.friend_requests
  WHERE sender_id = target_user_id
    AND recipient_id = v_caller_id
    AND status = 'pending'
  FOR UPDATE;

  IF v_existing_reverse.id IS NOT NULL THEN
    UPDATE public.friend_requests
    SET status = 'accepted',
        responded_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    WHERE id = v_existing_reverse.id;

    IF EXISTS (
      SELECT 1 FROM public.friendships
      WHERE (user_id = v_caller_id AND friend_id = target_user_id)
         OR (user_id = target_user_id AND friend_id = v_caller_id)
    ) THEN
      UPDATE public.friendships
      SET status = 'accepted',
          responded_at = timezone('utc'::text, now()),
          updated_at = timezone('utc'::text, now())
      WHERE (user_id = v_caller_id AND friend_id = target_user_id)
         OR (user_id = target_user_id AND friend_id = v_caller_id);
    ELSE
      INSERT INTO public.friendships (user_id, friend_id, status, responded_at, updated_at)
      VALUES (target_user_id, v_caller_id, 'accepted', timezone('utc'::text, now()), timezone('utc'::text, now()));
    END IF;

    -- Create notification for target with deterministic dedupe_key
    INSERT INTO public.notifications (
      recipient_id,
      user_id,
      actor_id,
      sender_id,
      type,
      event_type,
      title,
      body,
      data,
      metadata,
      conversation_id,
      friend_request_id,
      dedupe_key
    ) VALUES (
      target_user_id,
      target_user_id,
      v_caller_id,
      v_caller_id,
      'friend_request_accepted',
      'friend_accepted',
      'Friend Request Accepted',
      'accepted your friend request',
      jsonb_build_object('request_id', v_existing_reverse.id, 'actor_id', v_caller_id),
      jsonb_build_object('request_id', v_existing_reverse.id, 'actor_id', v_caller_id),
      NULL,
      v_existing_reverse.id,
      'friend_request_accepted:' || v_existing_reverse.id::text
    )
    ON CONFLICT (recipient_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'friends',
      'requestId', v_existing_reverse.id,
      'autoAccepted', true
    );
  END IF;

  -- 2. Check if outgoing request already exists
  SELECT id, status INTO v_existing_outgoing
  FROM public.friend_requests
  WHERE sender_id = v_caller_id
    AND recipient_id = target_user_id
    AND status = 'pending'
  FOR UPDATE;

  IF v_existing_outgoing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'outgoing_pending',
      'requestId', v_existing_outgoing.id,
      'autoAccepted', false
    );
  END IF;

  -- 3. Create new pending request
  INSERT INTO public.friend_requests (sender_id, recipient_id, status)
  VALUES (v_caller_id, target_user_id, 'pending')
  RETURNING id INTO v_new_req_id;

  -- Create notification for recipient with deterministic dedupe_key
  INSERT INTO public.notifications (
    recipient_id,
    user_id,
    actor_id,
    sender_id,
    type,
    event_type,
    title,
    body,
    data,
    metadata,
    conversation_id,
    friend_request_id,
    dedupe_key
  ) VALUES (
    target_user_id,
    target_user_id,
    v_caller_id,
    v_caller_id,
    'friend_request',
    'friend_request',
    'New Friend Request',
    'sent you a friend request',
    jsonb_build_object('request_id', v_new_req_id, 'actor_id', v_caller_id),
    jsonb_build_object('request_id', v_new_req_id, 'actor_id', v_caller_id),
    NULL,
    v_new_req_id,
    'friend_request:' || v_new_req_id::text
  )
  ON CONFLICT (recipient_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'outgoing_pending',
    'requestId', v_new_req_id,
    'autoAccepted', false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- B. Update accept_friend_request to include deterministic dedupe_key
DROP FUNCTION IF EXISTS public.accept_friend_request(uuid);
CREATE OR REPLACE FUNCTION public.accept_friend_request(request_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_caller_id uuid;
  v_req record;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT id, sender_id, recipient_id, status INTO v_req
  FROM public.friend_requests
  WHERE id = request_id
  FOR UPDATE;

  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'Friend request not found';
  END IF;

  IF v_req.recipient_id <> v_caller_id THEN
    RAISE EXCEPTION 'Only the recipient can accept this friend request';
  END IF;

  IF v_req.status = 'accepted' THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'accepted',
      'requestId', v_req.id,
      'alreadyAccepted', true
    );
  END IF;

  -- Update request status
  UPDATE public.friend_requests
  SET status = 'accepted',
      responded_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  WHERE id = v_req.id;

  -- Upsert friendship
  IF EXISTS (
    SELECT 1 FROM public.friendships
    WHERE (user_id = v_req.sender_id AND friend_id = v_req.recipient_id)
       OR (user_id = v_req.recipient_id AND friend_id = v_req.sender_id)
  ) THEN
    UPDATE public.friendships
    SET status = 'accepted',
        responded_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    WHERE (user_id = v_req.sender_id AND friend_id = v_req.recipient_id)
       OR (user_id = v_req.recipient_id AND friend_id = v_req.sender_id);
  ELSE
    INSERT INTO public.friendships (user_id, friend_id, status, responded_at, updated_at)
    VALUES (v_req.sender_id, v_req.recipient_id, 'accepted', timezone('utc'::text, now()), timezone('utc'::text, now()));
  END IF;

  -- Create notification for the sender with deterministic dedupe_key
  INSERT INTO public.notifications (
    recipient_id,
    user_id,
    actor_id,
    sender_id,
    type,
    event_type,
    title,
    body,
    data,
    metadata,
    conversation_id,
    friend_request_id,
    dedupe_key
  ) VALUES (
    v_req.sender_id,
    v_req.sender_id,
    v_caller_id,
    v_caller_id,
    'friend_request_accepted',
    'friend_accepted',
    'Friend Request Accepted',
    'accepted your friend request',
    jsonb_build_object('request_id', v_req.id, 'actor_id', v_caller_id),
    jsonb_build_object('request_id', v_req.id, 'actor_id', v_caller_id),
    NULL,
    v_req.id,
    'friend_request_accepted:' || v_req.id::text
  )
  ON CONFLICT (recipient_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'accepted',
    'requestId', v_req.id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- C. Update handle_new_message_notification trigger with dedupe_key & mute check
CREATE OR REPLACE FUNCTION public.handle_new_message_notification()
RETURNS trigger AS $$
BEGIN
  -- For every conversation member (except the sender), insert an idempotent notification record
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
    'New Message',
    CASE
      WHEN NEW.message_type = 'image' AND (NEW.content IS NULL OR trim(NEW.content) = '') THEN '📷 Photo'
      WHEN NEW.message_type = 'voice' THEN '🎤 Voice message'
      ELSE COALESCE(NEW.content, 'New message')
    END,
    jsonb_build_object('conversation_id', NEW.conversation_id, 'message_id', NEW.id, 'sender_id', NEW.sender_id),
    jsonb_build_object('conversation_id', NEW.conversation_id, 'message_id', NEW.id, 'sender_id', NEW.sender_id),
    'message:' || NEW.id::text || ':' || cm.user_id::text
  FROM public.conversation_members cm
  LEFT JOIN public.conversation_notification_preferences cnp
    ON cnp.conversation_id = NEW.conversation_id AND cnp.user_id = cm.user_id
  WHERE cm.conversation_id = NEW.conversation_id
    AND cm.user_id <> NEW.sender_id
    AND COALESCE(cnp.muted, false) = false
  ON CONFLICT (recipient_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- D. Update toggle_message_reaction with reaction notification & idempotency
DROP FUNCTION IF EXISTS public.toggle_message_reaction(uuid, text);
CREATE OR REPLACE FUNCTION public.toggle_message_reaction(
  p_message_id uuid,
  p_reaction text
)
RETURNS jsonb AS $$
DECLARE
  v_actor_id uuid;
  v_conv_id uuid;
  v_author_id uuid;
  v_existing_id uuid;
  v_actor_name text;
  v_dedupe_key text;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  SELECT conversation_id, sender_id INTO v_conv_id, v_author_id
  FROM public.messages
  WHERE id = p_message_id;

  IF v_conv_id IS NULL OR NOT public.is_conversation_member(v_conv_id, v_actor_id) THEN
    RAISE EXCEPTION 'MESSAGE_ACCESS_DENIED';
  END IF;

  SELECT id INTO v_existing_id
  FROM public.message_reactions
  WHERE message_id = p_message_id
    AND user_id = v_actor_id
    AND reaction = p_reaction;

  v_dedupe_key := 'reaction:' || p_message_id::text || ':' || v_actor_id::text;

  IF v_existing_id IS NOT NULL THEN
    DELETE FROM public.message_reactions WHERE id = v_existing_id;
    -- Remove corresponding notification when reaction is toggled off
    DELETE FROM public.notifications
    WHERE dedupe_key = v_dedupe_key AND recipient_id = v_author_id;

    RETURN jsonb_build_object('success', true, 'added', false, 'reaction', p_reaction);
  ELSE
    INSERT INTO public.message_reactions (message_id, user_id, reaction)
    VALUES (p_message_id, v_actor_id, p_reaction);

    -- Only notify message author if actor is not the author
    IF v_author_id IS NOT NULL AND v_author_id <> v_actor_id THEN
      SELECT display_name INTO v_actor_name
      FROM public.profiles
      WHERE id = v_actor_id;

      INSERT INTO public.notifications (
        recipient_id,
        user_id,
        actor_id,
        sender_id,
        type,
        event_type,
        title,
        body,
        data,
        metadata,
        conversation_id,
        message_id,
        dedupe_key
      ) VALUES (
        v_author_id,
        v_author_id,
        v_actor_id,
        v_actor_id,
        'reaction',
        'reaction',
        'New Reaction',
        COALESCE(v_actor_name, 'Someone') || ' reacted ' || p_reaction || ' to your message',
        jsonb_build_object('message_id', p_message_id, 'reaction', p_reaction, 'actor_id', v_actor_id),
        jsonb_build_object('message_id', p_message_id, 'reaction', p_reaction, 'actor_id', v_actor_id),
        v_conv_id,
        p_message_id,
        v_dedupe_key
      )
      ON CONFLICT (recipient_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
    END IF;

    RETURN jsonb_build_object('success', true, 'added', true, 'reaction', p_reaction);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.toggle_message_reaction(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_message_reaction(uuid, text) TO authenticated;
