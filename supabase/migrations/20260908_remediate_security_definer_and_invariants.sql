-- ==============================================================================
-- Heat Chat — Remediation Migration 20260908
-- Description:
--   1. Enforce SET search_path = public, pg_temp on all SECURITY DEFINER functions
--   2. Atomic row locking (FOR UPDATE) in join_group_via_invite_link
--   3. Hardened Anonymous Poll Privacy: restrictive RLS and removal from realtime publication
--   4. Secure poll aggregation RPC: get_conversation_polls
--   5. Database invariant: unique owner partial index on conversation_members
--   6. Polls updated_at tracking for realtime invalidation
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. HARDEN ALL SECURITY DEFINER FUNCTIONS WITH SEARCH_PATH
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND (p.proconfig IS NULL OR NOT EXISTS (
        SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%'
      ))
  LOOP
    EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public, pg_temp;', r.proname, r.args);
  END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 2. GROUP OWNER DATABASE INVARIANT
-- ------------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS unique_group_owner_idx
  ON public.conversation_members(conversation_id)
  WHERE role = 'owner';

-- ------------------------------------------------------------------------------
-- 3. POLLS UPDATED_AT & REALTIME PRIVACY HARDENING
-- ------------------------------------------------------------------------------
ALTER TABLE public.polls
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now());

-- Remove poll_votes from supabase_realtime publication to prevent raw vote broadcast
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.poll_votes;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Hardened poll_votes RLS: anonymous votes can ONLY be selected by the voter themselves
DROP POLICY IF EXISTS "Users can view poll votes for authorized polls" ON public.poll_votes;

CREATE POLICY "Users can view poll votes for authorized polls"
  ON public.poll_votes FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.polls p
      WHERE p.id = poll_id
        AND NOT p.is_anonymous
        AND public.is_conversation_member(p.conversation_id, auth.uid())
    )
  );

-- ------------------------------------------------------------------------------
-- 4. ATOMIC VOTE_POLL WITH UPDATED_AT TOUCH
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vote_poll(
  p_poll_id uuid,
  p_option_ids uuid[]
)
RETURNS void AS $$
DECLARE
  v_caller_id uuid;
  v_conv_id uuid;
  v_is_closed boolean;
  v_is_multi boolean;
  v_allow_change boolean;
  v_opt_id uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT conversation_id, is_closed, is_multiple_choice, allow_vote_change
  INTO v_conv_id, v_is_closed, v_is_multi, v_allow_change
  FROM public.polls
  WHERE id = p_poll_id;

  IF v_conv_id IS NULL THEN
    RAISE EXCEPTION 'Poll not found';
  END IF;

  IF v_is_closed THEN
    RAISE EXCEPTION 'Poll is closed';
  END IF;

  IF NOT public.is_conversation_member(v_conv_id, v_caller_id) THEN
    RAISE EXCEPTION 'You are not a member of this conversation';
  END IF;

  IF p_option_ids IS NULL OR array_length(p_option_ids, 1) = 0 THEN
    -- Clearing all votes
    IF NOT v_allow_change THEN
      RAISE EXCEPTION 'Vote changes are not allowed for this poll';
    END IF;
    DELETE FROM public.poll_votes WHERE poll_id = p_poll_id AND user_id = v_caller_id;
    UPDATE public.polls SET updated_at = timezone('utc'::text, now()) WHERE id = p_poll_id;
    RETURN;
  END IF;

  IF NOT v_is_multi AND array_length(p_option_ids, 1) > 1 THEN
    RAISE EXCEPTION 'Only single option selection allowed for this poll';
  END IF;

  -- Verify all options belong to this poll
  FOREACH v_opt_id IN ARRAY p_option_ids LOOP
    IF NOT EXISTS (SELECT 1 FROM public.poll_options WHERE id = v_opt_id AND poll_id = p_poll_id) THEN
      RAISE EXCEPTION 'Invalid option ID % for this poll', v_opt_id;
    END IF;
  END LOOP;

  -- Clear existing votes for user on this poll
  DELETE FROM public.poll_votes WHERE poll_id = p_poll_id AND user_id = v_caller_id;

  -- Insert new votes
  FOREACH v_opt_id IN ARRAY p_option_ids LOOP
    INSERT INTO public.poll_votes (
      poll_id,
      option_id,
      user_id
    ) VALUES (
      p_poll_id,
      v_opt_id,
      v_caller_id
    );
  END LOOP;

  -- Touch poll updated_at to trigger realtime broadcast to conversation members
  UPDATE public.polls SET updated_at = timezone('utc'::text, now()) WHERE id = p_poll_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ------------------------------------------------------------------------------
