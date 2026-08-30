-- ==============================================================================
-- Heat Chat — Phase 4: Rich Media, Voice Notes, File Sharing & Media Gallery
-- Migration Timestamp: 2026-09-03
-- ==============================================================================

-- 1. EXTEND MESSAGES MESSAGE_TYPE CONSTRAINT
-- ------------------------------------------------------------------------------
-- Allow: text, image, video, audio, voice, file
alter table public.messages
  drop constraint if exists messages_message_type_check;

alter table public.messages
  add constraint messages_message_type_check
  check (message_type in ('text', 'image', 'video', 'audio', 'voice', 'file'));

-- 2. EXTEND ATTACHMENTS TABLE
-- ------------------------------------------------------------------------------
-- Add duration_seconds (for audio/voice/video), thumbnail_path, and metadata jsonb
alter table public.attachments
  add column if not exists duration_seconds integer,
  add column if not exists thumbnail_path text,
  add column if not exists metadata jsonb default '{}'::jsonb;

-- 3. OPTIMIZED INDEXES FOR MEDIA & GALLERY QUERIES
-- ------------------------------------------------------------------------------
create index if not exists idx_messages_conv_type_created
  on public.messages(conversation_id, message_type, created_at desc);

create index if not exists idx_attachments_msg_id
  on public.attachments(message_id);

-- 4. HARDEN STORAGE POLICIES FOR CHAT-ATTACHMENTS BUCKET
-- ------------------------------------------------------------------------------
-- Ensure bucket is strictly private
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do update set public = false;

-- 5. FUNCTION: GET CONVERSATION MEDIA GALLERY
-- ------------------------------------------------------------------------------
-- Returns media attachments for a conversation with pagination, category filter,
-- and excluding messages deleted for everyone or hidden for the caller.
create or replace function public.get_conversation_media(
  p_conversation_id uuid,
  p_category text default 'all', -- 'all', 'media' (image+video), 'audio' (audio+voice), 'files'
  p_limit integer default 30,
  p_before timestamptz default null
)
returns table (
  attachment_id uuid,
  message_id uuid,
  sender_id uuid,
  conversation_id uuid,
  message_type text,
  file_name text,
  file_type text,
  file_size bigint,
  width integer,
  height integer,
  duration_seconds integer,
  storage_path text,
  thumbnail_path text,
  metadata jsonb,
  created_at timestamptz
) as $$
declare
  v_caller_id uuid;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if not public.is_conversation_member(p_conversation_id, v_caller_id) then
    raise exception 'CONVERSATION_ACCESS_DENIED';
  end if;

  return query
  select
    a.id as attachment_id,
    m.id as message_id,
    m.sender_id,
    m.conversation_id,
    m.message_type,
    a.file_name,
    a.file_type,
    a.file_size,
    a.width,
    a.height,
    a.duration_seconds,
    a.storage_path,
    a.thumbnail_path,
    a.metadata,
    m.created_at
  from public.attachments a
  join public.messages m on m.id = a.message_id
  where m.conversation_id = p_conversation_id
    and m.deleted_at is null
    and not exists (
      select 1 from public.message_user_states mus
      where mus.message_id = m.id
        and mus.user_id = v_caller_id
    )
    and (
      case
        when p_category = 'media' then m.message_type in ('image', 'video')
        when p_category = 'audio' then m.message_type in ('audio', 'voice')
        when p_category = 'files' then m.message_type in ('file')
        else m.message_type in ('image', 'video', 'audio', 'voice', 'file')
      end
    )
    and (p_before is null or m.created_at < p_before)
  order by m.created_at desc
  limit coalesce(p_limit, 30);
end;
$$ language plpgsql security definer stable set search_path = public, pg_temp;
