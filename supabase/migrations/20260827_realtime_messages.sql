-- ==============================================================================
-- Heat Chat — Phase 5 Migration: Realtime Messages, Trigger & Read Receipts
-- Migration Timestamp: 2026-08-27
-- Description: Automated conversation timestamp update trigger, realtime publication,
--              and optimized composite indexes for chat feeds.
-- ==============================================================================

-- 1. Trigger function to update conversations.updated_at on new message
create or replace function public.handle_new_message_conversation_updated_at()
returns trigger as $$
begin
  update public.conversations
  set updated_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$ language plpgsql security definer;

-- Attach trigger to messages table
drop trigger if exists on_message_inserted_update_conversation on public.messages;
create trigger on_message_inserted_update_conversation
  after insert on public.messages
  for each row
  execute function public.handle_new_message_conversation_updated_at();

-- 2. Performance indexes for message pagination and reads
create index if not exists messages_conv_id_created_at_asc_idx 
  on public.messages (conversation_id, created_at asc);

create index if not exists message_reads_msg_user_composite_idx 
  on public.message_reads (message_id, user_id);

-- 3. Enable Supabase Realtime for messages and message_reads
-- Safely add tables to publication if it exists
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
  end if;
end;
$$;