-- 5. ATOMIC CLOSE_POLL WITH UPDATED_AT TOUCH
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_poll(p_poll_id uuid)
RETURNS void AS $$
DECLARE
  v_caller_id uuid;
  v_conv_id uuid;
  v_creator_id uuid;
  v_is_closed boolean;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT conversation_id, created_by, is_closed
  INTO v_conv_id, v_creator_id, v_is_closed
  FROM public.polls
  WHERE id = p_poll_id;

  IF v_conv_id IS NULL THEN
    RAISE EXCEPTION 'Poll not found';
  END IF;

  IF v_is_closed THEN
    RETURN;
  END IF;

  -- Only creator or admin/owner can close poll
  IF v_caller_id <> v_creator_id AND NOT public.is_conversation_admin(v_conv_id, v_caller_id) THEN
    RAISE EXCEPTION 'Only the poll creator or group admins can close this poll';
  END IF;

  UPDATE public.polls
  SET is_closed = true,
      closed_at = timezone('utc'::text, now()),
      closed_by = v_caller_id,
      updated_at = timezone('utc'::text, now())
  WHERE id = p_poll_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ------------------------------------------------------------------------------
-- 6. SECURE POLL AGGREGATION RPC (ANONYMOUS-SAFE)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_conversation_polls(p_conversation_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_caller_id uuid;
  v_result jsonb;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_conversation_member(p_conversation_id, v_caller_id) THEN
    RAISE EXCEPTION 'Not a member of this conversation';
  END IF;

  SELECT coalesce(jsonb_agg(poll_data ORDER BY poll_data->>'createdAt' DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'id', p.id,
      'conversationId', p.conversation_id,
      'messageId', p.message_id,
      'question', p.question,
      'isMultipleChoice', p.is_multiple_choice,
      'isAnonymous', p.is_anonymous,
      'allowVoteChange', p.allow_vote_change,
      'isClosed', p.is_closed,
      'closedAt', p.closed_at,
      'closedBy', p.closed_by,
      'createdBy', p.created_by,
      'createdAt', p.created_at,
      'options', (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', opt.id,
            'pollId', opt.poll_id,
            'optionText', opt.option_text,
            'position', opt.position,
            'voteCount', (
              SELECT count(*)::int
              FROM public.poll_votes pv
              WHERE pv.option_id = opt.id
            ),
            'isVotedByMe', EXISTS (
              SELECT 1
              FROM public.poll_votes pv
              WHERE pv.option_id = opt.id AND pv.user_id = v_caller_id
            ),
            'voterUserIds', CASE
              WHEN p.is_anonymous THEN null
              ELSE (
                SELECT coalesce(jsonb_agg(pv.user_id), '[]'::jsonb)
                FROM public.poll_votes pv
                WHERE pv.option_id = opt.id
              )
            END
          ) ORDER BY opt.position ASC
        )
        FROM public.poll_options opt
        WHERE opt.poll_id = p.id
      )
    ) AS poll_data
    FROM public.polls p
    WHERE p.conversation_id = p_conversation_id
  ) sub;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.get_conversation_polls(uuid) TO authenticated;

-- ------------------------------------------------------------------------------
-- 7. ATOMIC JOIN_GROUP_VIA_INVITE_LINK WITH ROW LOCKING (FOR UPDATE)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_group_via_invite_link(p_token text)
RETURNS uuid AS $$
DECLARE
  v_caller_id uuid;
  v_conv_id uuid;
  v_link_id uuid;
  v_max_uses int;
  v_uses_count int;
  v_is_revoked boolean;
  v_expires_at timestamptz;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Lock invite link row exclusively to prevent concurrency race conditions
  SELECT id, conversation_id, max_uses, uses_count, is_revoked, expires_at
  INTO v_link_id, v_conv_id, v_max_uses, v_uses_count, v_is_revoked, v_expires_at
  FROM public.group_invite_links
  WHERE token = p_token
  FOR UPDATE;

  IF v_link_id IS NULL OR v_is_revoked THEN
    RAISE EXCEPTION 'Invite link is invalid or has been revoked';
  END IF;

  IF v_expires_at IS NOT NULL AND v_expires_at < timezone('utc'::text, now()) THEN
    RAISE EXCEPTION 'Invite link has expired';
  END IF;

  IF v_max_uses IS NOT NULL AND v_uses_count >= v_max_uses THEN
    RAISE EXCEPTION 'Invite link has reached maximum allowed uses';
  END IF;

  -- Check if user is already a member
  IF EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id = v_conv_id AND user_id = v_caller_id
  ) THEN
    RETURN v_conv_id;
  END IF;

  -- Add caller as regular member
  INSERT INTO public.conversation_members (
    conversation_id,
    user_id,
    role
  ) VALUES (
    v_conv_id,
    v_caller_id,
    'member'
  );

  -- Atomically increment uses count
  UPDATE public.group_invite_links
  SET uses_count = uses_count + 1
  WHERE id = v_link_id;

  RETURN v_conv_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.join_group_via_invite_link(text) TO authenticated;
