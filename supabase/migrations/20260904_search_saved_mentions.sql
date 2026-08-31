-- ==============================================================================
-- HEAT CHAT — PHASE 5: FULL-TEXT SEARCH, SAVED MESSAGES & MENTIONS
-- Migration Timestamp: 2026-09-04
-- ==============================================================================

-- 1. MESSAGE MENTIONS TABLE
-- ------------------------------------------------------------------------------
create table if not exists public.message_mentions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  mentioned_user_id uuid not null references public.profiles(id) on delete cascade,
  username_snapshot text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint unique_message_mention unique (message_id, mentioned_user_id)
);

create index if not exists idx_message_mentions_msg 
  on public.message_mentions(message_id);
create index if not exists idx_message_mentions_user_created 
  on public.message_mentions(mentioned_user_id, created_at desc);

-- Enable RLS on message_mentions
alter table public.message_mentions enable row level security;

drop policy if exists "Members can view message mentions in accessible conversations" on public.message_mentions;
create policy "Members can view message mentions in accessible conversations"
  on public.message_mentions for select
  to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and m.deleted_at is null
        and public.is_conversation_member(m.conversation_id, auth.uid())
    )
  );

drop policy if exists "Senders can insert mentions for their messages" on public.message_mentions;
create policy "Senders can insert mentions for their messages"
  on public.message_mentions for insert
  to authenticated
  with check (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and m.sender_id = auth.uid()
        and public.is_conversation_member(m.conversation_id, auth.uid())
    )
  );

drop policy if exists "Senders can delete mentions for their messages" on public.message_mentions;
create policy "Senders can delete mentions for their messages"
  on public.message_mentions for delete
  to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and m.sender_id = auth.uid()
    )
  );

-- 2. FULL-TEXT SEARCH GIN INDEX ON MESSAGES
-- ------------------------------------------------------------------------------
create index if not exists messages_fts_idx 
  on public.messages 
  using gin(to_tsvector('english', coalesce(content, ''))) 
  where deleted_at is null;

create index if not exists idx_messages_conv_created_asc 
  on public.messages(conversation_id, created_at asc);

-- 3. SAVED MESSAGES (REUSING STARRED_MESSAGES TABLE)
-- ------------------------------------------------------------------------------
-- Ensure starred_messages table and indexes exist
create table if not exists public.starred_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint unique_user_starred_message unique (user_id, message_id)
);

create index if not exists starred_messages_user_idx 
  on public.starred_messages(user_id, created_at desc);
create index if not exists starred_messages_msg_idx 
  on public.starred_messages(message_id);

alter table public.starred_messages enable row level security;

-- 4. SAVED MESSAGES RPCs
-- ------------------------------------------------------------------------------

-- Save message (idempotent)
create or replace function public.save_message(p_message_id uuid)
returns boolean as $$
declare
  v_conv_id uuid;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select conversation_id into v_conv_id
  from public.messages
  where id = p_message_id and deleted_at is null;

  if v_conv_id is null or not public.is_conversation_member(v_conv_id, auth.uid()) then
    raise exception 'MESSAGE_ACCESS_DENIED';
  end if;

  insert into public.starred_messages (user_id, message_id)
  values (auth.uid(), p_message_id)
  on conflict (user_id, message_id) do nothing;

  return true;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- Unsave message (idempotent)
create or replace function public.unsave_message(p_message_id uuid)
returns boolean as $$
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  delete from public.starred_messages
  where user_id = auth.uid() and message_id = p_message_id;

  return true;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- Toggle saved message
