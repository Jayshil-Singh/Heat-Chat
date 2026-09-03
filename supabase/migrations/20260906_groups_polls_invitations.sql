-- ==============================================================================
-- HEAT CHAT — PHASE 6: GROUPS, ROLES, PERMISSIONS, INVITATIONS & POLLS
-- Migration: 20260906_groups_polls_invitations.sql
-- ==============================================================================

-- 1. EXTEND CONVERSATIONS TABLE WITH GROUP METADATA
alter table public.conversations
  add column if not exists description text,
  add column if not exists cover_url text,
  add column if not exists privacy text default 'private' check (privacy in ('public', 'private')),
  add column if not exists permissions jsonb default '{
    "who_can_add_members": "anyone",
    "who_can_send_messages": "anyone",
    "who_can_pin_messages": "admin_only",
    "who_can_create_polls": "anyone",
    "who_can_invite": "anyone"
  }'::jsonb;

-- 2. EXTEND ROLE CONSTRAINT ON CONVERSATION_MEMBERS
do $$
begin
  alter table public.conversation_members
    drop constraint if exists conversation_members_role_check;
  
  alter table public.conversation_members
    add constraint conversation_members_role_check
    check (role in ('owner', 'admin', 'moderator', 'member'));
exception
  when others then null;
end $$;

-- 3. CREATE GROUP INVITATIONS TABLE
create table if not exists public.group_invitations (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  expires_at timestamptz not null default (timezone('utc'::text, now()) + interval '7 days'),
  responded_at timestamptz,
  constraint unique_pending_group_invitation unique (conversation_id, invitee_id, status)
);

create index if not exists idx_group_invitations_invitee on public.group_invitations(invitee_id, status);
create index if not exists idx_group_invitations_conv on public.group_invitations(conversation_id, status);

alter table public.group_invitations enable row level security;

-- Invitations RLS:
-- Inviter and Invitee and Group Admins can view invitations
create policy "Members and invitees can view group invitations"
  on public.group_invitations for select
  to authenticated
  using (
    invitee_id = auth.uid()
    or inviter_id = auth.uid()
    or public.is_conversation_member(conversation_id, auth.uid())
  );

create policy "Authorized members can create group invitations"
  on public.group_invitations for insert
  to authenticated
  with check (
    inviter_id = auth.uid()
    and public.is_conversation_member(conversation_id, auth.uid())
  );

create policy "Invitee or Inviter can update invitation status"
  on public.group_invitations for update
  to authenticated
  using (
    invitee_id = auth.uid()
    or inviter_id = auth.uid()
    or public.is_conversation_admin(conversation_id, auth.uid())
  );

-- 4. CREATE GROUP INVITE LINKS TABLE
create table if not exists public.group_invite_links (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  token text not null unique,
  created_by uuid not null references public.profiles(id) on delete cascade,
  max_uses int default null,
  uses_count int not null default 0,
  is_revoked boolean not null default false,
  expires_at timestamptz default null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_group_invite_links_token on public.group_invite_links(token) where not is_revoked;
create index if not exists idx_group_invite_links_conv on public.group_invite_links(conversation_id);

alter table public.group_invite_links enable row level security;

create policy "Group members can view invite links"
  on public.group_invite_links for select
  to authenticated
  using (
    public.is_conversation_member(conversation_id, auth.uid())
  );

create policy "Group admins can create invite links"
  on public.group_invite_links for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and public.is_conversation_admin(conversation_id, auth.uid())
  );

create policy "Group admins can update invite links"
  on public.group_invite_links for update
  to authenticated
  using (
    public.is_conversation_admin(conversation_id, auth.uid())
  );

-- 5. CREATE POLLS TABLE
create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  question text not null,
  is_multiple_choice boolean not null default false,
  is_anonymous boolean not null default false,
  allow_vote_change boolean not null default true,
  is_closed boolean not null default false,
  closed_at timestamptz default null,
  closed_by uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_polls_conv on public.polls(conversation_id, created_at desc);
create index if not exists idx_polls_msg on public.polls(message_id);

alter table public.polls enable row level security;

create policy "Conversation members can view polls"
  on public.polls for select
  to authenticated
  using (public.is_conversation_member(conversation_id, auth.uid()));

create policy "Conversation members can create polls"
  on public.polls for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and public.is_conversation_member(conversation_id, auth.uid())
  );

create policy "Creator or admin can update polls"
  on public.polls for update
  to authenticated
  using (
    created_by = auth.uid()
    or public.is_conversation_admin(conversation_id, auth.uid())
  );

-- 6. CREATE POLL OPTIONS TABLE
create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_text text not null,
  position int not null default 0,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_poll_options_poll on public.poll_options(poll_id, position asc);

