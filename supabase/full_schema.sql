-- ==============================================================================
-- Heat Chat — Full Production Schema & Migrations (Phases 1-6)
-- Apply in Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ==============================================================================

-- ==============================================================================
-- 1. EXTENSIONS & CORE HELPER FUNCTIONS
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

-- ==============================================================================
-- 2. TABLE: PROFILES
-- ==============================================================================
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

-- ==============================================================================
-- 3. TABLE: CONVERSATIONS
-- ==============================================================================
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'direct' check (type in ('direct', 'group')),
  name text,
  description text,
  avatar_url text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists conversations_created_by_idx on public.conversations(created_by);
create index if not exists conversations_updated_at_idx on public.conversations(updated_at desc);
create index if not exists conversations_type_idx on public.conversations(type);

drop trigger if exists set_conversations_updated_at on public.conversations;
create trigger set_conversations_updated_at
  before update on public.conversations
  for each row
  execute function public.handle_updated_at();

-- ==============================================================================
-- 4. TABLE: CONVERSATION_MEMBERS
-- ==============================================================================
create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'admin')),
  joined_at timestamptz not null default timezone('utc'::text, now()),
  primary key (conversation_id, user_id)
);

create index if not exists conv_members_user_id_idx on public.conversation_members(user_id);
create index if not exists conv_members_conv_id_idx on public.conversation_members(conversation_id);

-- ==============================================================================
-- 5. RECURSION-SAFE MEMBERSHIP HELPER FUNCTIONS
-- ==============================================================================
create or replace function public.is_conversation_member(conv_id uuid, check_user_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 
    from public.conversation_members
    where conversation_id = conv_id
      and user_id = check_user_id
  );
end;
$$ language plpgsql security definer stable;

create or replace function public.is_conversation_admin(conv_id uuid, check_user_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 
    from public.conversation_members
    where conversation_id = conv_id
      and user_id = check_user_id
      and role = 'admin'
  );
end;
$$ language plpgsql security definer stable;

-- ==============================================================================
-- 6. TABLE: MESSAGES
-- ==============================================================================
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  message_type text not null default 'text' check (message_type in ('text', 'image', 'file')),
  reply_to_message_id uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  deleted_at timestamptz,
  constraint message_content_length check (char_length(content) <= 5000 and char_length(trim(content)) > 0)
);

create index if not exists messages_conv_created_idx on public.messages(conversation_id, created_at desc);
create index if not exists messages_conv_id_created_at_asc_idx on public.messages(conversation_id, created_at asc);
create index if not exists messages_sender_id_idx on public.messages(sender_id);
create index if not exists messages_reply_to_idx on public.messages(reply_to_message_id);

drop trigger if exists set_messages_updated_at on public.messages;
create trigger set_messages_updated_at
  before update on public.messages
  for each row
  execute function public.handle_updated_at();

-- ==============================================================================
-- 7. TABLE: MESSAGE_REACTIONS
-- ==============================================================================
create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null check (reaction in ('❤️', '😂', '👍', '😮', '😢', '🔥')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint unique_message_user_reaction unique (message_id, user_id, reaction)
);

create index if not exists msg_reactions_msg_id_idx on public.message_reactions(message_id);
create index if not exists msg_reactions_user_id_idx on public.message_reactions(user_id);

-- ==============================================================================
-- 8. TABLE: MESSAGE_READS
-- ==============================================================================
create table if not exists public.message_reads (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default timezone('utc'::text, now()),
  primary key (message_id, user_id)
);

create index if not exists msg_reads_user_idx on public.message_reads(user_id);
create index if not exists msg_reads_msg_idx on public.message_reads(message_id);
create index if not exists message_reads_msg_user_composite_idx on public.message_reads (message_id, user_id);

-- ==============================================================================
-- 9. TABLE: ATTACHMENTS
-- ==============================================================================
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  file_type text not null,
  file_size bigint not null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists attachments_msg_id_idx on public.attachments(message_id);

-- ==============================================================================
-- 10. TABLE: FRIENDSHIPS
-- ==============================================================================
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'blocked')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint no_self_friendship check (user_id != friend_id)
);

create unique index if not exists unique_friendship_pair_idx 
  on public.friendships (least(user_id, friend_id), greatest(user_id, friend_id));

create index if not exists friendships_user_idx on public.friendships(user_id, status);
create index if not exists friendships_friend_idx on public.friendships(friend_id, status);

drop trigger if exists set_friendships_updated_at on public.friendships;
create trigger set_friendships_updated_at
  before update on public.friendships
  for each row
  execute function public.handle_updated_at();

-- ==============================================================================
-- 11. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.message_reads enable row level security;
alter table public.attachments enable row level security;
alter table public.friendships enable row level security;

-- PROFILES
drop policy if exists "Public profiles are viewable by authenticated users" on public.profiles;
create policy "Public profiles are viewable by authenticated users"
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

-- CONVERSATIONS
drop policy if exists "Users can view conversations they belong to" on public.conversations;
create policy "Users can view conversations they belong to"
  on public.conversations for select
  to authenticated
  using (public.is_conversation_member(id, auth.uid()));

drop policy if exists "Authenticated users can create conversations" on public.conversations;
create policy "Authenticated users can create conversations"
  on public.conversations for insert
  to authenticated
  with check (auth.uid() = created_by);

drop policy if exists "Admins or creators can update conversations" on public.conversations;
create policy "Admins or creators can update conversations"
  on public.conversations for update
  to authenticated
  using (public.is_conversation_admin(id, auth.uid()) or created_by = auth.uid())
  with check (public.is_conversation_admin(id, auth.uid()) or created_by = auth.uid());

drop policy if exists "Admins or creators can delete conversations" on public.conversations;
create policy "Admins or creators can delete conversations"
  on public.conversations for delete
  to authenticated
  using (public.is_conversation_admin(id, auth.uid()) or created_by = auth.uid());

-- CONVERSATION_MEMBERS
drop policy if exists "Users can view members of conversations they belong to" on public.conversation_members;
create policy "Users can view members of conversations they belong to"
  on public.conversation_members for select
  to authenticated
  using (public.is_conversation_member(conversation_id, auth.uid()));

drop policy if exists "Users can add members or join permitted conversations" on public.conversation_members;
create policy "Users can add members or join permitted conversations"
  on public.conversation_members for insert
  to authenticated
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.created_by = auth.uid()
    )
    or
    public.is_conversation_admin(conversation_id, auth.uid())
    or
    auth.uid() = user_id
  );

drop policy if exists "Admins or self can remove members" on public.conversation_members;
create policy "Admins or self can remove members"
  on public.conversation_members for delete
  to authenticated
  using (
    auth.uid() = user_id 
    or public.is_conversation_admin(conversation_id, auth.uid())
  );

drop policy if exists "Admins can update member roles" on public.conversation_members;
create policy "Admins can update member roles"
  on public.conversation_members for update
  to authenticated
  using (public.is_conversation_admin(conversation_id, auth.uid()))
  with check (public.is_conversation_admin(conversation_id, auth.uid()));

-- MESSAGES
drop policy if exists "Users can view messages in conversations they belong to" on public.messages;
create policy "Users can view messages in conversations they belong to"
  on public.messages for select
  to authenticated
  using (public.is_conversation_member(conversation_id, auth.uid()));

drop policy if exists "Members can insert messages to their conversations" on public.messages;
create policy "Members can insert messages to their conversations"
  on public.messages for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and public.is_conversation_member(conversation_id, auth.uid())
  );

drop policy if exists "Senders can edit their own messages" on public.messages;
create policy "Senders can edit their own messages"
  on public.messages for update
  to authenticated
  using (
    auth.uid() = sender_id
    and public.is_conversation_member(conversation_id, auth.uid())
  )
  with check (
    auth.uid() = sender_id
    and public.is_conversation_member(conversation_id, auth.uid())
  );

drop policy if exists "Senders can delete their own messages" on public.messages;
create policy "Senders can delete their own messages"
  on public.messages for delete
  to authenticated
  using (
    auth.uid() = sender_id
    and public.is_conversation_member(conversation_id, auth.uid())
  );

-- MESSAGE_REACTIONS
drop policy if exists "Members can view reactions in their conversations" on public.message_reactions;
create policy "Members can view reactions in their conversations"
  on public.message_reactions for select
  to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and public.is_conversation_member(m.conversation_id, auth.uid())
    )
  );

drop policy if exists "Members can add their own reactions" on public.message_reactions;
create policy "Members can add their own reactions"
  on public.message_reactions for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and public.is_conversation_member(m.conversation_id, auth.uid())
    )
  );

drop policy if exists "Users can remove their own reactions" on public.message_reactions;
create policy "Users can remove their own reactions"
  on public.message_reactions for delete
  to authenticated
  using (auth.uid() = user_id);

-- MESSAGE_READS
drop policy if exists "Members can view read receipts in their conversations" on public.message_reads;
create policy "Members can view read receipts in their conversations"
  on public.message_reads for select
  to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and public.is_conversation_member(m.conversation_id, auth.uid())
    )
  );

drop policy if exists "Users can record their own read receipts" on public.message_reads;
create policy "Users can record their own read receipts"
  on public.message_reads for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and public.is_conversation_member(m.conversation_id, auth.uid())
    )
  );

-- ATTACHMENTS
drop policy if exists "Members can view attachments in their conversations" on public.attachments;
create policy "Members can view attachments in their conversations"
  on public.attachments for select
  to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and public.is_conversation_member(m.conversation_id, auth.uid())
    )
  );

drop policy if exists "Senders can attach records to their messages" on public.attachments;
create policy "Senders can attach records to their messages"
  on public.attachments for insert
  to authenticated
  with check (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and m.sender_id = auth.uid()
        and public.is_conversation_member(m.conversation_id, auth.uid())
    )
  );

-- FRIENDSHIPS
drop policy if exists "Users can view their own friendships and requests" on public.friendships;
create policy "Users can view their own friendships and requests"
  on public.friendships for select
  to authenticated
  using (auth.uid() = user_id or auth.uid() = friend_id);

drop policy if exists "Users can send friend requests" on public.friendships;
create policy "Users can send friend requests"
  on public.friendships for insert
  to authenticated
  with check (auth.uid() = user_id and user_id != friend_id);

drop policy if exists "Users can accept, decline, or update their friendships" on public.friendships;
create policy "Users can accept, decline, or update their friendships"
  on public.friendships for update
  to authenticated
  using (auth.uid() = user_id or auth.uid() = friend_id)
  with check (auth.uid() = user_id or auth.uid() = friend_id);

drop policy if exists "Users can remove their friendships or cancel requests" on public.friendships;
create policy "Users can remove their friendships or cancel requests"
  on public.friendships for delete
  to authenticated
  using (auth.uid() = user_id or auth.uid() = friend_id);

