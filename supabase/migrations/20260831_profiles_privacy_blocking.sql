-- ==============================================================================
-- Heat Chat — Phase 1: Profiles, Privacy & Blocking Migration
-- Migration Timestamp: 2026-08-31
-- Description: Extends profiles, introduces user_privacy_settings and blocked_users,
--              centralizes authorization functions, and configures storage buckets.
-- ==============================================================================

-- 1. EXTEND PROFILES TABLE
-- ------------------------------------------------------------------------------
alter table public.profiles
  add column if not exists cover_url text,
  add column if not exists status_message text,
  add column if not exists status_emoji text,
  add column if not exists presence_status text not null default 'ONLINE',
  add column if not exists last_seen_at timestamptz,
  add column if not exists timezone text not null default 'UTC',
  add column if not exists language text not null default 'en';

-- Add constraints on profiles safely
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_profiles_presence_status') then
    alter table public.profiles
      add constraint chk_profiles_presence_status
      check (presence_status in ('ONLINE', 'AWAY', 'BUSY', 'OFFLINE', 'INVISIBLE'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chk_profiles_status_message') then
    alter table public.profiles
      add constraint chk_profiles_status_message
      check (char_length(coalesce(status_message, '')) <= 160);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chk_profiles_status_emoji') then
    alter table public.profiles
      add constraint chk_profiles_status_emoji
      check (char_length(coalesce(status_emoji, '')) <= 16);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chk_profiles_language') then
    alter table public.profiles
      add constraint chk_profiles_language
      check (char_length(language) between 2 and 10);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chk_profiles_timezone') then
    alter table public.profiles
      add constraint chk_profiles_timezone
      check (char_length(timezone) between 1 and 64);
  end if;
end $$;

-- 2. CREATE TABLE: USER_PRIVACY_SETTINGS
-- ------------------------------------------------------------------------------
create table if not exists public.user_privacy_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  who_can_message text not null default 'everyone' check (who_can_message in ('everyone', 'friends', 'nobody')),
  who_can_friend_request text not null default 'everyone' check (who_can_friend_request in ('everyone', 'friends_of_friends', 'nobody')),
  who_can_see_profile text not null default 'everyone' check (who_can_see_profile in ('everyone', 'friends', 'nobody')),
  who_can_see_avatar text not null default 'everyone' check (who_can_see_avatar in ('everyone', 'friends', 'nobody')),
  who_can_see_status text not null default 'everyone' check (who_can_see_status in ('everyone', 'friends', 'nobody')),
  who_can_see_online text not null default 'everyone' check (who_can_see_online in ('everyone', 'friends', 'nobody')),
  who_can_see_last_seen text not null default 'everyone' check (who_can_see_last_seen in ('everyone', 'friends', 'nobody')),
  who_can_add_to_groups text not null default 'everyone' check (who_can_add_to_groups in ('everyone', 'friends', 'nobody')),
  who_can_call text not null default 'everyone' check (who_can_call in ('everyone', 'friends', 'nobody')),
  read_receipts_enabled boolean not null default true,
  typing_indicators_enabled boolean not null default true,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

-- Trigger for user_privacy_settings.updated_at
drop trigger if exists set_user_privacy_settings_updated_at on public.user_privacy_settings;
create trigger set_user_privacy_settings_updated_at
  before update on public.user_privacy_settings
  for each row
  execute function public.handle_updated_at();

-- Auto-provision privacy settings for existing profiles
insert into public.user_privacy_settings (user_id)
select p.id from public.profiles p
where not exists (select 1 from public.user_privacy_settings ups where ups.user_id = p.id)
on conflict (user_id) do nothing;

-- 3. CREATE TABLE: BLOCKED_USERS
-- ------------------------------------------------------------------------------
create table if not exists public.blocked_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  blocked_user_id uuid not null references public.profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  
  constraint uq_blocked_users unique (user_id, blocked_user_id),
  constraint chk_no_self_block check (user_id <> blocked_user_id)
);

create index if not exists idx_blocked_users_user_id on public.blocked_users(user_id);
create index if not exists idx_blocked_users_blocked_user_id on public.blocked_users(blocked_user_id);

-- 4. ENABLE RLS & POLICIES
-- ------------------------------------------------------------------------------
alter table public.user_privacy_settings enable row level security;
alter table public.blocked_users enable row level security;

-- user_privacy_settings RLS Policies
drop policy if exists "Users can view their own privacy settings" on public.user_privacy_settings;
create policy "Users can view their own privacy settings"
  on public.user_privacy_settings for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own privacy settings" on public.user_privacy_settings;
create policy "Users can insert their own privacy settings"
  on public.user_privacy_settings for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own privacy settings" on public.user_privacy_settings;
create policy "Users can update their own privacy settings"
  on public.user_privacy_settings for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- blocked_users RLS Policies
drop policy if exists "Users can view their own blocked list" on public.blocked_users;
create policy "Users can view their own blocked list"
  on public.blocked_users for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can block other users" on public.blocked_users;
create policy "Users can block other users"
  on public.blocked_users for insert
  to authenticated
  with check (auth.uid() = user_id and user_id <> blocked_user_id);

drop policy if exists "Users can unblock other users" on public.blocked_users;
create policy "Users can unblock other users"
  on public.blocked_users for delete
  to authenticated
  using (auth.uid() = user_id);

-- 5. STORAGE BUCKET: COVERS
-- ------------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do update set public = excluded.public;

-- Covers storage policies
drop policy if exists "Cover images are publicly accessible" on storage.objects;
create policy "Cover images are publicly accessible"
  on storage.objects for select
  to public
  using (bucket_id = 'covers');

drop policy if exists "Users can upload their own cover" on storage.objects;
create policy "Users can upload their own cover"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'covers' 
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update their own cover" on storage.objects;
create policy "Users can update their own cover"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'covers' 
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their own cover" on storage.objects;
create policy "Users can delete their own cover"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'covers' 
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 6. CENTRAL AUTHORIZATION FUNCTIONS (SECURITY DEFINER)
-- ------------------------------------------------------------------------------

-- Check if any block exists between two users
create or replace function public.is_user_blocked(user_a uuid, user_b uuid)
returns boolean as $$
begin
  if user_a is null or user_b is null then
    return false;
  end if;
  return exists (
    select 1 from public.blocked_users
    where (user_id = user_a and blocked_user_id = user_b)
       or (user_id = user_b and blocked_user_id = user_a)
  );
end;
$$ language plpgsql security definer stable;

-- Check if user_a has explicitly blocked user_b
create or replace function public.has_blocked(user_a uuid, user_b uuid)
returns boolean as $$
begin
  if user_a is null or user_b is null then
    return false;
  end if;
  return exists (
    select 1 from public.blocked_users
    where user_id = user_a and blocked_user_id = user_b
  );
end;
$$ language plpgsql security definer stable;

-- Check if user_a and user_b are accepted friends
create or replace function public.are_friends(user_a uuid, user_b uuid)
returns boolean as $$
begin
  if user_a is null or user_b is null then
    return false;
  end if;
  return exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((user_id = user_a and friend_id = user_b)
        or (user_id = user_b and friend_id = user_a))
  );
