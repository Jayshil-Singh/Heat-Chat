-- ==============================================================================
-- Heat Chat — Phase 2: Friends, Friend Requests, Mutual Friends & Reporting
-- Migration Timestamp: 2026-09-01
-- Description:
--   1. Extends `public.friendships` with state-machine statuses (pending, accepted,
--      declined, cancelled, expired) and responded_at.
--   2. Extends `public.moderation_reports` with structured target references and categories.
--   3. Creates `public.moderation_notes` table for admin notes.
--   4. Creates atomic Security-Definer RPCs for friend requests, acceptance with
--      re-checks, cancellation, decline, friend removal, mutual friends calculation,
--      relationship state detection, and report submissions with duplicate prevention.
--   5. Updates block RPC to transactionally clear all active friendships/requests.
-- ==============================================================================

-- 1. FRIENDSHIPS EXTENSIONS
-- ------------------------------------------------------------------------------
alter table public.friendships
  add column if not exists responded_at timestamptz;

-- Update status check constraint on friendships
alter table public.friendships
  drop constraint if exists friendships_status_check;

alter table public.friendships
  add constraint friendships_status_check
  check (status in ('pending', 'accepted', 'declined', 'blocked', 'cancelled', 'expired'));

-- Indexes for efficient friend and request lookups
create index if not exists idx_friendships_user_status
  on public.friendships(user_id, status);

create index if not exists idx_friendships_friend_status
  on public.friendships(friend_id, status);

create index if not exists idx_friendships_status_updated
  on public.friendships(status, updated_at desc);

-- 2. MODERATION REPORTS & NOTES EXTENSIONS
-- ------------------------------------------------------------------------------
alter table public.moderation_reports
  add column if not exists category text;

alter table public.moderation_reports
  add column if not exists target_user_id uuid references public.profiles(id) on delete set null;

alter table public.moderation_reports
  add column if not exists target_message_id uuid references public.messages(id) on delete set null;

alter table public.moderation_reports
  add column if not exists target_attachment_id uuid references public.attachments(id) on delete set null;

alter table public.moderation_reports
  add column if not exists target_conversation_id uuid references public.conversations(id) on delete set null;

create index if not exists idx_moderation_reports_reporter_status
  on public.moderation_reports(reporter_id, status);

create index if not exists idx_moderation_reports_category
  on public.moderation_reports(category);

