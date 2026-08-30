-- ==============================================================================
-- Heat Chat — Phase 3: Advanced Messaging, Actions, Threads, Reactions,
-- Read/Delivery State, Pinning, Forwarding, Drafts & Unread Engine
-- Migration Timestamp: 2026-09-02
-- ==============================================================================

-- 1. MESSAGES TABLE EXTENSIONS
-- ------------------------------------------------------------------------------
alter table public.messages
  add column if not exists client_message_id uuid,
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists delete_scope text check (delete_scope in ('me', 'everyone')),
  add column if not exists forwarded_from_message_id uuid references public.messages(id) on delete set null;

-- Unique constraint for client message idempotency
create unique index if not exists idx_messages_sender_client_id 
  on public.messages(sender_id, client_message_id)
  where client_message_id is not null;

create index if not exists idx_messages_forwarded_from 
  on public.messages(forwarded_from_message_id);

-- Update reaction constraint on message_reactions to support extended reaction set
alter table public.message_reactions
  drop constraint if exists message_reactions_reaction_check;

alter table public.message_reactions
  add constraint message_reactions_reaction_check
  check (reaction in ('❤️', '😂', '👍', '😮', '😢', '🔥', '😡', '👏'));

-- 2. NEW TABLES FOR PHASE 3
-- ------------------------------------------------------------------------------

-- 2.1 Message User States (for "Delete for Me")
create table if not exists public.message_user_states (
  user_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  hidden_at timestamptz not null default timezone('utc'::text, now()),
  primary key (user_id, message_id)
);

create index if not exists idx_msg_user_states_user 
  on public.message_user_states(user_id);
create index if not exists idx_msg_user_states_msg 
  on public.message_user_states(message_id);

-- 2.2 Message Pins
create table if not exists public.message_pins (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  pinned_by uuid not null references public.profiles(id) on delete cascade,
  pinned_at timestamptz not null default timezone('utc'::text, now()),
  constraint unique_conversation_pinned_message unique (conversation_id, message_id)
);

create index if not exists idx_message_pins_conv 
  on public.message_pins(conversation_id, pinned_at desc);
create index if not exists idx_message_pins_msg 
  on public.message_pins(message_id);

-- 2.3 Message Delivery States
create table if not exists public.message_delivery_states (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delivered_at timestamptz not null default timezone('utc'::text, now()),
  primary key (message_id, user_id)
);

create index if not exists idx_msg_delivery_user 
  on public.message_delivery_states(user_id);
create index if not exists idx_msg_delivery_msg 
  on public.message_delivery_states(message_id);

-- 2.4 Conversation User States (Unread engine & local state)
create table if not exists public.conversation_user_states (
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  last_read_message_id uuid references public.messages(id) on delete set null,
  last_read_at timestamptz,
  unread_count integer not null default 0,
  is_marked_unread boolean not null default false,
  primary key (user_id, conversation_id)
);

create index if not exists idx_conv_user_states_user 
  on public.conversation_user_states(user_id);
create index if not exists idx_conv_user_states_conv 
  on public.conversation_user_states(conversation_id);

-- 2.5 Conversation Drafts
create table if not exists public.conversation_drafts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  content text not null,
  reply_to_message_id uuid references public.messages(id) on delete set null,
  updated_at timestamptz not null default timezone('utc'::text, now()),
  primary key (user_id, conversation_id)
);

create index if not exists idx_conv_drafts_user 
  on public.conversation_drafts(user_id);

-- 3. ROW LEVEL SECURITY (RLS) FOR NEW TABLES
-- ------------------------------------------------------------------------------
alter table public.message_user_states enable row level security;
alter table public.message_pins enable row level security;
alter table public.message_delivery_states enable row level security;
alter table public.conversation_user_states enable row level security;
alter table public.conversation_drafts enable row level security;

-- message_user_states policies
drop policy if exists "Users can view own message states" on public.message_user_states;
create policy "Users can view own message states"
  on public.message_user_states for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own message states" on public.message_user_states;
create policy "Users can insert own message states"
  on public.message_user_states for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own message states" on public.message_user_states;
create policy "Users can delete own message states"
  on public.message_user_states for delete
  to authenticated
  using (auth.uid() = user_id);

