-- ==============================================================================
-- HEAT CHAT — PHASE 10: FULL-TEXT SEARCH & STARRED MESSAGES
-- ==============================================================================

-- 1. FULL-TEXT SEARCH GIN INDEX ON MESSAGES
create index if not exists messages_fts_idx 
  on public.messages 
  using gin(to_tsvector('english', content)) 
  where deleted_at is null;

-- 2. STARRED MESSAGES TABLE
create table if not exists public.starred_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint unique_user_starred_message unique (user_id, message_id)
);

-- 3. INDEXES
create index if not exists starred_messages_user_idx on public.starred_messages(user_id, created_at desc);
create index if not exists starred_messages_msg_idx on public.starred_messages(message_id);

-- 4. ROW LEVEL SECURITY (RLS) ON STARRED MESSAGES
alter table public.starred_messages enable row level security;

drop policy if exists "Users can view own starred messages" on public.starred_messages;
drop policy if exists "Users can insert own starred messages" on public.starred_messages;
drop policy if exists "Users can delete own starred messages" on public.starred_messages;

create policy "Users can view own starred messages"
  on public.starred_messages for select
  to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and m.deleted_at is null
        and public.is_conversation_member(m.conversation_id, auth.uid())
    )
  );

create policy "Users can insert own starred messages"
  on public.starred_messages for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and m.deleted_at is null
        and public.is_conversation_member(m.conversation_id, auth.uid())
    )
  );

create policy "Users can delete own starred messages"
  on public.starred_messages for delete
  to authenticated
  using (auth.uid() = user_id);

-- 5. RPC: SEARCH CONVERSATION MESSAGES
create or replace function public.search_conversation_messages(
  p_conv_id uuid,
  p_query text,
  p_limit int default 50
)
returns table (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  content text,
  message_type text,
  created_at timestamp with time zone,
  rank real
) as $$
declare
  v_limit int;
  v_trimmed text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_conversation_member(p_conv_id, auth.uid()) then
    raise exception 'Not authorized to search this conversation';
  end if;

  v_trimmed := trim(p_query);
  if v_trimmed is null or v_trimmed = '' then
    return;
  end if;

  v_limit := least(greatest(coalesce(p_limit, 50), 1), 100);

  return query
  select
    m.id,
    m.conversation_id,
    m.sender_id,
    m.content,
    m.message_type,
    m.created_at,
    ts_rank(to_tsvector('english', m.content), plainto_tsquery('english', v_trimmed)) as rank
  from public.messages m
  where m.conversation_id = p_conv_id
    and m.deleted_at is null
    and to_tsvector('english', m.content) @@ plainto_tsquery('english', v_trimmed)
  order by rank desc, m.created_at desc
  limit v_limit;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- 6. RPC: SEARCH GLOBAL MESSAGES
create or replace function public.search_global_messages(
  p_query text,
  p_limit int default 50
)
returns table (
  id uuid,
  conversation_id uuid,
  conversation_name text,
  conversation_type text,
  sender_id uuid,
  sender_name text,
  sender_avatar text,
  content text,
  message_type text,
  created_at timestamp with time zone,
  rank real
) as $$
declare
  v_limit int;
  v_trimmed text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  v_trimmed := trim(p_query);
  if v_trimmed is null or v_trimmed = '' then
    return;
  end if;

  v_limit := least(greatest(coalesce(p_limit, 50), 1), 100);

  return query
  select
    m.id,
    m.conversation_id,
    coalesce(c.name, p.display_name, 'Direct Message') as conversation_name,
    c.type as conversation_type,
    m.sender_id,
    p.display_name as sender_name,
    p.avatar_url as sender_avatar,
    m.content,
    m.message_type,
    m.created_at,
    ts_rank(to_tsvector('english', m.content), plainto_tsquery('english', v_trimmed)) as rank
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  join public.profiles p on p.id = m.sender_id
  where public.is_conversation_member(m.conversation_id, auth.uid())
    and m.deleted_at is null
    and to_tsvector('english', m.content) @@ plainto_tsquery('english', v_trimmed)
  order by rank desc, m.created_at desc
  limit v_limit;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- 7. RPC: TOGGLE STARRED MESSAGE
create or replace function public.toggle_starred_message(p_message_id uuid)
returns boolean as $$
declare
  v_exists boolean;
  v_conv_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select conversation_id into v_conv_id
  from public.messages
  where id = p_message_id and deleted_at is null;

  if v_conv_id is null or not public.is_conversation_member(v_conv_id, auth.uid()) then
    raise exception 'Message not found or unauthorized';
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
    values (auth.uid(), p_message_id);
    return true;
  end if;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- 8. RPC: GET MESSAGE CONTEXT BY ID (FOR CROSS-PAGINATION JUMP-TO)
create or replace function public.get_message_context_by_id(p_message_id uuid)
returns table (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  content text,
  message_type text,
  reply_to_message_id uuid,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone,
  sender_username text,
  sender_display_name text,
  sender_avatar_url text
) as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  return query
  select
    m.id,
    m.conversation_id,
    m.sender_id,
    m.content,
    m.message_type,
    m.reply_to_message_id,
    m.created_at,
    m.updated_at,
    m.deleted_at,
    p.username as sender_username,
    p.display_name as sender_display_name,
    p.avatar_url as sender_avatar_url
  from public.messages m
  join public.profiles p on p.id = m.sender_id
  where m.id = p_message_id
    and public.is_conversation_member(m.conversation_id, auth.uid());
end;
$$ language plpgsql security definer set search_path = public, pg_temp;