-- Moderation Notes Table (Admin internal notes)
create table if not exists public.moderation_notes (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.moderation_reports(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_moderation_notes_report
  on public.moderation_notes(report_id, created_at desc);

alter table public.moderation_notes enable row level security;

-- Moderation Notes RLS: Only admins can view/insert notes
drop policy if exists "Admins can view moderation notes" on public.moderation_notes;
create policy "Admins can view moderation notes"
  on public.moderation_notes for select
  to authenticated
  using (public.is_any_admin(auth.uid()));

drop policy if exists "Admins can insert moderation notes" on public.moderation_notes;
create policy "Admins can insert moderation notes"
  on public.moderation_notes for insert
  to authenticated
  with check (public.is_any_admin(auth.uid()) and auth.uid() = author_id);

-- Reporter RLS policy for moderation_reports (Users can view their own submitted reports)
drop policy if exists "Users can view their own submitted reports" on public.moderation_reports;
create policy "Users can view their own submitted reports"
  on public.moderation_reports for select
  to authenticated
  using (reporter_id = auth.uid() or public.is_any_admin(auth.uid()));

drop policy if exists "Users can insert reports" on public.moderation_reports;
create policy "Users can insert reports"
  on public.moderation_reports for insert
  to authenticated
  with check (reporter_id = auth.uid());

-- 3. CENTRAL RELATIONSHIP STATE MACHINE RPCS
-- ------------------------------------------------------------------------------

-- Get comprehensive relationship state between viewer and target
create or replace function public.get_user_relationship_state(
  p_viewer_id uuid,
  p_target_id uuid
)
returns jsonb as $$
declare
  v_blocked boolean;
  v_has_blocked_viewer boolean;
  v_can_msg boolean;
  v_can_fr boolean;
  v_friendship_rec record;
  v_state text := 'NONE';
  v_request_id uuid := null;
  v_created_at timestamptz := null;
begin
  if p_viewer_id is null or p_target_id is null then
    return jsonb_build_object(
      'friendship', 'NONE',
      'requestId', null,
      'isBlocked', false,
      'hasBlockedViewer', false,
      'canMessage', false,
      'canFriendRequest', false
    );
  end if;

  if p_viewer_id = p_target_id then
    return jsonb_build_object(
      'friendship', 'SELF',
      'requestId', null,
      'isBlocked', false,
      'hasBlockedViewer', false,
      'canMessage', false,
      'canFriendRequest', false
    );
  end if;

  -- 1. Check blocking in both directions
  v_blocked := exists (
    select 1 from public.blocked_users
    where user_id = p_viewer_id and blocked_user_id = p_target_id
  );

  v_has_blocked_viewer := exists (
    select 1 from public.blocked_users
    where user_id = p_target_id and blocked_user_id = p_viewer_id
  );

  if v_blocked or v_has_blocked_viewer then
    return jsonb_build_object(
      'friendship', 'NONE',
      'requestId', null,
      'isBlocked', v_blocked,
      'hasBlockedViewer', v_has_blocked_viewer,
      'canMessage', false,
      'canFriendRequest', false
    );
  end if;

  -- 2. Find current friendship row
  select id, user_id, friend_id, status, created_at
  into v_friendship_rec
  from public.friendships
  where (user_id = p_viewer_id and friend_id = p_target_id)
     or (user_id = p_target_id and friend_id = p_viewer_id)
  limit 1;

  if v_friendship_rec.id is not null then
    if v_friendship_rec.status = 'accepted' then
      v_state := 'FRIENDS';
      v_request_id := v_friendship_rec.id;
      v_created_at := v_friendship_rec.created_at;
    elsif v_friendship_rec.status = 'pending' then
      v_request_id := v_friendship_rec.id;
      v_created_at := v_friendship_rec.created_at;
      if v_friendship_rec.user_id = p_viewer_id then
        v_state := 'PENDING_OUTGOING';
      else
        v_state := 'PENDING_INCOMING';
      end if;
    else
      -- declined, cancelled, expired -> treated as NONE for active relationship
      v_state := 'NONE';
    end if;
  end if;

  -- 3. Calculate capabilities using Phase 1 privacy rules
  v_can_msg := public.can_send_message(p_viewer_id, p_target_id);
  v_can_fr := (v_state = 'NONE') and public.can_send_friend_request(p_viewer_id, p_target_id);

  return jsonb_build_object(
    'friendship', v_state,
    'requestId', v_request_id,
    'createdAt', v_created_at,
    'isBlocked', false,
    'hasBlockedViewer', false,
    'canMessage', v_can_msg,
    'canFriendRequest', v_can_fr
  );
end;
$$ language plpgsql security definer stable;

-- 4. SEND FRIEND REQUEST RPC
-- ------------------------------------------------------------------------------
create or replace function public.send_friend_request(p_recipient_id uuid)
returns jsonb as $$
declare
  v_actor_id uuid;
  v_existing record;
  v_new_id uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if v_actor_id = p_recipient_id then
    raise exception 'CANNOT_FRIEND_SELF';
  end if;

  -- Verify blocking in either direction
  if public.is_user_blocked(v_actor_id, p_recipient_id) then
    raise exception 'BLOCKED_USER';
  end if;

  -- Verify privacy permissions
  if not public.can_send_friend_request(v_actor_id, p_recipient_id) then
    raise exception 'PRIVACY_RESTRICTED';
  end if;

  -- Check existing record (with lock for concurrency safety)
  select id, user_id, friend_id, status
  into v_existing
  from public.friendships
  where (user_id = v_actor_id and friend_id = p_recipient_id)
     or (user_id = p_recipient_id and friend_id = v_actor_id)
  for update;

  if v_existing.id is not null then
    if v_existing.status = 'accepted' then
      raise exception 'ALREADY_FRIENDS';
    elsif v_existing.status = 'pending' then
      if v_existing.user_id = v_actor_id then
        -- Outgoing request already pending -> idempotent success
        return jsonb_build_object(
          'success', true,
          'friendshipId', v_existing.id,
          'status', 'PENDING_OUTGOING',
          'autoAccepted', false
        );
      else
        -- Simultaneous request: recipient already sent us a request!
        -- Auto-accept the existing incoming request cleanly
        update public.friendships
        set status = 'accepted',
            responded_at = timezone('utc'::text, now()),
            updated_at = timezone('utc'::text, now())
        where id = v_existing.id;

        return jsonb_build_object(
          'success', true,
          'friendshipId', v_existing.id,
          'status', 'FRIENDS',
          'autoAccepted', true
        );
      end if;
    else
      -- Previous state was declined / cancelled / expired -> reuse row and set back to pending
      update public.friendships
      set user_id = v_actor_id,
          friend_id = p_recipient_id,
          status = 'pending',
          created_at = timezone('utc'::text, now()),
          updated_at = timezone('utc'::text, now()),
          responded_at = null
      where id = v_existing.id;

      return jsonb_build_object(
        'success', true,
        'friendshipId', v_existing.id,
        'status', 'PENDING_OUTGOING',
        'autoAccepted', false
      );
    end if;
  end if;

  -- Insert new pending request
  insert into public.friendships (user_id, friend_id, status)
  values (v_actor_id, p_recipient_id, 'pending')
  returning id into v_new_id;

  return jsonb_build_object(
    'success', true,
    'friendshipId', v_new_id,
    'status', 'PENDING_OUTGOING',
    'autoAccepted', false
  );
end;
$$ language plpgsql security definer;

-- 5. ACCEPT FRIEND REQUEST RPC
-- ------------------------------------------------------------------------------
create or replace function public.accept_friend_request(p_friendship_id uuid)
returns jsonb as $$
declare
  v_actor_id uuid;
  v_req record;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  -- Lock row for update
  select id, user_id, friend_id, status
  into v_req
  from public.friendships
  where id = p_friendship_id
  for update;

  if v_req.id is null then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  -- Verify actor is the RECIPIENT of the request
  if v_req.friend_id <> v_actor_id then
    raise exception 'REQUEST_NOT_YOURS';
  end if;

  -- Verify request is strictly PENDING
  if v_req.status <> 'pending' then
    if v_req.status = 'accepted' then
      return jsonb_build_object('success', true, 'friendshipId', v_req.id, 'status', 'accepted');
    end if;
    raise exception 'REQUEST_NOT_PENDING';
  end if;

  -- Re-check blocking at acceptance time (essential security check)
  if public.is_user_blocked(v_req.user_id, v_req.friend_id) then
    raise exception 'BLOCKED_USER';
  end if;

  -- Update to accepted
  update public.friendships
  set status = 'accepted',
      responded_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  where id = v_req.id;

  return jsonb_build_object(
    'success', true,
    'friendshipId', v_req.id,
    'status', 'accepted'
  );
end;
$$ language plpgsql security definer;

-- 6. DECLINE FRIEND REQUEST RPC
-- ------------------------------------------------------------------------------
create or replace function public.decline_friend_request(p_friendship_id uuid)
returns jsonb as $$
declare
  v_actor_id uuid;
  v_req record;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select id, user_id, friend_id, status
  into v_req
  from public.friendships
  where id = p_friendship_id
  for update;

  if v_req.id is null then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  -- Only recipient can decline
  if v_req.friend_id <> v_actor_id then
    raise exception 'REQUEST_NOT_YOURS';
  end if;

  if v_req.status <> 'pending' then
    raise exception 'REQUEST_NOT_PENDING';
  end if;

  update public.friendships
  set status = 'declined',
      responded_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  where id = v_req.id;

  return jsonb_build_object('success', true, 'status', 'declined');
end;
$$ language plpgsql security definer;

-- 7. CANCEL FRIEND REQUEST RPC
-- ------------------------------------------------------------------------------
create or replace function public.cancel_friend_request(p_friendship_id uuid)
returns jsonb as $$
declare
  v_actor_id uuid;
  v_req record;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select id, user_id, friend_id, status
  into v_req
  from public.friendships
  where id = p_friendship_id
  for update;

  if v_req.id is null then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  -- Only sender can cancel
  if v_req.user_id <> v_actor_id then
    raise exception 'REQUEST_NOT_YOURS';
  end if;

  if v_req.status <> 'pending' then
    raise exception 'REQUEST_NOT_PENDING';
  end if;

  update public.friendships
  set status = 'cancelled',
      updated_at = timezone('utc'::text, now())
  where id = v_req.id;

  return jsonb_build_object('success', true, 'status', 'cancelled');
end;
$$ language plpgsql security definer;

-- 8. REMOVE FRIEND RPC
-- ------------------------------------------------------------------------------
create or replace function public.remove_friend(p_target_user_id uuid)
returns jsonb as $$
declare
  v_actor_id uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  delete from public.friendships
  where (user_id = v_actor_id and friend_id = p_target_user_id)
     or (user_id = p_target_user_id and friend_id = v_actor_id);

  return jsonb_build_object('success', true, 'removed', true);
end;
$$ language plpgsql security definer;

-- 9. GET MUTUAL FRIENDS RPC
-- ------------------------------------------------------------------------------
create or replace function public.get_mutual_friends(
  p_viewer_id uuid,
  p_target_id uuid
)
returns jsonb as $$
declare
  v_count integer;
  v_profiles jsonb;
begin
  if p_viewer_id is null or p_target_id is null or p_viewer_id = p_target_id then
    return jsonb_build_object('count', 0, 'profiles', '[]'::jsonb);
  end if;

  -- Mutual friends are users who have accepted friendships with BOTH viewer and target,
  -- AND are not blocked by or blocking the viewer
  with viewer_friends as (
    select case when user_id = p_viewer_id then friend_id else user_id end as friend_uid
    from public.friendships
    where status = 'accepted'
      and (user_id = p_viewer_id or friend_id = p_viewer_id)
  ),
  target_friends as (
    select case when user_id = p_target_id then friend_id else user_id end as friend_uid
    from public.friendships
    where status = 'accepted'
      and (user_id = p_target_id or friend_id = p_target_id)
  ),
  mutual as (
    select vf.friend_uid
    from viewer_friends vf
    join target_friends tf on vf.friend_uid = tf.friend_uid
    where not public.is_user_blocked(p_viewer_id, vf.friend_uid)
      and not public.is_user_blocked(p_target_id, vf.friend_uid)
  )
  select count(*),
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', p.id,
               'username', p.username,
               'displayName', p.display_name,
               'avatarUrl', case
                 when coalesce(upr.who_can_see_avatar, 'everyone') = 'everyone'
                   or (upr.who_can_see_avatar = 'friends' and public.are_friends(p_viewer_id, p.id))
                 then p.avatar_url
                 else null
               end
             )
           ),
           '[]'::jsonb
         )
  into v_count, v_profiles
  from mutual m
  join public.profiles p on p.id = m.friend_uid
  left join public.user_privacy_settings upr on upr.user_id = p.id;

  return jsonb_build_object(
    'count', coalesce(v_count, 0),
    'profiles', coalesce(v_profiles, '[]'::jsonb)
  );
