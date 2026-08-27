-- ==============================================================================
-- Heat Chat — Phase 4 Migration: Direct Conversation RPC & Uniqueness
-- Migration Timestamp: 2026-08-27
-- Description: Adds atomic, race-condition-proof direct conversation creation RPC
--              with friendship validation, and helper functions for friendships.
-- ==============================================================================

-- Function to get or create a direct conversation atomically between two users
create or replace function public.get_or_create_direct_conversation(target_user_id uuid)
returns uuid as $$
declare
  current_user_id uuid;
  existing_conv_id uuid;
  new_conv_id uuid;
  is_friends boolean;
begin
  current_user_id := auth.uid();
  
  -- 1. Validate authentication
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- 2. Prevent self-chat
  if current_user_id = target_user_id then
    raise exception 'Cannot create a direct conversation with yourself';
  end if;

  -- 3. Verify target user exists
  if not exists (select 1 from public.profiles where id = target_user_id) then
    raise exception 'Target user not found';
  end if;

  -- 4. Check if direct conversation already exists between the two users
  select c.id into existing_conv_id
  from public.conversations c
  join public.conversation_members cm1 on cm1.conversation_id = c.id and cm1.user_id = current_user_id
  join public.conversation_members cm2 on cm2.conversation_id = c.id and cm2.user_id = target_user_id
  where c.type = 'direct'
  limit 1;

  if existing_conv_id is not null then
    return existing_conv_id;
  end if;

  -- 5. Privacy check: Only accepted friends can start a new direct conversation
  select exists (
    select 1 
    from public.friendships f
    where f.status = 'accepted'
      and (
        (f.user_id = current_user_id and f.friend_id = target_user_id)
        or
        (f.user_id = target_user_id and f.friend_id = current_user_id)
      )
  ) into is_friends;

  if not is_friends then
    raise exception 'You must be accepted friends to start a new direct conversation';
  end if;

  -- 6. Atomic creation with advisory lock on ordered user pair to prevent race conditions
  perform pg_advisory_xact_lock(
    hashtext(least(current_user_id::text, target_user_id::text) || ':' || greatest(current_user_id::text, target_user_id::text))
  );

  -- Double check after acquiring lock in case of concurrent execution
  select c.id into existing_conv_id
  from public.conversations c
  join public.conversation_members cm1 on cm1.conversation_id = c.id and cm1.user_id = current_user_id
  join public.conversation_members cm2 on cm2.conversation_id = c.id and cm2.user_id = target_user_id
  where c.type = 'direct'
  limit 1;

  if existing_conv_id is not null then
    return existing_conv_id;
  end if;

  -- Create new direct conversation
  insert into public.conversations (type, created_by)
  values ('direct', current_user_id)
  returning id into new_conv_id;

  -- Add both members
  insert into public.conversation_members (conversation_id, user_id, role)
  values
    (new_conv_id, current_user_id, 'member'),
    (new_conv_id, target_user_id, 'member');

  return new_conv_id;
end;
$$ language plpgsql security definer set search_path = public, auth;

-- Grant execution to authenticated users
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;
