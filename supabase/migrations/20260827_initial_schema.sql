-- ==============================================================================
-- Heat Chat — Initial Database Schema & Security Migration
-- Migration Timestamp: 2026-08-27
-- Description: Complete schema for private friends messaging with strict RLS,
--              automated profile provisioning, helper security functions,
--              and storage bucket policies.
-- ==============================================================================

-- Enable UUID extension if not already enabled
create extension if not exists "uuid-ossp";

-- ==============================================================================
-- 1. HELPER FUNCTIONS & TRIGGERS
-- ==============================================================================

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
  
  -- Username constraint: 3-30 characters, alphanumeric, underscore, hyphen
  constraint valid_username check (username ~* '^[a-z0-9_-]{3,30}$')
);

-- Case-insensitive search indexes for username and display name
create unique index if not exists profiles_username_lower_idx on public.profiles (lower(username));
create index if not exists profiles_display_name_idx on public.profiles (display_name);
create index if not exists profiles_display_name_lower_idx on public.profiles (lower(display_name));

-- Trigger for profiles.updated_at
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
    -- Fallback username from email prefix
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
    -- Fail safely so user registration is not blocked if metadata is invalid
    return new;
end;
$$ language plpgsql security definer;

-- Trigger to attach on auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

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
-- 5. RECURSION-SAFE AUTHORIZATION HELPER FUNCTIONS
-- ==============================================================================
-- These functions use SECURITY DEFINER to inspect membership without triggering
-- recursive RLS evaluation on conversation_members.

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
  deleted_at timestamptz
);

create index if not exists messages_conv_created_idx on public.messages(conversation_id, created_at desc);
create index if not exists messages_sender_id_idx on public.messages(sender_id);
create index if not exists messages_reply_to_idx on public.messages(reply_to_message_id);

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

-- Ensure a single unique record per user pair regardless of orientation
create unique index if not exists unique_friendship_pair_idx 
  on public.friendships (least(user_id, friend_id), greatest(user_id, friend_id));

create index if not exists friendships_user_idx on public.friendships(user_id, status);
create index if not exists friendships_friend_idx on public.friendships(friend_id, status);

create trigger set_friendships_updated_at
  before update on public.friendships
  for each row
  execute function public.handle_updated_at();

-- ==============================================================================
-- 11. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.message_reads enable row level security;
alter table public.attachments enable row level security;
alter table public.friendships enable row level security;

-- ------------------------------------------------------------------------------
-- PROFILES POLICIES
-- ------------------------------------------------------------------------------
create policy "Public profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ------------------------------------------------------------------------------
-- CONVERSATIONS POLICIES
-- ------------------------------------------------------------------------------
create policy "Users can view conversations they belong to"
  on public.conversations for select
  to authenticated
  using (public.is_conversation_member(id, auth.uid()));

create policy "Authenticated users can create conversations"
  on public.conversations for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "Admins or creators can update conversations"
  on public.conversations for update
  to authenticated
  using (public.is_conversation_admin(id, auth.uid()) or created_by = auth.uid())
  with check (public.is_conversation_admin(id, auth.uid()) or created_by = auth.uid());

create policy "Admins or creators can delete conversations"
  on public.conversations for delete
  to authenticated
  using (public.is_conversation_admin(id, auth.uid()) or created_by = auth.uid());

-- ------------------------------------------------------------------------------
-- CONVERSATION_MEMBERS POLICIES
-- ------------------------------------------------------------------------------
create policy "Users can view members of conversations they belong to"
  on public.conversation_members for select
  to authenticated
  using (public.is_conversation_member(conversation_id, auth.uid()));

create policy "Users can add members or join permitted conversations"
  on public.conversation_members for insert
  to authenticated
  with check (
    -- User creating a new conversation can add themselves/initial members
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.created_by = auth.uid()
    )
    or
    -- Existing admin can add new members
    public.is_conversation_admin(conversation_id, auth.uid())
    or
    -- User adding themselves
    auth.uid() = user_id
  );

create policy "Admins or self can remove members"
  on public.conversation_members for delete
  to authenticated
  using (
    auth.uid() = user_id 
    or public.is_conversation_admin(conversation_id, auth.uid())
  );

create policy "Admins can update member roles"
  on public.conversation_members for update
  to authenticated
  using (public.is_conversation_admin(conversation_id, auth.uid()))
  with check (public.is_conversation_admin(conversation_id, auth.uid()));

-- ------------------------------------------------------------------------------
-- MESSAGES POLICIES
-- ------------------------------------------------------------------------------
create policy "Users can view messages in conversations they belong to"
  on public.messages for select
  to authenticated
  using (public.is_conversation_member(conversation_id, auth.uid()));

create policy "Members can insert messages to their conversations"
  on public.messages for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and public.is_conversation_member(conversation_id, auth.uid())
  );

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

create policy "Senders can delete their own messages"
  on public.messages for delete
  to authenticated
  using (
    auth.uid() = sender_id
    and public.is_conversation_member(conversation_id, auth.uid())
  );

-- ------------------------------------------------------------------------------
-- MESSAGE_REACTIONS POLICIES
-- ------------------------------------------------------------------------------
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

create policy "Users can remove their own reactions"
  on public.message_reactions for delete
  to authenticated
  using (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- MESSAGE_READS POLICIES
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- ATTACHMENTS POLICIES
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- FRIENDSHIPS POLICIES
-- ------------------------------------------------------------------------------
create policy "Users can view their own friendships and requests"
  on public.friendships for select
  to authenticated
  using (auth.uid() = user_id or auth.uid() = friend_id);

create policy "Users can send friend requests"
  on public.friendships for insert
  to authenticated
  with check (auth.uid() = user_id and user_id != friend_id);

create policy "Users can accept, decline, or update their friendships"
  on public.friendships for update
  to authenticated
  using (auth.uid() = user_id or auth.uid() = friend_id)
  with check (auth.uid() = user_id or auth.uid() = friend_id);

create policy "Users can remove their friendships or cancel requests"
  on public.friendships for delete
  to authenticated
  using (auth.uid() = user_id or auth.uid() = friend_id);

-- ==============================================================================
-- 12. STORAGE BUCKET & POLICIES (chat-attachments & avatars)
-- ==============================================================================
-- Create private bucket for chat-attachments and public/private bucket for avatars
insert into storage.buckets (id, name, public)
values 
  ('chat-attachments', 'chat-attachments', false),
  ('avatars', 'avatars', true)
on conflict (id) do update set public = excluded.public;

-- Avatars storage policies
create policy "Avatar images are publicly accessible"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

create policy "Users can upload their own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars' 
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update their own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars' 
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars' 
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Chat attachments storage policies
create policy "Authenticated users can upload chat attachments"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'chat-attachments');

create policy "Conversation members can read chat attachments"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'chat-attachments'
    and (
      -- If files are stored as conversation_id/filename
      public.is_conversation_member((storage.foldername(name))[1]::uuid, auth.uid())
      or
      -- Or if user uploaded the file
      owner = auth.uid()
    )
  );
