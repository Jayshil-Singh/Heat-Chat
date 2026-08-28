-- ==============================================================================
-- HEAT CHAT — PHASE 9: NOTIFICATIONS, PREFERENCES & CONVERSATION MUTES
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

-- Drop old policies to ensure idempotent migration
drop policy if exists "Users can view own notification preferences" on public.notification_preferences;
drop policy if exists "Users can insert own notification preferences" on public.notification_preferences;
drop policy if exists "Users can update own notification preferences" on public.notification_preferences;
drop policy if exists "Users can delete own notification preferences" on public.notification_preferences;

drop policy if exists "Users can view own conversation mute preferences" on public.conversation_notification_preferences;
drop policy if exists "Users can insert own conversation mute preferences" on public.conversation_notification_preferences;
drop policy if exists "Users can update own conversation mute preferences" on public.conversation_notification_preferences;
drop policy if exists "Users can delete own conversation mute preferences" on public.conversation_notification_preferences;

drop policy if exists "Users can view own notifications" on public.notifications;
drop policy if exists "Users can update own notifications" on public.notifications;
drop policy if exists "Users can delete own notifications" on public.notifications;

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
  -- For every conversation member (except the sender), insert a notification record
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
-- Mark a single notification as read
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

-- Mark all notifications as read for current user
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

-- Toggle conversation mute
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
