-- Migration 061: driver_assignments trip_progress / trip_note / trip_progress_updated_at
-- (Phase 67, DTRIP-03/04/05)
--
-- Adds THREE new, all-nullable columns to driver_assignments, separate from
-- every other pre-existing column on that table:
--   trip_progress            text, nullable, CHECK NULL or one of
--                             en_route | arrived | on_board | completed | no_show
--   trip_note                text, nullable
--   trip_progress_updated_at timestamptz, nullable
--
-- trip_progress is a driver-only, self-reported field kept structurally
-- separate from bookings.status (own column, own table) even though it
-- deliberately reuses two of the same literal strings (en_route, completed)
-- for driver familiarity — the isolation boundary is the table/column split,
-- not the vocabulary. No pre-existing column on driver_assignments is
-- altered or referenced here.
--
-- TEXT + CHECK is used (not a Postgres ENUM), matching the
-- customer_profiles.account_type / pricing_globals precedent.
--
-- This is a plain, additive column change with no privilege changes of any
-- kind and no function/procedure involved.
--
-- Applied LIVE by the operator (this repo's established convention — no
-- migrations are auto-pushed; local Supabase keys are placeholders).

ALTER TABLE driver_assignments
  ADD COLUMN trip_progress text
    CHECK (trip_progress IS NULL OR trip_progress IN ('en_route', 'arrived', 'on_board', 'completed', 'no_show'));

ALTER TABLE driver_assignments
  ADD COLUMN trip_note text;

ALTER TABLE driver_assignments
  ADD COLUMN trip_progress_updated_at timestamptz;
