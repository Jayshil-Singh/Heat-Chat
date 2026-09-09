-- ==============================================================================
-- HEAT CHAT — PHASE 20: NOTIFICATION DELIVERIES SCHEMA CORRECTION
-- Migration: 20260919_phase20_notification_deliveries_schema_fix.sql
-- Description:
--   Phase 19 used CREATE TABLE IF NOT EXISTS public.notification_deliveries,
--   but that table was already created by Phase 7. The CREATE TABLE was a
--   no-op, so Phase 19's new columns (updated_at, lease_expires_at) and the
--   claim_v2 index were never applied to the live table.
--
--   This migration corrects that using idempotent ALTER TABLE ADD COLUMN IF
--   NOT EXISTS statements. Existing data is preserved — no table drops, wipes,
--   or row deletions are performed.
--
--   Safe to run multiple times.
-- ==============================================================================

-- 1. ADD MISSING COLUMNS TO notification_deliveries
-- Phase 7 table is missing: updated_at, lease_expires_at
-- (Phase 7 has lease_until; Phase 19 renamed concept to lease_expires_at)
-- Both columns are added without NOT NULL so they are nullable and safe to
-- back-fill on existing rows without disruption.

ALTER TABLE public.notification_deliveries
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone
    DEFAULT timezone('utc'::text, now());

ALTER TABLE public.notification_deliveries
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamp with time zone
    DEFAULT NULL;

-- 2. ADD MISSING PHASE 19 CLAIM INDEX
-- idx_notification_deliveries_claim_v2 supports the background worker that
-- claims pending/failed delivery jobs ordered by next_attempt_at.
-- (The Phase 7 index idx_notification_deliveries_claim covers 'pending' and
--  'processing'; the Phase 19 worker additionally needs to re-attempt 'failed'
--  deliveries, hence the separate v2 index.)
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_claim_v2
  ON public.notification_deliveries(status, next_attempt_at)
  WHERE status IN ('pending', 'failed');

-- 3. ADD MISSING PHASE 19 USER-STATUS INDEX
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_user
  ON public.notification_deliveries(user_id, status);

-- 4. VERIFY NOTHING ELSE IS BROKEN
-- The trigger handle_notification_delivery_enqueue (created in Phase 19) only
-- inserts: notification_id, subscription_id, user_id, status, attempt_count,
-- next_attempt_at — all of which exist in the Phase 7 table. The trigger is
-- already correct. No changes to trigger or function are needed here.

-- ==============================================================================
-- END OF PHASE 20 SCHEMA CORRECTION
-- ==============================================================================