-- message_pins policies
drop policy if exists "Members can view pins in their conversations" on public.message_pins;
create policy "Members can view pins in their conversations"
  on public.message_pins for select
  to authenticated
  using (public.is_conversation_member(conversation_id, auth.uid()));

drop policy if exists "Members can insert pins in their conversations" on public.message_pins;
create policy "Members can insert pins in their conversations"
  on public.message_pins for insert
  to authenticated
  with check (
    auth.uid() = pinned_by and 
    public.is_conversation_member(conversation_id, auth.uid())
  );

drop policy if exists "Members can delete pins in their conversations" on public.message_pins;
create policy "Members can delete pins in their conversations"
  on public.message_pins for delete
  to authenticated
  using (public.is_conversation_member(conversation_id, auth.uid()));

-- message_delivery_states policies
drop policy if exists "Members can view delivery states" on public.message_delivery_states;
create policy "Members can view delivery states"
  on public.message_delivery_states for select
  to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and public.is_conversation_member(m.conversation_id, auth.uid())
    )
  );

drop policy if exists "Users can record own delivery state" on public.message_delivery_states;
create policy "Users can record own delivery state"
  on public.message_delivery_states for insert
  to authenticated
  with check (auth.uid() = user_id);

-- conversation_user_states policies
drop policy if exists "Users can view own conversation state" on public.conversation_user_states;
create policy "Users can view own conversation state"
  on public.conversation_user_states for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can upsert own conversation state" on public.conversation_user_states;
create policy "Users can upsert own conversation state"
  on public.conversation_user_states for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own conversation state" on public.conversation_user_states;
create policy "Users can update own conversation state"
  on public.conversation_user_states for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- conversation_drafts policies
drop policy if exists "Users can manage own drafts" on public.conversation_drafts;
create policy "Users can manage own drafts"
  on public.conversation_drafts for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4. SECURITY DEFINER RPCS FOR ADVANCED MESSAGING
-- ------------------------------------------------------------------------------

-- 4.1 Send Message RPC (with idempotency, blocking & privacy checks)
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

  -- 4. Validate content
  v_clean_content := trim(coalesce(p_content, ''));
  if length(v_clean_content) = 0 then
    raise exception 'MESSAGE_EMPTY';
  end if;
  if length(v_clean_content) > 4000 then
    raise exception 'MESSAGE_TOO_LONG';
  end if;

  -- 5. Validate reply target if supplied (must be in same conversation and not inaccessible)
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
    coalesce(p_message_type, 'text'),
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
    'replyToMessageId', v_new_msg.reply_to_message_id,
    'forwardedFromMessageId', v_new_msg.forwarded_from_message_id,
    'clientMessageId', v_new_msg.client_message_id,
    'createdAt', v_new_msg.created_at,
    'duplicate', false
  );
end;
$$ language plpgsql security definer;

-- 4.2 Edit Message RPC
create or replace function public.edit_message(
  p_message_id uuid,
  p_content text
)
returns jsonb as $$
declare
  v_actor_id uuid;
  v_msg record;
  v_clean_content text;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select id, conversation_id, sender_id, content, deleted_at, created_at
  into v_msg
  from public.messages
  where id = p_message_id
  for update;

  if v_msg.id is null then
    raise exception 'MESSAGE_NOT_FOUND';
  end if;

  if v_msg.sender_id <> v_actor_id then
    raise exception 'MESSAGE_EDIT_FORBIDDEN';
  end if;

  if v_msg.deleted_at is not null then
    raise exception 'MESSAGE_ALREADY_DELETED';
  end if;

  v_clean_content := trim(coalesce(p_content, ''));
  if length(v_clean_content) = 0 then
    raise exception 'MESSAGE_EMPTY';
  end if;
  if length(v_clean_content) > 4000 then
    raise exception 'MESSAGE_TOO_LONG';
  end if;

  update public.messages
  set content = v_clean_content,
      edited_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  where id = p_message_id;

  return jsonb_build_object(
    'success', true,
    'messageId', p_message_id,
    'content', v_clean_content,
    'editedAt', timezone('utc'::text, now())
  );
end;
$$ language plpgsql security definer;

