-- Migration 060: driver_assignments permanent trip_token (Phase 66, DTRIP-01/02/08)
--
-- Adds a NEW trip_token uuid column, separate from the existing single-use
-- `token` (accept/decline) column. DEFAULT gen_random_uuid() means Postgres
-- backfills every existing row's trip_token in the same ALTER TABLE
-- statement — no explicit UPDATE needed (D-12). The permanent trip token has
-- NO expiry and NO used_at consumption (D-01) — validity is checked live on
-- every request via lib/trip-token.ts's isTripLinkValid predicate (D-03),
-- not a stored expiry/used flag.
--
-- This migration touches NO SECURITY DEFINER RPC — a plain ADD COLUMN needs no
-- privilege-adjustment statements (contrast with migration 059's DROP+CREATE
-- re-grant pitfall, which does not apply here).
--
-- Applied LIVE by the operator (this repo's established convention — no
-- migrations are auto-pushed; local Supabase keys are placeholders).

ALTER TABLE driver_assignments
  ADD COLUMN trip_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS driver_assignments_trip_token_idx
  ON driver_assignments (trip_token);