end;
$$ language plpgsql security definer stable;

-- 10. ATOMIC BLOCK EXTENSION (TERMINATES FRIENDSHIPS & REQUESTS)
-- ------------------------------------------------------------------------------
create or replace function public.block_user(target_id uuid, block_reason text default null)
returns boolean as $$
declare
  actor_id uuid;
begin
  actor_id := auth.uid();
  if actor_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  if actor_id = target_id then
    raise exception 'BLOCK_SELF_FORBIDDEN';
  end if;

  -- 1. Insert block record
  insert into public.blocked_users (user_id, blocked_user_id, reason)
  values (actor_id, target_id, block_reason)
  on conflict (user_id, blocked_user_id) do nothing;

  -- 2. Transactionally remove any friendship or pending/active requests
  delete from public.friendships
  where (user_id = actor_id and friend_id = target_id)
     or (user_id = target_id and friend_id = actor_id);

  return true;
end;
$$ language plpgsql security definer;

-- 11. SUBMIT MODERATION REPORT RPC (WITH DEDUPLICATION)
-- ------------------------------------------------------------------------------
create or replace function public.submit_moderation_report(
  p_target_type text,
  p_target_id text,
  p_category text,
  p_description text default null
)
returns jsonb as $$
declare
  v_reporter_id uuid;
  v_existing_id uuid;
  v_new_id uuid;
  v_target_user_id uuid := null;
  v_target_msg_id uuid := null;
  v_target_att_id uuid := null;
  v_target_conv_id uuid := null;