create or replace function public.toggle_saved_message(p_message_id uuid)
returns boolean as $$
declare
  v_exists boolean;
  v_conv_id uuid;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select conversation_id into v_conv_id
  from public.messages
  where id = p_message_id and deleted_at is null;

  if v_conv_id is null or not public.is_conversation_member(v_conv_id, auth.uid()) then
    raise exception 'MESSAGE_ACCESS_DENIED';
  end if;

  select exists (
    select 1 from public.starred_messages
    where user_id = auth.uid() and message_id = p_message_id
  ) into v_exists;

  if v_exists then
    delete from public.starred_messages
    where user_id = auth.uid() and message_id = p_message_id;
    return false;
  else
    insert into public.starred_messages (user_id, message_id)
    values (auth.uid(), p_message_id)
    on conflict (user_id, message_id) do nothing;
    return true;
  end if;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- 5. GET SAVED MESSAGES RPC (PAGINATED & SEARCHABLE)
-- ------------------------------------------------------------------------------
create or replace function public.get_saved_messages(
  p_query text default null,
  p_conversation_id uuid default null,
  p_message_type text default null,
  p_before timestamptz default null,
  p_limit int default 30
)
returns table (
  saved_id uuid,
  saved_at timestamptz,
  message_id uuid,
  conversation_id uuid,
  conversation_name text,
  conversation_type text,
  sender_id uuid,
  sender_name text,
  sender_username text,
  sender_avatar text,
  content text,
  message_type text,
  is_deleted boolean,
  created_at timestamptz,
  edited_at timestamptz,
  attachments jsonb
) as $$
declare
  v_limit int;
  v_trimmed text;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_trimmed := nullif(trim(coalesce(p_query, '')), '');

  return query
  select
    sm.id as saved_id,
    sm.created_at as saved_at,
    m.id as message_id,
    m.conversation_id,
    coalesce(c.name, other_p.display_name, 'Conversation') as conversation_name,
    c.conversation_type::text as conversation_type,
    m.sender_id,
    sender_p.display_name as sender_name,
    sender_p.username as sender_username,
    sender_p.avatar_url as sender_avatar,
    case
      when m.deleted_at is not null then 'This message was deleted'
      else m.content
    end as content,
    m.message_type,
    (m.deleted_at is not null) as is_deleted,
    m.created_at,
    m.edited_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', a.id,
            'fileName', a.file_name,
            'fileType', a.file_type,
            'fileSize', a.file_size,
            'storagePath', a.storage_path,
            'width', a.width,
            'height', a.height,
            'durationSeconds', a.duration_seconds,
            'thumbnailPath', a.thumbnail_path
          )
        )
        from public.attachments a
        where a.message_id = m.id
      ),
      '[]'::jsonb
    ) as attachments
  from public.starred_messages sm
  join public.messages m on m.id = sm.message_id
  join public.conversations c on c.id = m.conversation_id
  left join public.profiles sender_p on sender_p.id = m.sender_id
  left join lateral (
    select p.display_name
    from public.conversation_members cm
    join public.profiles p on p.id = cm.user_id
    where cm.conversation_id = c.id and cm.user_id <> auth.uid()
    limit 1
  ) other_p on true
  where sm.user_id = auth.uid()
    and public.is_conversation_member(m.conversation_id, auth.uid())
    -- Exclude if message was deleted for this user specifically
    and not exists (
      select 1 from public.message_user_states mus
      where mus.message_id = m.id and mus.user_id = auth.uid()
    )
    and (p_conversation_id is null or m.conversation_id = p_conversation_id)
    and (p_message_type is null or m.message_type = p_message_type)
    and (p_before is null or sm.created_at < p_before)
    and (
      v_trimmed is null
      or m.deleted_at is null and (
        to_tsvector('english', coalesce(m.content, '')) @@ plainto_tsquery('english', v_trimmed)
        or m.content ilike '%' || v_trimmed || '%'
      )
    )
  order by sm.created_at desc
  limit v_limit;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- 6. FULL-TEXT SEARCH RPC: SEARCH MESSAGES
