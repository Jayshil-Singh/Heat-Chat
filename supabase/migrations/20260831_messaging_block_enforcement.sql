-- ==============================================================================
-- Heat Chat — Phase 1 Supplement: Messaging Block Enforcement
-- Migration Timestamp: 2026-08-31 (supplement)
-- Description: Tightens the messages INSERT RLS policy to reject messages
--              sent by or to a blocked user in a direct conversation.
--              Group conversations are unaffected (blocking cannot prevent
--              a shared group message).
-- ==============================================================================

-- Helper: get other member's user ID in a DIRECT conversation
create or replace function public.get_direct_conversation_other_member(
  p_conversation_id uuid,
  p_sender_id uuid
)
returns uuid as $$
  select cm.user_id
  from public.conversation_members cm
  join public.conversations c on c.id = cm.conversation_id
  where cm.conversation_id = p_conversation_id
    and cm.user_id <> p_sender_id
    and c.type = 'direct'
  limit 1;
$$ language sql security definer stable;

-- Replace the existing messages INSERT RLS policy with one that also
-- enforces block protection for direct (1-on-1) conversations.
drop policy if exists "Members can insert messages to their conversations"
  on public.messages;

create policy "Members can insert messages to their conversations"
  on public.messages for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and public.is_conversation_member(conversation_id, auth.uid())
    and not public.is_user_blocked(
      auth.uid(),
      public.get_direct_conversation_other_member(conversation_id, auth.uid())
    )
  );

-- Note: get_direct_conversation_other_member returns NULL for group conversations
-- (because there is no single other_member), so is_user_blocked(uid, NULL)
-- returns false — group messaging is not affected by this policy.