-- 4.3 Delete Message for Me RPC
create or replace function public.delete_message_for_me(p_message_id uuid)
returns jsonb as $$
declare
  v_actor_id uuid;
  v_conv_id uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select conversation_id into v_conv_id
  from public.messages
  where id = p_message_id;

  if v_conv_id is null or not public.is_conversation_member(v_conv_id, v_actor_id) then
    raise exception 'MESSAGE_ACCESS_DENIED';
  end if;

  insert into public.message_user_states (user_id, message_id, hidden_at)
  values (v_actor_id, p_message_id, timezone('utc'::text, now()))
  on conflict (user_id, message_id) do nothing;

  return jsonb_build_object('success', true, 'scope', 'me');
end;
$$ language plpgsql security definer;

-- 4.4 Delete Message for Everyone RPC
create or replace function public.delete_message_for_everyone(p_message_id uuid)
returns jsonb as $$
declare
  v_actor_id uuid;
  v_msg record;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select id, conversation_id, sender_id, deleted_at
  into v_msg
  from public.messages
  where id = p_message_id
  for update;

  if v_msg.id is null then
    raise exception 'MESSAGE_NOT_FOUND';
  end if;

  if v_msg.sender_id <> v_actor_id then
    raise exception 'MESSAGE_DELETE_FORBIDDEN';
  end if;

  if v_msg.deleted_at is not null then
    return jsonb_build_object('success', true, 'alreadyDeleted', true);
  end if;

  update public.messages
  set deleted_at = timezone('utc'::text, now()),
      deleted_by = v_actor_id,
      delete_scope = 'everyone',
      content = 'This message was deleted',
      updated_at = timezone('utc'::text, now())
  where id = p_message_id;

  return jsonb_build_object('success', true, 'scope', 'everyone', 'alreadyDeleted', false);
end;
$$ language plpgsql security definer;

-- 4.5 Forward Message RPC
create or replace function public.forward_message(
  p_message_id uuid,
  p_target_conversation_id uuid,
  p_client_message_id uuid default null
)
returns jsonb as $$
declare
  v_actor_id uuid;
  v_src_msg record;
  v_target_conv record;
  v_other_member_id uuid;
  v_new_msg record;
  v_existing_msg record;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  -- 1. Verify source message accessibility
  select id, conversation_id, content, message_type, deleted_at
  into v_src_msg
  from public.messages
  where id = p_message_id;

  if v_src_msg.id is null or not public.is_conversation_member(v_src_msg.conversation_id, v_actor_id) then
    raise exception 'INVALID_FORWARD_SOURCE';
  end if;

  if v_src_msg.deleted_at is not null then
    raise exception 'CANNOT_FORWARD_DELETED_MESSAGE';
  end if;

  -- 2. Verify target conversation membership
  if not public.is_conversation_member(p_target_conversation_id, v_actor_id) then
    raise exception 'CONVERSATION_ACCESS_DENIED';
  end if;

  select id, type into v_target_conv
  from public.conversations
  where id = p_target_conversation_id;

  if v_target_conv.id is null then
    raise exception 'CONVERSATION_NOT_FOUND';
  end if;

  -- 3. If target conversation is direct, check blocking and privacy
  if v_target_conv.type = 'direct' then
    select user_id into v_other_member_id
    from public.conversation_members
    where conversation_id = p_target_conversation_id
      and user_id <> v_actor_id
    limit 1;

    if v_other_member_id is not null then
      if public.is_user_blocked(v_actor_id, v_other_member_id) then
        raise exception 'MESSAGE_BLOCKED';
      end if;
      if not public.can_send_message(v_actor_id, v_other_member_id) then
        raise exception 'PRIVACY_RESTRICTED';
      end if;
    end if;
  end if;

  -- 4. Check idempotency
  if p_client_message_id is not null then
    select * into v_existing_msg
    from public.messages
    where sender_id = v_actor_id and client_message_id = p_client_message_id;

    if v_existing_msg.id is not null then
      return jsonb_build_object(
        'success', true,
        'messageId', v_existing_msg.id,
        'conversationId', v_existing_msg.conversation_id,
        'forwardedFromMessageId', v_existing_msg.forwarded_from_message_id,
        'duplicate', true
      );
    end if;
  end if;

  -- 5. Insert forwarded message
  insert into public.messages (
    conversation_id,
    sender_id,
    content,
    message_type,
    forwarded_from_message_id,
    client_message_id
  ) values (
    p_target_conversation_id,
    v_actor_id,
    v_src_msg.content,
    v_src_msg.message_type,
    p_message_id,
    p_client_message_id
  )
  returning * into v_new_msg;

  -- 6. Update target conversation updated_at and unread counts
  update public.conversations
  set updated_at = timezone('utc'::text, now())
  where id = p_target_conversation_id;

  insert into public.conversation_user_states (user_id, conversation_id, unread_count, is_marked_unread)
  select cm.user_id, p_target_conversation_id, 1, false
  from public.conversation_members cm
  where cm.conversation_id = p_target_conversation_id and cm.user_id <> v_actor_id
  on conflict (user_id, conversation_id)
  do update set 
    unread_count = public.conversation_user_states.unread_count + 1,
    is_marked_unread = false;

  return jsonb_build_object(
    'success', true,
    'messageId', v_new_msg.id,
    'conversationId', v_new_msg.conversation_id,
    'forwardedFromMessageId', p_message_id,
    'duplicate', false
  );