-- ------------------------------------------------------------------------------
create or replace function public.search_messages(
  p_query text,
  p_conversation_id uuid default null,
  p_sender_id uuid default null,
  p_message_type text default null,
  p_saved_only boolean default false,
  p_before timestamptz default null,
  p_after timestamptz default null,
  p_limit int default 30
)
returns table (
  id uuid,
  conversation_id uuid,
  conversation_name text,
  conversation_type text,
  sender_id uuid,
  sender_name text,
  sender_username text,
  sender_avatar text,
  content text,
  message_type text,
  created_at timestamptz,
  edited_at timestamptz,
  rank real,
  is_saved boolean,
  attachments jsonb
) as $$
declare
  v_limit int;
  v_trimmed text;
  v_tsquery tsquery;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  v_trimmed := trim(coalesce(p_query, ''));
  if v_trimmed = '' then
    return;
  end if;

  v_limit := least(greatest(coalesce(p_limit, 30), 1), 100);

  -- Safe query parsing
  begin
    v_tsquery := plainto_tsquery('english', v_trimmed);
  exception when others then
    v_tsquery := null;
  end;

  return query
  select
    m.id,
    m.conversation_id,
    coalesce(c.name, other_p.display_name, 'Conversation') as conversation_name,
    c.conversation_type::text as conversation_type,
    m.sender_id,
    sender_p.display_name as sender_name,
    sender_p.username as sender_username,
    sender_p.avatar_url as sender_avatar,
    m.content,
    m.message_type,
    m.created_at,
    m.edited_at,
    case
      when v_tsquery is not null then ts_rank(to_tsvector('english', coalesce(m.content, '')), v_tsquery)
      else 0.0::real
    end as rank,
    (sm.id is not null) as is_saved,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', a.id,
            'fileName', a.file_name,
            'fileType', a.file_type,
            'fileSize', a.file_size,
            'storagePath', a.storage_path,
            'width', a.width,
            'height', a.height,
            'durationSeconds', a.duration_seconds,
            'thumbnailPath', a.thumbnail_path
          )
        )
        from public.attachments a
        where a.message_id = m.id
      ),
      '[]'::jsonb
    ) as attachments
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  left join public.profiles sender_p on sender_p.id = m.sender_id
  left join lateral (
    select p.display_name
    from public.conversation_members cm
    join public.profiles p on p.id = cm.user_id
    where cm.conversation_id = c.id and cm.user_id <> auth.uid()
    limit 1
  ) other_p on true
  left join public.starred_messages sm on sm.message_id = m.id and sm.user_id = auth.uid()
  where public.is_conversation_member(m.conversation_id, auth.uid())
    and m.deleted_at is null
    -- Exclude if message was deleted for this user specifically
    and not exists (
      select 1 from public.message_user_states mus
      where mus.message_id = m.id and mus.user_id = auth.uid()
    )
    and (p_conversation_id is null or m.conversation_id = p_conversation_id)
    and (p_sender_id is null or m.sender_id = p_sender_id)
    and (p_message_type is null or m.message_type = p_message_type)
    and (not p_saved_only or sm.id is not null)
    and (p_before is null or m.created_at < p_before)
    and (p_after is null or m.created_at > p_after)
    and (
      (v_tsquery is not null and to_tsvector('english', coalesce(m.content, '')) @@ v_tsquery)
      or m.content ilike '%' || v_trimmed || '%'
    )
  order by rank desc, m.created_at desc
  limit v_limit;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- 7. FULL-TEXT SEARCH RPC: SEARCH MEDIA
