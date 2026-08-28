-- ==============================================================================
-- HEAT CHAT — PHASE 8: MEDIA ATTACHMENTS & STORAGE MIGRATION
-- ==============================================================================

-- 1. SAFE UUID CASTING FUNCTION
-- Prevents unhandled cast exceptions when processing malformed or traversal storage paths
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

-- 2. EXTEND ATTACHMENTS TABLE
-- Add width and height dimensions if not already present
alter table public.attachments add column if not exists width integer;
alter table public.attachments add column if not exists height integer;

-- Add index on message_id if not exists
create index if not exists attachments_message_id_idx on public.attachments(message_id);

-- 3. STRICT ROW LEVEL SECURITY ON PUBLIC.ATTACHMENTS
alter table public.attachments enable row level security;

-- Drop existing attachments policies to ensure clean state
drop policy if exists "Members can view attachments in their conversations" on public.attachments;
drop policy if exists "Senders can attach records to their messages" on public.attachments;
drop policy if exists "Senders can delete their attachments" on public.attachments;
drop policy if exists "Authorized users can delete attachments" on public.attachments;

-- SELECT: Only active conversation members where the parent message is NOT deleted
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

-- INSERT: Senders can only attach records to their own messages in permitted conversations
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

-- DELETE: Message sender or conversation admin/owner
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

-- 4. HARDEN CHAT-ATTACHMENTS STORAGE BUCKET & POLICIES
-- Ensure bucket is private
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do update set public = false;

-- Drop old storage policies
drop policy if exists "Authenticated users can upload chat attachments" on storage.objects;
drop policy if exists "Conversation members can read chat attachments" on storage.objects;
drop policy if exists "Conversation members can upload chat attachments" on storage.objects;
drop policy if exists "Authorized users can delete chat attachments" on storage.objects;

-- INSERT: Only active members of the conversation (first path segment) can upload
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

-- SELECT: Only active members of the conversation can read/generate signed URLs
-- Removed members immediately evaluate to false
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

-- DELETE: Object owner or conversation admin
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
