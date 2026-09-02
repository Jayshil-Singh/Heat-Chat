-- ==============================================================================
-- Heat Chat — Fix Column Reference Regressions in Search & Saved Functions
-- Migration: 20260905_fix_search_saved_column_references.sql
-- Description: Updates get_saved_messages, search_messages, and
--              get_direct_conversation_other_member to reference c.type
--              instead of non-existent c.conversation_type.
-- ==============================================================================

-- 1. Helper: get other member's user ID in a DIRECT conversation
create or replace function public.get_direct_conversation_other_member(
  p_conversation_id uuid,
  p_sender_id uuid
)
returns uuid as $$
  select cm.user_id
  from public.conversation_members cm
  join public.conversations c on c.id = cm.conversation_id
  where cm.conversation_id = p_conversation_id
    and cm.user_id <> p_sender_id
    and c.type = 'direct'
  limit 1;
$$ language sql security definer stable;

-- 2. GET SAVED MESSAGES RPC
create or replace function public.get_saved_messages(
  p_query text default null,
  p_category text default 'all',
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
    c.type::text as conversation_type,
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
    and (
      p_category = 'all'
      or (p_category = 'links' and m.content ~* 'https?://[^\s]+')
      or (p_category = 'media' and (m.message_type = 'image' or m.message_type = 'video'))
      or (p_category = 'files' and (m.message_type = 'file' or m.message_type = 'audio' or m.message_type = 'voice'))
      or (p_category = 'text' and m.message_type = 'text')
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

-- 3. SEARCH MESSAGES RPC
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
    c.type::text as conversation_type,
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