begin
  v_reporter_id := auth.uid();
  if v_reporter_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if p_target_type is null or p_target_id is null or p_category is null then
    raise exception 'REPORT_INVALID';
  end if;

  -- Normalize target type
  p_target_type := lower(trim(p_target_type));

  -- Validate targets
  if p_target_type = 'user' then
    v_target_user_id := p_target_id::uuid;
    if v_target_user_id = v_reporter_id then
      raise exception 'CANNOT_REPORT_SELF';
    end if;
  elsif p_target_type = 'message' then
    v_target_msg_id := p_target_id::uuid;
    -- Verify reporter belongs to conversation
    select conversation_id into v_target_conv_id
    from public.messages
    where id = v_target_msg_id;
    if v_target_conv_id is null or not public.is_conversation_member(v_target_conv_id, v_reporter_id) then
      raise exception 'REPORT_NOT_ACCESSIBLE';
    end if;
  elsif p_target_type = 'attachment' then
    v_target_att_id := p_target_id::uuid;
  elsif p_target_type = 'conversation' then
    v_target_conv_id := p_target_id::uuid;
  else
    raise exception 'INVALID_TARGET_TYPE';
  end if;

  -- Check for existing active report from same reporter for same target & category
  select id into v_existing_id
  from public.moderation_reports
  where reporter_id = v_reporter_id
    and target_type = p_target_type
    and target_id = p_target_id
    and category = p_category
    and status in ('New', 'Assigned', 'Investigating', 'ActionTaken')
  limit 1;

  if v_existing_id is not null then
    -- Return existing active report gracefully (duplicate prevention)
    return jsonb_build_object(
      'success', true,
      'reportId', v_existing_id,
      'duplicate', true,
      'message', 'An active report for this item has already been received.'
    );
  end if;

  -- Insert report
  insert into public.moderation_reports (
    reporter_id,
    target_type,
    target_id,
    category,
    reason,
    description,
    target_user_id,
    target_message_id,
    target_attachment_id,
    target_conversation_id,
    status
  ) values (
    v_reporter_id,
    p_target_type,
    p_target_id,
    p_category,
    p_category,
    p_description,
    v_target_user_id,
    v_target_msg_id,
    v_target_att_id,
    v_target_conv_id,
    'New'
  )
  returning id into v_new_id;

  return jsonb_build_object(
    'success', true,
    'reportId', v_new_id,
    'duplicate', false,
    'message', 'Report submitted successfully.'
  );
end;
$$ language plpgsql security definer;
