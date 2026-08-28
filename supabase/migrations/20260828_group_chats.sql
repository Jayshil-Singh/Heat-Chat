-- ==============================================================================
-- HEAT CHAT — PHASE 7: GROUP CHATS MIGRATION
-- ==============================================================================

-- 1. UPDATE ROLE CONSTRAINT ON CONVERSATION_MEMBERS
-- Drop existing check constraint if any and re-add to support 'owner', 'admin', 'member'
do $$
begin
  alter table public.conversation_members
    drop constraint if exists conversation_members_role_check;
  
  alter table public.conversation_members
    add constraint conversation_members_role_check
    check (role in ('owner', 'admin', 'member'));
exception
  when others then null;
end $$;

-- 2. PERFORMANCE INDEXES
create index if not exists conv_members_user_conv_idx 
  on public.conversation_members(user_id, conversation_id);

create index if not exists conv_members_conv_user_idx 
  on public.conversation_members(conversation_id, user_id);

-- 3. UPDATED AND NEW AUTHORIZATION HELPER FUNCTIONS
create or replace function public.is_conversation_admin(conv_id uuid, check_user_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 
    from public.conversation_members
    where conversation_id = conv_id
      and user_id = check_user_id
      and role in ('owner', 'admin')
  );
end;
$$ language plpgsql security definer stable;

create or replace function public.is_conversation_owner(conv_id uuid, check_user_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 
    from public.conversation_members
    where conversation_id = conv_id
      and user_id = check_user_id
      and role = 'owner'
  );
end;
$$ language plpgsql security definer stable;

create or replace function public.get_conversation_role(conv_id uuid, check_user_id uuid)
returns text as $$
declare
  v_role text;
begin
  select role into v_role
  from public.conversation_members
  where conversation_id = conv_id
    and user_id = check_user_id;
  return v_role;
end;
$$ language plpgsql security definer stable;

-- 4. RPC: CREATE GROUP CONVERSATION
create or replace function public.create_group_conversation(
  group_name text,
  member_user_ids uuid[],
  group_avatar_url text default null
)
returns uuid as $$
declare
  v_caller_id uuid;
  v_conv_id uuid;
  v_trimmed_name text;
  v_member_id uuid;
  v_valid_friends uuid[];
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  v_trimmed_name := trim(group_name);
  if length(v_trimmed_name) < 1 or length(v_trimmed_name) > 100 then
    raise exception 'Group name must be between 1 and 100 characters';
  end if;

  -- Filter member_user_ids: deduplicate, exclude caller
  select array_agg(distinct uid)
  into v_valid_friends
  from unnest(member_user_ids) as uid
  where uid is not null and uid <> v_caller_id;

  if v_valid_friends is null or array_length(v_valid_friends, 1) = 0 then
    raise exception 'At least one friend must be selected to create a group';
  end if;

  -- Verify each invited friend has an accepted friendship with the caller
  foreach v_member_id in array v_valid_friends loop
    if not exists (
      select 1 from public.friendships
      where status = 'accepted'
        and ((user_id = v_caller_id and friend_id = v_member_id) or (user_id = v_member_id and friend_id = v_caller_id))
    ) then
      raise exception 'User % is not an accepted friend of the creator', v_member_id;
    end if;
  end loop;

  -- Create conversation
  insert into public.conversations (
    type,
    name,
    avatar_url,
    created_by
  ) values (
    'group',
    v_trimmed_name,
    group_avatar_url,
    v_caller_id
  ) returning id into v_conv_id;

  -- Add caller as owner
  insert into public.conversation_members (
    conversation_id,
    user_id,
    role
  ) values (
    v_conv_id,
    v_caller_id,
    'owner'
  );

  -- Add friends as regular members
  foreach v_member_id in array v_valid_friends loop
    insert into public.conversation_members (
      conversation_id,
      user_id,
      role
    ) values (
      v_conv_id,
      v_member_id,
      'member'
    );
  end loop;

  return v_conv_id;
end;
$$ language plpgsql security definer;