end;
$$ language plpgsql security definer stable;

-- Check if viewer can view target user's profile
create or replace function public.can_view_profile(viewer_id uuid, target_id uuid)
returns boolean as $$
declare
  setting text;
begin
  if viewer_id = target_id then
    return true;
  end if;
  if public.is_user_blocked(viewer_id, target_id) then
    return false;
  end if;
  select who_can_see_profile into setting
  from public.user_privacy_settings
  where user_id = target_id;
  if setting is null or setting = 'everyone' then
    return true;
  end if;
  if setting = 'friends' then
    return public.are_friends(viewer_id, target_id);
  end if;
  return false;
end;
$$ language plpgsql security definer stable;

-- Check if viewer can send direct message to target
create or replace function public.can_send_message(viewer_id uuid, target_id uuid)
returns boolean as $$
declare
  setting text;
begin
  if viewer_id = target_id then
    return true;
  end if;
  if public.is_user_blocked(viewer_id, target_id) then
    return false;
  end if;
  select who_can_message into setting
  from public.user_privacy_settings
  where user_id = target_id;
  if setting is null or setting = 'everyone' then
    return true;
  end if;
  if setting = 'friends' then
    return public.are_friends(viewer_id, target_id);
  end if;
  return false;
end;
$$ language plpgsql security definer stable;

-- Check if viewer can send friend request to target
create or replace function public.can_send_friend_request(viewer_id uuid, target_id uuid)
returns boolean as $$
declare
  setting text;
begin
  if viewer_id = target_id then
    return false;
  end if;
  if public.is_user_blocked(viewer_id, target_id) then
    return false;
  end if;
  select who_can_friend_request into setting
  from public.user_privacy_settings
  where user_id = target_id;
  if setting is null or setting = 'everyone' then
    return true;
  end if;
  if setting = 'nobody' then
    return false;
  end if;
  -- 'friends_of_friends'
  return exists (
    select 1
    from public.friendships f1
    join public.friendships f2 on (
      (f1.friend_id = f2.user_id or f1.friend_id = f2.friend_id or f1.user_id = f2.user_id or f1.user_id = f2.friend_id)
    )
    where f1.status = 'accepted' and f2.status = 'accepted'
      and (f1.user_id = viewer_id or f1.friend_id = viewer_id)
      and (f2.user_id = target_id or f2.friend_id = target_id)
  );
