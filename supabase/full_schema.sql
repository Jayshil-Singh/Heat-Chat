-- ==============================================================================
-- Heat Chat — Complete Database Schema (Phases 1-6)
-- Run this in Supabase Dashboard -> SQL Editor
-- ==============================================================================

-- ==============================================================================
-- 1. EXTENSIONS & CORE TABLES (Phase 2 & 3)
-- ==============================================================================
create extension if not exists "uuid-ossp";

-- Function to automatically manage updated_at timestamps
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql security definer;

-- TABLE: PROFILES
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  display_name text not null,
  avatar_url text,
  bio text,
  status text not null default 'offline' check (status in ('online', 'offline', 'away', 'busy')),
  last_seen timestamptz default timezone('utc'::text, now()),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint valid_username check (username ~* '^[a-z0-9_-]{3,30}$')
);

create unique index if not exists profiles_username_lower_idx on public.profiles (lower(username));
create index if not exists profiles_display_name_idx on public.profiles (display_name);
create index if not exists profiles_display_name_lower_idx on public.profiles (lower(display_name));

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.handle_updated_at();

-- Auto-provision profile on auth.users registration
create or replace function public.handle_new_user()
returns trigger as $$
declare
  raw_username text;
  clean_username text;
  raw_display_name text;
begin
  raw_username := new.raw_user_meta_data->>'username';
  raw_display_name := new.raw_user_meta_data->>'display_name';
  
  if raw_username is null or trim(raw_username) = '' then
    clean_username := lower(split_part(new.email, '@', 1)) || '_' || substr(new.id::text, 1, 4);
  else
    clean_username := lower(trim(raw_username));
  end if;

  if raw_display_name is null or trim(raw_display_name) = '' then
    raw_display_name := split_part(new.email, '@', 1);
  else
    raw_display_name := trim(raw_display_name);
  end if;

  insert into public.profiles (id, username, display_name, avatar_url, bio, status)
  values (
    new.id,
    clean_username,
    raw_display_name,
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'bio',
    'online'
  )
  on conflict (id) do nothing;
  
  return new;
exception
  when others then
    return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- TABLE: FRIENDSHIPS
create table if not exists public.friendships (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint cannot_friend_self check (user_id != friend_id),
  constraint unique_friendship_pair unique (user_id, friend_id)
);

create index if not exists friendships_user_id_idx on public.friendships (user_id);
create index if not exists friendships_friend_id_idx on public.friendships (friend_id);
create index if not exists friendships_status_idx on public.friendships (status);

drop trigger if exists set_friendships_updated_at on public.friendships;
create trigger set_friendships_updated_at
  before update on public.friendships
  for each row
  execute function public.handle_updated_at();

-- TABLE: CONVERSATIONS
create table if not exists public.conversations (
  id uuid primary key default uuid_generate_v4(),
  type text not null default 'direct' check (type in ('direct', 'group')),
  name text,
  avatar_url text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists conversations_type_idx on public.conversations (type);
create index if not exists conversations_updated_at_idx on public.conversations (updated_at desc);

drop trigger if exists set_conversations_updated_at on public.conversations;
create trigger set_conversations_updated_at
  before update on public.conversations
  for each row
  execute function public.handle_updated_at();

-- TABLE: CONVERSATION_MEMBERS
create table if not exists public.conversation_members (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default timezone('utc'::text, now()),
  last_read_at timestamptz default timezone('utc'::text, now()),
  constraint unique_conversation_member unique (conversation_id, user_id)
);

create index if not exists conv_members_conversation_id_idx on public.conversation_members (conversation_id);
create index if not exists conv_members_user_id_idx on public.conversation_members (user_id);

-- TABLE: MESSAGES
create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  message_type text not null default 'text' check (message_type in ('text', 'image', 'video', 'file', 'system')),
  reply_to_message_id uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  deleted_at timestamptz,
  constraint message_content_length check (char_length(content) <= 5000 and char_length(trim(content)) > 0)
);

