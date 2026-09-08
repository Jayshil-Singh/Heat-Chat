import fs from "node:fs";
import path from "node:path";

const srcPath = path.resolve("supabase/migrations/20260907_discover_people.sql");
const destPath = path.resolve("supabase/migrations/20260911_phase14_production_incident_fix.sql");

const src = fs.readFileSync(srcPath, "utf8");
const header = `-- ==============================================================================
-- HEAT CHAT — PHASE 14: PRODUCTION INCIDENT FIX (DISCOVER PEOPLE & SOCIAL RPCS)
-- Migration: 20260911_phase14_production_incident_fix.sql
-- Description:
--   Emergency production synchronization fix for missing Phase 11 schema & RPCs.
--   1. Ensures public.discovery_preferences exists with RLS and indexes
--   2. Ensures public.friend_requests exists with canonical anti-duplicate index
--   3. Relaxes public.notifications(conversation_id) to nullable for social events
--   4. Deploys Security-Definer RPCs (set_discoverability, get_my_discoverability,
--      discover_people, send_friend_request, accept_friend_request,
--      reject_friend_request, decline_friend_request, cancel_friend_request,
--      get_my_friend_requests) with SET search_path = public, pg_temp
--   5. Grants EXECUTE to 'authenticated' role
-- ==============================================================================

`;

const lines = src.split("\n");
const contentAfterHeader = lines.slice(12).join("\n");
fs.writeFileSync(destPath, header + contentAfterHeader, "utf8");
console.log("Created 20260911_phase14_production_incident_fix.sql successfully");
