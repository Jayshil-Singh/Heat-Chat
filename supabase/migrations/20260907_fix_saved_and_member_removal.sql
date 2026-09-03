-- ==============================================================================
-- Migration: 20260907_fix_saved_and_member_removal.sql
-- Description: 
--   1. Fix get_saved_messages column reference (c.type::text as conversation_type)
--   2. Update remove_group_member to return jsonb with deterministic status codes
-- ==============================================================================

-- 1. DROP EXISTING OVERLOADS IF NECESSARY
drop function if exists public.get_saved_messages(text, text, uuid, text, timestamptz, int);
drop function if exists public.get_saved_messages(text, uuid, text, timestamptz, int);

-- 2. CREATE AUTHORITATIVE get_saved_messages RPC
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

grant execute on function public.get_saved_messages(text, uuid, text, timestamptz, int) to authenticated;

-- 3. DROP & RECREATE remove_group_member RETURNING JSONB
drop function if exists public.remove_group_member(uuid, uuid);

create or replace function public.remove_group_member(
  conv_id uuid,
  target_user_id uuid
)
returns jsonb as $$
declare
  v_caller_id uuid;
  v_caller_role text;
  v_target_role text;
  v_conv_type text;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    return jsonb_build_object(
      'success', false,
      'code', 'UNAUTHORIZED',
      'message', 'Authentication required'
    );
  end if;

  if conv_id is null or target_user_id is null then
    return jsonb_build_object(
      'success', false,
      'code', 'INVALID_ARGUMENTS',
      'message', 'Conversation ID and Target User ID are required'
    );
  end if;

  select type into v_conv_type from public.conversations where id = conv_id;
  if v_conv_type is null or v_conv_type <> 'group' then
    return jsonb_build_object(
      'success', false,
      'code', 'GROUP_NOT_FOUND',
      'message', 'Group conversation not found'
    );
  end if;

  select role into v_caller_role from public.conversation_members where conversation_id = conv_id and user_id = v_caller_id;
  if v_caller_role is null then
    return jsonb_build_object(
      'success', false,
      'code', 'CALLER_NOT_MEMBER',
      'message', 'Caller is not a member of this group'
    );
  end if;

  select role into v_target_role from public.conversation_members where conversation_id = conv_id and user_id = target_user_id;
  if v_target_role is null then
    return jsonb_build_object(
      'success', false,
      'code', 'TARGET_NOT_MEMBER',
      'message', 'Target user is not a member of this group'
    );
  end if;

  -- Self removal
  if v_caller_id = target_user_id then
    if v_caller_role = 'owner' then
      return jsonb_build_object(
        'success', false,
        'code', 'OWNER_CANNOT_LEAVE',
        'message', 'Owner cannot remove themselves. Transfer ownership or use leave_group'
      );
    end if;

    delete from public.conversation_members where conversation_id = conv_id and user_id = target_user_id;
    return jsonb_build_object(
      'success', true,
      'code', 'SELF_REMOVED',
      'message', 'Successfully left group'
    );
  end if;

  -- Role hierarchy checks
  if v_caller_role = 'owner' then
    delete from public.conversation_members where conversation_id = conv_id and user_id = target_user_id;
    return jsonb_build_object(
      'success', true,
      'code', 'REMOVED',
      'message', 'Member successfully removed'
    );
  elsif v_caller_role = 'admin' then
    if v_target_role in ('owner', 'admin') then
      return jsonb_build_object(
        'success', false,
        'code', 'FORBIDDEN_HIERARCHY',
        'message', 'Admins cannot remove other admins or the group owner'
      );
    else
      delete from public.conversation_members where conversation_id = conv_id and user_id = target_user_id;
      return jsonb_build_object(
        'success', true,
        'code', 'REMOVED',
        'message', 'Member successfully removed'
      );
    end if;
  elsif v_caller_role = 'moderator' then
    if v_target_role in ('owner', 'admin', 'moderator') then
      return jsonb_build_object(
        'success', false,
        'code', 'FORBIDDEN_HIERARCHY',
        'message', 'Moderators cannot remove admins, owners, or other moderators'
      );
    else
      delete from public.conversation_members where conversation_id = conv_id and user_id = target_user_id;
      return jsonb_build_object(
        'success', true,
        'code', 'REMOVED',
        'message', 'Member successfully removed'
      );
    end if;
  else
    return jsonb_build_object(
      'success', false,
      'code', 'FORBIDDEN',
      'message', 'Regular members cannot remove other members'
    );
  end if;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