create index if not exists messages_conversation_id_idx on public.messages (conversation_id);
create index if not exists messages_sender_id_idx on public.messages (sender_id);
create index if not exists messages_created_at_idx on public.messages (created_at desc);

drop trigger if exists set_messages_updated_at on public.messages;
create trigger set_messages_updated_at
  before update on public.messages
  for each row
  execute function public.handle_updated_at();

-- TABLE: MESSAGE_READS
create table if not exists public.message_reads (
  id uuid primary key default uuid_generate_v4(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default timezone('utc'::text, now()),
  constraint unique_message_read unique (message_id, user_id)
);

create index if not exists message_reads_message_id_idx on public.message_reads (message_id);
create index if not exists message_reads_user_id_idx on public.message_reads (user_id);

-- TABLE: MESSAGE_REACTIONS
create table if not exists public.message_reactions (
  id uuid primary key default uuid_generate_v4(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null check (reaction in ('heart', 'laugh', 'thumbs_up', 'surprised', 'sad', 'fire')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint unique_message_user_reaction unique (message_id, user_id, reaction)
);

create index if not exists message_reactions_message_id_idx on public.message_reactions (message_id);
create index if not exists message_reactions_user_id_idx on public.message_reactions (user_id);

-- ==============================================================================
-- RLS HELPER FUNCTIONS
-- ==============================================================================
create or replace function public.is_conversation_member(conv_id uuid)
returns boolean as $$
begin
  return exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = conv_id
      and cm.user_id = auth.uid()
  );
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.is_conversation_admin(conv_id uuid)
returns boolean as $$
begin
  return exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = conv_id
      and cm.user_id = auth.uid()
      and cm.role = 'admin'
  );
end;
$$ language plpgsql security definer set search_path = public;

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_reads enable row level security;
alter table public.message_reactions enable row level security;

-- PROFILES POLICIES
drop policy if exists "Profiles are viewable by authenticated users" on public.profiles;
create policy "Profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- FRIENDSHIPS POLICIES
drop policy if exists "Users can view friendships they are part of" on public.friendships;
create policy "Users can view friendships they are part of"
  on public.friendships for select
  to authenticated
  using (auth.uid() = user_id or auth.uid() = friend_id);

drop policy if exists "Users can create friend requests" on public.friendships;
create policy "Users can create friend requests"
  on public.friendships for insert
  to authenticated
  with check (auth.uid() = user_id and status = 'pending');

drop policy if exists "Users can update friendships they are part of" on public.friendships;
create policy "Users can update friendships they are part of"
  on public.friendships for update
  to authenticated
  using (auth.uid() = user_id or auth.uid() = friend_id)
  with check (auth.uid() = user_id or auth.uid() = friend_id);

drop policy if exists "Users can delete friendships they are part of" on public.friendships;
create policy "Users can delete friendships they are part of"
  on public.friendships for delete
  to authenticated
  using (auth.uid() = user_id or auth.uid() = friend_id);

-- CONVERSATIONS POLICIES
drop policy if exists "Users can view conversations they are members of" on public.conversations;
create policy "Users can view conversations they are members of"
  on public.conversations for select
  to authenticated
  using (public.is_conversation_member(id));

drop policy if exists "Authenticated users can create conversations" on public.conversations;
create policy "Authenticated users can create conversations"
  on public.conversations for insert
  to authenticated
  with check (auth.uid() = created_by);

drop policy if exists "Conversation admins can update conversation details" on public.conversations;
create policy "Conversation admins can update conversation details"
  on public.conversations for update
  to authenticated
  using (public.is_conversation_admin(id))
  with check (public.is_conversation_admin(id));

drop policy if exists "Conversation admins can delete conversation" on public.conversations;
create policy "Conversation admins can delete conversation"
  on public.conversations for delete
  to authenticated
  using (public.is_conversation_admin(id));

-- CONVERSATION_MEMBERS POLICIES
drop policy if exists "Users can view members of conversations they belong to" on public.conversation_members;
create policy "Users can view members of conversations they belong to"
  on public.conversation_members for select
  to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists "Admins or users adding themselves during creation can insert members" on public.conversation_members;
create policy "Admins or users adding themselves during creation can insert members"
  on public.conversation_members for insert
  to authenticated
  with check (
    public.is_conversation_admin(conversation_id)
    or (
      auth.uid() = user_id 
      and exists (
        select 1 from public.conversations c 
        where c.id = conversation_id and c.created_by = auth.uid()
      )
    )
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.created_by = auth.uid()
    )
  );

