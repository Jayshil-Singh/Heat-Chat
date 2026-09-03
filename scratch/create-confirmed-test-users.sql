-- ==============================================================================
-- HEAT CHAT — Create Confirmed Dedicated Test Accounts SQL
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/rmvpdcftfdeizitnrvkw/sql
-- ==============================================================================

-- 1. Remove previous test users
DELETE FROM auth.users WHERE email IN ('phase7_test_a@test.local', 'phase7_test_b@test.local');

-- 2. Insert User A (Auto-confirmed)
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'phase7_test_a@test.local',
  crypt('Phase7TestPassword123!', gen_salt('bf')),
  timezone('utc'::text, now()),
  timezone('utc'::text, now()),
  '{"provider":"email","providers":["email"]}',
  '{"username":"phase7_test_a","display_name":"PHASE7_TEST_A"}',
  timezone('utc'::text, now()),
  timezone('utc'::text, now()),
  '',
  ''
);

-- 3. Insert User B (Auto-confirmed)
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'phase7_test_b@test.local',
  crypt('Phase7TestPassword123!', gen_salt('bf')),
  timezone('utc'::text, now()),
  timezone('utc'::text, now()),
  '{"provider":"email","providers":["email"]}',
  '{"username":"phase7_test_b","display_name":"PHASE7_TEST_B"}',
  timezone('utc'::text, now()),
  timezone('utc'::text, now()),
  '',
  ''
);

-- 4. Create email identities for both users
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT
  id,
  id,
  json_build_object('sub', id::text, 'email', email)::jsonb,
  'email',
  id::text,
  now(),
  now(),
  now()
FROM auth.users
WHERE email IN ('phase7_test_a@test.local', 'phase7_test_b@test.local')
ON CONFLICT (provider, provider_id) DO NOTHING;
