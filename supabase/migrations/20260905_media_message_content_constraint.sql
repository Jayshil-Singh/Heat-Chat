-- ==============================================================================
-- Heat Chat — Phase 4 Media Send: Media Message Content Constraint & Validation
-- Migration Timestamp: 2026-09-05
-- ==============================================================================
-- Problem: The original message_content_length check constraint on public.messages
-- required char_length(trim(content)) > 0 unconditionally. For media/file messages
-- (image, video, audio, voice, file) without a caption, content is an empty string (""),
-- causing Postgres to reject the row with:
--   "new row for relation 'messages' violates check constraint 'message_content_length'"
--
-- Fix: Update the check constraint to require non-empty content ONLY when
-- message_type = 'text'. For media messages, empty content (no caption) is valid,
-- while non-empty captions are bounded by char_length(content) <= 5000.
-- Also update send_message RPC to match this logic.
-- ==============================================================================

-- 1. UPDATE TABLE CHECK CONSTRAINT ON public.messages
-- ------------------------------------------------------------------------------
alter table public.messages
  drop constraint if exists message_content_length;

alter table public.messages
  add constraint message_content_length
  check (
    char_length(content) <= 5000 and
    (message_type <> 'text' or char_length(trim(content)) > 0)
  );

-- 2. UPDATE send_message RPC
-- ------------------------------------------------------------------------------
create or replace function public.send_message(
  p_conversation_id uuid,
  p_content text,
  p_client_message_id uuid default null,
  p_reply_to_message_id uuid default null,
  p_forwarded_from_message_id uuid default null,
  p_message_type text default 'text'
)
returns jsonb as $$
declare
  v_sender_id uuid;
  v_conv record;
  v_other_member_id uuid;
  v_existing_msg record;
  v_reply_msg record;
  v_forward_msg record;
  v_new_msg record;
  v_clean_content text;
  v_msg_type text;
begin
  v_sender_id := auth.uid();
  if v_sender_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  -- 1. Check conversation membership
  if not public.is_conversation_member(p_conversation_id, v_sender_id) then
    raise exception 'CONVERSATION_ACCESS_DENIED';
  end if;

  -- 2. Fetch conversation details
  select id, type into v_conv
  from public.conversations
  where id = p_conversation_id;

  if v_conv.id is null then
    raise exception 'CONVERSATION_NOT_FOUND';
  end if;

  -- 3. If direct conversation, enforce blocking and privacy
  if v_conv.type = 'direct' then
    select user_id into v_other_member_id
    from public.conversation_members
    where conversation_id = p_conversation_id
      and user_id <> v_sender_id
    limit 1;

    if v_other_member_id is not null then
      if public.is_user_blocked(v_sender_id, v_other_member_id) then
        raise exception 'MESSAGE_BLOCKED';
      end if;

      if not public.can_send_message(v_sender_id, v_other_member_id) then
        raise exception 'PRIVACY_RESTRICTED';
      end if;
    end if;
  end if;

  -- 4. Validate content based on message_type
  v_msg_type := coalesce(p_message_type, 'text');
  v_clean_content := trim(coalesce(p_content, ''));

  -- Pure text messages cannot be empty
  if v_msg_type = 'text' and length(v_clean_content) = 0 then
    raise exception 'MESSAGE_EMPTY';
  end if;

  -- All messages / captions cannot exceed 4000 characters
  if length(v_clean_content) > 4000 then
    raise exception 'MESSAGE_TOO_LONG';
  end if;

  -- 5. Validate reply target if supplied (must be in same conversation)
  if p_reply_to_message_id is not null then
    select id, conversation_id into v_reply_msg
    from public.messages
    where id = p_reply_to_message_id;

    if v_reply_msg.id is null or v_reply_msg.conversation_id <> p_conversation_id then
      raise exception 'INVALID_REPLY_TARGET';
    end if;
  end if;

  -- 6. Validate forwarded target if supplied (caller must have access to original message)
  if p_forwarded_from_message_id is not null then
    select id, conversation_id into v_forward_msg
    from public.messages
    where id = p_forwarded_from_message_id;

    if v_forward_msg.id is null or not public.is_conversation_member(v_forward_msg.conversation_id, v_sender_id) then
      raise exception 'INVALID_FORWARD_TARGET';
    end if;
  end if;

  -- 7. Check idempotency: if client_message_id already exists for sender, return existing
  if p_client_message_id is not null then
    select * into v_existing_msg
    from public.messages
    where sender_id = v_sender_id and client_message_id = p_client_message_id;

    if v_existing_msg.id is not null then
      return jsonb_build_object(
        'success', true,
        'messageId', v_existing_msg.id,
        'conversationId', v_existing_msg.conversation_id,
        'senderId', v_existing_msg.sender_id,
        'content', v_existing_msg.content,
        'clientMessageId', v_existing_msg.client_message_id,
        'createdAt', v_existing_msg.created_at,
        'duplicate', true
      );
    end if;
  end if;

  -- 8. Insert message
  insert into public.messages (
    conversation_id,
    sender_id,
    content,
    message_type,
    reply_to_message_id,
    forwarded_from_message_id,
    client_message_id
  ) values (
    p_conversation_id,
    v_sender_id,
    v_clean_content,
    v_msg_type,
    p_reply_to_message_id,
    p_forwarded_from_message_id,
    p_client_message_id
  )
  returning * into v_new_msg;

  -- 9. Update conversation updated_at
  update public.conversations
  set updated_at = timezone('utc'::text, now())
  where id = p_conversation_id;

  -- 10. Update unread count for other members in conversation_user_states
  insert into public.conversation_user_states (user_id, conversation_id, unread_count, is_marked_unread)
  select cm.user_id, p_conversation_id, 1, false
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id and cm.user_id <> v_sender_id
  on conflict (user_id, conversation_id)
  do update set 
    unread_count = public.conversation_user_states.unread_count + 1,
    is_marked_unread = false;

  -- 11. Clear draft for sender if exists
  delete from public.conversation_drafts
  where user_id = v_sender_id and conversation_id = p_conversation_id;

  return jsonb_build_object(
    'success', true,
    'messageId', v_new_msg.id,
    'conversationId', v_new_msg.conversation_id,
    'senderId', v_new_msg.sender_id,
    'content', v_new_msg.content,
    'messageType', v_new_msg.message_type,
    'clientMessageId', v_new_msg.client_message_id,
    'createdAt', v_new_msg.created_at,
    'duplicate', false
  );
end;
$$ language plpgsql security definer set search_path = public, pg_temp;
