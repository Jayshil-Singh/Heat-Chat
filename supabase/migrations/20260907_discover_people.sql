-- ==============================================================================
-- HEAT CHAT — PHASE 11: DISCOVER PEOPLE, FRIEND REQUESTS & SOCIAL DISCOVERY
-- Migration: 20260907_discover_people.sql
-- Description:
--   1. Creates public.discovery_preferences (opt-in, default false)
--   2. Creates public.friend_requests with canonical anti-duplicate pending index
--   3. Relaxes public.notifications(conversation_id) to be nullable for social notifications
--   4. Creates atomic Security-Definer RPCs for discoverability, discovery search,
--      friend request lifecycle (send, accept, decline/reject, cancel),
--      and friendship integration with public.friendships.
-- ==============================================================================

-- 1. DISCOVERY PREFERENCES TABLE
-- ------------------------------------------------------------------------------
create table if not exists public.discovery_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  discoverable boolean not null default false,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists discovery_preferences_discoverable_idx
  on public.discovery_preferences(discoverable)
  where discoverable = true;

create index if not exists discovery_preferences_updated_at_idx
  on public.discovery_preferences(updated_at);

alter table public.discovery_preferences enable row level security;

-- Drop old policies to ensure idempotent migration
drop policy if exists "Users can view own discovery preference" on public.discovery_preferences;
create policy "Users can view own discovery preference"
  on public.discovery_preferences for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can insert own discovery preference" on public.discovery_preferences;
create policy "Users can insert own discovery preference"
  on public.discovery_preferences for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update own discovery preference" on public.discovery_preferences;
create policy "Users can update own discovery preference"
  on public.discovery_preferences for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Optional compatibility view for discoverable_profiles
create or replace view public.discoverable_profiles as
  select user_id, discoverable, updated_at
  from public.discovery_preferences;

-- 2. FRIEND REQUESTS TABLE
-- ------------------------------------------------------------------------------
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  responded_at timestamptz,
  constraint friend_requests_no_self_request
    check (sender_id <> recipient_id),
  constraint friend_requests_valid_status
    check (status in ('pending', 'accepted', 'rejected', 'declined', 'cancelled'))
);

create index if not exists friend_requests_sender_idx
  on public.friend_requests(sender_id, status);

create index if not exists friend_requests_recipient_idx
  on public.friend_requests(recipient_id, status);

create index if not exists friend_requests_created_at_idx
  on public.friend_requests(created_at desc);

-- Canonical unordered pair partial unique index:
-- Guarantees that neither (A->B) nor (B->A) can simultaneously exist in 'pending' status!
create unique index if not exists friend_requests_pending_canonical_idx
  on public.friend_requests(least(sender_id, recipient_id), greatest(sender_id, recipient_id))
  where status = 'pending';

alter table public.friend_requests enable row level security;

drop policy if exists "Users can view own friend requests" on public.friend_requests;
create policy "Users can view own friend requests"
  on public.friend_requests for select
  to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());

drop policy if exists "Users can insert own friend requests" on public.friend_requests;
create policy "Users can insert own friend requests"
  on public.friend_requests for insert
  to authenticated
  with check (sender_id = auth.uid());

drop policy if exists "Users can update own friend requests" on public.friend_requests;
create policy "Users can update own friend requests"
  on public.friend_requests for update
  to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid())
  with check (sender_id = auth.uid() or recipient_id = auth.uid());

-- 3. NOTIFICATIONS SCHEMA RELAXATION (Social notifications without conversation)
-- ------------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'conversation_id'
      and is_nullable = 'NO'
  ) then
    alter table public.notifications alter column conversation_id drop not null;
  end if;
end $$;

-- 4. DISCOVERABILITY RPCS
-- ------------------------------------------------------------------------------