-- 5. RPC: ADD GROUP MEMBERS
create or replace function public.add_group_members(
  conv_id uuid,
  new_user_ids uuid[]
)
returns void as $$
declare
  v_caller_id uuid;
  v_conv_type text;
  v_user_id uuid;
  v_valid_users uuid[];
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select type into v_conv_type from public.conversations where id = conv_id;
  if v_conv_type is null or v_conv_type <> 'group' then
    raise exception 'Group conversation not found';
  end if;

  if not public.is_conversation_admin(conv_id, v_caller_id) then
    raise exception 'Only group owners and admins can add members';
  end if;

  select array_agg(distinct uid)
  into v_valid_users
  from unnest(new_user_ids) as uid
  where uid is not null and uid <> v_caller_id;

  if v_valid_users is null or array_length(v_valid_users, 1) = 0 then
    raise exception 'No valid users provided';
  end if;

  foreach v_user_id in array v_valid_users loop
    -- Verify friendship rule
    if not exists (
      select 1 from public.friendships
      where status = 'accepted'
        and ((user_id = v_caller_id and friend_id = v_user_id) or (user_id = v_user_id and friend_id = v_caller_id))
    ) then
      raise exception 'User % is not an accepted friend', v_user_id;
    end if;

    -- Avoid duplicate membership
    if exists (
      select 1 from public.conversation_members
      where conversation_id = conv_id and user_id = v_user_id
    ) then
      continue;
    end if;

    insert into public.conversation_members (
      conversation_id,
      user_id,
      role
    ) values (
      conv_id,
      v_user_id,
      'member'
    );
  end loop;
end;
$$ language plpgsql security definer;

-- 6. RPC: REMOVE GROUP MEMBER
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

  if v_caller_id = target_user_id then
    if v_caller_role = 'owner' then
      raise exception 'Owner cannot remove themselves. Transfer ownership or use leave_group';
    end if;
    delete from public.conversation_members where conversation_id = conv_id and user_id = target_user_id;
    return;
  end if;

  if v_caller_role = 'owner' then
    delete from public.conversation_members where conversation_id = conv_id and user_id = target_user_id;
    return;
  elsif v_caller_role = 'admin' then
    if v_target_role = 'owner' then
      raise exception 'Admins cannot remove the group owner';
    elsif v_target_role = 'admin' then
      raise exception 'Admins cannot remove other admins';
    else
      delete from public.conversation_members where conversation_id = conv_id and user_id = target_user_id;
      return;
    end if;
  else
    raise exception 'Regular members cannot remove other members';
  end if;
end;
$$ language plpgsql security definer;

-- 7. RPC: UPDATE GROUP MEMBER ROLE (INCL. ATOMIC OWNERSHIP TRANSFER)
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

  if new_role not in ('owner', 'admin', 'member') then
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

-- 8. RPC: UPDATE GROUP DETAILS
create or replace function public.update_group_details(
  conv_id uuid,
  new_name text,
  new_avatar_url text default null
)
returns void as $$
declare
  v_caller_id uuid;
  v_conv_type text;
  v_trimmed_name text;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select type into v_conv_type from public.conversations where id = conv_id;
  if v_conv_type is null or v_conv_type <> 'group' then
    raise exception 'Group conversation not found';
  end if;

  if not public.is_conversation_admin(conv_id, v_caller_id) then
    raise exception 'Only group owners and admins can update group details';
  end if;

  v_trimmed_name := trim(new_name);
  if length(v_trimmed_name) < 1 or length(v_trimmed_name) > 100 then
    raise exception 'Group name must be between 1 and 100 characters';
  end if;

  update public.conversations
  set name = v_trimmed_name,
      avatar_url = coalesce(new_avatar_url, avatar_url),
      updated_at = timezone('utc'::text, now())
  where id = conv_id;
end;
$$ language plpgsql security definer;

-- 9. RPC: LEAVE GROUP
create or replace function public.leave_group(conv_id uuid)
returns void as $$
declare
  v_caller_id uuid;
  v_caller_role text;
  v_conv_type text;
  v_member_count int;
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
    raise exception 'You are not a member of this group';
  end if;

  select count(*) into v_member_count from public.conversation_members where conversation_id = conv_id;

  if v_caller_role = 'owner' then
    if v_member_count > 1 then
      raise exception 'Owner cannot leave group without transferring ownership first';
    else
      -- Sole member was owner, delete conversation
      delete from public.conversations where id = conv_id;
      return;
    end if;
  end if;

  delete from public.conversation_members where conversation_id = conv_id and user_id = v_caller_id;
end;
$$ language plpgsql security definer;

-- 10. REALTIME PUBLICATION FOR CONVERSATION_MEMBERS
do $$
begin
  alter publication supabase_realtime add table public.conversation_members;
exception
  when duplicate_object then null;
  when others then null;
end $$;
