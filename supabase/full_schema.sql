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