drop policy if exists "Admins can update member roles" on public.conversation_members;
create policy "Admins can update member roles"
  on public.conversation_members for update
  to authenticated
  using (
    public.is_conversation_admin(conversation_id)
    or (auth.uid() = user_id)
  )
  with check (
    public.is_conversation_admin(conversation_id)
    or (auth.uid() = user_id)
  );

drop policy if exists "Members can leave or admins can remove members" on public.conversation_members;
create policy "Members can leave or admins can remove members"
  on public.conversation_members for delete
  to authenticated
  using (
    auth.uid() = user_id
    or public.is_conversation_admin(conversation_id)
  );

-- MESSAGES POLICIES
drop policy if exists "Members can view messages in their conversations" on public.messages;
create policy "Members can view messages in their conversations"
  on public.messages for select
  to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists "Members can insert messages in their conversations" on public.messages;
create policy "Members can insert messages in their conversations"
  on public.messages for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and public.is_conversation_member(conversation_id)
  );

drop policy if exists "Users can update their own messages" on public.messages;
create policy "Users can update their own messages"
  on public.messages for update
  to authenticated
  using (
    auth.uid() = sender_id
    and public.is_conversation_member(conversation_id)
  )
  with check (
    auth.uid() = sender_id
    and public.is_conversation_member(conversation_id)
  );

drop policy if exists "Users can delete their own messages" on public.messages;
create policy "Users can delete their own messages"
  on public.messages for delete
  to authenticated
  using (
    auth.uid() = sender_id
    and public.is_conversation_member(conversation_id)
  );

-- MESSAGE_READS POLICIES
drop policy if exists "Members can view read receipts in their conversations" on public.message_reads;
create policy "Members can view read receipts in their conversations"
  on public.message_reads for select
  to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_reads.message_id
        and public.is_conversation_member(m.conversation_id)
    )
  );

drop policy if exists "Users can mark messages as read" on public.message_reads;
create policy "Users can mark messages as read"
  on public.message_reads for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.messages m
      where m.id = message_reads.message_id
        and public.is_conversation_member(m.conversation_id)
    )
  );

-- MESSAGE_REACTIONS POLICIES
drop policy if exists "Members can view message reactions in their conversations" on public.message_reactions;
create policy "Members can view message reactions in their conversations"
  on public.message_reactions for select
  to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id
        and public.is_conversation_member(m.conversation_id)
    )
  );

drop policy if exists "Users can add reactions" on public.message_reactions;
create policy "Users can add reactions"
  on public.message_reactions for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id
        and public.is_conversation_member(m.conversation_id)
    )
  );

drop policy if exists "Users can remove their own reactions" on public.message_reactions;
create policy "Users can remove their own reactions"
  on public.message_reactions for delete
  to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id
        and public.is_conversation_member(m.conversation_id)
    )
  );

-- ==============================================================================
-- 2. PHASE 4: DIRECT CONVERSATION RPC
-- ==============================================================================
create or replace function public.get_or_create_direct_conversation(target_user_id uuid)
returns uuid as $$
declare
  current_user_id uuid;
  existing_conv_id uuid;
  new_conv_id uuid;
  is_friends boolean;