-- ==============================================================================
-- 12. PHASE 4: DIRECT CONVERSATION RPC (ATOMIC WITH ADVISORY LOCK)
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
-- 13. PHASE 5: CONVERSATION UPDATED_AT TRIGGER
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

-- ==============================================================================
-- 14. PHASE 6: CROSS-CONVERSATION REPLY TRIGGER & PERFORMANCE INDEX
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
-- 15. SUPABASE REALTIME PUBLICATION (messages, message_reads, message_reactions)
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
-- 16. STORAGE BUCKETS & POLICIES (chat-attachments & avatars)
-- ==============================================================================
insert into storage.buckets (id, name, public)
values 
  ('chat-attachments', 'chat-attachments', false),
  ('avatars', 'avatars', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Avatar images are publicly accessible" on storage.objects;
create policy "Avatar images are publicly accessible"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
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

drop policy if exists "Authenticated users can upload chat attachments" on storage.objects;
create policy "Authenticated users can upload chat attachments"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'chat-attachments');

drop policy if exists "Conversation members can read chat attachments" on storage.objects;
create policy "Conversation members can read chat attachments"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'chat-attachments'
    and (
      public.is_conversation_member((storage.foldername(name))[1]::uuid, auth.uid())
      or
      owner = auth.uid()
    )
  );

-- ==============================================================================
-- 15. PHASE 7: GROUP CHATS EXTENSIONS & RPC FUNCTIONS
-- ==============================================================================

-- 1. Update role check constraint on conversation_members
do $$
begin
  alter table public.conversation_members
    drop constraint if exists conversation_members_role_check;
  
  alter table public.conversation_members
    add constraint conversation_members_role_check
    check (role in ('owner', 'admin', 'member'));
exception
  when others then null;
end $$;

-- 2. Performance indexes
create index if not exists conv_members_user_conv_idx 
  on public.conversation_members(user_id, conversation_id);

create index if not exists conv_members_conv_user_idx 
  on public.conversation_members(conversation_id, user_id);

-- 3. Authorization helper functions
create or replace function public.is_conversation_admin(conv_id uuid, check_user_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 
    from public.conversation_members
    where conversation_id = conv_id
      and user_id = check_user_id
      and role in ('owner', 'admin')
  );
end;
$$ language plpgsql security definer stable;

create or replace function public.is_conversation_owner(conv_id uuid, check_user_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 
    from public.conversation_members
    where conversation_id = conv_id
      and user_id = check_user_id
      and role = 'owner'
  );
end;
$$ language plpgsql security definer stable;

create or replace function public.get_conversation_role(conv_id uuid, check_user_id uuid)
returns text as $$
declare
  v_role text;
begin
  select role into v_role
  from public.conversation_members
  where conversation_id = conv_id
    and user_id = check_user_id;
  return v_role;
end;
$$ language plpgsql security definer stable;

-- 4. RPC: create_group_conversation
create or replace function public.create_group_conversation(
  group_name text,
  member_user_ids uuid[],
  group_avatar_url text default null
)
returns uuid as $$
declare
  v_caller_id uuid;
  v_conv_id uuid;
  v_trimmed_name text;
  v_member_id uuid;
  v_valid_friends uuid[];
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  v_trimmed_name := trim(group_name);
  if length(v_trimmed_name) < 1 or length(v_trimmed_name) > 100 then
    raise exception 'Group name must be between 1 and 100 characters';
  end if;

  select array_agg(distinct uid)
  into v_valid_friends
  from unnest(member_user_ids) as uid
  where uid is not null and uid <> v_caller_id;

  if v_valid_friends is null or array_length(v_valid_friends, 1) = 0 then
    raise exception 'At least one friend must be selected to create a group';
  end if;

  foreach v_member_id in array v_valid_friends loop
    if not exists (
      select 1 from public.friendships
      where status = 'accepted'
        and ((user_id = v_caller_id and friend_id = v_member_id) or (user_id = v_member_id and friend_id = v_caller_id))
    ) then
      raise exception 'User % is not an accepted friend of the creator', v_member_id;
    end if;
  end loop;

  insert into public.conversations (
    type,
    name,
    avatar_url,
    created_by
  ) values (
    'group',
    v_trimmed_name,
    group_avatar_url,
    v_caller_id
  ) returning id into v_conv_id;

  insert into public.conversation_members (
    conversation_id,
    user_id,
    role
  ) values (
    v_conv_id,
    v_caller_id,
    'owner'
  );

  foreach v_member_id in array v_valid_friends loop
    insert into public.conversation_members (
      conversation_id,
      user_id,
      role
    ) values (
      v_conv_id,
      v_member_id,
      'member'
    );
  end loop;

  return v_conv_id;
end;
$$ language plpgsql security definer;

-- 5. RPC: add_group_members
create or replace function public.add_group_members(
  conv_id uuid,
  new_user_ids uuid[]
)
returns void as $$
declare
  v_caller_id uuid;
  v_conv_type text;
  v_user_id uuid;
  v_valid_users uuid[];
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select type into v_conv_type from public.conversations where id = conv_id;
  if v_conv_type is null or v_conv_type <> 'group' then
    raise exception 'Group conversation not found';
  end if;

  if not public.is_conversation_admin(conv_id, v_caller_id) then
    raise exception 'Only group owners and admins can add members';
  end if;

  select array_agg(distinct uid)
  into v_valid_users
  from unnest(new_user_ids) as uid
  where uid is not null and uid <> v_caller_id;

  if v_valid_users is null or array_length(v_valid_users, 1) = 0 then
    raise exception 'No valid users provided';
  end if;

  foreach v_user_id in array v_valid_users loop
    if not exists (
      select 1 from public.friendships
      where status = 'accepted'
        and ((user_id = v_caller_id and friend_id = v_user_id) or (user_id = v_user_id and friend_id = v_caller_id))
    ) then
      raise exception 'User % is not an accepted friend', v_user_id;
    end if;

    if exists (
      select 1 from public.conversation_members
      where conversation_id = conv_id and user_id = v_user_id
    ) then
      continue;
    end if;

    insert into public.conversation_members (
      conversation_id,
      user_id,
      role
    ) values (
      conv_id,
      v_user_id,
      'member'
    );
  end loop;
end;
$$ language plpgsql security definer;

-- 6. RPC: remove_group_member
create or replace function public.remove_group_member(
  conv_id uuid,
  target_user_id uuid
)
returns void as $$
declare
  v_caller_id uuid;
  v_caller_role text;
  v_target_role text;
  v_conv_type text;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select type into v_conv_type from public.conversations where id = conv_id;
  if v_conv_type is null or v_conv_type <> 'group' then
    raise exception 'Group conversation not found';
  end if;

  select role into v_caller_role from public.conversation_members where conversation_id = conv_id and user_id = v_caller_id;
  if v_caller_role is null then
    raise exception 'Caller is not a member of this group';
  end if;

  select role into v_target_role from public.conversation_members where conversation_id = conv_id and user_id = target_user_id;
  if v_target_role is null then
    raise exception 'Target user is not a member of this group';
  end if;

  if v_caller_id = target_user_id then
    if v_caller_role = 'owner' then
      raise exception 'Owner cannot remove themselves. Transfer ownership or use leave_group';
    end if;
    delete from public.conversation_members where conversation_id = conv_id and user_id = target_user_id;
    return;
  end if;

  if v_caller_role = 'owner' then
    delete from public.conversation_members where conversation_id = conv_id and user_id = target_user_id;
    return;
  elsif v_caller_role = 'admin' then
    if v_target_role = 'owner' then
      raise exception 'Admins cannot remove the group owner';
    elsif v_target_role = 'admin' then
      raise exception 'Admins cannot remove other admins';
    else
      delete from public.conversation_members where conversation_id = conv_id and user_id = target_user_id;
      return;
    end if;
  else
    raise exception 'Regular members cannot remove other members';
  end if;
end;
$$ language plpgsql security definer;

-- 7. RPC: update_group_member_role
create or replace function public.update_group_member_role(
  conv_id uuid,
  target_user_id uuid,
  new_role text
)
returns void as $$
declare
  v_caller_id uuid;
  v_caller_role text;
  v_target_role text;
  v_conv_type text;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select type into v_conv_type from public.conversations where id = conv_id;
  if v_conv_type is null or v_conv_type <> 'group' then
    raise exception 'Group conversation not found';
  end if;

  select role into v_caller_role from public.conversation_members where conversation_id = conv_id and user_id = v_caller_id;
  if v_caller_role is null or v_caller_role <> 'owner' then
    raise exception 'Only the group owner can manage roles or transfer ownership';
  end if;

  if new_role not in ('owner', 'admin', 'member') then
    raise exception 'Invalid role: %', new_role;
  end if;

  select role into v_target_role from public.conversation_members where conversation_id = conv_id and user_id = target_user_id;
  if v_target_role is null then
    raise exception 'Target user is not a member of this group';
  end if;

  if new_role = 'owner' then
    if target_user_id = v_caller_id then
      return;
    end if;
    update public.conversation_members set role = 'owner' where conversation_id = conv_id and user_id = target_user_id;
    update public.conversation_members set role = 'admin' where conversation_id = conv_id and user_id = v_caller_id;
    update public.conversations set created_by = target_user_id where id = conv_id;
    return;
  else
    if target_user_id = v_caller_id then
      raise exception 'Owner cannot demote self without transferring ownership first';
    end if;
    update public.conversation_members set role = new_role where conversation_id = conv_id and user_id = target_user_id;
  end if;
end;
$$ language plpgsql security definer;

-- 8. RPC: update_group_details
create or replace function public.update_group_details(
  conv_id uuid,
  new_name text,
  new_avatar_url text default null
)
returns void as $$
declare
  v_caller_id uuid;
  v_conv_type text;
  v_trimmed_name text;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select type into v_conv_type from public.conversations where id = conv_id;
  if v_conv_type is null or v_conv_type <> 'group' then
    raise exception 'Group conversation not found';
  end if;

  if not public.is_conversation_admin(conv_id, v_caller_id) then
    raise exception 'Only group owners and admins can update group details';
  end if;

  v_trimmed_name := trim(new_name);
  if length(v_trimmed_name) < 1 or length(v_trimmed_name) > 100 then
    raise exception 'Group name must be between 1 and 100 characters';
  end if;

  update public.conversations
  set name = v_trimmed_name,
      avatar_url = coalesce(new_avatar_url, avatar_url),
      updated_at = timezone('utc'::text, now())
  where id = conv_id;
end;
$$ language plpgsql security definer;