alter table public.poll_options enable row level security;

create policy "Users can view poll options for authorized polls"
  on public.poll_options for select
  to authenticated
  using (
    exists (
      select 1 from public.polls p
      where p.id = poll_id and public.is_conversation_member(p.conversation_id, auth.uid())
    )
  );

create policy "Creator can insert poll options"
  on public.poll_options for insert
  to authenticated
  with check (
    exists (
      select 1 from public.polls p
      where p.id = poll_id and p.created_by = auth.uid()
    )
  );

-- 7. CREATE POLL VOTES TABLE
create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_id uuid not null references public.poll_options(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint unique_poll_user_option_vote unique (poll_id, option_id, user_id)
);

create index if not exists idx_poll_votes_poll on public.poll_votes(poll_id);
create index if not exists idx_poll_votes_user on public.poll_votes(user_id);

alter table public.poll_votes enable row level security;

create policy "Users can view poll votes for authorized polls"
  on public.poll_votes for select
  to authenticated
  using (
    exists (
      select 1 from public.polls p
      where p.id = poll_id and public.is_conversation_member(p.conversation_id, auth.uid())
    )
  );

create policy "Users can insert their own vote"
  on public.poll_votes for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.polls p
      where p.id = poll_id
        and not p.is_closed
        and public.is_conversation_member(p.conversation_id, auth.uid())
    )
  );

create policy "Users can delete their own vote"
  on public.poll_votes for delete
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.polls p
      where p.id = poll_id
        and not p.is_closed
        and p.allow_vote_change
    )
  );

-- 8. HELPER FUNCTIONS: ROLE & MODERATION CHECKS
create or replace function public.is_conversation_moderator(conv_id uuid, check_user_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 
    from public.conversation_members
    where conversation_id = conv_id
      and user_id = check_user_id
      and role in ('owner', 'admin', 'moderator')
  );
end;
$$ language plpgsql security definer stable;

-- 9. ATOMIC RPC: CREATE POLL WITH OPTIONS
create or replace function public.create_poll(
  p_conversation_id uuid,
  p_question text,
  p_options text[],
  p_is_multiple_choice boolean default false,
  p_is_anonymous boolean default false,
  p_allow_vote_change boolean default true
)
returns uuid as $$
declare
  v_caller_id uuid;
  v_conv_type text;
  v_poll_id uuid;
  v_msg_id uuid;
  v_trimmed_question text;
  v_opt_text text;
  v_pos int := 0;
  v_permissions jsonb;
  v_who_can_poll text;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select type, permissions into v_conv_type, v_permissions
  from public.conversations
  where id = p_conversation_id;

  if v_conv_type is null or v_conv_type <> 'group' then
    raise exception 'Group conversation not found';
  end if;

  if not public.is_conversation_member(p_conversation_id, v_caller_id) then
    raise exception 'You are not a member of this group';
  end if;

  -- Permission check
  v_who_can_poll := coalesce(v_permissions->>'who_can_create_polls', 'anyone');
  if v_who_can_poll = 'admin_only' and not public.is_conversation_admin(p_conversation_id, v_caller_id) then
    raise exception 'Only admins can create polls in this group';
  end if;

  v_trimmed_question := trim(p_question);
  if length(v_trimmed_question) < 1 or length(v_trimmed_question) > 300 then
    raise exception 'Poll question must be between 1 and 300 characters';
  end if;

  if p_options is null or array_length(p_options, 1) < 2 or array_length(p_options, 1) > 10 then
    raise exception 'Poll must have between 2 and 10 options';
  end if;

  -- 1. Create Poll Message in Chat
  insert into public.messages (
    conversation_id,
    sender_id,
    content,
    message_type
  ) values (
    p_conversation_id,
    v_caller_id,
    '📊 ' || v_trimmed_question,
    'poll'
  ) returning id into v_msg_id;

  -- 2. Create Poll Record
  insert into public.polls (
    conversation_id,
    message_id,
    question,
    is_multiple_choice,
    is_anonymous,
    allow_vote_change,
    created_by
  ) values (
    p_conversation_id,
    v_msg_id,
    v_trimmed_question,
    p_is_multiple_choice,
    p_is_anonymous,
    p_allow_vote_change,
    v_caller_id
  ) returning id into v_poll_id;

  -- 3. Insert Options
  foreach v_opt_text in array p_options loop
    if length(trim(v_opt_text)) > 0 then
      insert into public.poll_options (
        poll_id,
        option_text,
        position
      ) values (
        v_poll_id,
        trim(v_opt_text),
        v_pos
      );
      v_pos := v_pos + 1;
    end if;
  end loop;

  return v_poll_id;
end;
$$ language plpgsql security definer;