end;
$$ language plpgsql security definer;

-- 4.6 Pin & Unpin Message RPCs
create or replace function public.pin_message(p_message_id uuid)
returns jsonb as $$
declare
  v_actor_id uuid;
  v_conv_id uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select conversation_id into v_conv_id
  from public.messages
  where id = p_message_id;

  if v_conv_id is null or not public.is_conversation_member(v_conv_id, v_actor_id) then
    raise exception 'MESSAGE_ACCESS_DENIED';
  end if;

  insert into public.message_pins (conversation_id, message_id, pinned_by, pinned_at)
  values (v_conv_id, p_message_id, v_actor_id, timezone('utc'::text, now()))
  on conflict (conversation_id, message_id) do nothing;

  return jsonb_build_object('success', true, 'pinned', true);
end;
$$ language plpgsql security definer;

create or replace function public.unpin_message(p_message_id uuid)
returns jsonb as $$
declare
  v_actor_id uuid;
  v_conv_id uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select conversation_id into v_conv_id
  from public.messages
  where id = p_message_id;

  if v_conv_id is null or not public.is_conversation_member(v_conv_id, v_actor_id) then
    raise exception 'MESSAGE_ACCESS_DENIED';
  end if;

  delete from public.message_pins
  where conversation_id = v_conv_id and message_id = p_message_id;

  return jsonb_build_object('success', true, 'pinned', false);
end;
$$ language plpgsql security definer;

-- 4.7 Toggle Reaction RPC
create or replace function public.toggle_message_reaction(
  p_message_id uuid,
  p_reaction text
)
returns jsonb as $$
declare
  v_actor_id uuid;
  v_conv_id uuid;
  v_existing_id uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select conversation_id into v_conv_id
  from public.messages
  where id = p_message_id;

  if v_conv_id is null or not public.is_conversation_member(v_conv_id, v_actor_id) then
    raise exception 'MESSAGE_ACCESS_DENIED';
  end if;

  select id into v_existing_id
  from public.message_reactions
  where message_id = p_message_id
    and user_id = v_actor_id
    and reaction = p_reaction;

  if v_existing_id is not null then
    delete from public.message_reactions where id = v_existing_id;
    return jsonb_build_object('success', true, 'added', false, 'reaction', p_reaction);
  else
    insert into public.message_reactions (message_id, user_id, reaction)
    values (p_message_id, v_actor_id, p_reaction);
    return jsonb_build_object('success', true, 'added', true, 'reaction', p_reaction);
  end if;
end;
$$ language plpgsql security definer;

-- 4.8 Delivery State RPC
create or replace function public.mark_message_delivered(p_message_id uuid)
returns jsonb as $$
declare
  v_actor_id uuid;
  v_conv_id uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select conversation_id into v_conv_id
  from public.messages
  where id = p_message_id;

  if v_conv_id is null or not public.is_conversation_member(v_conv_id, v_actor_id) then
    raise exception 'MESSAGE_ACCESS_DENIED';
  end if;

  insert into public.message_delivery_states (message_id, user_id, delivered_at)
  values (p_message_id, v_actor_id, timezone('utc'::text, now()))
  on conflict (message_id, user_id) do nothing;

  return jsonb_build_object('success', true);