-- 9. RPC: leave_group
create or replace function public.leave_group(conv_id uuid)
returns void as $$
declare
  v_caller_id uuid;
  v_caller_role text;
  v_conv_type text;
  v_member_count int;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select type into v_conv_type from public.conversations where id = conv_id;
  if v_conv_type is null or v_conv_type <> 'group' then
    raise exception 'Group conversation not found';
  end if;

  select role into v_caller_role from public.conversation_members where conversation_id = conv_id and user_id = v_caller_id;
  if v_caller_role is null then
    raise exception 'You are not a member of this group';
  end if;

  select count(*) into v_member_count from public.conversation_members where conversation_id = conv_id;

  if v_caller_role = 'owner' then
    if v_member_count > 1 then
      raise exception 'Owner cannot leave group without transferring ownership first';
    else
      delete from public.conversations where id = conv_id;
      return;
    end if;
  end if;

  delete from public.conversation_members where conversation_id = conv_id and user_id = v_caller_id;
end;
$$ language plpgsql security definer;

-- 10. Realtime publication for conversation_members
do $$
begin
  alter publication supabase_realtime add table public.conversation_members;
exception
  when duplicate_object then null;
  when others then null;
end $$;

-- ==============================================================================
-- PHASE 8: MEDIA ATTACHMENTS & STORAGE POLICIES
-- ==============================================================================

-- 1. Safe UUID casting function
create or replace function public.safe_cast_uuid(val text)
returns uuid as $$
begin
  if val is null or val = '' then
    return null;
  end if;
  return val::uuid;
exception
  when others then
    return null;
end;
$$ language plpgsql immutable security definer set search_path = public, pg_temp;

-- 2. Extend attachments table
alter table public.attachments add column if not exists width integer;
alter table public.attachments add column if not exists height integer;

create index if not exists attachments_message_id_idx on public.attachments(message_id);

-- 3. Strict Row Level Security on public.attachments
alter table public.attachments enable row level security;

drop policy if exists "Members can view attachments in their conversations" on public.attachments;
drop policy if exists "Senders can attach records to their messages" on public.attachments;
drop policy if exists "Senders can delete their attachments" on public.attachments;
drop policy if exists "Authorized users can delete attachments" on public.attachments;

create policy "Members can view attachments in their conversations"
  on public.attachments for select
  to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and m.deleted_at is null
        and public.is_conversation_member(m.conversation_id, auth.uid())
    )
  );

create policy "Senders can attach records to their messages"
  on public.attachments for insert
  to authenticated
  with check (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and m.sender_id = auth.uid()
        and public.is_conversation_member(m.conversation_id, auth.uid())
    )
  );

create policy "Authorized users can delete attachments"
  on public.attachments for delete
  to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and (
          m.sender_id = auth.uid()
          or public.is_conversation_admin(m.conversation_id, auth.uid())
        )
    )
  );

-- 4. Storage policies for chat-attachments
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do update set public = false;

drop policy if exists "Authenticated users can upload chat attachments" on storage.objects;
drop policy if exists "Conversation members can read chat attachments" on storage.objects;
drop policy if exists "Conversation members can upload chat attachments" on storage.objects;
drop policy if exists "Authorized users can delete chat attachments" on storage.objects;

create policy "Conversation members can upload chat attachments"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and public.is_conversation_member(
      public.safe_cast_uuid((storage.foldername(name))[1]),
      auth.uid()
    )
  );

create policy "Conversation members can read chat attachments"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'chat-attachments'
    and public.is_conversation_member(
      public.safe_cast_uuid((storage.foldername(name))[1]),
      auth.uid()
    )
  );

create policy "Authorized users can delete chat attachments"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'chat-attachments'
    and (
      owner = auth.uid()
      or public.is_conversation_admin(
        public.safe_cast_uuid((storage.foldername(name))[1]),
        auth.uid()
      )
    )
  );

-- ==============================================================================
-- 23. PHASE 9: NOTIFICATIONS & PREFERENCES
-- ==============================================================================

-- 1. USER NOTIFICATION PREFERENCES TABLE
create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notifications_enabled boolean not null default true,
  sound_enabled boolean not null default true,
  desktop_notifications_enabled boolean not null default false,
  message_preview_enabled boolean not null default true,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. CONVERSATION NOTIFICATION PREFERENCES TABLE (MUTING)
create table if not exists public.conversation_notification_preferences (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  muted boolean not null default false,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (conversation_id, user_id)
);

-- 3. NOTIFICATIONS TABLE
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'message',
  read_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. INDEXES
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_user_unread_idx on public.notifications(user_id, read_at) where read_at is null;
create index if not exists notifications_conv_id_idx on public.notifications(conversation_id);
create index if not exists notifications_msg_id_idx on public.notifications(message_id);

-- 5. ROW LEVEL SECURITY
alter table public.notification_preferences enable row level security;
alter table public.conversation_notification_preferences enable row level security;
alter table public.notifications enable row level security;

-- Notification Preferences RLS
create policy "Users can view own notification preferences"
  on public.notification_preferences for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own notification preferences"
  on public.notification_preferences for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own notification preferences"
  on public.notification_preferences for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own notification preferences"
  on public.notification_preferences for delete
  to authenticated
  using (auth.uid() = user_id);

-- Conversation Notification Preferences RLS
create policy "Users can view own conversation mute preferences"
  on public.conversation_notification_preferences for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own conversation mute preferences"
  on public.conversation_notification_preferences for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and public.is_conversation_member(conversation_id, auth.uid())
  );

create policy "Users can update own conversation mute preferences"
  on public.conversation_notification_preferences for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own conversation mute preferences"
  on public.conversation_notification_preferences for delete
  to authenticated
  using (auth.uid() = user_id);

-- Notifications RLS
create policy "Users can view own notifications"
  on public.notifications for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can update own notifications"
  on public.notifications for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own notifications"
  on public.notifications for delete
  to authenticated
  using (auth.uid() = user_id);

-- 6. AUTOMATIC MESSAGE NOTIFICATION TRIGGER
create or replace function public.handle_new_message_notification()
returns trigger as $$
begin
  insert into public.notifications (user_id, conversation_id, message_id, sender_id, type)
  select
    cm.user_id,
    new.conversation_id,
    new.id,
    new.sender_id,
    'message'
  from public.conversation_members cm
  where cm.conversation_id = new.conversation_id
    and cm.user_id <> new.sender_id;
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists on_message_created_notification on public.messages;
create trigger on_message_created_notification
  after insert on public.messages
  for each row
  execute function public.handle_new_message_notification();

-- 7. RPC FUNCTIONS
create or replace function public.mark_notification_as_read(notif_id uuid)
returns boolean as $$
declare
  v_updated boolean := false;
begin
  update public.notifications
  set read_at = timezone('utc'::text, now())
  where id = notif_id
    and user_id = auth.uid()
    and read_at is null;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

create or replace function public.mark_all_notifications_as_read()
returns integer as $$
declare
  v_count integer := 0;
begin
  update public.notifications
  set read_at = timezone('utc'::text, now())
  where user_id = auth.uid()
    and read_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

create or replace function public.toggle_conversation_mute(
  conv_id uuid,
  is_muted boolean
)
returns boolean as $$
begin
  if not public.is_conversation_member(conv_id, auth.uid()) then
    raise exception 'Not authorized to mute this conversation';
  end if;

  insert into public.conversation_notification_preferences (
    conversation_id,
    user_id,
    muted,
    updated_at
  )
  values (
    conv_id,
    auth.uid(),
    is_muted,
    timezone('utc'::text, now())
  )
  on conflict (conversation_id, user_id)
  do update set
    muted = is_muted,
    updated_at = timezone('utc'::text, now());

  return true;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- 8. ADD TO REALTIME PUBLICATION
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

-- ==============================================================================
-- 24. PHASE 10: FULL-TEXT SEARCH & STARRED MESSAGES
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

-- ==============================================================================
-- 13. HEAT CHAT ADMIN PLATFORM, RBAC & SECURITY INFRASTRUCTURE
-- ==============================================================================

-- Account Status Extensions on Profiles
alter table public.profiles 
  add column if not exists is_suspended boolean not null default false,
  add column if not exists suspended_until timestamptz,
  add column if not exists suspension_reason text,
  add column if not exists is_disabled boolean not null default false,
  add column if not exists force_logout_at timestamptz;

create index if not exists idx_profiles_account_status 
  on public.profiles(is_suspended, is_disabled);

-- Admin Roles
create table if not exists public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null,
  hierarchy_level integer not null check (hierarchy_level >= 0 and hierarchy_level <= 100),
  is_system boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

-- Admin Permissions
create table if not exists public.admin_permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  category text not null,
  description text not null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_admin_permissions_category 
  on public.admin_permissions(category);

-- Role-Permission Mappings
create table if not exists public.admin_role_permissions (
  role_id uuid not null references public.admin_roles(id) on delete cascade,
  permission_id uuid not null references public.admin_permissions(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  primary key (role_id, permission_id)
);

-- Admin User Roles
create table if not exists public.admin_user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.admin_roles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default timezone('utc'::text, now()),
  scope_type text default 'global',
  scope_id text default null,
  constraint unique_user_role unique (user_id, role_id)
);

create index if not exists idx_admin_user_roles_user 
  on public.admin_user_roles(user_id);
create index if not exists idx_admin_user_roles_role 
  on public.admin_user_roles(role_id);

-- Immutable Append-Only Admin Audit Logs
create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  actor_user_id uuid not null references public.profiles(id) on delete set null,
  actor_role text not null,
  action text not null,
  target_type text not null,
  target_id text not null,
  reason text not null,
  old_value jsonb,
  new_value jsonb,
  ip_address text,
  user_agent text,
  request_id text,
  result text not null default 'SUCCESS',
  metadata jsonb
);

create index if not exists idx_admin_audit_created_at 
  on public.admin_audit_logs(created_at desc);
create index if not exists idx_admin_audit_actor 
  on public.admin_audit_logs(actor_user_id);
create index if not exists idx_admin_audit_action 
  on public.admin_audit_logs(action);
create index if not exists idx_admin_audit_target 
  on public.admin_audit_logs(target_type, target_id);

-- Prevent Audit Log Modification Trigger
create or replace function public.prevent_audit_log_modification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Security violation: admin_audit_logs entries are immutable and cannot be updated, deleted, or truncated';
end;
$$;

drop trigger if exists trg_prevent_audit_log_modification on public.admin_audit_logs;
create trigger trg_prevent_audit_log_modification
  before update or delete on public.admin_audit_logs
  for each row
  execute function public.prevent_audit_log_modification();

-- Admin Security Events
create table if not exists public.admin_security_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  event_type text not null,
  user_id uuid references public.profiles(id) on delete set null,
  email text,
  ip_address text,
  user_agent text,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  metadata jsonb
);

create index if not exists idx_security_events_created 
  on public.admin_security_events(created_at desc);
create index if not exists idx_security_events_type 
  on public.admin_security_events(event_type);
create index if not exists idx_security_events_user 
  on public.admin_security_events(user_id);