-- 10. ATOMIC RPC: VOTE ON POLL
create or replace function public.vote_poll(
  p_poll_id uuid,
  p_option_ids uuid[]
)
returns void as $$
declare
  v_caller_id uuid;
  v_conv_id uuid;
  v_is_closed boolean;
  v_is_multi boolean;
  v_allow_change boolean;
  v_opt_id uuid;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select conversation_id, is_closed, is_multiple_choice, allow_vote_change
  into v_conv_id, v_is_closed, v_is_multi, v_allow_change
  from public.polls
  where id = p_poll_id;

  if v_conv_id is null then
    raise exception 'Poll not found';
  end if;

  if v_is_closed then
    raise exception 'Poll is closed';
  end if;

  if not public.is_conversation_member(v_conv_id, v_caller_id) then
    raise exception 'You are not a member of this conversation';
  end if;

  if p_option_ids is null or array_length(p_option_ids, 1) = 0 then
    -- Clearing all votes
    if not v_allow_change then
      raise exception 'Vote changes are not allowed for this poll';
    end if;
    delete from public.poll_votes where poll_id = p_poll_id and user_id = v_caller_id;
    return;
  end if;

  if not v_is_multi and array_length(p_option_ids, 1) > 1 then
    raise exception 'Only single option selection allowed for this poll';
  end if;

  -- Verify all options belong to this poll
  foreach v_opt_id in array p_option_ids loop
    if not exists (select 1 from public.poll_options where id = v_opt_id and poll_id = p_poll_id) then
      raise exception 'Invalid option ID % for this poll', v_opt_id;
    end if;
  end loop;

  -- Clear existing votes for user on this poll
  delete from public.poll_votes where poll_id = p_poll_id and user_id = v_caller_id;

  -- Insert new votes
  foreach v_opt_id in array p_option_ids loop
    insert into public.poll_votes (
      poll_id,
      option_id,
      user_id
    ) values (
      p_poll_id,
      v_opt_id,
      v_caller_id
    );
  end loop;
end;
$$ language plpgsql security definer;

-- 11. ATOMIC RPC: CLOSE POLL
create or replace function public.close_poll(p_poll_id uuid)
returns void as $$
declare
  v_caller_id uuid;
  v_conv_id uuid;
  v_creator_id uuid;
  v_is_closed boolean;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select conversation_id, created_by, is_closed
  into v_conv_id, v_creator_id, v_is_closed
  from public.polls
  where id = p_poll_id;

  if v_conv_id is null then
    raise exception 'Poll not found';
  end if;

  if v_is_closed then
    return;
  end if;

  -- Only creator or admin/owner can close poll
  if v_caller_id <> v_creator_id and not public.is_conversation_admin(v_conv_id, v_caller_id) then
    raise exception 'Only the poll creator or group admins can close this poll';
  end if;

  update public.polls
  set is_closed = true,
      closed_at = timezone('utc'::text, now()),
      closed_by = v_caller_id
  where id = p_poll_id;
end;
$$ language plpgsql security definer;

-- 12. ATOMIC RPC: JOIN GROUP VIA INVITE LINK
create or replace function public.join_group_via_invite_link(p_token text)
returns uuid as $$
declare
  v_caller_id uuid;
  v_conv_id uuid;
  v_link_id uuid;
  v_max_uses int;
  v_uses_count int;
  v_is_revoked boolean;
  v_expires_at timestamptz;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select id, conversation_id, max_uses, uses_count, is_revoked, expires_at
  into v_link_id, v_conv_id, v_max_uses, v_uses_count, v_is_revoked, v_expires_at
  from public.group_invite_links
  where token = p_token;

  if v_link_id is null or v_is_revoked then
    raise exception 'Invite link is invalid or has been revoked';
  end if;

  if v_expires_at is not null and v_expires_at < timezone('utc'::text, now()) then
    raise exception 'Invite link has expired';
  end if;

  if v_max_uses is not null and v_uses_count >= v_max_uses then
    raise exception 'Invite link has reached maximum allowed uses';
  end if;

  -- Check if user is already a member
  if exists (
    select 1 from public.conversation_members
    where conversation_id = v_conv_id and user_id = v_caller_id
  ) then
    return v_conv_id;
  end if;

  -- Add caller as regular member
  insert into public.conversation_members (
    conversation_id,
    user_id,
    role
  ) values (
    v_conv_id,
    v_caller_id,
    'member'
  );

  -- Increment use count
  update public.group_invite_links
  set uses_count = uses_count + 1
  where id = v_link_id;

  return v_conv_id;
end;
$$ language plpgsql security definer;