end;
$$ language plpgsql security definer;

-- 4.9 Read State & Unread Engine RPCs
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns jsonb as $$
declare
  v_actor_id uuid;
  v_last_msg_id uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if not public.is_conversation_member(p_conversation_id, v_actor_id) then
    raise exception 'CONVERSATION_ACCESS_DENIED';
  end if;

  -- Get latest message in conversation
  select id into v_last_msg_id
  from public.messages
  where conversation_id = p_conversation_id
  order by created_at desc
  limit 1;

  -- Record message reads for unread incoming messages
  insert into public.message_reads (message_id, user_id, read_at)
  select m.id, v_actor_id, timezone('utc'::text, now())
  from public.messages m
  where m.conversation_id = p_conversation_id
    and m.sender_id <> v_actor_id
    and not exists (
      select 1 from public.message_reads mr
      where mr.message_id = m.id and mr.user_id = v_actor_id
    )
  on conflict (message_id, user_id) do nothing;

  -- Update conversation_user_states
  insert into public.conversation_user_states (
    user_id,
    conversation_id,
    last_read_message_id,
    last_read_at,
    unread_count,
    is_marked_unread
  ) values (
    v_actor_id,
    p_conversation_id,
    v_last_msg_id,
    timezone('utc'::text, now()),
    0,
    false
  )
  on conflict (user_id, conversation_id)
  do update set 
    last_read_message_id = excluded.last_read_message_id,
    last_read_at = excluded.last_read_at,
    unread_count = 0,
    is_marked_unread = false;

  return jsonb_build_object('success', true, 'unreadCount', 0);
end;
$$ language plpgsql security definer;

create or replace function public.mark_conversation_unread(p_conversation_id uuid)
returns jsonb as $$
declare
  v_actor_id uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if not public.is_conversation_member(p_conversation_id, v_actor_id) then
    raise exception 'CONVERSATION_ACCESS_DENIED';
  end if;

  insert into public.conversation_user_states (
    user_id,
    conversation_id,
    is_marked_unread,
    unread_count
  ) values (
    v_actor_id,
    p_conversation_id,
    true,
    1
  )
  on conflict (user_id, conversation_id)
  do update set 
    is_marked_unread = true,
    unread_count = greatest(public.conversation_user_states.unread_count, 1);

  return jsonb_build_object('success', true, 'isMarkedUnread', true);
end;
$$ language plpgsql security definer;

-- 4.10 Drafts RPCs
create or replace function public.save_draft(
  p_conversation_id uuid,
  p_content text,
  p_reply_to_message_id uuid default null
)
returns jsonb as $$
declare
  v_actor_id uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if not public.is_conversation_member(p_conversation_id, v_actor_id) then
    raise exception 'CONVERSATION_ACCESS_DENIED';
  end if;

  if p_content is null or length(trim(p_content)) = 0 then
    delete from public.conversation_drafts
    where user_id = v_actor_id and conversation_id = p_conversation_id;
    return jsonb_build_object('success', true, 'deleted', true);
  end if;

  insert into public.conversation_drafts (
    user_id,
    conversation_id,
    content,
    reply_to_message_id,
    updated_at
  ) values (
    v_actor_id,
    p_conversation_id,
    p_content,
    p_reply_to_message_id,
    timezone('utc'::text, now())
  )
  on conflict (user_id, conversation_id)
  do update set 
    content = excluded.content,
    reply_to_message_id = excluded.reply_to_message_id,
    updated_at = excluded.updated_at;

  return jsonb_build_object('success', true, 'saved', true);
end;
$$ language plpgsql security definer;

create or replace function public.delete_draft(p_conversation_id uuid)
returns jsonb as $$
declare
  v_actor_id uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  delete from public.conversation_drafts
  where user_id = v_actor_id and conversation_id = p_conversation_id;

  return jsonb_build_object('success', true, 'deleted', true);
end;
$$ language plpgsql security definer;