-- Moderation Reports
create table if not exists public.moderation_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('user', 'message', 'conversation', 'attachment')),
  target_id text not null,
  reason text not null,
  description text,
  status text not null default 'New' check (status in ('New', 'Assigned', 'Investigating', 'ActionTaken', 'Resolved', 'Closed')),
  assigned_to uuid references public.profiles(id) on delete set null,
  resolution_notes text,
  action_taken text,
  resolved_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_moderation_reports_status 
  on public.moderation_reports(status, created_at desc);
create index if not exists idx_moderation_reports_target 
  on public.moderation_reports(target_type, target_id);
create index if not exists idx_moderation_reports_assigned 
  on public.moderation_reports(assigned_to);

-- System Settings
create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null,
  category text not null,
  description text not null,
  is_secret boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

-- RLS Enablement
alter table public.admin_roles enable row level security;
alter table public.admin_permissions enable row level security;
alter table public.admin_role_permissions enable row level security;
alter table public.admin_user_roles enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.admin_security_events enable row level security;
alter table public.moderation_reports enable row level security;
alter table public.system_settings enable row level security;

-- Admin Helper Functions & Policies
create or replace function public.is_any_admin(p_user_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if p_user_id is null then
    return false;
  end if;
  return exists (
    select 1 from public.admin_user_roles aur
    where aur.user_id = p_user_id
  );
end;
$$;

drop policy if exists "Admin roles viewable by admins" on public.admin_roles;
create policy "Admin roles viewable by admins"
  on public.admin_roles for select
  to authenticated
  using (public.is_any_admin(auth.uid()));

drop policy if exists "Admin permissions viewable by admins" on public.admin_permissions;
create policy "Admin permissions viewable by admins"
  on public.admin_permissions for select
  to authenticated
  using (public.is_any_admin(auth.uid()));

drop policy if exists "Admin role permissions viewable by admins" on public.admin_role_permissions;
create policy "Admin role permissions viewable by admins"
  on public.admin_role_permissions for select
  to authenticated
  using (public.is_any_admin(auth.uid()));

drop policy if exists "Admin user roles viewable by admins" on public.admin_user_roles;
create policy "Admin user roles viewable by admins"
  on public.admin_user_roles for select
  to authenticated
  using (public.is_any_admin(auth.uid()));

drop policy if exists "Audit logs viewable by authorized admins" on public.admin_audit_logs;
create policy "Audit logs viewable by authorized admins"
  on public.admin_audit_logs for select
  to authenticated
  using (public.is_any_admin(auth.uid()));

drop policy if exists "Security events viewable by authorized admins" on public.admin_security_events;
create policy "Security events viewable by authorized admins"
  on public.admin_security_events for select
  to authenticated
  using (public.is_any_admin(auth.uid()));

drop policy if exists "Users view own reports and admins view all" on public.moderation_reports;
create policy "Users view own reports and admins view all"
  on public.moderation_reports for select
  to authenticated
  using (auth.uid() = reporter_id or public.is_any_admin(auth.uid()));

drop policy if exists "Authenticated users can create reports" on public.moderation_reports;
create policy "Authenticated users can create reports"
  on public.moderation_reports for insert
  to authenticated
  with check (auth.uid() = reporter_id);

drop policy if exists "System settings viewable by admins" on public.system_settings;
create policy "System settings viewable by admins"
  on public.system_settings for select
  to authenticated
  using (public.is_any_admin(auth.uid()));

-- Hardened Security Definer Functions
create or replace function public.has_admin_permission(req_permission text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_caller_id uuid;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    return false;
  end if;

  if exists (
    select 1 from public.profiles
    where id = v_caller_id
      and (is_disabled = true or is_suspended = true)
  ) then
    return false;
  end if;

  return exists (
    select 1
    from public.admin_user_roles aur
    join public.admin_role_permissions arp on arp.role_id = aur.role_id
    join public.admin_permissions ap on ap.id = arp.permission_id
    where aur.user_id = v_caller_id
      and ap.key = req_permission
  );
end;
$$;

create or replace function public.get_caller_admin_permissions()
returns table(permission_key text)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_caller_id uuid;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    return;
  end if;

  return query
  select distinct ap.key
  from public.admin_user_roles aur
  join public.admin_role_permissions arp on arp.role_id = aur.role_id
  join public.admin_permissions ap on ap.id = arp.permission_id
  where aur.user_id = v_caller_id;
end;
$$;

create or replace function public.get_caller_admin_roles()
returns table(role_name text, hierarchy_level integer)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_caller_id uuid;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    return;
  end if;

  return query
  select ar.name, ar.hierarchy_level
  from public.admin_user_roles aur
  join public.admin_roles ar on ar.id = aur.role_id
  where aur.user_id = v_caller_id
  order by ar.hierarchy_level desc;
end;
$$;

create or replace function public.admin_log_audit(
  p_action text,
  p_target_type text,
  p_target_id text,
  p_reason text,
  p_old_value jsonb default null,
  p_new_value jsonb default null,
  p_ip_address text default null,
  p_user_agent text default null,
  p_result text default 'SUCCESS',
  p_metadata jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_top_role text;
  v_log_id uuid;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Unauthenticated audit attempt';
  end if;

  select ar.name into v_top_role
  from public.admin_user_roles aur
  join public.admin_roles ar on ar.id = aur.role_id
  where aur.user_id = v_caller_id
  order by ar.hierarchy_level desc
  limit 1;

  if v_top_role is null then
    v_top_role := 'Anonymous';
  end if;

  insert into public.admin_audit_logs (
    actor_user_id,
    actor_role,
    action,
    target_type,
    target_id,
    reason,
    old_value,
    new_value,
    ip_address,
    user_agent,
    result,
    metadata
  ) values (
    v_caller_id,
    v_top_role,
    p_action,
    p_target_type,
    p_target_id,
    p_reason,
    p_old_value,
    p_new_value,
    p_ip_address,
    p_user_agent,
    p_result,
    p_metadata
  ) returning id into v_log_id;

  return v_log_id;
end;
$$;

-- ==============================================================================
-- 14. ADMIN PLATFORM: SEPARATE AUTH, PRIMARY SUPERADMIN BOOTSTRAP & MFA
-- ==============================================================================

ALTER TABLE public.admin_user_roles 
  ADD COLUMN IF NOT EXISTS is_primary_superadmin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mfa_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS mfa_enrolled_at timestamptz,
  ADD COLUMN IF NOT EXISTS mfa_last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS account_state text NOT NULL DEFAULT 'ACTIVE' 
    CHECK (account_state IN ('INVITED', 'EMAIL_PENDING', 'EMAIL_VERIFIED', 'MFA_PENDING', 'MFA_VERIFIED', 'ACTIVE', 'SUSPENDED', 'DISABLED', 'REVOKED')),
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_admin_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS mfa_reset_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_primary_superadmin 
  ON public.admin_user_roles(is_primary_superadmin) 
  WHERE is_primary_superadmin = true;

CREATE TABLE IF NOT EXISTS public.admin_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role_id uuid NOT NULL REFERENCES public.admin_roles(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  invited_by uuid NOT NULL REFERENCES public.profiles(id),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_admin_invitations_token_hash ON public.admin_invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_invitations_email ON public.admin_invitations(email);

ALTER TABLE public.admin_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin invitations viewable only by authorized admins"
  ON public.admin_invitations FOR SELECT
  TO authenticated
  USING (public.is_any_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.admin_mfa_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_admin_recovery_codes_user ON public.admin_mfa_recovery_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_recovery_codes_hash ON public.admin_mfa_recovery_codes(code_hash);

ALTER TABLE public.admin_mfa_recovery_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recovery codes viewable only by account owner"
  ON public.admin_mfa_recovery_codes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.admin_is_bootstrap_available()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.admin_user_roles
  WHERE is_primary_superadmin = true;

  RETURN v_count = 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_bootstrap_primary_superadmin(
  p_user_id uuid,
  p_display_name text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
  v_role_id uuid;
  v_user_email text;
  v_email_confirmed timestamptz;
BEGIN
  LOCK TABLE public.admin_user_roles IN EXCLUSIVE MODE;

  SELECT EXISTS (
    SELECT 1 FROM public.admin_user_roles WHERE is_primary_superadmin = true
  ) INTO v_exists;

  IF v_exists THEN
    RAISE EXCEPTION 'Initial administrator setup has already been completed.';
  END IF;

  SELECT email, email_confirmed_at INTO v_user_email, v_email_confirmed
  FROM auth.users
  WHERE id = p_user_id;

  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'Target user not found.';
  END IF;

  IF v_email_confirmed IS NULL THEN
    RAISE EXCEPTION 'Email must be verified before SuperAdmin activation.';
  END IF;

  INSERT INTO public.profiles (id, username, display_name, status)
  VALUES (
    p_user_id,
    COALESCE((SELECT username FROM public.profiles WHERE id = p_user_id), split_part(v_user_email, '@', 1)),
    COALESCE(p_display_name, (SELECT display_name FROM public.profiles WHERE id = p_user_id), split_part(v_user_email, '@', 1)),
    'online'
  )
  ON CONFLICT (id) DO UPDATE SET
    display_name = COALESCE(EXCLUDED.display_name, public.profiles.display_name),
    updated_at = timezone('utc'::text, now());

  SELECT id INTO v_role_id FROM public.admin_roles WHERE name = 'SuperAdmin';
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'SuperAdmin system role is not defined.';
  END IF;

  INSERT INTO public.admin_user_roles (
    user_id,
    role_id,
    assigned_by,
    is_primary_superadmin,
    mfa_required,
    mfa_enrolled_at,
    mfa_last_verified_at,
    account_state,
    activated_at,
    last_admin_login_at
  ) VALUES (
    p_user_id,
    v_role_id,
    p_user_id,
    true,
    true,
    timezone('utc'::text, now()),
    timezone('utc'::text, now()),
    'ACTIVE',
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
  )
  ON CONFLICT (user_id, role_id) DO UPDATE SET
    is_primary_superadmin = true,
    account_state = 'ACTIVE',
    mfa_required = true,
    mfa_last_verified_at = timezone('utc'::text, now()),
    activated_at = timezone('utc'::text, now());

  INSERT INTO public.admin_audit_logs (
    actor_user_id,
    actor_role,
    action,
    target_type,
    target_id,
    reason,
    result
  ) VALUES (
    p_user_id,
    'SuperAdmin',
    'PRIMARY_SUPERADMIN_CREATED',
    'user',
    p_user_id::text,
    'Initial platform bootstrap completed successfully.',
    'SUCCESS'
  );

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_invitation(
  p_email text,
  p_role_id uuid,
  p_token_hash text,
  p_expires_hours integer DEFAULT 48
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_level integer;
  v_target_level integer;
  v_invitation_id uuid;
  v_role_name text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF NOT public.has_admin_permission('roles.manage') THEN
    RAISE EXCEPTION 'Access denied: missing roles.manage permission.';
  END IF;

  SELECT COALESCE(max(r.hierarchy_level), 0) INTO v_caller_level
  FROM public.admin_user_roles ur
  JOIN public.admin_roles r ON ur.role_id = r.id
  WHERE ur.user_id = v_caller AND ur.account_state = 'ACTIVE';

  SELECT hierarchy_level, name INTO v_target_level, v_role_name
  FROM public.admin_roles
  WHERE id = p_role_id;

  IF v_target_level IS NULL THEN
    RAISE EXCEPTION 'Target role does not exist.';
  END IF;

  IF v_target_level >= v_caller_level THEN
    RAISE EXCEPTION 'Hierarchy violation: cannot invite an administrator with equal or higher role level.';
  END IF;

  UPDATE public.admin_invitations
  SET revoked_at = timezone('utc'::text, now())
  WHERE email = lower(trim(p_email)) AND accepted_at IS NULL AND revoked_at IS NULL;

  INSERT INTO public.admin_invitations (
    email,
    role_id,
    token_hash,
    invited_by,
    expires_at
  ) VALUES (
    lower(trim(p_email)),
    p_role_id,
    p_token_hash,
    v_caller,
    timezone('utc'::text, now()) + (p_expires_hours || ' hours')::interval
  ) RETURNING id INTO v_invitation_id;

  INSERT INTO public.admin_audit_logs (
    actor_user_id,
    actor_role,
    action,
    target_type,
    target_id,
    reason,
    metadata,
    result
  ) VALUES (
    v_caller,
    'Admin',
    'ADMIN_INVITED',
    'user',
    p_email,
    'Administrator invitation generated.',
    jsonb_build_object('role_name', v_role_name, 'role_id', p_role_id, 'expires_hours', p_expires_hours),
    'SUCCESS'
  );

  RETURN v_invitation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_validate_invitation(p_token_hash text)
RETURNS TABLE (
  invitation_id uuid,
  email text,
  role_id uuid,
  role_name text,
  hierarchy_level integer,
  invited_by_username text,
  is_valid boolean,
  invalid_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv record;
BEGIN
  SELECT 
    i.id,
    i.email,
    i.role_id,
    r.name as role_name,
    r.hierarchy_level,
    p.username as invited_by_username,
    i.expires_at,
    i.accepted_at,
    i.revoked_at
  INTO v_inv
  FROM public.admin_invitations i
  JOIN public.admin_roles r ON i.role_id = r.id
  JOIN public.profiles p ON i.invited_by = p.id
  WHERE i.token_hash = p_token_hash;

  IF v_inv.id IS NULL THEN
    RETURN QUERY SELECT 
      NULL::uuid, NULL::text, NULL::uuid, NULL::text, NULL::integer, NULL::text,
      false, 'Invitation token not found or invalid.';
    RETURN;
  END IF;

  IF v_inv.accepted_at IS NOT NULL THEN
    RETURN QUERY SELECT 
      v_inv.id, v_inv.email, v_inv.role_id, v_inv.role_name, v_inv.hierarchy_level, v_inv.invited_by_username,
      false, 'Invitation has already been used.';
    RETURN;
  END IF;

  IF v_inv.revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT 
      v_inv.id, v_inv.email, v_inv.role_id, v_inv.role_name, v_inv.hierarchy_level, v_inv.invited_by_username,
      false, 'Invitation has been revoked.';
    RETURN;
  END IF;

  IF v_inv.expires_at < timezone('utc'::text, now()) THEN
    RETURN QUERY SELECT 
      v_inv.id, v_inv.email, v_inv.role_id, v_inv.role_name, v_inv.hierarchy_level, v_inv.invited_by_username,
      false, 'Invitation token has expired.';
    RETURN;
  END IF;

  RETURN QUERY SELECT 
    v_inv.id, v_inv.email, v_inv.role_id, v_inv.role_name, v_inv.hierarchy_level, v_inv.invited_by_username,
    true, NULL::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_accept_invitation(
  p_user_id uuid,
  p_token_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv record;
  v_user_email text;
  v_email_confirmed timestamptz;
BEGIN
  SELECT i.*, r.name as role_name
  INTO v_inv
  FROM public.admin_invitations i
  JOIN public.admin_roles r ON i.role_id = r.id
  WHERE i.token_hash = p_token_hash
    AND i.accepted_at IS NULL
    AND i.revoked_at IS NULL
    AND i.expires_at > timezone('utc'::text, now());

  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'Invalid, expired, or previously used invitation token.';
  END IF;

  SELECT email, email_confirmed_at INTO v_user_email, v_email_confirmed
  FROM auth.users
  WHERE id = p_user_id;

  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'Target user not found.';
  END IF;

  IF lower(trim(v_user_email)) != lower(trim(v_inv.email)) THEN
    RAISE EXCEPTION 'User email does not match invited email address.';
  END IF;

  IF v_email_confirmed IS NULL THEN
    RAISE EXCEPTION 'Email must be verified before administrator role activation.';
  END IF;

  UPDATE public.admin_invitations
  SET accepted_at = timezone('utc'::text, now())
  WHERE id = v_inv.id;

  INSERT INTO public.admin_user_roles (
    user_id,
    role_id,
    assigned_by,
    is_primary_superadmin,
    mfa_required,
    mfa_enrolled_at,
    mfa_last_verified_at,
    account_state,
    activated_at,
    last_admin_login_at
  ) VALUES (
    p_user_id,
    v_inv.role_id,
    v_inv.invited_by,
    false,
    true,
    timezone('utc'::text, now()),
    timezone('utc'::text, now()),
    'ACTIVE',
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
  )
  ON CONFLICT (user_id, role_id) DO UPDATE SET
    account_state = 'ACTIVE',
    mfa_required = true,
    mfa_last_verified_at = timezone('utc'::text, now()),
    activated_at = timezone('utc'::text, now());

  INSERT INTO public.admin_audit_logs (
    actor_user_id,
    actor_role,
    action,
    target_type,
    target_id,
    reason,
    metadata,
    result
  ) VALUES (
    p_user_id,
    v_inv.role_name,
    'ADMIN_ACTIVATED',
    'user',
    p_user_id::text,
    'Administrator accepted invitation and activated account.',
    jsonb_build_object('invitation_id', v_inv.id, 'role_name', v_inv.role_name),
    'SUCCESS'
  );

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_mfa_status(
  p_user_id uuid,
  p_enrolled boolean DEFAULT true,
  p_verified boolean DEFAULT true
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() != p_user_id AND NOT public.has_admin_permission('security.manage') THEN
    RAISE EXCEPTION 'Access denied: cannot update MFA status for another user without security.manage.';
  END IF;

  UPDATE public.admin_user_roles
  SET 
    mfa_enrolled_at = CASE WHEN p_enrolled THEN COALESCE(mfa_enrolled_at, timezone('utc'::text, now())) ELSE NULL END,
    mfa_last_verified_at = CASE WHEN p_verified THEN timezone('utc'::text, now()) ELSE mfa_last_verified_at END,
    last_admin_login_at = timezone('utc'::text, now())
  WHERE user_id = p_user_id;

  RETURN true;
END;
$$;

-- Permanent User Deletion (SuperAdmin Only)
CREATE OR REPLACE FUNCTION public.admin_delete_user(
  p_target_user_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_is_superadmin boolean;
  v_target_is_primary boolean;
  v_target_profile record;
BEGIN
  -- 1. Derive caller strictly from authenticated context
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required for administrative operations.' USING ERRCODE = '42501';
  END IF;

  -- 2. Verify caller is an active SuperAdmin
  SELECT EXISTS (
    SELECT 1 
    FROM public.admin_user_roles aur
    JOIN public.admin_roles ar ON aur.role_id = ar.id
    WHERE aur.user_id = v_caller_id
      AND aur.account_state = 'ACTIVE'
      AND (ar.name = 'SuperAdmin' OR aur.is_primary_superadmin = true)
  ) INTO v_is_superadmin;

  IF NOT v_is_superadmin THEN
    RAISE EXCEPTION 'Access denied: Permanent user deletion is strictly restricted to SuperAdmin.' USING ERRCODE = '42501';
  END IF;

  -- 3. Prevent Self-Deletion
  IF p_target_user_id = v_caller_id THEN
    RAISE EXCEPTION 'Security violation: Administrators cannot delete their own account.' USING ERRCODE = '42501';
  END IF;

  -- 4. Prevent Primary SuperAdmin Deletion
  SELECT EXISTS (
    SELECT 1 
    FROM public.admin_user_roles 
    WHERE user_id = p_target_user_id 
      AND is_primary_superadmin = true
  ) INTO v_target_is_primary;

  IF v_target_is_primary THEN
    RAISE EXCEPTION 'Security violation: Primary SuperAdmin account cannot be deleted.' USING ERRCODE = '42501';
  END IF;

  -- 5. Capture target metadata before deletion
  SELECT * INTO v_target_profile
  FROM public.profiles
  WHERE id = p_target_user_id;

  -- 6. Purge dependent application records in safe dependency order
  DELETE FROM public.admin_mfa_recovery_codes WHERE user_id = p_target_user_id;
  DELETE FROM public.admin_user_roles WHERE user_id = p_target_user_id;
  DELETE FROM public.starred_messages WHERE user_id = p_target_user_id;
  DELETE FROM public.message_reads WHERE user_id = p_target_user_id;
  DELETE FROM public.message_reactions WHERE user_id = p_target_user_id;
  DELETE FROM public.attachments WHERE uploader_id = p_target_user_id;
  DELETE FROM public.messages WHERE sender_id = p_target_user_id;
  DELETE FROM public.conversation_members WHERE user_id = p_target_user_id;
  DELETE FROM public.friendships WHERE user_id = p_target_user_id OR friend_id = p_target_user_id;
  DELETE FROM public.notifications WHERE user_id = p_target_user_id OR actor_id = p_target_user_id;
  DELETE FROM public.notification_preferences WHERE user_id = p_target_user_id;
  DELETE FROM public.conversation_notification_preferences WHERE user_id = p_target_user_id;
  DELETE FROM public.profiles WHERE id = p_target_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_user_id', p_target_user_id,
    'username', v_target_profile.username,
    'display_name', v_target_profile.display_name,
    'reason', p_reason
  );
END;
$$;

-- Table for tracking durable user deletion lifecycle & reconciliation
CREATE TABLE IF NOT EXISTS public.admin_user_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL UNIQUE,
  target_email text,
  target_username text,
  target_display_name text,
  actor_user_id uuid NOT NULL,
  reason text NOT NULL,
  state text NOT NULL CHECK (state IN (
    'DELETION_REQUESTED',
    'DELETING_STORAGE',
    'DELETING_APPLICATION_DATA',
    'DELETING_AUTH',
    'COMPLETED',
    'FAILED_REQUIRES_RECONCILIATION'
  )),
  last_error text,
  storage_paths_to_delete text[],
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_admin_user_deletions_target ON public.admin_user_deletions(target_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_user_deletions_state ON public.admin_user_deletions(state);

DROP TRIGGER IF EXISTS set_admin_user_deletions_updated_at ON public.admin_user_deletions;
CREATE TRIGGER set_admin_user_deletions_updated_at
  BEFORE UPDATE ON public.admin_user_deletions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.admin_user_deletions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SuperAdmins can manage deletion records" ON public.admin_user_deletions;
CREATE POLICY "SuperAdmins can manage deletion records"
  ON public.admin_user_deletions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_user_roles aur
      JOIN public.admin_roles ar ON aur.role_id = ar.id
      WHERE aur.user_id = auth.uid()
        AND aur.account_state = 'ACTIVE'
        AND (ar.name = 'SuperAdmin' OR aur.is_primary_superadmin = true)
    )
  );

CREATE OR REPLACE FUNCTION public.admin_initiate_user_deletion(
  p_target_user_id uuid,
  p_reason text,
  p_target_email text DEFAULT NULL,
  p_target_username text DEFAULT NULL,
  p_target_display_name text DEFAULT NULL,
  p_storage_paths text[] DEFAULT ARRAY[]::text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_is_superadmin boolean;
  v_existing record;
  v_new_id uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 
    FROM public.admin_user_roles aur
    JOIN public.admin_roles ar ON aur.role_id = ar.id
    WHERE aur.user_id = v_caller_id
      AND aur.account_state = 'ACTIVE'
      AND (ar.name = 'SuperAdmin' OR aur.is_primary_superadmin = true)
  ) INTO v_is_superadmin;

  IF NOT v_is_superadmin THEN
    RAISE EXCEPTION 'Access denied: Permanent user deletion requires SuperAdmin role.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_existing
  FROM public.admin_user_deletions
  WHERE target_user_id = p_target_user_id;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.state = 'COMPLETED' THEN
      RETURN jsonb_build_object(
        'status', 'ALREADY_COMPLETED',
        'deletion_id', v_existing.id,
        'state', v_existing.state,
        'completed_at', v_existing.completed_at
      );
    END IF;

    IF v_existing.state IN ('DELETION_REQUESTED', 'DELETING_STORAGE', 'DELETING_APPLICATION_DATA', 'DELETING_AUTH')
       AND v_existing.updated_at > timezone('utc'::text, now()) - interval '30 seconds' THEN
      RETURN jsonb_build_object(
        'status', 'IN_PROGRESS',
        'deletion_id', v_existing.id,
        'state', v_existing.state
      );
    END IF;

    UPDATE public.admin_user_deletions
    SET 
      state = 'DELETION_REQUESTED',
      last_error = NULL,
      updated_at = timezone('utc'::text, now())
    WHERE id = v_existing.id;

    RETURN jsonb_build_object(
      'status', 'RESUMING',
      'deletion_id', v_existing.id,
      'state', 'DELETION_REQUESTED',
      'storage_paths', v_existing.storage_paths_to_delete
    );
  END IF;

  INSERT INTO public.admin_user_deletions (
    target_user_id,
    target_email,
    target_username,
    target_display_name,
    actor_user_id,
    reason,
    state,
    storage_paths_to_delete
  ) VALUES (
    p_target_user_id,
    p_target_email,
    p_target_username,
    p_target_display_name,
    v_caller_id,
    p_reason,
    'DELETION_REQUESTED',
    p_storage_paths
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'status', 'INITIATED',
    'deletion_id', v_new_id,
    'state', 'DELETION_REQUESTED'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_advance_deletion_state(
  p_deletion_id uuid,
  p_next_state text,
  p_last_error text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.admin_user_deletions
  SET 
    state = p_next_state,
    last_error = p_last_error,
    updated_at = timezone('utc'::text, now()),
    completed_at = CASE WHEN p_next_state = 'COMPLETED' THEN timezone('utc'::text, now()) ELSE completed_at END
  WHERE id = p_deletion_id;

  RETURN FOUND;
END;
$$;

-- Extend admin_user_deletions table with operational tracking fields
ALTER TABLE IF EXISTS public.admin_user_deletions 
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_admin_user_deletions_stuck 
  ON public.admin_user_deletions(state, updated_at);

-- Configurable Stuck-Deletion Detection RPC
CREATE OR REPLACE FUNCTION public.admin_get_stuck_deletions(
  p_timeout_minutes integer DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  target_user_id uuid,
  target_email text,
  target_username text,
  target_display_name text,
  actor_user_id uuid,
  reason text,
  state text,
  last_error text,
  retry_count integer,
  created_at timestamptz,
  updated_at timestamptz,
  is_stuck boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_is_superadmin boolean;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 
    FROM public.admin_user_roles aur
    JOIN public.admin_roles ar ON aur.role_id = ar.id
    WHERE aur.user_id = v_caller_id
      AND aur.account_state = 'ACTIVE'
      AND (ar.name = 'SuperAdmin' OR aur.is_primary_superadmin = true)
  ) INTO v_is_superadmin;

  IF NOT v_is_superadmin THEN
    RAISE EXCEPTION 'Access denied: Viewing deletion operations requires SuperAdmin role.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT 
    aud.id,
    aud.target_user_id,
    aud.target_email,
    aud.target_username,
    aud.target_display_name,
    aud.actor_user_id,
    aud.reason,
    aud.state,
    aud.last_error,
    aud.retry_count,
    aud.created_at,
    aud.updated_at,
    (
      aud.state = 'FAILED_REQUIRES_RECONCILIATION' OR
      (
        aud.state IN ('DELETION_REQUESTED', 'DELETING_STORAGE', 'DELETING_APPLICATION_DATA', 'DELETING_AUTH')
        AND aud.updated_at < (timezone('utc'::text, now()) - (p_timeout_minutes || ' minutes')::interval)
      )
    ) AS is_stuck
  FROM public.admin_user_deletions aud
  ORDER BY aud.created_at DESC;
END;
$$;

-- Atomic Lock & Start Reconciliation RPC
CREATE OR REPLACE FUNCTION public.admin_start_deletion_reconciliation(
  p_operation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_is_superadmin boolean;
  v_rec record;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 
    FROM public.admin_user_roles aur
    JOIN public.admin_roles ar ON aur.role_id = ar.id
    WHERE aur.user_id = v_caller_id
      AND aur.account_state = 'ACTIVE'
      AND (ar.name = 'SuperAdmin' OR aur.is_primary_superadmin = true)
  ) INTO v_is_superadmin;

  IF NOT v_is_superadmin THEN
    RAISE EXCEPTION 'Access denied: Reconciling deletions requires SuperAdmin role.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_rec
  FROM public.admin_user_deletions
  WHERE id = p_operation_id
  FOR UPDATE;

  IF v_rec.id IS NULL THEN
    RETURN jsonb_build_object('status', 'NOT_FOUND');
  END IF;

  IF v_rec.state = 'COMPLETED' THEN
    RETURN jsonb_build_object(
      'status', 'ALREADY_COMPLETED',
      'deletion_id', v_rec.id,
      'completed_at', v_rec.completed_at
    );
  END IF;

  -- Concurrency check: if another admin actively reconciled within last 30s
  IF v_rec.last_reconciled_at IS NOT NULL 
     AND v_rec.last_reconciled_at > timezone('utc'::text, now()) - interval '30 seconds'
     AND v_rec.reconciled_by IS NOT NULL 
     AND v_rec.reconciled_by != v_caller_id THEN
    RETURN jsonb_build_object(
      'status', 'IN_PROGRESS',
      'deletion_id', v_rec.id,
      'reconciled_by', v_rec.reconciled_by
    );
  END IF;

  -- Acquire reconciliation lock
  UPDATE public.admin_user_deletions
  SET 
    retry_count = retry_count + 1,
    last_reconciled_at = timezone('utc'::text, now()),
    reconciled_by = v_caller_id,
    updated_at = timezone('utc'::text, now())
  WHERE id = p_operation_id;

  RETURN jsonb_build_object(
    'status', 'LOCKED_FOR_RECONCILIATION',
    'deletion_id', v_rec.id,
    'target_user_id', v_rec.target_user_id,
    'target_email', v_rec.target_email,
    'target_username', v_rec.target_username,
    'target_display_name', v_rec.target_display_name,
    'previous_state', v_rec.state,
    'storage_paths', v_rec.storage_paths_to_delete,
    'retry_count', v_rec.retry_count + 1
  );
END;
$$;

-- ==============================================================================
-- Heat Chat — Phase 3: Advanced Messaging, Actions, Threads, Reactions,
-- Read/Delivery State, Pinning, Forwarding, Drafts & Unread Engine
-- Migration Timestamp: 2026-09-02
-- ==============================================================================

-- 1. MESSAGES TABLE EXTENSIONS
alter table public.messages
  add column if not exists client_message_id uuid,
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists delete_scope text check (delete_scope in ('me', 'everyone')),
  add column if not exists forwarded_from_message_id uuid references public.messages(id) on delete set null;

create unique index if not exists idx_messages_sender_client_id 
  on public.messages(sender_id, client_message_id)
  where client_message_id is not null;

create index if not exists idx_messages_forwarded_from 
  on public.messages(forwarded_from_message_id);

alter table public.message_reactions
  drop constraint if exists message_reactions_reaction_check;

alter table public.message_reactions
  add constraint message_reactions_reaction_check
  check (reaction in ('❤️', '😂', '👍', '😮', '😢', '🔥', '😡', '👏'));

-- 2. NEW TABLES FOR PHASE 3
create table if not exists public.message_user_states (
  user_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  hidden_at timestamptz not null default timezone('utc'::text, now()),
  primary key (user_id, message_id)
);

create index if not exists idx_msg_user_states_user 
  on public.message_user_states(user_id);
create index if not exists idx_msg_user_states_msg 
  on public.message_user_states(message_id);

create table if not exists public.message_pins (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  pinned_by uuid not null references public.profiles(id) on delete cascade,
  pinned_at timestamptz not null default timezone('utc'::text, now()),
  constraint unique_conversation_pinned_message unique (conversation_id, message_id)
);

create index if not exists idx_message_pins_conv 
  on public.message_pins(conversation_id, pinned_at desc);
create index if not exists idx_message_pins_msg 
  on public.message_pins(message_id);

create table if not exists public.message_delivery_states (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delivered_at timestamptz not null default timezone('utc'::text, now()),
  primary key (message_id, user_id)
);

create index if not exists idx_msg_delivery_user 
  on public.message_delivery_states(user_id);
create index if not exists idx_msg_delivery_msg 
  on public.message_delivery_states(message_id);

create table if not exists public.conversation_user_states (
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  last_read_message_id uuid references public.messages(id) on delete set null,
  last_read_at timestamptz,
  unread_count integer not null default 0,
  is_marked_unread boolean not null default false,
  primary key (user_id, conversation_id)
);

create index if not exists idx_conv_user_states_user 
  on public.conversation_user_states(user_id);
create index if not exists idx_conv_user_states_conv 
  on public.conversation_user_states(conversation_id);

create table if not exists public.conversation_drafts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  content text not null,
  reply_to_message_id uuid references public.messages(id) on delete set null,
  updated_at timestamptz not null default timezone('utc'::text, now()),
  primary key (user_id, conversation_id)
);

create index if not exists idx_conv_drafts_user 
  on public.conversation_drafts(user_id);

-- 3. ROW LEVEL SECURITY (RLS) FOR NEW TABLES
alter table public.message_user_states enable row level security;
alter table public.message_pins enable row level security;
alter table public.message_delivery_states enable row level security;
alter table public.conversation_user_states enable row level security;
alter table public.conversation_drafts enable row level security;

-- message_user_states policies
drop policy if exists "Users can view own message states" on public.message_user_states;
create policy "Users can view own message states"
  on public.message_user_states for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own message states" on public.message_user_states;
create policy "Users can insert own message states"
  on public.message_user_states for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own message states" on public.message_user_states;
create policy "Users can delete own message states"
  on public.message_user_states for delete
  to authenticated
  using (auth.uid() = user_id);

-- message_pins policies
drop policy if exists "Members can view pins in their conversations" on public.message_pins;
create policy "Members can view pins in their conversations"
  on public.message_pins for select
  to authenticated
  using (public.is_conversation_member(conversation_id, auth.uid()));

drop policy if exists "Members can insert pins in their conversations" on public.message_pins;
create policy "Members can insert pins in their conversations"
  on public.message_pins for insert
  to authenticated
  with check (
    auth.uid() = pinned_by and 
    public.is_conversation_member(conversation_id, auth.uid())
  );

drop policy if exists "Members can delete pins in their conversations" on public.message_pins;
create policy "Members can delete pins in their conversations"
  on public.message_pins for delete
  to authenticated
  using (public.is_conversation_member(conversation_id, auth.uid()));

-- message_delivery_states policies
drop policy if exists "Members can view delivery states" on public.message_delivery_states;
create policy "Members can view delivery states"
  on public.message_delivery_states for select
  to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and public.is_conversation_member(m.conversation_id, auth.uid())
    )
  );

drop policy if exists "Users can record own delivery state" on public.message_delivery_states;
create policy "Users can record own delivery state"
  on public.message_delivery_states for insert
  to authenticated
  with check (auth.uid() = user_id);

-- conversation_user_states policies
drop policy if exists "Users can view own conversation state" on public.conversation_user_states;
create policy "Users can view own conversation state"
  on public.conversation_user_states for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can upsert own conversation state" on public.conversation_user_states;
create policy "Users can upsert own conversation state"
  on public.conversation_user_states for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own conversation state" on public.conversation_user_states;
create policy "Users can update own conversation state"
  on public.conversation_user_states for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- conversation_drafts policies
drop policy if exists "Users can manage own drafts" on public.conversation_drafts;
create policy "Users can manage own drafts"
  on public.conversation_drafts for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4. SECURITY DEFINER RPCS FOR ADVANCED MESSAGING
create or replace function public.send_message(
  p_conversation_id uuid,
  p_content text,
  p_client_message_id uuid default null,
  p_reply_to_message_id uuid default null,
  p_forwarded_from_message_id uuid default null,
  p_message_type text default 'text'
)
returns jsonb as $$
declare
  v_sender_id uuid;
  v_conv record;
  v_other_member_id uuid;
  v_existing_msg record;
  v_reply_msg record;
  v_forward_msg record;
  v_new_msg record;
  v_clean_content text;
begin
  v_sender_id := auth.uid();
  if v_sender_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  -- 1. Check conversation membership
  if not public.is_conversation_member(p_conversation_id, v_sender_id) then
    raise exception 'CONVERSATION_ACCESS_DENIED';
  end if;

  -- 2. Fetch conversation details
  select id, type into v_conv
  from public.conversations
  where id = p_conversation_id;

  if v_conv.id is null then
    raise exception 'CONVERSATION_NOT_FOUND';
  end if;

  -- 3. If direct conversation, enforce blocking and privacy
  if v_conv.type = 'direct' then
    select user_id into v_other_member_id
    from public.conversation_members
    where conversation_id = p_conversation_id
      and user_id <> v_sender_id
    limit 1;

    if v_other_member_id is not null then
      if public.is_user_blocked(v_sender_id, v_other_member_id) then
        raise exception 'MESSAGE_BLOCKED';
      end if;

      if not public.can_send_message(v_sender_id, v_other_member_id) then
        raise exception 'PRIVACY_RESTRICTED';
      end if;
    end if;
  end if;

  -- 4. Validate content
  v_clean_content := trim(coalesce(p_content, ''));
  if length(v_clean_content) = 0 then
    raise exception 'MESSAGE_EMPTY';
  end if;
  if length(v_clean_content) > 4000 then
    raise exception 'MESSAGE_TOO_LONG';
  end if;

  -- 5. Validate reply target if supplied (must be in same conversation and not inaccessible)
  if p_reply_to_message_id is not null then
    select id, conversation_id into v_reply_msg
    from public.messages
    where id = p_reply_to_message_id;

    if v_reply_msg.id is null or v_reply_msg.conversation_id <> p_conversation_id then
      raise exception 'INVALID_REPLY_TARGET';
    end if;
  end if;

  -- 6. Validate forwarded target if supplied (caller must have access to original message)
  if p_forwarded_from_message_id is not null then
    select id, conversation_id into v_forward_msg
    from public.messages
    where id = p_forwarded_from_message_id;

    if v_forward_msg.id is null or not public.is_conversation_member(v_forward_msg.conversation_id, v_sender_id) then
      raise exception 'INVALID_FORWARD_TARGET';
    end if;
  end if;

  -- 7. Check idempotency: if client_message_id already exists for sender, return existing
  if p_client_message_id is not null then
    select * into v_existing_msg
    from public.messages
    where sender_id = v_sender_id and client_message_id = p_client_message_id;

    if v_existing_msg.id is not null then
      return jsonb_build_object(
        'success', true,
        'messageId', v_existing_msg.id,
        'conversationId', v_existing_msg.conversation_id,
        'senderId', v_existing_msg.sender_id,
        'content', v_existing_msg.content,
        'clientMessageId', v_existing_msg.client_message_id,
        'createdAt', v_existing_msg.created_at,
        'duplicate', true
      );
    end if;
  end if;

  -- 8. Insert message
  insert into public.messages (
    conversation_id,
    sender_id,
    content,
    message_type,
    reply_to_message_id,
    forwarded_from_message_id,
    client_message_id
  ) values (
    p_conversation_id,
    v_sender_id,
    v_clean_content,
    coalesce(p_message_type, 'text'),
    p_reply_to_message_id,
    p_forwarded_from_message_id,
    p_client_message_id
  )
  returning * into v_new_msg;

  -- 9. Update conversation updated_at
  update public.conversations
  set updated_at = timezone('utc'::text, now())
  where id = p_conversation_id;

  -- 10. Update unread count for other members in conversation_user_states
  insert into public.conversation_user_states (user_id, conversation_id, unread_count, is_marked_unread)
  select cm.user_id, p_conversation_id, 1, false
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id and cm.user_id <> v_sender_id
  on conflict (user_id, conversation_id)
  do update set 
    unread_count = public.conversation_user_states.unread_count + 1,
    is_marked_unread = false;

  -- 11. Clear draft for sender if exists
  delete from public.conversation_drafts
  where user_id = v_sender_id and conversation_id = p_conversation_id;

  return jsonb_build_object(
    'success', true,
    'messageId', v_new_msg.id,
    'conversationId', v_new_msg.conversation_id,
    'senderId', v_new_msg.sender_id,
    'content', v_new_msg.content,
    'messageType', v_new_msg.message_type,
    'replyToMessageId', v_new_msg.reply_to_message_id,
    'forwardedFromMessageId', v_new_msg.forwarded_from_message_id,
    'clientMessageId', v_new_msg.client_message_id,
    'createdAt', v_new_msg.created_at,
    'duplicate', false
  );
end;
$$ language plpgsql security definer;

create or replace function public.edit_message(
  p_message_id uuid,
  p_content text
)
returns jsonb as $$
declare
  v_actor_id uuid;
  v_msg record;
  v_clean_content text;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select id, conversation_id, sender_id, content, deleted_at, created_at
  into v_msg
  from public.messages
  where id = p_message_id
  for update;

  if v_msg.id is null then
    raise exception 'MESSAGE_NOT_FOUND';
  end if;

  if v_msg.sender_id <> v_actor_id then
    raise exception 'MESSAGE_EDIT_FORBIDDEN';
  end if;

  if v_msg.deleted_at is not null then
    raise exception 'MESSAGE_ALREADY_DELETED';
  end if;

  v_clean_content := trim(coalesce(p_content, ''));
  if length(v_clean_content) = 0 then
    raise exception 'MESSAGE_EMPTY';
  end if;
  if length(v_clean_content) > 4000 then
    raise exception 'MESSAGE_TOO_LONG';
  end if;

  update public.messages
  set content = v_clean_content,
      edited_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  where id = p_message_id;

  return jsonb_build_object(
    'success', true,
    'messageId', p_message_id,
    'content', v_clean_content,
    'editedAt', timezone('utc'::text, now())
  );
end;
$$ language plpgsql security definer;

create or replace function public.delete_message_for_me(p_message_id uuid)
returns jsonb as $$
declare
  v_actor_id uuid;
  v_conv_id uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select conversation_id into v_conv_id
  from public.messages
  where id = p_message_id;

  if v_conv_id is null or not public.is_conversation_member(v_conv_id, v_actor_id) then
    raise exception 'MESSAGE_ACCESS_DENIED';
  end if;

  insert into public.message_user_states (user_id, message_id, hidden_at)
  values (v_actor_id, p_message_id, timezone('utc'::text, now()))
  on conflict (user_id, message_id) do nothing;

  return jsonb_build_object('success', true, 'scope', 'me');
end;
$$ language plpgsql security definer;

create or replace function public.delete_message_for_everyone(p_message_id uuid)
returns jsonb as $$
declare
  v_actor_id uuid;
  v_msg record;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select id, conversation_id, sender_id, deleted_at
  into v_msg
  from public.messages
  where id = p_message_id
  for update;

  if v_msg.id is null then
    raise exception 'MESSAGE_NOT_FOUND';
  end if;

  if v_msg.sender_id <> v_actor_id then
    raise exception 'MESSAGE_DELETE_FORBIDDEN';
  end if;

  if v_msg.deleted_at is not null then
    return jsonb_build_object('success', true, 'alreadyDeleted', true);
  end if;

  update public.messages
  set deleted_at = timezone('utc'::text, now()),
      deleted_by = v_actor_id,
      delete_scope = 'everyone',
      content = 'This message was deleted',
      updated_at = timezone('utc'::text, now())
  where id = p_message_id;

  return jsonb_build_object('success', true, 'scope', 'everyone', 'alreadyDeleted', false);
end;
$$ language plpgsql security definer;

create or replace function public.forward_message(
  p_message_id uuid,
  p_target_conversation_id uuid,
  p_client_message_id uuid default null
)
returns jsonb as $$
declare
  v_actor_id uuid;
  v_src_msg record;
  v_target_conv record;
  v_other_member_id uuid;
  v_new_msg record;
  v_existing_msg record;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  -- 1. Verify source message accessibility
  select id, conversation_id, content, message_type, deleted_at
  into v_src_msg
  from public.messages
  where id = p_message_id;

  if v_src_msg.id is null or not public.is_conversation_member(v_src_msg.conversation_id, v_actor_id) then
    raise exception 'INVALID_FORWARD_SOURCE';
  end if;

  if v_src_msg.deleted_at is not null then
    raise exception 'CANNOT_FORWARD_DELETED_MESSAGE';
  end if;

  -- 2. Verify target conversation membership
  if not public.is_conversation_member(p_target_conversation_id, v_actor_id) then
    raise exception 'CONVERSATION_ACCESS_DENIED';
  end if;

  select id, type into v_target_conv
  from public.conversations
  where id = p_target_conversation_id;

  if v_target_conv.id is null then
    raise exception 'CONVERSATION_NOT_FOUND';
  end if;

  -- 3. If target conversation is direct, check blocking and privacy
  if v_target_conv.type = 'direct' then
    select user_id into v_other_member_id
    from public.conversation_members
    where conversation_id = p_target_conversation_id
      and user_id <> v_actor_id
    limit 1;

    if v_other_member_id is not null then
      if public.is_user_blocked(v_actor_id, v_other_member_id) then
        raise exception 'MESSAGE_BLOCKED';
      end if;
      if not public.can_send_message(v_actor_id, v_other_member_id) then
        raise exception 'PRIVACY_RESTRICTED';
      end if;
    end if;
  end if;

  -- 4. Check idempotency
  if p_client_message_id is not null then
    select * into v_existing_msg
    from public.messages
    where sender_id = v_actor_id and client_message_id = p_client_message_id;

    if v_existing_msg.id is not null then
      return jsonb_build_object(
        'success', true,
        'messageId', v_existing_msg.id,
        'conversationId', v_existing_msg.conversation_id,
        'forwardedFromMessageId', v_existing_msg.forwarded_from_message_id,
        'duplicate', true
      );
    end if;
  end if;

  -- 5. Insert forwarded message
  insert into public.messages (
    conversation_id,
    sender_id,
    content,
    message_type,
    forwarded_from_message_id,
    client_message_id
  ) values (
    p_target_conversation_id,
    v_actor_id,
    v_src_msg.content,
    v_src_msg.message_type,
    p_message_id,
    p_client_message_id
  )
  returning * into v_new_msg;

  -- 6. Update target conversation updated_at and unread counts
  update public.conversations
  set updated_at = timezone('utc'::text, now())
  where id = p_target_conversation_id;

  insert into public.conversation_user_states (user_id, conversation_id, unread_count, is_marked_unread)
  select cm.user_id, p_target_conversation_id, 1, false
  from public.conversation_members cm
  where cm.conversation_id = p_target_conversation_id and cm.user_id <> v_actor_id
  on conflict (user_id, conversation_id)
  do update set 
    unread_count = public.conversation_user_states.unread_count + 1,
    is_marked_unread = false;

  return jsonb_build_object(
    'success', true,
    'messageId', v_new_msg.id,
    'conversationId', v_new_msg.conversation_id,
    'forwardedFromMessageId', p_message_id,
    'duplicate', false
  );
end;
$$ language plpgsql security definer;

create or replace function public.pin_message(p_message_id uuid)
returns jsonb as $$
declare
  v_actor_id uuid;
  v_conv_id uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select conversation_id into v_conv_id
  from public.messages
  where id = p_message_id;

  if v_conv_id is null or not public.is_conversation_member(v_conv_id, v_actor_id) then
    raise exception 'MESSAGE_ACCESS_DENIED';
  end if;

  insert into public.message_pins (conversation_id, message_id, pinned_by, pinned_at)
  values (v_conv_id, p_message_id, v_actor_id, timezone('utc'::text, now()))
  on conflict (conversation_id, message_id) do nothing;

  return jsonb_build_object('success', true, 'pinned', true);
end;
$$ language plpgsql security definer;

create or replace function public.unpin_message(p_message_id uuid)
returns jsonb as $$
declare
  v_actor_id uuid;
  v_conv_id uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select conversation_id into v_conv_id
  from public.messages
  where id = p_message_id;

  if v_conv_id is null or not public.is_conversation_member(v_conv_id, v_actor_id) then
    raise exception 'MESSAGE_ACCESS_DENIED';
  end if;

  delete from public.message_pins
  where conversation_id = v_conv_id and message_id = p_message_id;

  return jsonb_build_object('success', true, 'pinned', false);
end;
$$ language plpgsql security definer;

create or replace function public.toggle_message_reaction(
  p_message_id uuid,
  p_reaction text
)
returns jsonb as $$
declare
  v_actor_id uuid;
  v_conv_id uuid;
  v_existing_id uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select conversation_id into v_conv_id
  from public.messages
  where id = p_message_id;

  if v_conv_id is null or not public.is_conversation_member(v_conv_id, v_actor_id) then
    raise exception 'MESSAGE_ACCESS_DENIED';
  end if;

  select id into v_existing_id
  from public.message_reactions
  where message_id = p_message_id
    and user_id = v_actor_id
    and reaction = p_reaction;

  if v_existing_id is not null then
    delete from public.message_reactions where id = v_existing_id;
    return jsonb_build_object('success', true, 'added', false, 'reaction', p_reaction);
  else
    insert into public.message_reactions (message_id, user_id, reaction)
    values (p_message_id, v_actor_id, p_reaction);
    return jsonb_build_object('success', true, 'added', true, 'reaction', p_reaction);
  end if;
end;
$$ language plpgsql security definer;

create or replace function public.mark_message_delivered(p_message_id uuid)
returns jsonb as $$
declare
  v_actor_id uuid;
  v_conv_id uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select conversation_id into v_conv_id
  from public.messages
  where id = p_message_id;

  if v_conv_id is null or not public.is_conversation_member(v_conv_id, v_actor_id) then
    raise exception 'MESSAGE_ACCESS_DENIED';
  end if;

  insert into public.message_delivery_states (message_id, user_id, delivered_at)
  values (p_message_id, v_actor_id, timezone('utc'::text, now()))
  on conflict (message_id, user_id) do nothing;

  return jsonb_build_object('success', true);
end;
$$ language plpgsql security definer;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns jsonb as $$
declare
  v_actor_id uuid;
  v_last_msg_id uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if not public.is_conversation_member(p_conversation_id, v_actor_id) then
    raise exception 'CONVERSATION_ACCESS_DENIED';
  end if;

  select id into v_last_msg_id
  from public.messages
  where conversation_id = p_conversation_id
  order by created_at desc
  limit 1;

  insert into public.message_reads (message_id, user_id, read_at)
  select m.id, v_actor_id, timezone('utc'::text, now())
  from public.messages m
  where m.conversation_id = p_conversation_id
    and m.sender_id <> v_actor_id
    and not exists (
      select 1 from public.message_reads mr
      where mr.message_id = m.id and mr.user_id = v_actor_id
    )
  on conflict (message_id, user_id) do nothing;

  insert into public.conversation_user_states (
    user_id,
    conversation_id,
    last_read_message_id,
    last_read_at,
    unread_count,
    is_marked_unread
  ) values (
    v_actor_id,
    p_conversation_id,
    v_last_msg_id,
    timezone('utc'::text, now()),
    0,
    false
  )
  on conflict (user_id, conversation_id)
  do update set 
    last_read_message_id = excluded.last_read_message_id,
    last_read_at = excluded.last_read_at,
    unread_count = 0,
    is_marked_unread = false;

  return jsonb_build_object('success', true, 'unreadCount', 0);
end;
$$ language plpgsql security definer;

create or replace function public.mark_conversation_unread(p_conversation_id uuid)
returns jsonb as $$
declare
  v_actor_id uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if not public.is_conversation_member(p_conversation_id, v_actor_id) then
    raise exception 'CONVERSATION_ACCESS_DENIED';
  end if;

  insert into public.conversation_user_states (
    user_id,
    conversation_id,
    is_marked_unread,
    unread_count
  ) values (
    v_actor_id,
    p_conversation_id,
    true,
    1
  )
  on conflict (user_id, conversation_id)
  do update set 
    is_marked_unread = true,
    unread_count = greatest(public.conversation_user_states.unread_count, 1);

  return jsonb_build_object('success', true, 'isMarkedUnread', true);
end;
$$ language plpgsql security definer;

create or replace function public.save_draft(
  p_conversation_id uuid,
  p_content text,
  p_reply_to_message_id uuid default null
)
returns jsonb as $$
declare
  v_actor_id uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if not public.is_conversation_member(p_conversation_id, v_actor_id) then
    raise exception 'CONVERSATION_ACCESS_DENIED';
  end if;

  if p_content is null or length(trim(p_content)) = 0 then
    delete from public.conversation_drafts
    where user_id = v_actor_id and conversation_id = p_conversation_id;
    return jsonb_build_object('success', true, 'deleted', true);
  end if;

  insert into public.conversation_drafts (
    user_id,
    conversation_id,
    content,
    reply_to_message_id,
    updated_at
  ) values (
    v_actor_id,
    p_conversation_id,
    p_content,
    p_reply_to_message_id,
    timezone('utc'::text, now())
  )
  on conflict (user_id, conversation_id)
  do update set 
    content = excluded.content,
    reply_to_message_id = excluded.reply_to_message_id,
    updated_at = excluded.updated_at;

  return jsonb_build_object('success', true, 'saved', true);
end;
$$ language plpgsql security definer;

create or replace function public.delete_draft(p_conversation_id uuid)
returns jsonb as $$
declare
  v_actor_id uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  delete from public.conversation_drafts
  where user_id = v_actor_id and conversation_id = p_conversation_id;

  return jsonb_build_object('success', true, 'deleted', true);
end;
$$ language plpgsql security definer;