-- ------------------------------------------------------------------------------
create or replace function public.search_media(
  p_query text default null,
  p_category text default 'all',
  p_conversation_id uuid default null,
  p_before timestamptz default null,
  p_limit int default 30
)
returns table (
  attachment_id uuid,
  message_id uuid,
  conversation_id uuid,
  conversation_name text,
  sender_id uuid,
  sender_name text,
  sender_username text,
  file_name text,
  file_type text,
  file_size bigint,
  width int,
  height int,
  duration_seconds int,
  storage_path text,
  thumbnail_path text,
  message_type text,
  message_content text,
  created_at timestamptz
) as $$
declare
  v_limit int;
  v_trimmed text;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 30), 1), 60);
  v_trimmed := nullif(trim(coalesce(p_query, '')), '');

  return query
  select
    a.id as attachment_id,
    m.id as message_id,
    m.conversation_id,
    coalesce(c.name, other_p.display_name, 'Conversation') as conversation_name,
    m.sender_id,
    p.display_name as sender_name,
    p.username as sender_username,
    a.file_name,
    a.file_type,
    a.file_size,
    a.width,
    a.height,
    a.duration_seconds,
    a.storage_path,
    a.thumbnail_path,
    m.message_type,
    m.content as message_content,
    a.created_at
  from public.attachments a
  join public.messages m on m.id = a.message_id
  join public.conversations c on c.id = m.conversation_id
  left join public.profiles p on p.id = m.sender_id
  left join lateral (
    select pr.display_name
    from public.conversation_members cm
    join public.profiles pr on pr.id = cm.user_id
    where cm.conversation_id = c.id and cm.user_id <> auth.uid()
    limit 1
  ) other_p on true
  where public.is_conversation_member(m.conversation_id, auth.uid())
    and m.deleted_at is null
    and not exists (
      select 1 from public.message_user_states mus
      where mus.message_id = m.id and mus.user_id = auth.uid()
    )
    and (p_conversation_id is null or m.conversation_id = p_conversation_id)
    and (p_before is null or a.created_at < p_before)
    and (
      p_category = 'all'
      or (p_category = 'media' and (a.file_type like 'image/%' or a.file_type like 'video/%'))
      or (p_category = 'audio' and a.file_type like 'audio/%')
      or (p_category = 'files' and a.file_type not like 'image/%' and a.file_type not like 'video/%' and a.file_type not like 'audio/%')
    )
    and (
      v_trimmed is null
      or a.file_name ilike '%' || v_trimmed || '%'
      or m.content ilike '%' || v_trimmed || '%'
    )
  order by a.created_at desc
  limit v_limit;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- 8. FULL-TEXT SEARCH RPC: SEARCH PEOPLE
-- ------------------------------------------------------------------------------
create or replace function public.search_people(
  p_query text,
  p_limit int default 20
)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  status text,
  is_friend boolean,
  is_blocked boolean
) as $$
declare
  v_limit int;
  v_trimmed text;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  v_trimmed := trim(coalesce(p_query, ''));
  if v_trimmed = '' then
    return;
  end if;

  v_limit := least(greatest(coalesce(p_limit, 20), 1), 50);

  return query
  select
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.bio,
    p.status,
    exists (
      select 1 from public.friendships f
      where ((f.user_id = auth.uid() and f.friend_id = p.id)
          or (f.friend_id = auth.uid() and f.user_id = p.id))
        and f.status = 'accepted'
    ) as is_friend,
    public.is_user_blocked(auth.uid(), p.id) as is_blocked
  from public.profiles p
  where p.id <> auth.uid()
    and (
      p.username ilike v_trimmed || '%'
      or p.display_name ilike v_trimmed || '%'
      or p.username ilike '%' || v_trimmed || '%'
      or p.display_name ilike '%' || v_trimmed || '%'
    )
    -- Don't show users who have blocked the caller or whom caller blocked
    and not public.is_user_blocked(auth.uid(), p.id)
  order by
    case when p.username ilike v_trimmed || '%' then 0 else 1 end,
    case when p.display_name ilike v_trimmed || '%' then 0 else 1 end,
    p.display_name asc
  limit v_limit;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- 9. MENTIONS CANDIDATE LOOKUP RPC
