-- ==============================================================================
-- HEAT CHAT — FIX DISCOVER PEOPLE AMBIGUOUS COLUMN REFERENCE (ERROR 42702)
-- Migration: 20260915_fix_discover_people_ambiguous_user_id.sql
-- Description:
--   Fixes PL/pgSQL variable conflict in public.discover_people where output
--   table parameter `user_id` collided with unqualified column `user_id` in
--   the mutual friends subqueries against public.friendships.
--   Adds #variable_conflict use_column and explicitly qualifies all table aliases.
-- ==============================================================================

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
#variable_conflict use_column
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
        select case when fs1.user_id = v_caller_id then fs1.friend_id else fs1.user_id end as friend_id
        from public.friendships fs1
        where (fs1.user_id = v_caller_id or fs1.friend_id = v_caller_id)
          and fs1.status = 'accepted'
      ) f1
      inner join (
        select case when fs2.user_id = p.id then fs2.friend_id else fs2.user_id end as friend_id
        from public.friendships fs2
        where (fs2.user_id = p.id or fs2.friend_id = p.id)
          and fs2.status = 'accepted'
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