begin
  current_user_id := auth.uid();
  
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if current_user_id = target_user_id then
    raise exception 'Cannot create a direct conversation with yourself';
  end if;

  if not exists (select 1 from public.profiles where id = target_user_id) then
    raise exception 'Target user not found';
  end if;

  select c.id into existing_conv_id
  from public.conversations c
  join public.conversation_members cm1 on cm1.conversation_id = c.id and cm1.user_id = current_user_id
  join public.conversation_members cm2 on cm2.conversation_id = c.id and cm2.user_id = target_user_id
  where c.type = 'direct'
  limit 1;

  if existing_conv_id is not null then
    return existing_conv_id;
  end if;

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

  perform pg_advisory_xact_lock(
    hashtext(least(current_user_id::text, target_user_id::text) || ':' || greatest(current_user_id::text, target_user_id::text))
  );

  select c.id into existing_conv_id
  from public.conversations c
  join public.conversation_members cm1 on cm1.conversation_id = c.id and cm1.user_id = current_user_id
  join public.conversation_members cm2 on cm2.conversation_id = c.id and cm2.user_id = target_user_id
  where c.type = 'direct'
  limit 1;

  if existing_conv_id is not null then
    return existing_conv_id;
  end if;

  insert into public.conversations (type, created_by)
  values ('direct', current_user_id)
  returning id into new_conv_id;

  insert into public.conversation_members (conversation_id, user_id, role)
  values
    (new_conv_id, current_user_id, 'member'),
    (new_conv_id, target_user_id, 'member');

  return new_conv_id;
end;
$$ language plpgsql security definer set search_path = public, auth;

grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;

-- ==============================================================================
-- 3. PHASE 5: REALTIME TRIGGER & INDEXES
-- ==============================================================================
create or replace function public.handle_new_message_conversation_updated_at()
returns trigger as $$
begin
  update public.conversations
  set updated_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_message_inserted_update_conversation on public.messages;
create trigger on_message_inserted_update_conversation
  after insert on public.messages
  for each row
  execute function public.handle_new_message_conversation_updated_at();

create index if not exists messages_conv_id_created_at_asc_idx 
  on public.messages (conversation_id, created_at asc);

create index if not exists message_reads_msg_user_composite_idx 
  on public.message_reads (message_id, user_id);

-- ==============================================================================
-- 4. PHASE 6: REPLY CROSS-CONVERSATION TRIGGER, REALTIME, & DELETED_AT INDEX
-- ==============================================================================
create or replace function public.validate_reply_same_conversation()
returns trigger as $$
begin
  if NEW.reply_to_message_id is not null then
    if not exists (
      select 1
      from public.messages m
      where m.id = NEW.reply_to_message_id
        and m.conversation_id = NEW.conversation_id
    ) then
      raise exception
        'Cross-conversation reply is not permitted. reply_to_message_id must reference a message within the same conversation (conversation_id: %).',
        NEW.conversation_id;
    end if;
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists validate_reply_conversation on public.messages;
create trigger validate_reply_conversation
  before insert or update on public.messages
  for each row
  execute function public.validate_reply_same_conversation();

create index if not exists messages_deleted_at_idx
  on public.messages (deleted_at)
  where deleted_at is not null;

-- ==============================================================================
-- 5. SUPABASE REALTIME PUBLICATION (messages, message_reads, message_reactions)
-- ==============================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables 
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
    ) then
      alter publication supabase_realtime add table public.messages;
    end if;

    if not exists (
      select 1 from pg_publication_tables 
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reads'
    ) then
      alter publication supabase_realtime add table public.message_reads;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reactions'
    ) then
      alter publication supabase_realtime add table public.message_reactions;
    end if;
  end if;
end;
$$;

-- ==============================================================================
-- 6. STORAGE BUCKET: AVATARS
-- ==============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880, -- 5MB limit
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- Storage RLS Policies
drop policy if exists "Avatar images are publicly accessible" on storage.objects;
create policy "Avatar images are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Authenticated users can upload avatars" on storage.objects;
create policy "Authenticated users can upload avatars"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update their own avatar" on storage.objects;
create policy "Users can update their own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
