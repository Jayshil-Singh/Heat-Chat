-- ==============================================================================
-- HEAT CHAT — Phase 7 Confirm Dedicated Test Accounts SQL
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/rmvpdcftfdeizitnrvkw/sql
-- ==============================================================================

UPDATE auth.users
SET email_confirmed_at = timezone('utc'::text, now()),
    confirmed_at = timezone('utc'::text, now())
WHERE id IN (
  'b351d659-4301-44fa-a985-67bb142b19c1',  -- phase7_test_a@test.local
  '4f9db9f1-3859-40eb-b12c-de962fa4659b'   -- phase7_test_b@test.local
);