-- Set discoverability (upsert)
create or replace function public.set_discoverability(enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id uuid;
  v_val boolean;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  v_val := coalesce(enabled, false);

  insert into public.discovery_preferences (user_id, discoverable, updated_at)
  values (v_caller_id, v_val, timezone('utc'::text, now()))
  on conflict (user_id)
  do update set
    discoverable = excluded.discoverable,
    updated_at = timezone('utc'::text, now());

  return v_val;
end;
$$;

revoke all on function public.set_discoverability(boolean) from public;
grant execute on function public.set_discoverability(boolean) to authenticated;

-- Get my discoverability
create or replace function public.get_my_discoverability()
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select discoverable
      from public.discovery_preferences
      where user_id = auth.uid()
    ),
    false
  );
$$;

revoke all on function public.get_my_discoverability() from public;
grant execute on function public.get_my_discoverability() to authenticated;

-- 5. DISCOVER PEOPLE RPC
-- ------------------------------------------------------------------------------
create or replace function public.discover_people(
  search_query text default null,
  result_limit integer default 20,
  result_offset integer default 0
)
returns table (
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  bio text,
  mutual_friend_count integer,
  relationship_status text,
  pending_request_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id uuid;
  v_limit int;
  v_offset int;
  v_clean_query text;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  -- Clamp pagination parameters
  v_limit := greatest(1, least(coalesce(result_limit, 20), 50));
  v_offset := greatest(0, coalesce(result_offset, 0));

  -- Sanitize and normalize search query
  if search_query is not null then
    v_clean_query := trim(search_query);
    if length(v_clean_query) > 100 then
      v_clean_query := substr(v_clean_query, 1, 100);
    end if;
    -- Escape like wildcards for safety
    v_clean_query := replace(replace(v_clean_query, '%', '\%'), '_', '\_');
    if length(v_clean_query) < 2 then
      v_clean_query := null;
    end if;
  else
    v_clean_query := null;
  end if;

  return query
  select
    p.id as user_id,
    p.display_name,
    p.username,
    p.avatar_url,
    p.bio,
    -- Mutual friends calculation with caller
    (
      select count(distinct f1.friend_id)::integer
      from (
        select case when user_id = v_caller_id then friend_id else user_id end as friend_id
        from public.friendships
        where (user_id = v_caller_id or friend_id = v_caller_id)
          and status = 'accepted'
      ) f1
      inner join (
        select case when user_id = p.id then friend_id else user_id end as friend_id
        from public.friendships
        where (user_id = p.id or friend_id = p.id)
          and status = 'accepted'
      ) f2 on f1.friend_id = f2.friend_id
    ) as mutual_friend_count,
    -- Server-side relationship status calculation
    (
      case
        -- 1. Accepted friends in existing friendships table
        when exists (
          select 1 from public.friendships f
          where ((f.user_id = v_caller_id and f.friend_id = p.id)
             or  (f.friend_id = v_caller_id and f.user_id = p.id))
            and f.status = 'accepted'
        ) then 'friends'
        -- 2. Outgoing pending request in friend_requests
        when exists (
          select 1 from public.friend_requests fr
          where fr.sender_id = v_caller_id and fr.recipient_id = p.id and fr.status = 'pending'
        ) then 'outgoing_pending'
        -- 3. Incoming pending request in friend_requests
        when exists (
          select 1 from public.friend_requests fr
          where fr.sender_id = p.id and fr.recipient_id = v_caller_id and fr.status = 'pending'
        ) then 'incoming_pending'
        -- 4. None
        else 'none'
      end
    ) as relationship_status,
    -- Pending request ID if exists
    (
      select fr.id
      from public.friend_requests fr
      where ((fr.sender_id = v_caller_id and fr.recipient_id = p.id)
          or (fr.sender_id = p.id and fr.recipient_id = v_caller_id))
        and fr.status = 'pending'
      limit 1
    ) as pending_request_id
  from public.profiles p
  inner join public.discovery_preferences dp on dp.user_id = p.id
  where dp.discoverable = true
    and p.id <> v_caller_id
    -- Exclude blocked users in either direction
    and not public.is_user_blocked(v_caller_id, p.id)
    and not public.is_user_blocked(p.id, v_caller_id)
    -- Apply search query if specified
    and (
      v_clean_query is null
      or p.display_name ilike '%' || v_clean_query || '%'
      or p.username ilike '%' || v_clean_query || '%'
      or coalesce(p.bio, '') ilike '%' || v_clean_query || '%'
    )
  order by p.display_name asc, p.id asc
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.discover_people(text, integer, integer) from public;
grant execute on function public.discover_people(text, integer, integer) to authenticated;

-- 6. SEND FRIEND REQUEST RPC
-- ------------------------------------------------------------------------------
create or replace function public.send_friend_request(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id uuid;
  v_target_discoverable boolean;
  v_existing_reverse record;
  v_existing_outgoing record;
  v_existing_friendship record;
  v_new_req_id uuid;
  v_recent_request_count int;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if target_user_id is null then
    raise exception 'INVALID_TARGET_USER_ID';
  end if;

  if target_user_id = v_caller_id then
    raise exception 'CANNOT_REQUEST_SELF';
  end if;

  -- Verify target user exists
  if not exists (select 1 from public.profiles where id = target_user_id) then
    raise exception 'TARGET_USER_NOT_FOUND';
  end if;

  -- Verify target user is currently discoverable
  select discoverable into v_target_discoverable
  from public.discovery_preferences
  where user_id = target_user_id;

  if v_target_discoverable is not true then
    raise exception 'TARGET_NOT_DISCOVERABLE';
  end if;

  -- Verify blocking in either direction
  if public.is_user_blocked(v_caller_id, target_user_id) or public.is_user_blocked(target_user_id, v_caller_id) then
    raise exception 'USER_BLOCKED';
  end if;

  -- Verify not already friends in public.friendships
  select id, status into v_existing_friendship
  from public.friendships
  where ((user_id = v_caller_id and friend_id = target_user_id)
      or (user_id = target_user_id and friend_id = v_caller_id))
    and status = 'accepted';

  if v_existing_friendship.id is not null then
    raise exception 'ALREADY_FRIENDS';
  end if;

  -- Rate limit check: maximum 30 new outgoing requests per rolling 24 hours
  select count(*) into v_recent_request_count
  from public.friend_requests
  where sender_id = v_caller_id
    and created_at > (timezone('utc'::text, now()) - interval '24 hours');

  if v_recent_request_count >= 30 then
    raise exception 'RATE_LIMIT_EXCEEDED';
  end if;

  -- Lock and check for existing pending requests between this pair
  -- 1. Check if reverse request exists (target already sent request to caller)
  select id, sender_id, recipient_id, status
  into v_existing_reverse
  from public.friend_requests
  where sender_id = target_user_id
    and recipient_id = v_caller_id
    and status = 'pending'
  for update;

  if v_existing_reverse.id is not null then
    -- Atomic mutual conversion: auto-accept the existing incoming request!
    update public.friend_requests
    set status = 'accepted',
        responded_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    where id = v_existing_reverse.id;

    -- Upsert existing friendships row
    insert into public.friendships (user_id, friend_id, status, responded_at, updated_at)
    values (target_user_id, v_caller_id, 'accepted', timezone('utc'::text, now()), timezone('utc'::text, now()))
    on conflict (user_id, friend_id)
    do update set
      status = 'accepted',
      responded_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now());

    -- Create notification for target
    insert into public.notifications (
      user_id,
      actor_id,
      sender_id,
      type,
      event_type,
      title,
      body,
      data,
      conversation_id
    ) values (
      target_user_id,
      v_caller_id,
      v_caller_id,
      'friend_request_accepted',
      'friend_accepted',
      'Friend Request Accepted',
      'accepted your friend request',
      jsonb_build_object('request_id', v_existing_reverse.id, 'actor_id', v_caller_id),
      null
    );

    return jsonb_build_object(
      'success', true,
      'status', 'friends',
      'requestId', v_existing_reverse.id,
      'autoAccepted', true
    );
  end if;

  -- 2. Check if outgoing request already exists
  select id, status
  into v_existing_outgoing
  from public.friend_requests
  where sender_id = v_caller_id
    and recipient_id = target_user_id
    and status = 'pending'
  for update;

  if v_existing_outgoing.id is not null then
    -- Outgoing already pending -> idempotent return
    return jsonb_build_object(
      'success', true,
      'status', 'outgoing_pending',
      'requestId', v_existing_outgoing.id,
      'autoAccepted', false
    );
  end if;

  -- 3. Create new pending request
  insert into public.friend_requests (sender_id, recipient_id, status)
  values (v_caller_id, target_user_id, 'pending')
  returning id into v_new_req_id;

  -- Create notification for recipient
  insert into public.notifications (
    user_id,
    actor_id,
    sender_id,
    type,
    event_type,
    title,
    body,
    data,
    conversation_id
  ) values (
    target_user_id,
    v_caller_id,
    v_caller_id,
    'friend_request',
    'friend_request',
    'New Friend Request',
    'sent you a friend request',
    jsonb_build_object('request_id', v_new_req_id, 'actor_id', v_caller_id),
    null
  );

  return jsonb_build_object(
    'success', true,
    'status', 'outgoing_pending',
    'requestId', v_new_req_id,
    'autoAccepted', false
  );
end;
$$;

revoke all on function public.send_friend_request(uuid) from public;
grant execute on function public.send_friend_request(uuid) to authenticated;

-- 7. ACCEPT FRIEND REQUEST RPC
-- ------------------------------------------------------------------------------
create or replace function public.accept_friend_request(request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id uuid;
  v_req record;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if request_id is null then
    raise exception 'INVALID_REQUEST_ID';
  end if;

  -- Lock and fetch request
  select id, sender_id, recipient_id, status
  into v_req
  from public.friend_requests
  where id = request_id
  for update;

  if v_req.id is null then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  -- Verify caller is the recipient
  if v_req.recipient_id <> v_caller_id then
    raise exception 'REQUEST_NOT_YOURS';
  end if;

  -- Idempotency check: if already accepted, return success
  if v_req.status = 'accepted' then
    return jsonb_build_object('success', true, 'status', 'accepted', 'requestId', v_req.id);
  end if;

  if v_req.status <> 'pending' then
    raise exception 'REQUEST_NOT_PENDING';
  end if;

  -- Re-check blocking at acceptance time
  if public.is_user_blocked(v_caller_id, v_req.sender_id) or public.is_user_blocked(v_req.sender_id, v_caller_id) then
    raise exception 'USER_BLOCKED';
  end if;

  -- Atomically update friend_requests status
  update public.friend_requests
  set status = 'accepted',
      responded_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  where id = v_req.id;

  -- Atomically upsert into public.friendships
  -- Check if a friendship record exists either way
  if exists (
    select 1 from public.friendships
    where (user_id = v_req.sender_id and friend_id = v_req.recipient_id)
       or (user_id = v_req.recipient_id and friend_id = v_req.sender_id)
  ) then
    update public.friendships
    set status = 'accepted',
        responded_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    where (user_id = v_req.sender_id and friend_id = v_req.recipient_id)
       or (user_id = v_req.recipient_id and friend_id = v_req.sender_id);
  else
    insert into public.friendships (user_id, friend_id, status, responded_at, updated_at)
    values (v_req.sender_id, v_req.recipient_id, 'accepted', timezone('utc'::text, now()), timezone('utc'::text, now()));
  end if;

  -- Create notification for the sender
  insert into public.notifications (
    user_id,
    actor_id,
    sender_id,
    type,
    event_type,
    title,
    body,
    data,
    conversation_id
  ) values (
    v_req.sender_id,
    v_caller_id,
    v_caller_id,
    'friend_request_accepted',
    'friend_accepted',
    'Friend Request Accepted',
    'accepted your friend request',
    jsonb_build_object('request_id', v_req.id, 'actor_id', v_caller_id),
    null
  );

  return jsonb_build_object(
    'success', true,
    'status', 'accepted',
    'requestId', v_req.id
  );
end;
$$;

revoke all on function public.accept_friend_request(uuid) from public;
grant execute on function public.accept_friend_request(uuid) to authenticated;

-- 8. REJECT / DECLINE FRIEND REQUEST RPC
-- ------------------------------------------------------------------------------
create or replace function public.reject_friend_request(request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id uuid;
  v_req record;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select id, sender_id, recipient_id, status
  into v_req
  from public.friend_requests
  where id = request_id
  for update;

  if v_req.id is null then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  -- Only recipient can reject/decline
  if v_req.recipient_id <> v_caller_id then
    raise exception 'REQUEST_NOT_YOURS';
  end if;

  if v_req.status <> 'pending' then
    raise exception 'REQUEST_NOT_PENDING';
  end if;

  update public.friend_requests
  set status = 'rejected',
      responded_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  where id = v_req.id;

  return jsonb_build_object('success', true, 'status', 'rejected', 'requestId', v_req.id);
end;
$$;

revoke all on function public.reject_friend_request(uuid) from public;
grant execute on function public.reject_friend_request(uuid) to authenticated;

-- Decline alias for compatibility
create or replace function public.decline_friend_request(request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return public.reject_friend_request(request_id);
end;
$$;

revoke all on function public.decline_friend_request(uuid) from public;
grant execute on function public.decline_friend_request(uuid) to authenticated;

-- 9. CANCEL FRIEND REQUEST RPC
-- ------------------------------------------------------------------------------
create or replace function public.cancel_friend_request(request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id uuid;
  v_req record;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select id, sender_id, recipient_id, status
  into v_req
  from public.friend_requests
  where id = request_id
  for update;

  if v_req.id is null then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  -- Only sender can cancel
  if v_req.sender_id <> v_caller_id then
    raise exception 'REQUEST_NOT_YOURS';
  end if;

  if v_req.status <> 'pending' then
    raise exception 'REQUEST_NOT_PENDING';
  end if;

  update public.friend_requests
  set status = 'cancelled',
      responded_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  where id = v_req.id;

  return jsonb_build_object('success', true, 'status', 'cancelled', 'requestId', v_req.id);
end;
$$;

revoke all on function public.cancel_friend_request(uuid) from public;
grant execute on function public.cancel_friend_request(uuid) to authenticated;

-- 10. GET MY FRIEND REQUESTS RPC
-- ------------------------------------------------------------------------------
create or replace function public.get_my_friend_requests()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id uuid;
  v_incoming jsonb;
  v_outgoing jsonb;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  -- Fetch incoming pending requests with sender safe profile
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'requestId', fr.id,
        'createdAt', fr.created_at,
        'status', fr.status,
        'sender', jsonb_build_object(
          'id', p.id,
          'displayName', p.display_name,
          'username', p.username,
          'avatarUrl', p.avatar_url,
          'bio', p.bio
        )
      ) order by fr.created_at desc
    ),
    '[]'::jsonb
  )
  into v_incoming
  from public.friend_requests fr
  inner join public.profiles p on p.id = fr.sender_id
  where fr.recipient_id = v_caller_id
    and fr.status = 'pending';

  -- Fetch outgoing pending requests with recipient safe profile
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'requestId', fr.id,
        'createdAt', fr.created_at,
        'status', fr.status,
        'recipient', jsonb_build_object(
          'id', p.id,
          'displayName', p.display_name,
          'username', p.username,
          'avatarUrl', p.avatar_url,
          'bio', p.bio
        )
      ) order by fr.created_at desc
    ),
    '[]'::jsonb
  )
  into v_outgoing
  from public.friend_requests fr
  inner join public.profiles p on p.id = fr.recipient_id
  where fr.sender_id = v_caller_id
    and fr.status = 'pending';

  return jsonb_build_object(
    'incoming', v_incoming,
    'outgoing', v_outgoing
  );
end;
$$;

revoke all on function public.get_my_friend_requests() from public;
grant execute on function public.get_my_friend_requests() to authenticated;