-- 13. ATOMIC RPC: DELETE GROUP CONVERSATION
create or replace function public.delete_group_conversation(p_conv_id uuid)
returns void as $$
declare
  v_caller_id uuid;
  v_conv_type text;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select type into v_conv_type from public.conversations where id = p_conv_id;
  if v_conv_type is null or v_conv_type <> 'group' then
    raise exception 'Group conversation not found';
  end if;

  if not public.is_conversation_owner(p_conv_id, v_caller_id) then
    raise exception 'Only the group owner can delete the group';
  end if;

  -- Cascade delete conversation and all associated artifacts cleanly
  delete from public.conversations where id = p_conv_id;
end;
$$ language plpgsql security definer;

-- 14. UPDATED RPC: UPDATE GROUP MEMBER ROLE (INCL MODERATOR & OWNER TRANSFER)
create or replace function public.update_group_member_role(
  conv_id uuid,
  target_user_id uuid,
  new_role text
)
returns void as $$
declare
  v_caller_id uuid;
  v_caller_role text;
  v_target_role text;
  v_conv_type text;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select type into v_conv_type from public.conversations where id = conv_id;
  if v_conv_type is null or v_conv_type <> 'group' then
    raise exception 'Group conversation not found';
  end if;

  select role into v_caller_role from public.conversation_members where conversation_id = conv_id and user_id = v_caller_id;
  if v_caller_role is null or v_caller_role <> 'owner' then
    raise exception 'Only the group owner can manage roles or transfer ownership';
  end if;

  if new_role not in ('owner', 'admin', 'moderator', 'member') then
    raise exception 'Invalid role: %', new_role;
  end if;

  select role into v_target_role from public.conversation_members where conversation_id = conv_id and user_id = target_user_id;
  if v_target_role is null then
    raise exception 'Target user is not a member of this group';
  end if;

  if new_role = 'owner' then
    if target_user_id = v_caller_id then
      return;
    end if;
    -- Atomic Ownership Transfer
    update public.conversation_members set role = 'owner' where conversation_id = conv_id and user_id = target_user_id;
    update public.conversation_members set role = 'admin' where conversation_id = conv_id and user_id = v_caller_id;
    update public.conversations set created_by = target_user_id where id = conv_id;
    return;
  else
    if target_user_id = v_caller_id then
      raise exception 'Owner cannot demote self without transferring ownership first';
    end if;
    update public.conversation_members set role = new_role where conversation_id = conv_id and user_id = target_user_id;
  end if;
end;
$$ language plpgsql security definer;

-- 15. UPDATED RPC: REMOVE GROUP MEMBER (WITH MODERATOR & ADMIN PROTECTION)
create or replace function public.remove_group_member(
  conv_id uuid,
  target_user_id uuid
)
returns void as $$
declare
  v_caller_id uuid;
  v_caller_role text;
  v_target_role text;
  v_conv_type text;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select type into v_conv_type from public.conversations where id = conv_id;
  if v_conv_type is null or v_conv_type <> 'group' then
    raise exception 'Group conversation not found';
  end if;

  select role into v_caller_role from public.conversation_members where conversation_id = conv_id and user_id = v_caller_id;
  if v_caller_role is null then
    raise exception 'Caller is not a member of this group';
  end if;

  select role into v_target_role from public.conversation_members where conversation_id = conv_id and user_id = target_user_id;
  if v_target_role is null then
    raise exception 'Target user is not a member of this group';
  end if;

  -- Self removal
  if v_caller_id = target_user_id then
    if v_caller_role = 'owner' then
      raise exception 'Owner cannot remove themselves. Transfer ownership or use leave_group';
    end if;
    delete from public.conversation_members where conversation_id = conv_id and user_id = target_user_id;
    return;
  end if;

  -- Role hierarchy checks
  if v_caller_role = 'owner' then
    delete from public.conversation_members where conversation_id = conv_id and user_id = target_user_id;
    return;
  elsif v_caller_role = 'admin' then
    if v_target_role in ('owner', 'admin') then
      raise exception 'Admins cannot remove other admins or the group owner';
    else
      delete from public.conversation_members where conversation_id = conv_id and user_id = target_user_id;
      return;
    end if;
  elsif v_caller_role = 'moderator' then
    if v_target_role in ('owner', 'admin', 'moderator') then
      raise exception 'Moderators cannot remove admins, owners, or other moderators';
    else
      delete from public.conversation_members where conversation_id = conv_id and user_id = target_user_id;
      return;
    end if;
  else
    raise exception 'Regular members cannot remove other members';
  end if;
end;
$$ language plpgsql security definer;

-- 16. REALTIME PUBLICATION REGISTRATION
do $$
begin
  alter publication supabase_realtime add table public.polls;
exception when duplicate_object then null; when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.poll_votes;
exception when duplicate_object then null; when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.group_invitations;
exception when duplicate_object then null; when others then null;
end $$;
