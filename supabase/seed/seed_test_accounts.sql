-- ==============================================================================
-- Heat Chat — Test Account Seeding & RLS Verification Guide
-- ==============================================================================
-- To test multi-user authorization and Row Level Security (RLS) policies:
--
-- Option 1: Create test users via the Heat Chat UI at /register
--   User A: alice@example.com (Username: alice_r, Display Name: Alice Rivera)
--   User B: bob@example.com   (Username: bob_m,   Display Name: Bob Miller)
--   User C: charlie@example.com (Username: charlie_k, Display Name: Charlie Kim)
--
-- Option 2: SQL Insertion into auth.users (if executing directly in Supabase SQL Editor):
--
-- NOTE: In Supabase, creating users directly in auth.users triggers public.handle_new_user()
-- to automatically provision their corresponding public.profiles records with clean usernames.

-- ==============================================================================
-- RLS VERIFICATION TEST QUERIES
-- ==============================================================================

-- 1. Profile Isolation Test:
--    When authenticated as User A (auth.uid() = '...'):
--    - SELECT * FROM public.profiles;               -> SUCCEEDS (Public directory)
--    - UPDATE public.profiles SET bio = 'New bio' 
--      WHERE id = 'USER_B_UUID';                   -> FAILS / 0 rows affected (RLS restricts to auth.uid() = id)

-- 2. Private Conversation Access Test:
--    - Direct conversation between User A and User B (id = 'conv-123')
--    - When User C (auth.uid() = 'USER_C_UUID') executes:
--      SELECT * FROM public.messages 
--      WHERE conversation_id = 'conv-123';         -> Returns 0 rows (is_conversation_member returns false)
--    - When User C attempts:
--      INSERT INTO public.messages (conversation_id, sender_id, content)
--      VALUES ('conv-123', 'USER_C_UUID', 'hack'); -> FAILS (RLS violation)

-- 3. Message Editing / Deletion Isolation:
--    - User B cannot update User A's messages:
--      UPDATE public.messages SET content = 'tampered' 
--      WHERE sender_id = 'USER_A_UUID';            -> FAILS / 0 rows affected