end;
$$ language plpgsql security definer stable;

-- 7. SAFE PROFILE RETRIEVAL RPC (JSON DTO)
-- ------------------------------------------------------------------------------
create or replace function public.get_safe_profile(viewer_id uuid, target_username text)
returns jsonb as $$
declare
  target_rec record;
  privacy_rec record;
  is_self boolean;
  is_blocked boolean;
  has_blocked_me boolean;
  is_friend boolean;
  can_see_avatar boolean;
  can_see_status boolean;
  can_see_online boolean;
  can_see_last_seen boolean;
  can_msg boolean;
  can_fr boolean;
begin
  -- Lookup target profile by normalized username
  select * into target_rec
  from public.profiles
  where lower(username) = lower(trim(target_username))
  limit 1;

  if target_rec.id is null then
    return null;
  end if;

  is_self := (viewer_id = target_rec.id);
  is_blocked := public.has_blocked(viewer_id, target_rec.id);
  has_blocked_me := public.has_blocked(target_rec.id, viewer_id);
  is_friend := public.are_friends(viewer_id, target_rec.id);

  -- Fetch target privacy settings (defaults if not present)
  select * into privacy_rec
  from public.user_privacy_settings
  where user_id = target_rec.id;

  if is_self then
    can_see_avatar := true;
    can_see_status := true;
    can_see_online := true;
    can_see_last_seen := true;
    can_msg := true;
    can_fr := false;
  elsif is_blocked or has_blocked_me then
    can_see_avatar := false;
    can_see_status := false;
    can_see_online := false;
    can_see_last_seen := false;
    can_msg := false;
    can_fr := false;
  else
    -- Avatar visibility
    can_see_avatar := (
      coalesce(privacy_rec.who_can_see_avatar, 'everyone') = 'everyone'
      or (privacy_rec.who_can_see_avatar = 'friends' and is_friend)
    );
    -- Status visibility
    can_see_status := (
      coalesce(privacy_rec.who_can_see_status, 'everyone') = 'everyone'
      or (privacy_rec.who_can_see_status = 'friends' and is_friend)
    );
    -- Online state visibility
    can_see_online := (
      coalesce(privacy_rec.who_can_see_online, 'everyone') = 'everyone'
      or (privacy_rec.who_can_see_online = 'friends' and is_friend)
    );
    -- Last seen visibility
    can_see_last_seen := (
      coalesce(privacy_rec.who_can_see_last_seen, 'everyone') = 'everyone'
      or (privacy_rec.who_can_see_last_seen = 'friends' and is_friend)
    );
    -- Can send message
    can_msg := (
      coalesce(privacy_rec.who_can_message, 'everyone') = 'everyone'
      or (privacy_rec.who_can_message = 'friends' and is_friend)
    );
    -- Can send friend request
    can_fr := (not is_friend) and public.can_send_friend_request(viewer_id, target_rec.id);
  end if;

  return jsonb_build_object(
    'id', target_rec.id,
    'username', target_rec.username,
    'displayName', target_rec.display_name,
    'avatarUrl', case when can_see_avatar then target_rec.avatar_url else null end,
    'coverUrl', case when can_see_avatar then target_rec.cover_url else null end,
    'bio', case when not is_blocked and not has_blocked_me then target_rec.bio else null end,
    'statusMessage', case when can_see_status then target_rec.status_message else null end,
    'statusEmoji', case when can_see_status then target_rec.status_emoji else null end,
    'presenceStatus', case when can_see_online then target_rec.presence_status else 'OFFLINE' end,
    'lastSeenAt', case when can_see_last_seen then target_rec.last_seen_at else null end,
    'timezone', case when is_self or is_friend then target_rec.timezone else null end,
    'language', case when is_self then target_rec.language else null end,
    'isSelf', is_self,
    'isFriend', is_friend,
    'isBlocked', is_blocked,
    'hasBlockedViewer', has_blocked_me,
    'canMessage', can_msg,
    'canFriendRequest', can_fr
  );
end;
$$ language plpgsql security definer stable;

-- 8. BLOCK & UNBLOCK MUTATION RPCS
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

  insert into public.blocked_users (user_id, blocked_user_id, reason)
  values (actor_id, target_id, block_reason)
  on conflict (user_id, blocked_user_id) do nothing;

  -- Terminate any existing active friendship or requests
  delete from public.friendships
  where (user_id = actor_id and friend_id = target_id)
     or (user_id = target_id and friend_id = actor_id);

  return true;
end;
$$ language plpgsql security definer;

create or replace function public.unblock_user(target_id uuid)
returns boolean as $$
declare
  actor_id uuid;
begin
  actor_id := auth.uid();
  if actor_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  delete from public.blocked_users
  where user_id = actor_id and blocked_user_id = target_id;

  return true;
end;
$$ language plpgsql security definer;
