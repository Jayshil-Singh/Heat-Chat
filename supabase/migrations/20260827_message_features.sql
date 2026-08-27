-- ==============================================================================
-- Heat Chat — Phase 6 Migration: Message Features
-- Migration Timestamp: 2026-08-27
-- Description: Reply cross-conversation validation trigger (BEFORE INSERT + UPDATE),
--              message_reactions realtime publication.
-- ==============================================================================

-- ---------------------------------------------------------------------------
-- 1. Validate reply_to_message_id references same conversation
--    Applied BEFORE INSERT and BEFORE UPDATE on messages.
--    This is the authoritative DB-level enforcement for cross-conversation
--    reply protection. The RLS policies further restrict message access.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_reply_same_conversation()
RETURNS TRIGGER AS $$
BEGIN
  -- Only validate when reply_to_message_id is being set (not null)
  IF NEW.reply_to_message_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.messages m
      WHERE m.id = NEW.reply_to_message_id
        AND m.conversation_id = NEW.conversation_id
    ) THEN
      RAISE EXCEPTION
        'Cross-conversation reply is not permitted. reply_to_message_id must reference a message within the same conversation (conversation_id: %).',
        NEW.conversation_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply trigger BEFORE INSERT and BEFORE UPDATE
DROP TRIGGER IF EXISTS validate_reply_conversation ON public.messages;
CREATE TRIGGER validate_reply_conversation
  BEFORE INSERT OR UPDATE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_reply_same_conversation();

-- ---------------------------------------------------------------------------
-- 2. Add message_reactions to Supabase Realtime publication
--    (messages and message_reads were added in Phase 5 migration)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'message_reactions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
    END IF;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Performance index for deleted message queries
--    Supports efficient filtering of non-deleted messages in feeds
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS messages_deleted_at_idx
  ON public.messages (deleted_at)
  WHERE deleted_at IS NOT NULL;