-- ------------------------------------------------------------------------------
create or replace function public.get_mention_candidates(
  p_conversation_id uuid,
  p_query text default '',
  p_limit int default 10
)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text
) as $$
declare
  v_limit int;
  v_trimmed text;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if not public.is_conversation_member(p_conversation_id, auth.uid()) then
    raise exception 'CONVERSATION_ACCESS_DENIED';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 10), 1), 25);
  v_trimmed := trim(coalesce(p_query, ''));

  return query
  select
    p.id as user_id,
    p.username,
    p.display_name,
    p.avatar_url
  from public.conversation_members cm
  join public.profiles p on p.id = cm.user_id
  where cm.conversation_id = p_conversation_id
    and p.id <> auth.uid()
    and (
      v_trimmed = ''
      or p.username ilike v_trimmed || '%'
      or p.display_name ilike v_trimmed || '%'
      or p.username ilike '%' || v_trimmed || '%'
      or p.display_name ilike '%' || v_trimmed || '%'
    )
    and not public.is_user_blocked(auth.uid(), p.id)
  order by
    case when p.username ilike v_trimmed || '%' then 0 else 1 end,
    p.display_name asc
  limit v_limit;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- 10. MENTION INSERT & NOTIFICATION HANDLER
-- ------------------------------------------------------------------------------
create or replace function public.record_message_mentions(
  p_message_id uuid,
  p_mentioned_usernames text[]
)
returns void as $$
declare
  v_sender_id uuid;
  v_conv_id uuid;
  v_uname text;
  v_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select sender_id, conversation_id into v_sender_id, v_conv_id
  from public.messages
  where id = p_message_id and deleted_at is null;

  if v_sender_id is null or v_sender_id <> auth.uid() then
    raise exception 'MESSAGE_ACCESS_DENIED';
  end if;

  if p_mentioned_usernames is null or array_length(p_mentioned_usernames, 1) = 0 then
    return;
  end if;

  -- Limit max mentions to 50
  foreach v_uname in array p_mentioned_usernames[1:50]
  loop
    -- Look up profile by username
    select id into v_user_id
    from public.profiles
    where lower(username) = lower(v_uname)
      and id <> auth.uid();

    if v_user_id is not null and public.is_conversation_member(v_conv_id, v_user_id) then
      -- Insert mention record
      insert into public.message_mentions (message_id, mentioned_user_id, username_snapshot)
      values (p_message_id, v_user_id, v_uname)
      on conflict (message_id, mentioned_user_id) do nothing;

      -- Insert mention notification
      insert into public.notifications (user_id, conversation_id, message_id, sender_id, type)
      values (v_user_id, v_conv_id, p_message_id, auth.uid(), 'mention')
      on conflict do nothing;
    end if;
  end loop;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- 11. RECONCILE MENTIONS ON MESSAGE EDIT
-- ------------------------------------------------------------------------------
create or replace function public.reconcile_message_mentions(
  p_message_id uuid,
  p_new_usernames text[]
)
returns void as $$
declare
  v_sender_id uuid;
  v_conv_id uuid;
  v_current_user_ids uuid[];
  v_new_user_ids uuid[] := '{}';
  v_uname text;
  v_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select sender_id, conversation_id into v_sender_id, v_conv_id
  from public.messages
  where id = p_message_id and deleted_at is null;

  if v_sender_id is null or v_sender_id <> auth.uid() then
    raise exception 'MESSAGE_ACCESS_DENIED';
  end if;

  -- Resolve valid mentioned user IDs from usernames
  if p_new_usernames is not null then
    foreach v_uname in array p_new_usernames[1:50]
    loop
      select id into v_user_id
      from public.profiles
      where lower(username) = lower(v_uname)
        and id <> auth.uid();

      if v_user_id is not null and public.is_conversation_member(v_conv_id, v_user_id) then
        v_new_user_ids := array_append(v_new_user_ids, v_user_id);
      end if;
    end loop;
  end if;

  -- Delete removed mentions
  delete from public.message_mentions
  where message_id = p_message_id
    and not (mentioned_user_id = any(v_new_user_ids));

  -- Insert new mentions
  if array_length(v_new_user_ids, 1) > 0 then
    foreach v_user_id in array v_new_user_ids
    loop
      insert into public.message_mentions (message_id, mentioned_user_id)
      values (p_message_id, v_user_id)
      on conflict (message_id, mentioned_user_id) do nothing;
    end loop;
  end if;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- 12. REALTIME PUBLICATION
-- ------------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_mentions'
  ) then
    alter publication supabase_realtime add table public.message_mentions;
  end if;
end;
$$;
